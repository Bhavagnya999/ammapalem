import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Columns2,
  Crosshair,
  Eye,
  Layers,
  LocateFixed,
  MoveHorizontal,
  ZoomIn,
} from 'lucide-react';
import type {
  AnalysisResult,
  ChangeOverlayCategory,
  ChangePolygonFeature,
  PixelProbeResult,
} from '../types/earth';

type CompareMode = 'slider' | 'side-by-side';
type ImagerySourceMode = 'multispectral' | 'wayback';
type LayerChannel = 'rgb' | 'fcc' | 'ndvi' | 'ndwi' | 'ndbi' | 'lulc';

interface SatelliteComparisonProps {
  analysis: AnalysisResult | null;
  loading: boolean;
  error: string | null;
}

const CHANNELS: Array<{ id: LayerChannel; label: string; hint: string }> = [
  { id: 'rgb', label: 'True Color', hint: 'Natural optical reflectance across full orbital swath' },
  { id: 'fcc', label: 'False Color (NIR)', hint: 'NIR / Red / Green — vegetation appears crimson' },
  { id: 'ndvi', label: 'NDVI', hint: 'Normalized Difference Vegetation Index' },
  { id: 'ndwi', label: 'NDWI', hint: 'Normalized Difference Water Index' },
  { id: 'ndbi', label: 'NDBI', hint: 'Normalized Difference Built-up Index' },
  { id: 'lulc', label: 'Land Cover', hint: '5-class probability-weighted classification' },
];

const CHANGE_FILTERS: Array<{
  id: ChangeOverlayCategory;
  label: string;
  color: string;
}> = [
  { id: 'built_up', label: 'Newly Built-up', color: '#F97316' },
  { id: 'veg_loss', label: 'Vegetation Loss', color: '#EF4444' },
  { id: 'veg_gain', label: 'Vegetation Gain', color: '#22C55E' },
  { id: 'water_change', label: 'Water Changes', color: '#3B82F6' },
  { id: 'agri_conversion', label: 'Agri Conversion', color: '#EAB308' },
];

