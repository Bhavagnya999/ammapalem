import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed, Route, Tag } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AdminBoundariesResponse,
  AnalysisResult,
  ChangePolygonFeature,
} from '../types/earth';

type ChangeLayerId = 'change-highlight' | 'change-veg' | 'change-builtup' | 'change-water';
type BasemapType = 'satellite' | 'terrain';

interface ChangeDetectionSectionProps {
  analysis: AnalysisResult | null;
  boundaries: AdminBoundariesResponse | null;
  loading: boolean;
}

const CHANGE_LAYERS: Array<{
  id: ChangeLayerId;
  label: string;
  description: string;
  legend: Array<{ color: string; text: string }>;
}> = [
  {
    id: 'change-highlight',
    label: '5-Class Change Highlight',
    description: 'Confirmed pixel-based land changes filtered above the active confidence threshold.',
    legend: [
      { color: '#F97316', text: 'Newly Built-up' },
      { color: '#EF4444', text: 'Vegetation Loss' },
      { color: '#22C55E', text: 'Vegetation Gain' },
      { color: '#3B82F6', text: 'Water Change' },
      { color: '#EAB308', text: 'Agricultural Conversion' },
    ],
  },
  {
    id: 'change-veg',
    label: 'Vegetation (ΔNDVI)',
    description: 'Highlights pixels where NDVI changed by more than ±0.14 between 2016 and 2026.',
    legend: [
      { color: '#22C55E', text: 'Vegetation Gain (ΔNDVI > +0.14)' },
      { color: '#EF4444', text: 'Vegetation Loss (ΔNDVI < −0.14)' },
      { color: '#3B3D36', text: 'Spectrally Stable' },
    ],
  },
  {
    id: 'change-builtup',
    label: 'Built-up Expansion (ΔNDBI)',
    description: 'Isolates built-up land expansion clusters (≥100 m² at 10 m resolution).',
    legend: [
      { color: '#F97316', text: 'New Built-up Land (2016→2026)' },
      { color: '#D2C2A5', text: 'Persistent Built-up Core' },
    ],
  },
  {
    id: 'change-water',
    label: 'Water Bodies (ΔNDWI)',
    description: 'Tracks irrigation tank expansion and surface water reduction.',
    legend: [
      { color: '#3B82F6', text: 'Surface Water Expansion' },
      { color: '#EAB308', text: 'Surface Water Reduction' },
      { color: '#2563EB', text: 'Persistent Water' },
    ],
  },
];

