import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
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
import type { AnalysisResult, ChangePolygonFeature } from '../types/earth';

type ChangeLayerId = 'change-highlight' | 'change-veg' | 'change-builtup' | 'change-water';

interface ChangeDetectionSectionProps {
  analysis: AnalysisResult | null;
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

export function ChangeDetectionSection({ analysis, loading }: ChangeDetectionSectionProps) {
  const [activeLayer, setActiveLayer] = useState<ChangeLayerId>('change-highlight');
  const [selectedPoly, setSelectedPoly] = useState<ChangePolygonFeature | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const polyGroupRef = useRef<L.LayerGroup | null>(null);

  const centerLat = analysis?.location.center.lat ?? 17.2237;
  const centerLon = analysis?.location.center.lon ?? 80.2483;
  const bbox = analysis?.location.bbox ?? [80.22009, 17.19659, 80.27651, 17.25081];

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLon],
      zoom: 13,
      minZoom: 11,
      maxZoom: 17,
    });

    // Esri World Dark Gray Base (no API key watermarks)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 16,
      }
    ).addTo(map);

    map.fitBounds(
      [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ],
      { padding: [10, 10] }
    );

    L.rectangle(
      [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ],
      { color: '#D2C7B0', weight: 1.2, dashArray: '4 4', fill: false, interactive: false }
    ).addTo(map);

    polyGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      polyGroupRef.current = null;
    };
  }, [centerLat, centerLon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !analysis) return;
    if (overlayRef.current) overlayRef.current.remove();
    const url = analysis.layers[activeLayer];
    if (url) {
      overlayRef.current = L.imageOverlay(
        url,
        [
          [bbox[1], bbox[0]],
          [bbox[3], bbox[2]],
        ],
        { opacity: 0.9, interactive: false }
      ).addTo(map);
    }
  }, [analysis, activeLayer]);

  // Render clickable change polygons when 5-Class Change Highlight is active
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
          style: {
            color: isSelected ? '#FFFFFF' : poly.color,
            weight: isSelected ? 2.5 : 1.2,
            fillColor: poly.color,
            fillOpacity: isSelected ? 0.55 : 0.25,
          },
        }
      );
      layer.on('click', () => setSelectedPoly(poly));
      layer.bindTooltip(
        `${poly.categoryLabel} · ${poly.areaHa.toFixed(2)} ha (${poly.confidencePct}%)`,
        { sticky: true }
      );
      layer.addTo(group);
    }
  }, [analysis, activeLayer, selectedPoly]);

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
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[#2B2E28] px-4 py-3">
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

          <div className="relative min-h-[380px] flex-1 bg-[#0D0E0C]">
            {loading && !analysis && (
              <div className="absolute inset-0 z-[400] flex items-center justify-center bg-[#111210]/80 text-xs text-[#9A9484]">
                Computing change raster…
              </div>
            )}
            <div ref={mapContainerRef} className="h-[400px] w-full lg:h-full" />
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#242721] pt-2.5 text-xs">
                <span className="text-[#EBE7DE]">
                  <strong style={{ color: selectedPoly.color }}>{selectedPoly.categoryLabel}:</strong>{' '}
                  {selectedPoly.earlierClass} → {selectedPoly.latestClass}
                </span>
                <span className="font-mono text-[#D2C7B0] tabular-nums">
                  {selectedPoly.areaM2.toLocaleString()} m² · {selectedPoly.areaHa.toFixed(2)} ha · {selectedPoly.confidencePct}% conf.
                </span>
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