export function SatelliteComparison({ analysis, loading, error }: SatelliteComparisonProps) {
  const [mode, setMode] = useState<CompareMode>('slider');
  const [sourceMode, setSourceMode] = useState<ImagerySourceMode>('multispectral');
  const [channel, setChannel] = useState<LayerChannel>('rgb');
  const [sliderPct, setSliderPct] = useState<number>(50);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(100);
  const [showBoundaries, setShowBoundaries] = useState<boolean>(true);
  const [showChangeOverlay, setShowChangeOverlay] = useState<boolean>(true);
  const [enabledCats, setEnabledCats] = useState<Record<ChangeOverlayCategory, boolean>>({
    built_up: true,
    veg_loss: true,
    veg_gain: true,
    water_change: true,
    agri_conversion: true,
  });
  const [selectedPolygon, setSelectedPolygon] = useState<ChangePolygonFeature | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [probe, setProbe] = useState<PixelProbeResult | null>(null);
  const [probing, setProbing] = useState<boolean>(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const leftContainerRef = useRef<HTMLDivElement | null>(null);
  const rightContainerRef = useRef<HTMLDivElement | null>(null);

  const leftMapRef = useRef<L.Map | null>(null);
  const rightMapRef = useRef<L.Map | null>(null);
  const leftSatTileRef = useRef<L.TileLayer | null>(null);
  const rightSatTileRef = useRef<L.TileLayer | null>(null);
  const leftOverlayRef = useRef<L.ImageOverlay | null>(null);
  const rightOverlayRef = useRef<L.ImageOverlay | null>(null);
  const leftVectorGroupRef = useRef<L.LayerGroup | null>(null);
  const rightVectorGroupRef = useRef<L.LayerGroup | null>(null);
  const leftPolyGroupRef = useRef<L.LayerGroup | null>(null);
  const rightPolyGroupRef = useRef<L.LayerGroup | null>(null);
  const syncingRef = useRef<boolean>(false);
  const draggingSliderRef = useRef<boolean>(false);
  const fittedRef = useRef<boolean>(false);

  const centerLat = analysis?.location.center.lat ?? 17.2237;
  const centerLon = analysis?.location.center.lon ?? 80.2483;
  const bbox = analysis?.location.bbox ?? [80.22009, 17.19659, 80.27651, 17.25081];
  const leafletBounds: L.LatLngBoundsExpression = [
    [bbox[1], bbox[0]],
    [bbox[3], bbox[2]],
  ];

  // Initialize synchronized Leaflet map pair with Esri Dark Gray basemap (no Carto API watermark)
  useEffect(() => {
    if (!leftContainerRef.current || !rightContainerRef.current) return;

    const createBaseMap = (container: HTMLElement, withZoomControl: boolean) => {
      const map = L.map(container, {
        center: [centerLat, centerLon],
        zoom: 14,
        minZoom: 11,
        maxZoom: 18,
        zoomControl: withZoomControl,
        attributionControl: withZoomControl,
      });

      // Esri World Dark Gray Base (verified 200 OK without API key watermarks)
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors',
          maxZoom: 16,
        }
      ).addTo(map);

      return map;
    };

    const leftMap = createBaseMap(leftContainerRef.current, true);
    const rightMap = createBaseMap(rightContainerRef.current, false);

    leftMapRef.current = leftMap;
    rightMapRef.current = rightMap;
    leftVectorGroupRef.current = L.layerGroup().addTo(leftMap);
    rightVectorGroupRef.current = L.layerGroup().addTo(rightMap);
    leftPolyGroupRef.current = L.layerGroup().addTo(leftMap);
    rightPolyGroupRef.current = L.layerGroup().addTo(rightMap);

    if (!fittedRef.current) {
      leftMap.fitBounds(leafletBounds, { padding: [12, 12] });
      rightMap.setView(leftMap.getCenter(), leftMap.getZoom(), { animate: false });
      fittedRef.current = true;
    }

    const syncMaps = (source: L.Map, target: L.Map) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      target.setView(source.getCenter(), source.getZoom(), { animate: false });
      syncingRef.current = false;
    };

    leftMap.on('move', () => syncMaps(leftMap, rightMap));
    leftMap.on('zoom', () => syncMaps(leftMap, rightMap));
    rightMap.on('move', () => syncMaps(rightMap, leftMap));
    rightMap.on('zoom', () => syncMaps(rightMap, leftMap));

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      setHoverCoord({ lat: e.latlng.lat, lon: e.latlng.lng });
    };
    leftMap.on('mousemove', handleMouseMove);
    rightMap.on('mousemove', handleMouseMove);

    return () => {
      leftMap.remove();
      rightMap.remove();
      leftMapRef.current = null;
      rightMapRef.current = null;
      leftSatTileRef.current = null;
      rightSatTileRef.current = null;
      leftOverlayRef.current = null;
      rightOverlayRef.current = null;
      fittedRef.current = false;
    };
  }, [centerLat, centerLon]);

  // Reflow Leaflet viewports when switching between slider and side-by-side
  useEffect(() => {
    const timer = setTimeout(() => {
      leftMapRef.current?.invalidateSize({ animate: false });
      rightMapRef.current?.invalidateSize({ animate: false });
      if (leftMapRef.current && rightMapRef.current) {
        rightMapRef.current.setView(leftMapRef.current.getCenter(), leftMapRef.current.getZoom(), {
          animate: false,
        });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [mode]);

  // Manage full-viewport satellite XYZ tiles + study-area spectral overlays
  useEffect(() => {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap || !analysis) return;

    if (leftSatTileRef.current) leftSatTileRef.current.remove();
    if (rightSatTileRef.current) rightSatTileRef.current.remove();
    if (leftOverlayRef.current) leftOverlayRef.current.remove();
    if (rightOverlayRef.current) rightOverlayRef.current.remove();

    if (sourceMode === 'wayback' && analysis.waybackPair.available) {
      const wb16 = analysis.waybackPair.earlier;
      const wb26 = analysis.waybackPair.latest;
      if (wb16) {
        leftSatTileRef.current = L.tileLayer(wb16.tileUrlTemplate, {
          maxZoom: 18,
          opacity: overlayOpacity / 100,
          attribution: `Esri Wayback (${wb16.captureDate})`,
        }).addTo(leftMap);
      }
      if (wb26) {
        rightSatTileRef.current = L.tileLayer(wb26.tileUrlTemplate, {
          maxZoom: 18,
          opacity: overlayOpacity / 100,
          attribution: `Esri Wayback (${wb26.captureDate})`,
        }).addTo(rightMap);
      }
      return;
    }

    // Full-swath Sentinel-2 / Landsat real XYZ tiles so imagery extends across entire viewport
    const tile16Url = `/api/tile/${analysis.scene2016.collection}/${encodeURIComponent(analysis.scene2016.id)}/{z}/{x}/{y}.png`;
    const tile26Url = `/api/tile/${analysis.scene2026.collection}/${encodeURIComponent(analysis.scene2026.id)}/{z}/{x}/{y}.png`;

    leftSatTileRef.current = L.tileLayer(tile16Url, {
      maxZoom: 17,
      opacity: overlayOpacity / 100,
    }).addTo(leftMap);

    rightSatTileRef.current = L.tileLayer(tile26Url, {
      maxZoom: 17,
      opacity: overlayOpacity / 100,
    }).addTo(rightMap);

    // For analytical spectral channels (FCC, NDVI, NDWI, NDBI, LULC) or exact-extent RGB, layer the cropped 10m raster
    if (channel !== 'rgb') {
      const url16 = analysis.layers[`${channel}-2016`];
      const url26 = analysis.layers[`${channel}-2026`];
      if (url16) {
        leftOverlayRef.current = L.imageOverlay(url16, leafletBounds, {
          opacity: overlayOpacity / 100,
          interactive: false,
        }).addTo(leftMap);
      }
      if (url26) {
        rightOverlayRef.current = L.imageOverlay(url26, leafletBounds, {
          opacity: overlayOpacity / 100,
          interactive: false,
        }).addTo(rightMap);
      }
    }
  }, [analysis, sourceMode, channel]);

  // Sync overlay opacity dynamically
  useEffect(() => {
    const op = overlayOpacity / 100;
    leftSatTileRef.current?.setOpacity(op);
    rightSatTileRef.current?.setOpacity(op);
    leftOverlayRef.current?.setOpacity(op);
    rightOverlayRef.current?.setOpacity(op);
  }, [overlayOpacity]);

  // Render clickable GeoJSON change highlight polygons on BOTH synchronized maps
  useEffect(() => {
    const groups = [leftPolyGroupRef.current, rightPolyGroupRef.current];
    for (const g of groups) {
      if (!g) continue;
      g.clearLayers();
      if (!analysis || !showChangeOverlay) continue;

      const filtered = analysis.changePolygons.filter((p) => enabledCats[p.category]);
      if (filtered.length === 0) continue;

      for (const poly of filtered) {
        const isSelected = selectedPolygon?.id === poly.id;
        const layer = L.geoJSON(
          {
            type: 'Feature',
            properties: {},
            geometry: poly.geometry,
          } as GeoJSON.Feature,
          {
            style: {
              color: isSelected ? '#FFFFFF' : poly.color,
              weight: isSelected ? 2.5 : 1.3,
              fillColor: poly.color,
              fillOpacity: isSelected ? 0.55 : 0.34,
            },
          }
        );

        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedPolygon(poly);
        });

        layer.bindTooltip(
          `${poly.categoryLabel} · ${poly.areaHa.toFixed(2)} ha (${poly.confidencePct}% conf.)`,
          { sticky: true, direction: 'top' }
        );
        layer.addTo(g);
      }
    }
  }, [analysis, showChangeOverlay, enabledCats, selectedPolygon]);

  // Toggle AOI boundary and Ammapalem marker
  useEffect(() => {
    const groups = [leftVectorGroupRef.current, rightVectorGroupRef.current];
    for (const g of groups) {
      if (!g) continue;
      g.clearLayers();
      if (showBoundaries) {
        L.rectangle(leafletBounds, {
          color: '#EBE7DE',
          weight: 1.5,
          dashArray: '6 4',
          fill: false,
          interactive: false,
        }).addTo(g);

        L.circleMarker([centerLat, centerLon], {
          radius: 5,
          color: '#111210',
          weight: 1.5,
          fillColor: '#A3B47E',
          fillOpacity: 0.95,
          interactive: false,
        }).addTo(g);
      }
    }
  }, [showBoundaries, centerLat, centerLon, bbox]);

  // Click-to-probe pixel metrics
  useEffect(() => {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap) return;

    const handleClick = async (e: L.LeafletMouseEvent) => {
      if (!analysis) return;
      setProbing(true);
      try {
        const res = await fetch(
          `/api/probe?key=${encodeURIComponent(analysis.key)}&lat=${e.latlng.lat}&lon=${e.latlng.lng}`
        );
        if (res.ok) {
          const data: PixelProbeResult = await res.json();
          setProbe(data);
        }
      } finally {
        setProbing(false);
      }
    };

    leftMap.on('click', handleClick);
    rightMap.on('click', handleClick);
    return () => {
      leftMap.off('click', handleClick);
      rightMap.off('click', handleClick);
    };
  }, [analysis]);

  const handleResetView = () => {
    leftMapRef.current?.fitBounds(leafletBounds, { padding: [12, 12], animate: true });
  };

  const handleZoomToPolygonInHighRes = (poly: ChangePolygonFeature) => {
    if (analysis?.waybackPair.available) {
      setSourceMode('wayback');
    }
    leftMapRef.current?.setView([poly.centroid.lat, poly.centroid.lon], 17, { animate: true });
  };

  const toggleCategory = (cat: ChangeOverlayCategory) => {
    setEnabledCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Dragging logic for vertical swipe slider
  const updateSliderFromClientX = (clientX: number) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSliderPct(Math.min(96, Math.max(4, pct)));
  };

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingSliderRef.current) return;
      updateSliderFromClientX(e.clientX);
    };
    const onPointerUp = () => {
      draggingSliderRef.current = false;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const leftDateLabel =
    sourceMode === 'wayback' && analysis?.waybackPair.earlier
      ? analysis.waybackPair.earlier.captureDate
      : analysis?.scene2016.dateLabel ?? 'Pending';
  const rightDateLabel =
    sourceMode === 'wayback' && analysis?.waybackPair.latest
      ? analysis.waybackPair.latest.captureDate
      : analysis?.scene2026.dateLabel ?? 'Pending';

  const leftSourceText =
    sourceMode === 'wayback'
      ? 'Esri World Imagery Wayback (<1 m)'
      : analysis
      ? `${analysis.scene2016.mission} · ${analysis.scene2016.resolutionMeters} m · Cloud ${analysis.scene2016.cloudCover.toFixed(2)}%`
      : 'Sentinel-2 L2A';

  const rightSourceText =
    sourceMode === 'wayback'
      ? 'Esri World Imagery Wayback (<1 m)'
      : analysis
      ? `${analysis.scene2026.mission} · ${analysis.scene2026.resolutionMeters} m · Cloud ${analysis.scene2026.cloudCover.toFixed(2)}%`
      : 'Sentinel-2 L2A';

  const activeChannelMeta = CHANNELS.find((c) => c.id === channel)!;

  return (
    <section id="comparison" className="scroll-mt-20 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#A3B47E]">
            Interactive Before / After Viewer &amp; Clickable Change Polygons
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#EBE7DE]">
            Satellite Comparison · Oct 2016 vs 2026
          </h2>
          <p className="mt-1 text-sm text-[#9A9484]">
            Full-extent co-registered imagery centered on Ammapalem (17.2237° N, 80.2483° E). Drag the divider, toggle detected change polygons, or switch to High-Res Wayback to inspect buildings and roads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Imagery Source Mode: Multispectral vs High-Res Wayback */}
          <div
            role="group"
            aria-label="Imagery resolution source"
            className="inline-flex items-center rounded-md border border-[#2B2E28] bg-[#171916] p-1"
          >
            <button
              type="button"
              onClick={() => setSourceMode('multispectral')}
              className={`rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                sourceMode === 'multispectral'
                  ? 'bg-[#8C9A6E]/25 text-[#EBE7DE]'
                  : 'text-[#9A9484] hover:text-[#EBE7DE]'
              }`}
            >
              Sentinel-2 / Landsat
            </button>
            <button
              type="button"
              disabled={!analysis?.waybackPair.available}
              onClick={() => setSourceMode('wayback')}
              className={`rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors disabled:opacity-40 ${
                sourceMode === 'wayback'
                  ? 'bg-[#D2C7B0]/25 text-[#EBE7DE]'
                  : 'text-[#9A9484] hover:text-[#EBE7DE]'
              }`}
            >
              High-Res Wayback (&lt;1 m)
            </button>
          </div>

          <div
            role="group"
            aria-label="Comparison layout"
            className="inline-flex items-center rounded-md border border-[#2B2E28] bg-[#171916] p-1"
          >
            <button
              type="button"
              onClick={() => setMode('slider')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                mode === 'slider'
                  ? 'bg-[#8C9A6E]/25 text-[#EBE7DE]'
                  : 'text-[#9A9484] hover:text-[#EBE7DE]'
              }`}
            >
              <MoveHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Slider</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('side-by-side')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                mode === 'side-by-side'
                  ? 'bg-[#8C9A6E]/25 text-[#EBE7DE]'
                  : 'text-[#9A9484] hover:text-[#EBE7DE]'
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Side-by-Side</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetView}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2B2E28] bg-[#171916] px-3 py-2 text-xs font-medium text-[#D2C7B0] whitespace-nowrap shrink-0 transition-colors hover:border-[#4A4E44] hover:text-[#EBE7DE]"
          >
            <LocateFixed className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
            <span>Fit AOI</span>
          </button>
        </div>
      </div>

      {/* Spectral Band & Change Overlay Toolbar */}
      <div className="space-y-2.5 rounded-lg border border-[#2B2E28] bg-[#171916] px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#9A9484]">
              <Layers className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
              <span>Layer:</span>
            </span>
            {CHANNELS.map((ch) => (
              <button
                key={ch.id}
                type="button"
                disabled={sourceMode === 'wayback'}
                onClick={() => setChannel(ch.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors disabled:opacity-40 ${
                  channel === ch.id && sourceMode === 'multispectral'
                    ? 'bg-[#8C9A6E] text-[#111210]'
                    : 'bg-[#1E201C] text-[#C7C0B0] hover:bg-[#272A24] hover:text-[#EBE7DE]'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-[#9A9484]">
            <label className="inline-flex items-center gap-2">
              <span className="whitespace-nowrap">Opacity</span>
              <input
                type="range"
                min={30}
                max={100}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                className="w-20 cursor-pointer"
                aria-label="Imagery opacity"
              />
              <span className="w-9 font-mono tabular-nums text-[#EBE7DE]">{overlayOpacity}%</span>
            </label>

            <button
              type="button"
              onClick={() => setShowBoundaries((v) => !v)}
              className={`rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                showBoundaries
                  ? 'border-[#D2C7B0]/50 bg-[#D2C7B0]/15 text-[#EBE7DE]'
                  : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
              }`}
            >
              AOI Frame
            </button>
          </div>
        </div>

        {/* Toggleable 5-Color Change Highlight Overlay Controls */}
        <div className="flex flex-col gap-2 border-t border-[#242721] pt-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowChangeOverlay((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                showChangeOverlay
                  ? 'border-[#8C9A6E] bg-[#8C9A6E]/20 text-[#EBE7DE]'
                  : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
              }`}
            >
              <Eye className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
              <span>Change Highlight Overlay ({analysis?.changePolygons.length ?? 0} polygons)</span>
            </button>

            {showChangeOverlay &&
              CHANGE_FILTERS.map((cat) => {
                const active = enabledCats[cat.id];
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'border-[#3B3F36] bg-[#1E201C] text-[#EBE7DE]'
                        : 'border-[#242721] bg-[#141613] text-[#6E6A5E]'
                    }`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-xs"
                      style={{ backgroundColor: active ? cat.color : '#3E4139' }}
                      aria-hidden="true"
                    />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
          </div>

          <span className="text-[11px] text-[#857F70]">
            Click any highlighted polygon on the map to inspect area, transition, and confidence.
          </span>
        </div>
      </div>

      {/* Main Full-Width Map Comparison Stage */}
      <div className="relative overflow-hidden rounded-lg border border-[#2B2E28] bg-[#0D0E0C]">
        {loading && (
          <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center bg-[#111210]/80 backdrop-blur-[2px]">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#2B2E28] border-t-[#A3B47E]" />
            <p className="mt-3 text-sm font-medium text-[#EBE7DE]">
              Processing multi-temporal satellite bands &amp; change polygons…
            </p>
            <p className="mt-1 font-mono text-xs text-[#9A9484]">
              Computing confidence-gated pixel classifications over Ammapalem
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="flex min-h-[460px] flex-col items-center justify-center p-8 text-center">
            <p className="font-display text-lg font-medium text-[#D2C7B0]">
              Satellite Imagery Analysis Pending
            </p>
            <p className="mt-2 max-w-md text-sm text-[#9A9484]">{error}</p>
          </div>
        )}

        <div
          ref={stageRef}
          className={`relative w-full ${
            mode === 'slider'
              ? 'h-[580px] lg:h-[640px]'
              : 'grid grid-cols-1 gap-px bg-[#2B2E28] lg:grid-cols-2'
          }`}
        >
          {/* LEFT / 2016 VIEWPORT */}
          <div
            className={`relative ${
              mode === 'slider' ? 'absolute inset-0 h-full w-full' : 'h-[460px] lg:h-[560px] w-full'
            }`}
          >
            <div ref={leftContainerRef} className="h-full w-full" />

            <div className="pointer-events-none absolute top-3 left-14 z-[400] max-w-[calc(100%-4.5rem)] rounded border border-[#2B2E28] bg-[#111210]/90 px-3 py-2 backdrop-blur-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="font-mono font-semibold text-[#D2C7B0]">LEFT · 2016</span>
                <span className="text-[#5C594E]" aria-hidden="true">·</span>
                <span className="font-mono text-[#EBE7DE]">{leftDateLabel}</span>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-[#9A9484] tabular-nums">
                {leftSourceText}
              </p>
            </div>
          </div>

          {/* RIGHT / 2026 VIEWPORT */}
          <div
            className={`relative ${
              mode === 'slider' ? 'absolute inset-0 h-full w-full' : 'h-[460px] lg:h-[560px] w-full'
            }`}
            style={
              mode === 'slider'
                ? { clipPath: `inset(0 0 0 ${sliderPct}%)` }
                : undefined
            }
          >
            <div ref={rightContainerRef} className="h-full w-full" />

            <div className="pointer-events-none absolute top-3 right-3 z-[400] max-w-[calc(100%-2rem)] rounded border border-[#2B2E28] bg-[#111210]/90 px-3 py-2 text-right backdrop-blur-xs">
              <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs">
                <span className="font-mono text-[#EBE7DE]">{rightDateLabel}</span>
                <span className="text-[#5C594E]" aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-[#A3B47E]">RIGHT · 2026</span>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-[#9A9484] tabular-nums">
                {rightSourceText}
              </p>
            </div>
          </div>

          {/* Interactive Slider Handle */}
          {mode === 'slider' && (
            <div
              role="slider"
              tabIndex={0}
              aria-label="Satellite comparison swipe divider between 2016 and 2026"
              aria-valuemin={4}
              aria-valuemax={96}
              aria-valuenow={Math.round(sliderPct)}
              onPointerDown={(e) => {
                e.preventDefault();
                draggingSliderRef.current = true;
                updateSliderFromClientX(e.clientX);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setSliderPct((p) => Math.max(4, p - 2));
                if (e.key === 'ArrowRight') setSliderPct((p) => Math.min(96, p + 2));
              }}
              className="absolute top-0 bottom-0 z-[450] w-0.5 -translate-x-1/2 cursor-ew-resize bg-[#EBE7DE] focus-visible:outline-2 focus-visible:outline-[#A3B47E]"
              style={{ left: `${sliderPct}%` }}
            >
              <div className="absolute top-1/2 left-1/2 flex h-10 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border border-[#EBE7DE] bg-[#111210]/95 shadow-lg">
                <MoveHorizontal className="h-4 w-4 text-[#EBE7DE]" aria-hidden="true" />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Telemetry & Pixel Probe Bar */}
        <div className="flex flex-col gap-2 border-t border-[#2B2E28] bg-[#171916] px-4 py-2.5 text-xs lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[#9A9484] tabular-nums">
            <span>
              Center: <strong className="font-medium text-[#EBE7DE]">17.2237° N, 80.2483° E</strong>
            </span>
            <span>
              Cursor:{' '}
              <strong className="font-medium text-[#D2C7B0]">
                {hoverCoord
                  ? `${hoverCoord.lat.toFixed(5)}° N, ${hoverCoord.lon.toFixed(5)}° E`
                  : 'Move pointer over map'}
              </strong>
            </span>
            <span className="text-[#857F70]">
              {sourceMode === 'wayback'
                ? 'Sub-meter visual inspection mode for individual buildings & roads'
                : activeChannelMeta.hint}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
            <Crosshair className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
            {probing ? (
              <span className="text-[#9A9484]">Reading pixel spectral bands…</span>
            ) : probe && !probe.outOfBounds ? (
              <span className="text-[#EBE7DE]">
                ({probe.lat?.toFixed(4)}°N, {probe.lon?.toFixed(4)}°E):{' '}
                <span className="text-[#D2C7B0]">
                  2016 {probe.masked2016 ? 'Masked' : `${probe.year2016?.landCover} (${probe.year2016?.confidencePct}%)`}
                </span>
                {' → '}
                <span className="text-[#A3B47E]">
                  2026 {probe.masked2026 ? 'Masked' : `${probe.year2026?.landCover} (${probe.year2026?.confidencePct}%)`}
                </span>
              </span>
            ) : (
              <span className="text-[#9A9484]">Click map or any change polygon to inspect</span>
            )}
          </div>
        </div>
      </div>

      {/* Selected Change Polygon Inspector Card */}
      {selectedPolygon && (
        <div className="flex flex-col gap-4 rounded-lg border border-[#3B3F36] bg-[#171916] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="inline-block h-3 w-3 rounded-xs"
                style={{ backgroundColor: selectedPolygon.color }}
                aria-hidden="true"
              />
              <h3 className="font-display text-base font-semibold text-[#EBE7DE]">
                Detected Change Cluster · {selectedPolygon.categoryLabel}
              </h3>
              <span className="font-mono text-xs text-[#9A9484]">
                ({selectedPolygon.centroid.lat.toFixed(5)}° N, {selectedPolygon.centroid.lon.toFixed(5)}° E)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-2 pt-1 text-xs sm:grid-cols-4">
              <div>
                <p className="text-[#9A9484]">Approximate Area</p>
                <p className="mt-0.5 font-mono font-medium text-[#EBE7DE] tabular-nums">
                  {selectedPolygon.areaM2.toLocaleString()} m² · {selectedPolygon.areaHa.toFixed(2)} ha · {selectedPolygon.areaKm2.toFixed(4)} km²
                </p>
              </div>
              <div>
                <p className="text-[#9A9484]">Earlier Class (2016)</p>
                <p className="mt-0.5 font-mono font-medium text-[#D2C7B0]">
                  {selectedPolygon.earlierClass} (NDVI {selectedPolygon.meanNdvi2016})
                </p>
              </div>
              <div>
                <p className="text-[#9A9484]">Latest Class (2026)</p>
                <p className="mt-0.5 font-mono font-medium text-[#A3B47E]">
                  {selectedPolygon.latestClass} (NDVI {selectedPolygon.meanNdvi2026})
                </p>
              </div>
              <div>
                <p className="text-[#9A9484]">Detection Confidence</p>
                <p className="mt-0.5 font-mono font-medium text-[#EBE7DE] tabular-nums">
                  {selectedPolygon.confidencePct.toFixed(1)}% ({selectedPolygon.pixelCount} pixels)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {analysis?.waybackPair.available && (
              <button
                type="button"
                onClick={() => handleZoomToPolygonInHighRes(selectedPolygon)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#8C9A6E] px-3.5 py-2 text-xs font-semibold text-[#111210] whitespace-nowrap transition-colors hover:bg-[#9DAD7D]"
              >
                <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Verify in High-Res (z=17)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedPolygon(null)}
              className="rounded-md border border-[#2B2E28] bg-[#1E201C] px-3 py-2 text-xs font-medium text-[#C7C0B0] whitespace-nowrap hover:text-[#EBE7DE]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