function fmtSigned(n: number, decimals = 3): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${s}${Math.abs(n).toFixed(decimals)}`;
}

function ensureChangeMapPanes(map: L.Map) {
  const specs: Array<{ name: string; zIndex: number; passThrough: boolean }> = [
    { name: 'basemapPane', zIndex: 200, passThrough: false },
    { name: 'rasterPane', zIndex: 260, passThrough: false },
    { name: 'changePane', zIndex: 420, passThrough: false },
    { name: 'boundaryPane', zIndex: 520, passThrough: true },
    { name: 'transportPane', zIndex: 610, passThrough: true },
    { name: 'labelsPane', zIndex: 660, passThrough: true },
  ];
  for (const s of specs) {
    const pane = map.getPane(s.name) ?? map.createPane(s.name);
    pane.style.zIndex = String(s.zIndex);
    if (s.passThrough) pane.style.pointerEvents = 'none';
  }
}

export function ChangeDetectionSection({
  analysis,
  boundaries,
  loading,
}: ChangeDetectionSectionProps) {
  const [activeLayer, setActiveLayer] = useState<ChangeLayerId>('change-highlight');
  const [basemap, setBasemap] = useState<BasemapType>('satellite');
  const [rasterOpacity, setRasterOpacity] = useState<number>(78);
  const [showPlaceLabels, setShowPlaceLabels] = useState<boolean>(true);
  const [showRoadLabels, setShowRoadLabels] = useState<boolean>(true);
  const [showVillageBoundary, setShowVillageBoundary] = useState<boolean>(true);
  const [selectedPoly, setSelectedPoly] = useState<ChangePolygonFeature | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseTileRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const transportTileRef = useRef<L.TileLayer | null>(null);
  const placesTileRef = useRef<L.TileLayer | null>(null);
  const villageLabelsGroupRef = useRef<L.LayerGroup | null>(null);
  const boundaryGroupRef = useRef<L.LayerGroup | null>(null);
  const polyGroupRef = useRef<L.LayerGroup | null>(null);

  const centerLat = analysis?.location.center.lat ?? 17.2237;
  const centerLon = analysis?.location.center.lon ?? 80.2483;
  const bbox = analysis?.location.bbox ?? [80.22009, 17.19659, 80.27651, 17.25081];
  const leafletBounds: L.LatLngBoundsExpression = [
    [bbox[1], bbox[0]],
    [bbox[3], bbox[2]],
  ];

  // 1. Initialize Leaflet map with explicit z-ordered pane hierarchy
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLon],
      zoom: 13,
      minZoom: 10,
      maxZoom: 18,
    });
    ensureChangeMapPanes(map);

    map.fitBounds(leafletBounds, { padding: [12, 12] });

    polyGroupRef.current = L.layerGroup().addTo(map);
    boundaryGroupRef.current = L.layerGroup().addTo(map);
    villageLabelsGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      baseTileRef.current = null;
      overlayRef.current = null;
      transportTileRef.current = null;
      placesTileRef.current = null;
      villageLabelsGroupRef.current = null;
      boundaryGroupRef.current = null;
      polyGroupRef.current = null;
    };
  }, [centerLat, centerLon]);

  // 2. Esri World Imagery / Terrain basemap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    baseTileRef.current?.remove();

    const url =
      basemap === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';

    baseTileRef.current = L.tileLayer(url, {
      pane: 'basemapPane',
      attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 18,
    }).addTo(map);
  }, [basemap]);

  // 3. Change raster layer in rasterPane
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !analysis) return;
    if (overlayRef.current) overlayRef.current.remove();
    const url = analysis.layers[activeLayer];
    if (url) {
      overlayRef.current = L.imageOverlay(url, leafletBounds, {
        pane: 'rasterPane',
        opacity: rasterOpacity / 100,
        interactive: false,
      }).addTo(map);
    }
  }, [analysis, activeLayer]);

  useEffect(() => {
    overlayRef.current?.setOpacity(rasterOpacity / 100);
  }, [rasterOpacity]);

  // 4. Clickable change polygons in changePane
  useEffect(() => {
    const group = polyGroupRef.current;
    if (!group) return;
    group.clearLayers();
    if (!analysis || activeLayer !== 'change-highlight') return;

    for (const poly of analysis.changePolygons) {
      const isSelected = selectedPoly?.id === poly.id;
      const layer = L.geoJSON(
        { type: 'Feature', properties: {}, geometry: poly.geometry } as GeoJSON.Feature,
        {
          pane: 'changePane',
          style: {
            color: isSelected ? '#FFFFFF' : poly.color,
            weight: isSelected ? 2.6 : 1.3,
            fillColor: poly.color,
            fillOpacity: isSelected ? 0.58 : 0.3,
          },
        }
      );
      layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSelectedPoly(poly);
      });
      layer.bindTooltip(
        `${poly.categoryLabel} · ${poly.areaHa.toFixed(2)} ha (${poly.confidencePct}%)`,
        { sticky: true, direction: 'top' }
      );
      layer.addTo(group);
    }
  }, [analysis, activeLayer, selectedPoly]);

  // 5. Administrative boundaries (Official Village / Mandal + Study Area Grid) in boundaryPane
  useEffect(() => {
    const group = boundaryGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (showVillageBoundary && boundaries?.mandal?.feature) {
      L.geoJSON(boundaries.mandal.feature, {
        pane: 'boundaryPane',
        interactive: false,
        style: {
          color: '#D2C7B0',
          weight: 1.4,
          dashArray: '6 4',
          fill: false,
          opacity: 0.8,
        },
      }).addTo(group);
    }

    if (showVillageBoundary && boundaries?.village?.feature) {
      L.geoJSON(boundaries.village.feature, {
        pane: 'boundaryPane',
        interactive: false,
        style: {
          color: '#FFFFFF',
          weight: 2.2,
          fill: false,
          opacity: 0.95,
        },
      }).addTo(group);
    }

    L.rectangle(leafletBounds, {
      pane: 'boundaryPane',
      color: '#9A9484',
      weight: 1.1,
      dashArray: '3 5',
      fill: false,
      interactive: false,
    }).addTo(group);
  }, [boundaries, showVillageBoundary, bbox]);

  // 6. Esri World Transportation in transportPane
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    transportTileRef.current?.remove();
    transportTileRef.current = null;
    if (!showRoadLabels) return;

    transportTileRef.current = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      {
        pane: 'transportPane',
        maxZoom: 18,
        opacity: 0.92,
      }
    ).addTo(map);
  }, [showRoadLabels]);

  // 7. Esri World Boundaries and Places + verified LGD Konijerla village labels in labelsPane
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    placesTileRef.current?.remove();
    placesTileRef.current = null;
    villageLabelsGroupRef.current?.clearLayers();

    if (!showPlaceLabels) return;

    placesTileRef.current = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        pane: 'labelsPane',
        maxZoom: 18,
        opacity: 0.95,
      }
    ).addTo(map);

    const grp = villageLabelsGroupRef.current;
    if (!grp) return;
    const labels = boundaries?.villageLabels ?? [];
    if (labels.length > 0) {
      for (const v of labels) {
        L.marker([v.lat, v.lon], {
          pane: 'labelsPane',
          interactive: false,
          icon: L.divIcon({
            className: 'geo-village-label',
            html: `<div class="geo-village-label-text ${
              v.isTarget ? 'text-[12px] text-[#EBE7DE]' : 'text-[10px] text-[#D2C7B0]/90'
            }"><span>${v.isTarget ? v.name.toUpperCase() : v.name}</span></div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
        }).addTo(grp);
      }
    }
  }, [showPlaceLabels, boundaries]);

  const handleResetView = () => {
    const vb = boundaries?.village?.meta.bounds;
    if (vb && vb.length === 4) {
      mapRef.current?.fitBounds(
        [
          [vb[1], vb[0]],
          [vb[3], vb[2]],
        ],
        { padding: [14, 14], animate: true }
      );
      return;
    }
    mapRef.current?.fitBounds(leafletBounds, { padding: [12, 12], animate: true });
  };

  const currentMeta = CHANGE_LAYERS.find((l) => l.id === activeLayer)!;

  return (
    <section id="change-detection" className="scroll-mt-20 space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#A3B47E]">
          Confidence-Gated Pixel Change Detection
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#EBE7DE]">
          Change Detection · Categories A–F &amp; Spectral Shifts
        </h2>
        <p className="mt-1 text-sm text-[#9A9484]">
          Calculated across mutually cloud-free pixels between {analysis?.scene2016.dateLabel ?? '2016'} and {analysis?.scene2026.dateLabel ?? '2026'} at ≥{analysis ? Math.round(analysis.confidenceThreshold * 100) : 55}% classification confidence.
        </p>
      </div>

      {/* Main 2-column split: Spatial Change Map + Spectral Indices & Histogram */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        <div className="flex flex-col rounded-lg border border-[#2B2E28] bg-[#171916] lg:col-span-7">
          <div className="flex flex-col gap-2.5 border-b border-[#2B2E28] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {CHANGE_LAYERS.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => setActiveLayer(layer.id)}
                    className={`rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      activeLayer === layer.id
                        ? 'bg-[#8C9A6E] text-[#111210]'
                        : 'bg-[#1E201C] text-[#C7C0B0] hover:bg-[#272A24] hover:text-[#EBE7DE]'
                    }`}
                  >
                    {layer.label}
                  </button>
                ))}
              </div>

              <div className="inline-flex items-center rounded border border-[#2B2E28] bg-[#141613] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setBasemap('satellite')}
                  className={`rounded px-2 py-1 font-medium whitespace-nowrap ${
                    basemap === 'satellite' ? 'bg-[#8C9A6E]/25 text-[#EBE7DE]' : 'text-[#9A9484]'
                  }`}
                >
                  Satellite
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap('terrain')}
                  className={`rounded px-2 py-1 font-medium whitespace-nowrap ${
                    basemap === 'terrain' ? 'bg-[#8C9A6E]/25 text-[#EBE7DE]' : 'text-[#9A9484]'
                  }`}
                >
                  Terrain
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9A9484]">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowPlaceLabels((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 whitespace-nowrap ${
                    showPlaceLabels
                      ? 'border-[#8C9A6E] bg-[#8C9A6E]/15 text-[#EBE7DE]'
                      : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
                  }`}
                >
                  <Tag className="h-3 w-3 text-[#A3B47E]" aria-hidden="true" />
                  <span>Labels</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRoadLabels((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 whitespace-nowrap ${
                    showRoadLabels
                      ? 'border-[#8C9A6E] bg-[#8C9A6E]/15 text-[#EBE7DE]'
                      : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
                  }`}
                >
                  <Route className="h-3 w-3 text-[#A3B47E]" aria-hidden="true" />
                  <span>Roads</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowVillageBoundary((v) => !v)}
                  className={`rounded border px-2 py-0.5 whitespace-nowrap ${
                    showVillageBoundary
                      ? 'border-[#D2C7B0]/50 bg-[#D2C7B0]/15 text-[#EBE7DE]'
                      : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
                  }`}
                >
                  Boundaries
                </button>
                <button
                  type="button"
                  onClick={handleResetView}
                  className="inline-flex items-center gap-1 rounded border border-[#2B2E28] bg-[#1E201C] px-2 py-0.5 text-[#D2C7B0] whitespace-nowrap hover:text-[#EBE7DE]"
                >
                  <LocateFixed className="h-3 w-3 text-[#A3B47E]" aria-hidden="true" />
                  <span>Reset</span>
                </button>
              </div>

              <label className="inline-flex items-center gap-2">
                <span>Overlay Opacity</span>
                <input
                  type="range"
                  min={15}
                  max={100}
                  value={rasterOpacity}
                  onChange={(e) => setRasterOpacity(Number(e.target.value))}
                  className="w-16 cursor-pointer"
                  aria-label="Change raster overlay opacity"
                />
                <span className="w-8 font-mono tabular-nums text-[#EBE7DE]">{rasterOpacity}%</span>
              </label>
            </div>
          </div>

          <div className="relative min-h-[380px] flex-1 bg-[#0D0E0C]">
            {loading && !analysis && (
              <div className="absolute inset-0 z-[700] flex items-center justify-center bg-[#111210]/80 text-xs text-[#9A9484]">
                Computing change raster…
              </div>
            )}
            <div ref={mapContainerRef} className="h-[420px] w-full lg:h-full" />
          </div>

          <div className="border-t border-[#2B2E28] px-4 py-3">
            <p className="text-xs text-[#9A9484]">{currentMeta.description}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {currentMeta.legend.map((item) => (
                <div key={item.text} className="flex items-center gap-2 text-xs text-[#EBE7DE]">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-xs border border-white/15"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
            {selectedPoly && activeLayer === 'change-highlight' && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#242721] pt-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-[#857F70]">Change Category</p>
                  <p className="font-medium" style={{ color: selectedPoly.color }}>
                    {selectedPoly.categoryLabel}
                  </p>
                </div>
                <div>
                  <p className="text-[#857F70]">Coordinates</p>
                  <p className="font-mono text-[#D2C7B0] tabular-nums">
                    {selectedPoly.centroid.lat.toFixed(5)}° N, {selectedPoly.centroid.lon.toFixed(5)}° E
                  </p>
                </div>
                <div>
                  <p className="text-[#857F70]">Area</p>
                  <p className="font-mono text-[#EBE7DE] tabular-nums">
                    {selectedPoly.areaM2.toLocaleString()} m² ({selectedPoly.areaHa.toFixed(2)} ha)
                  </p>
                </div>
                <div>
                  <p className="text-[#857F70]">Transition &amp; Confidence</p>
                  <p className="font-mono text-[#A3B47E] tabular-nums">
                    {selectedPoly.earlierClass} → {selectedPoly.latestClass} ({selectedPoly.confidencePct}%)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Spectral Index Cards + NDVI Distribution Histogram */}
        <div className="flex flex-col justify-between gap-5 rounded-lg border border-[#2B2E28] bg-[#171916] p-5 lg:col-span-5">
          <div>
            <h3 className="font-display text-base font-semibold text-[#EBE7DE]">
              Calibrated Spectral Index Shifts
            </h3>
            <p className="mt-0.5 text-xs text-[#9A9484]">
              Computed across {analysis ? analysis.spatialAlignment.validJointPixels.toLocaleString() : '—'} mutually cloud-free pixels.
            </p>

            {analysis ? (
              <div className="mt-4 divide-y divide-[#252822] border-y border-[#252822]">
                {[
                  { name: 'NDVI (Vegetation)', formula: '(NIR − Red) / (NIR + Red)', stat: analysis.spectralIndices.ndvi },
                  { name: 'NDWI (Surface Water)', formula: '(Green − NIR) / (Green + NIR)', stat: analysis.spectralIndices.ndwi },
                  { name: 'NDBI (Built-up)', formula: '(SWIR1 − NIR) / (SWIR1 + NIR)', stat: analysis.spectralIndices.ndbi },
                  { name: 'BSI (Bare Soil / Clearing)', formula: '((SWIR1+Red)−(NIR+Blue))/Sum', stat: analysis.spectralIndices.bsi },
                ].map((row) => (
                  <div key={row.name} className="flex items-center justify-between gap-4 py-2.5">
                    <div>
                      <p className="text-xs font-medium text-[#EBE7DE]">{row.name}</p>
                      <p className="font-mono text-[11px] text-[#857F70]">{row.formula}</p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <p className="text-xs text-[#C7C0B0]">
                        {row.stat.mean2016.toFixed(3)} → {row.stat.mean2026.toFixed(3)}
                      </p>
                      <p
                        className={`text-xs font-semibold ${
                          row.stat.deltaMean >= 0 ? 'text-[#A3B47E]' : 'text-[#EF4444]'
                        }`}
                      >
                        Δ {fmtSigned(row.stat.deltaMean)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 font-mono text-xs text-[#9A9484]">Spectral index calculations pending…</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-[#EBE7DE]">
                NDVI Pixel Distribution (% of Analyzed Area)
              </h4>
              <span className="font-mono text-[11px] text-[#9A9484]">2016 vs 2026</span>
            </div>
            <div className="mt-3 h-[200px] w-full">
              {analysis ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analysis.spectralHistograms}
                    margin={{ top: 6, right: 6, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#252822" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="bin"
                      tick={{ fill: '#9A9484', fontSize: 10 }}
                      axisLine={{ stroke: '#2B2E28' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#9A9484', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      unit="%"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111210',
                        border: '1px solid #2B2E28',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#EBE7DE',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#C7C0B0' }} />
                    <Bar
                      dataKey="ndvi2016Pct"
                      name={`${analysis.scene2016.year} (${analysis.scene2016.dateLabel})`}
                      fill="#D2C7B0"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="ndvi2026Pct"
                      name={`${analysis.scene2026.year} (${analysis.scene2026.dateLabel})`}
                      fill="#8C9A6E"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center border border-[#252822] text-xs text-[#857F70]">
                  Histogram pending satellite data
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Categories A-F Multi-Unit Area Table + Building & Road Detection Scope */}
      {analysis && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="overflow-hidden rounded-lg border border-[#2B2E28] bg-[#171916] lg:col-span-8">
            <div className="border-b border-[#2B2E28] px-5 py-3.5">
              <h3 className="font-display text-base font-semibold text-[#EBE7DE]">
                Confirmed Land-Cover Changes (Categories A–F · m² / ha / km²)
              </h3>
              <p className="mt-0.5 text-xs text-[#9A9484]">
                Uncertain classifications below {Math.round(analysis.confidenceThreshold * 100)}% confidence ({analysis.spatialAlignment.uncertainExcludedArea.ha.toFixed(1)} ha) are excluded from confirmed change statistics.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#2B2E28] bg-[#141613] text-[#9A9484]">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Change Category</th>
                    <th className="px-4 py-2.5 text-right font-medium">Area (m²)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Area (ha)</th>
                    <th className="px-5 py-2.5 text-right font-medium">Area (km²)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#22251F] font-mono tabular-nums">
                  {[
                    { code: 'A', label: 'Newly developed / built-up land', color: '#F97316', m: analysis.detectedChanges.newlyBuiltUp },
                    { code: 'B', label: 'Vegetation loss', color: '#EF4444', m: analysis.detectedChanges.vegetationLoss },
                    { code: 'C', label: 'Vegetation gain', color: '#22C55E', m: analysis.detectedChanges.vegetationGain },
                    { code: 'D₁', label: 'Agricultural land converted to built-up', color: '#EAB308', m: analysis.detectedChanges.agriculturalToBuiltUp },
                    { code: 'D₂', label: 'Total agricultural land converted (all classes)', color: '#EAB308', m: analysis.detectedChanges.agriculturalConvertedTotal },
                    { code: 'E₁', label: 'Water-body expansion', color: '#3B82F6', m: analysis.detectedChanges.waterGained },
                    { code: 'E₂', label: 'Water-body reduction', color: '#3B82F6', m: analysis.detectedChanges.waterLost },
                    { code: 'F', label: 'Other confirmed land-cover transitions', color: '#9A9484', m: analysis.detectedChanges.otherChanges },
                  ].map((row) => (
                    <tr key={row.code} className="hover:bg-[#1C1E1A]">
                      <td className="px-5 py-2.5 font-sans">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-xs"
                            style={{ backgroundColor: row.color }}
                            aria-hidden="true"
                          />
                          <span className="font-mono text-[11px] text-[#9A9484]">{row.code}.</span>
                          <span className="text-[#EBE7DE]">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#C7C0B0]">
                        {row.m.m2.toLocaleString()} m²
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#EBE7DE]">
                        {row.m.ha.toFixed(2)} ha
                      </td>
                      <td className="px-5 py-2.5 text-right text-[#D2C7B0]">
                        {row.m.km2.toFixed(3)} km²
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Building & Road Detection Scope Card */}
          <div className="flex flex-col justify-between rounded-lg border border-[#2B2E28] bg-[#171916] p-5 lg:col-span-4">
            <div className="space-y-3">
              <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#F97316]">
                New Construction &amp; Resolution Scope
              </p>
              <h3 className="font-display text-base font-semibold text-[#EBE7DE]">
                Built-up Expansion vs Individual Buildings
              </h3>
              <p className="text-xs leading-relaxed text-[#C7C0B0]">
                {analysis.waybackPair.limitationNote}
              </p>
              <div className="border-t border-[#252822] pt-3 text-xs">
                <p className="text-[#9A9484]">Detected Built-up Expansion Clusters (≥0.16 ha)</p>
                <p className="mt-1 font-mono text-lg font-semibold text-[#F97316] tabular-nums">
                  {analysis.changePolygons.filter((p) => p.category === 'built_up' || (p.category === 'agri_conversion' && p.latestClass === 'Built-up Land')).length} clusters ·{' '}
                  {analysis.detectedChanges.newlyBuiltUp.ha.toFixed(1)} ha
                </p>
              </div>
            </div>

            {analysis.waybackPair.available && (
              <div className="mt-4 rounded border border-[#2B2E28] bg-[#141613] p-3 text-xs">
                <p className="font-medium text-[#EBE7DE]">High-Resolution Verification Available</p>
                <p className="mt-1 font-mono text-[11px] text-[#9A9484]">
                  Esri Wayback: {analysis.waybackPair.earlier?.captureDate} vs {analysis.waybackPair.latest?.captureDate} (&lt;1 m)
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Geographic Quadrant Breakdown Table */}
      <div className="overflow-hidden rounded-lg border border-[#2B2E28] bg-[#171916]">
        <div className="border-b border-[#2B2E28] px-5 py-3.5">
          <h3 className="font-display text-base font-semibold text-[#EBE7DE]">
            Spatial Quadrant Change Breakdown (Ammapalem 6 × 6 km AOI)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#2B2E28] bg-[#141613] text-[#9A9484]">
              <tr>
                <th className="px-5 py-3 font-medium">Sector &amp; Coordinates</th>
                <th className="px-4 py-3 text-right font-medium">Analyzed</th>
                <th className="px-4 py-3 text-right font-medium">Δ Vegetation</th>
                <th className="px-4 py-3 text-right font-medium">Δ Agriculture</th>
                <th className="px-4 py-3 text-right font-medium">Δ Built-up</th>
                <th className="px-4 py-3 text-right font-medium">Δ Water</th>
                <th className="px-5 py-3 text-right font-medium">Mean ΔNDVI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#22251F] font-mono tabular-nums">
              {analysis ? (
                analysis.quadrants.map((q) => (
                  <tr key={q.name} className="hover:bg-[#1C1E1A]">
                    <td className="px-5 py-3 font-sans">
                      <p className="font-medium text-[#EBE7DE]">{q.name}</p>
                      <p className="font-mono text-[11px] text-[#857F70]">{q.boundsLabel}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-[#C7C0B0]">
                      {q.analyzedKm2.toFixed(2)} km²
                    </td>
                    <td className={`px-4 py-3 text-right ${q.vegDeltaKm2 >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                      {fmtSigned(q.vegDeltaKm2, 2)} km²
                    </td>
                    <td className="px-4 py-3 text-right text-[#EAB308]">
                      {fmtSigned(q.agriDeltaKm2, 2)} km²
                    </td>
                    <td className="px-4 py-3 text-right text-[#F97316]">
                      {fmtSigned(q.builtUpDeltaKm2, 2)} km²
                    </td>
                    <td className="px-4 py-3 text-right text-[#3B82F6]">
                      {fmtSigned(q.waterDeltaKm2, 2)} km²
                    </td>
                    <td className="px-5 py-3 text-right text-[#EBE7DE]">
                      {fmtSigned(q.meanDeltaNdvi, 3)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-[#857F70]">
                    Sector breakdown pending satellite computation…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
