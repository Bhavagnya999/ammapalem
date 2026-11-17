import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Columns2,
  Crosshair,
  Eye,
  Info,
  Layers,
  LocateFixed,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Minus,
  MoveHorizontal,
  Plus,
  Route,
  Tag,
  ZoomIn,
} from 'lucide-react';
import type {
  AdminBoundariesResponse,
  AnalysisResult,
  ChangeOverlayCategory,
  ChangePolygonFeature,
  PixelProbeResult,
} from '../types/earth';

type CompareMode = 'slider' | 'side-by-side';
type ImagerySourceMode = 'multispectral' | 'wayback';
type BasemapType = 'satellite' | 'terrain';
type LayerChannel = 'rgb' | 'fcc' | 'ndvi' | 'ndwi' | 'ndbi' | 'lulc';

interface SatelliteComparisonProps {
  analysis: AnalysisResult | null;
  boundaries: AdminBoundariesResponse | null;
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

function ensureMapPanes(map: L.Map) {
  const specs: Array<{ name: string; zIndex: number; passThrough: boolean }> = [
    { name: 'basemapPane', zIndex: 200, passThrough: false },
    { name: 'satellitePane', zIndex: 250, passThrough: false },
    { name: 'changePane', zIndex: 420, passThrough: false },
    { name: 'boundaryPane', zIndex: 520, passThrough: true },
    { name: 'transportPane', zIndex: 610, passThrough: true },
    { name: 'labelsPane', zIndex: 660, passThrough: true },
  ];
  for (const s of specs) {
    const pane = map.getPane(s.name) ?? map.createPane(s.name);
    pane.style.zIndex = String(s.zIndex);
    if (s.passThrough) {
      pane.style.pointerEvents = 'none';
    }
  }
}

export function SatelliteComparison({
  analysis,
  boundaries,
  loading,
  error,
}: SatelliteComparisonProps) {
  const [mode, setMode] = useState<CompareMode>('slider');
  const [sourceMode, setSourceMode] = useState<ImagerySourceMode>('multispectral');
  const [basemap, setBasemap] = useState<BasemapType>('satellite');
  const [channel, setChannel] = useState<LayerChannel>('rgb');
  const [sliderPct, setSliderPct] = useState<number>(50);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(100);

  // Geographical & overlay layer toggles
  const [showPlaceLabels, setShowPlaceLabels] = useState<boolean>(true);
  const [showRoadLabels, setShowRoadLabels] = useState<boolean>(true);
  const [showVillageBoundary, setShowVillageBoundary] = useState<boolean>(true);
  const [showMandalBoundary, setShowMandalBoundary] = useState<boolean>(true);
  const [showDistrictBoundary, setShowDistrictBoundary] = useState<boolean>(false);
  const [showStudyGrid, setShowStudyGrid] = useState<boolean>(true);
  const [showChangeOverlay, setShowChangeOverlay] = useState<boolean>(true);
  const [showInfoPanel, setShowInfoPanel] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

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

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const leftContainerRef = useRef<HTMLDivElement | null>(null);
  const rightContainerRef = useRef<HTMLDivElement | null>(null);

  const leftMapRef = useRef<L.Map | null>(null);
  const rightMapRef = useRef<L.Map | null>(null);

  const leftBaseTileRef = useRef<L.TileLayer | null>(null);
  const rightBaseTileRef = useRef<L.TileLayer | null>(null);
  const leftSatTileRef = useRef<L.TileLayer | null>(null);
  const rightSatTileRef = useRef<L.TileLayer | null>(null);
  const leftOverlayRef = useRef<L.ImageOverlay | null>(null);
  const rightOverlayRef = useRef<L.ImageOverlay | null>(null);
  const leftTransportRef = useRef<L.TileLayer | null>(null);
  const rightTransportRef = useRef<L.TileLayer | null>(null);
  const leftPlacesTileRef = useRef<L.TileLayer | null>(null);
  const rightPlacesTileRef = useRef<L.TileLayer | null>(null);

  const leftVillageLabelGroupRef = useRef<L.LayerGroup | null>(null);
  const rightVillageLabelGroupRef = useRef<L.LayerGroup | null>(null);
  const leftBoundaryGroupRef = useRef<L.LayerGroup | null>(null);
  const rightBoundaryGroupRef = useRef<L.LayerGroup | null>(null);
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

  // Fit target: prefer official Ammapalem village bounds if loaded, otherwise 6x6 km study grid
  const getResetBounds = (): L.LatLngBoundsExpression => {
    const vb = boundaries?.village?.meta.bounds;
    if (vb && vb.length === 4) {
      return [
        [vb[1], vb[0]],
        [vb[3], vb[2]],
      ];
    }
    return leafletBounds;
  };

  // 1. Initialize synchronized Leaflet map pair with strict z-ordered pane hierarchy
  useEffect(() => {
    if (!leftContainerRef.current || !rightContainerRef.current) return;

    const createMap = (container: HTMLElement, withAttribution: boolean) => {
      const map = L.map(container, {
        center: [centerLat, centerLon],
        zoom: 14,
        minZoom: 9,
        maxZoom: 18,
        zoomControl: false, // Controlled cleanly via unified map toolbar
        attributionControl: withAttribution,
      });
      ensureMapPanes(map);
      return map;
    };

    const leftMap = createMap(leftContainerRef.current, true);
    const rightMap = createMap(rightContainerRef.current, false);

    leftMapRef.current = leftMap;
    rightMapRef.current = rightMap;

    leftPolyGroupRef.current = L.layerGroup().addTo(leftMap);
    rightPolyGroupRef.current = L.layerGroup().addTo(rightMap);
    leftBoundaryGroupRef.current = L.layerGroup().addTo(leftMap);
    rightBoundaryGroupRef.current = L.layerGroup().addTo(rightMap);
    leftVillageLabelGroupRef.current = L.layerGroup().addTo(leftMap);
    rightVillageLabelGroupRef.current = L.layerGroup().addTo(rightMap);

    if (!fittedRef.current) {
      leftMap.fitBounds(leafletBounds, { padding: [14, 14] });
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
      leftBaseTileRef.current = null;
      rightBaseTileRef.current = null;
      leftSatTileRef.current = null;
      rightSatTileRef.current = null;
      leftOverlayRef.current = null;
      rightOverlayRef.current = null;
      leftTransportRef.current = null;
      rightTransportRef.current = null;
      leftPlacesTileRef.current = null;
      rightPlacesTileRef.current = null;
      fittedRef.current = false;
    };
  }, [centerLat, centerLon]);

  // 2. Manage Basemap layer (Esri World Imagery default OR Esri World Topo terrain)
  useEffect(() => {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap) return;

    leftBaseTileRef.current?.remove();
    rightBaseTileRef.current?.remove();

    const tileUrl =
      basemap === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';

    const attribution =
      basemap === 'satellite'
        ? 'Esri, Maxar, Earthstar Geographics'
        : 'Esri, HERE, Garmin, USGS';

    leftBaseTileRef.current = L.tileLayer(tileUrl, {
      pane: 'basemapPane',
      maxZoom: 18,
      attribution,
    }).addTo(leftMap);

    rightBaseTileRef.current = L.tileLayer(tileUrl, {
      pane: 'basemapPane',
      maxZoom: 18,
    }).addTo(rightMap);
  }, [basemap]);

  // 3. Manage Esri World Transportation road overlay (transportPane)
  useEffect(() => {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap) return;

    leftTransportRef.current?.remove();
    rightTransportRef.current?.remove();
    leftTransportRef.current = null;
    rightTransportRef.current = null;

    if (!showRoadLabels) return;

    const url =
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';

    leftTransportRef.current = L.tileLayer(url, {
      pane: 'transportPane',
      maxZoom: 18,
      opacity: 0.92,
    }).addTo(leftMap);

    rightTransportRef.current = L.tileLayer(url, {
      pane: 'transportPane',
      maxZoom: 18,
      opacity: 0.92,
    }).addTo(rightMap);
  }, [showRoadLabels]);

  // 4. Manage Esri World Boundaries & Places + verified LGD Konijerla Mandal village labels (labelsPane)
  useEffect(() => {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap) return;

    leftPlacesTileRef.current?.remove();
    rightPlacesTileRef.current?.remove();
    leftPlacesTileRef.current = null;
    rightPlacesTileRef.current = null;

    leftVillageLabelGroupRef.current?.clearLayers();
    rightVillageLabelGroupRef.current?.clearLayers();

    if (!showPlaceLabels) return;

    const placesUrl =
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

    leftPlacesTileRef.current = L.tileLayer(placesUrl, {
      pane: 'labelsPane',
      maxZoom: 18,
      opacity: 0.95,
    }).addTo(leftMap);

    rightPlacesTileRef.current = L.tileLayer(placesUrl, {
      pane: 'labelsPane',
      maxZoom: 18,
      opacity: 0.95,
    }).addTo(rightMap);

    const labels = boundaries?.villageLabels ?? [];
    const groups = [leftVillageLabelGroupRef.current, rightVillageLabelGroupRef.current];

    for (const grp of groups) {
      if (!grp) continue;
      if (labels.length > 0) {
        for (const v of labels) {
          const isTarget = v.isTarget;
          const html = isTarget
            ? `<div class="geo-village-label-text text-[12px] text-[#EBE7DE]"><span style="color:#A3B47E;font-size:9px;letter-spacing:0.14em;">STUDY VILLAGE</span><span>${v.name.toUpperCase()}</span></div>`
            : `<div class="geo-village-label-text text-[10.5px] text-[#D2C7B0]/90"><span>${v.name}</span></div>`;

          L.marker([v.lat, v.lon], {
            pane: 'labelsPane',
            interactive: false,
            icon: L.divIcon({
              className: 'geo-village-label',
              html,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
          }).addTo(grp);
        }
      } else {
        // Verified fallback coordinate marker for Ammapalem when LGD label list is still loading
        L.marker([centerLat, centerLon], {
          pane: 'labelsPane',
          interactive: false,
          icon: L.divIcon({
            className: 'geo-village-label',
            html: `<div class="geo-village-label-text text-[12px] text-[#EBE7DE]"><span>AMMAPALEM</span></div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
        }).addTo(grp);
      }
    }
  }, [showPlaceLabels, boundaries, centerLat, centerLon]);

  // 5. Reflow Leaflet viewports when toggling slider / side-by-side / fullscreen
  useEffect(() => {
    const timer = setTimeout(() => {
      leftMapRef.current?.invalidateSize({ animate: false });
      rightMapRef.current?.invalidateSize({ animate: false });
      if (leftMapRef.current && rightMapRef.current) {
        rightMapRef.current.setView(leftMapRef.current.getCenter(), leftMapRef.current.getZoom(), {
          animate: false,
        });
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [mode, isFullscreen]);

  // Listen to native fullscreen exit (e.g. Escape key)
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen((prev) => (prev ? false : prev));
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // 6. Manage full-viewport 2016 vs 2026 satellite XYZ tiles + study-area spectral overlays (satellitePane)
  useEffect(() => {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap || !analysis) return;

    leftSatTileRef.current?.remove();
    rightSatTileRef.current?.remove();
    leftOverlayRef.current?.remove();
    rightOverlayRef.current?.remove();

    const op = overlayOpacity / 100;

    if (sourceMode === 'wayback' && analysis.waybackPair.available) {
      const wb16 = analysis.waybackPair.earlier;
      const wb26 = analysis.waybackPair.latest;
      if (wb16) {
        leftSatTileRef.current = L.tileLayer(wb16.tileUrlTemplate, {
          pane: 'satellitePane',
          maxZoom: 18,
          opacity: op,
          attribution: `Esri Wayback (${wb16.captureDate})`,
        }).addTo(leftMap);
      }
      if (wb26) {
        rightSatTileRef.current = L.tileLayer(wb26.tileUrlTemplate, {
          pane: 'satellitePane',
          maxZoom: 18,
          opacity: op,
          attribution: `Esri Wayback (${wb26.captureDate})`,
        }).addTo(rightMap);
      }
      return;
    }

    const tile16Url = `/api/tile/${analysis.scene2016.collection}/${encodeURIComponent(analysis.scene2016.id)}/{z}/{x}/{y}.png`;
    const tile26Url = `/api/tile/${analysis.scene2026.collection}/${encodeURIComponent(analysis.scene2026.id)}/{z}/{x}/{y}.png`;

    leftSatTileRef.current = L.tileLayer(tile16Url, {
      pane: 'satellitePane',
      maxZoom: 17,
      opacity: op,
    }).addTo(leftMap);

    rightSatTileRef.current = L.tileLayer(tile26Url, {
      pane: 'satellitePane',
      maxZoom: 17,
      opacity: op,
    }).addTo(rightMap);

    if (channel !== 'rgb') {
      const url16 = analysis.layers[`${channel}-2016`];
      const url26 = analysis.layers[`${channel}-2026`];
      if (url16) {
        leftOverlayRef.current = L.imageOverlay(url16, leafletBounds, {
          pane: 'satellitePane',
          opacity: op,
          interactive: false,
        }).addTo(leftMap);
      }
      if (url26) {
        rightOverlayRef.current = L.imageOverlay(url26, leafletBounds, {
          pane: 'satellitePane',
          opacity: op,
          interactive: false,
        }).addTo(rightMap);
      }
    }
  }, [analysis, sourceMode, channel]);

  // 7. Sync imagery opacity dynamically
  useEffect(() => {
    const op = overlayOpacity / 100;
    leftSatTileRef.current?.setOpacity(op);
    rightSatTileRef.current?.setOpacity(op);
    leftOverlayRef.current?.setOpacity(op);
    rightOverlayRef.current?.setOpacity(op);
  }, [overlayOpacity]);

  // 8. Render clickable GeoJSON change highlight polygons in changePane
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
            pane: 'changePane',
            style: {
              color: isSelected ? '#FFFFFF' : poly.color,
              weight: isSelected ? 2.6 : 1.4,
              fillColor: poly.color,
              fillOpacity: isSelected ? 0.58 : 0.34,
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

  // 9. Render separate Administrative Boundaries (Village, Mandal, District) + Approximate Analysis Grid in boundaryPane
  useEffect(() => {
    const groups = [leftBoundaryGroupRef.current, rightBoundaryGroupRef.current];
    for (const g of groups) {
      if (!g) continue;
      g.clearLayers();

      // District Boundary (Khammam)
      if (showDistrictBoundary && boundaries?.district?.feature) {
        L.geoJSON(boundaries.district.feature, {
          pane: 'boundaryPane',
          interactive: false,
          style: {
            color: '#8C9A6E',
            weight: 2.2,
            dashArray: '10 6',
            fill: false,
            opacity: 0.9,
          },
        }).addTo(g);
      }

      // Mandal Boundary (Konijerla)
      if (showMandalBoundary && boundaries?.mandal?.feature) {
        L.geoJSON(boundaries.mandal.feature, {
          pane: 'boundaryPane',
          interactive: false,
          style: {
            color: '#D2C7B0',
            weight: 1.8,
            dashArray: '6 4',
            fill: false,
            opacity: 0.85,
          },
        }).addTo(g);
      }

      // Official Village Boundary (Ammapalem LGD 579755)
      if (showVillageBoundary && boundaries?.village?.feature) {
        L.geoJSON(boundaries.village.feature, {
          pane: 'boundaryPane',
          interactive: false,
          style: {
            color: '#FFFFFF',
            weight: 2.4,
            fillColor: '#EBE7DE',
            fillOpacity: 0.04,
            opacity: 0.96,
          },
        }).addTo(g);
      }

      // Study Area Grid (Explicitly styled distinctly as Approximate Study Area, NOT official village boundary)
      if (showStudyGrid) {
        L.rectangle(leafletBounds, {
          pane: 'boundaryPane',
          color: '#9A9484',
          weight: 1.2,
          dashArray: '3 5',
          fill: false,
          interactive: false,
        }).addTo(g);
      }

      // Ammapalem center reference point
      L.circleMarker([centerLat, centerLon], {
        pane: 'boundaryPane',
        radius: 4.5,
        color: '#111210',
        weight: 1.5,
        fillColor: '#A3B47E',
        fillOpacity: 0.95,
        interactive: false,
      }).addTo(g);
    }
  }, [
    boundaries,
    showVillageBoundary,
    showMandalBoundary,
    showDistrictBoundary,
    showStudyGrid,
    centerLat,
    centerLon,
    bbox,
  ]);

  // 10. Click-to-probe pixel spectral metrics
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

  const handleZoomIn = () => {
    leftMapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    leftMapRef.current?.zoomOut();
  };

  const handleResetView = () => {
    leftMapRef.current?.fitBounds(getResetBounds(), { padding: [16, 16], animate: true });
  };

  const handleToggleFullscreen = async () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (next && el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback CSS fixed overlay (when fullscreen API is blocked inside iframe) handles fullscreen automatically
    }
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

  const satelliteInfoLabel =
    sourceMode === 'wayback'
      ? 'Esri World Imagery Wayback'
      : analysis
      ? analysis.scene2016.mission === analysis.scene2026.mission
        ? analysis.scene2026.mission
        : `${analysis.scene2016.mission} / ${analysis.scene2026.mission}`
      : 'Sentinel-2 L2A';

  const resolutionInfoLabel =
    sourceMode === 'wayback'
      ? '<1 m High-Resolution'
      : analysis
      ? `${analysis.scene2026.resolutionMeters} m GSD`
      : '10 m GSD';

  const activeChannelMeta = CHANNELS.find((c) => c.id === channel)!;

  return (
    <section id="comparison" className="scroll-mt-20 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#A3B47E]">
            Interactive Before / After Viewer &amp; Administrative Boundaries
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#EBE7DE]">
            Satellite Comparison · Oct 2016 vs 2026
          </h2>
          <p className="mt-1 text-sm text-[#9A9484]">
            Esri World Imagery basemap with verified geographic labels, official LGD Village / Mandal / District boundaries, and co-registered multi-temporal satellite overlays.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Imagery Source Mode */}
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

          {/* Slider vs Side-by-Side */}
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

          {/* Basemap Selector: Satellite vs Terrain */}
          <div
            role="group"
            aria-label="Basemap selector"
            className="inline-flex items-center rounded-md border border-[#2B2E28] bg-[#171916] p-1"
          >
            <button
              type="button"
              onClick={() => setBasemap('satellite')}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                basemap === 'satellite'
                  ? 'bg-[#8C9A6E]/25 text-[#EBE7DE]'
                  : 'text-[#9A9484] hover:text-[#EBE7DE]'
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Satellite</span>
            </button>
            <button
              type="button"
              onClick={() => setBasemap('terrain')}
              className={`rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                basemap === 'terrain'
                  ? 'bg-[#8C9A6E]/25 text-[#EBE7DE]'
                  : 'text-[#9A9484] hover:text-[#EBE7DE]'
              }`}
            >
              Terrain
            </button>
          </div>
        </div>
      </div>

      {/* Main Viewer Shell (supports full-screen container) */}
      <div
        ref={wrapperRef}
        className={`flex flex-col overflow-hidden rounded-lg border border-[#2B2E28] bg-[#0D0E0C] ${
          isFullscreen ? 'fixed inset-0 z-[1000] h-screen w-screen rounded-none' : ''
        }`}
      >
        {/* Unified Map & Layer Control Bar */}
        <div className="space-y-2 border-b border-[#2B2E28] bg-[#171916] px-4 py-3">
          {/* Row 1: Spectral Channels + Zoom/Reset/Opacity/Fullscreen */}
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#9A9484]">
                <Layers className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
                <span>Band:</span>
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

            <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#9A9484]">
              <label className="inline-flex items-center gap-2">
                <span className="whitespace-nowrap">Imagery Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                  className="w-20 cursor-pointer"
                  aria-label="Satellite imagery opacity"
                />
                <span className="w-9 font-mono tabular-nums text-[#EBE7DE]">{overlayOpacity}%</span>
              </label>

              {/* Zoom In / Out / Reset / Fullscreen */}
              <div className="inline-flex items-center rounded border border-[#2B2E28] bg-[#1E201C]">
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  aria-label="Zoom In"
                  className="px-2 py-1 text-[#C7C0B0] hover:bg-[#272A24] hover:text-[#EBE7DE]"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  aria-label="Zoom Out"
                  className="border-l border-[#2B2E28] px-2 py-1 text-[#C7C0B0] hover:bg-[#272A24] hover:text-[#EBE7DE]"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleResetView}
                  title="Reset view to Ammapalem"
                  className="inline-flex items-center gap-1 border-l border-[#2B2E28] px-2.5 py-1 text-xs font-medium text-[#D2C7B0] whitespace-nowrap hover:bg-[#272A24] hover:text-[#EBE7DE]"
                >
                  <LocateFixed className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
                  <span>Reset View</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="inline-flex items-center gap-1.5 rounded border border-[#2B2E28] bg-[#1E201C] px-2.5 py-1 text-xs font-medium text-[#EBE7DE] whitespace-nowrap shrink-0 hover:border-[#4A4E44]"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
                    <span>Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
                    <span>Fullscreen</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: Cartographic Labels & Administrative Boundary Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#242721] pt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowPlaceLabels((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  showPlaceLabels
                    ? 'border-[#8C9A6E] bg-[#8C9A6E]/20 text-[#EBE7DE]'
                    : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
                }`}
              >
                <Tag className="h-3 w-3 text-[#A3B47E]" aria-hidden="true" />
                <span>Place Labels</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRoadLabels((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  showRoadLabels
                    ? 'border-[#8C9A6E] bg-[#8C9A6E]/20 text-[#EBE7DE]'
                    : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
                }`}
              >
                <Route className="h-3 w-3 text-[#A3B47E]" aria-hidden="true" />
                <span>Roads</span>
              </button>

              <span className="mx-1 h-4 w-px bg-[#2B2E28]" aria-hidden="true" />

              <button
                type="button"
                disabled={!boundaries?.village}
                onClick={() => setShowVillageBoundary((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors disabled:opacity-45 ${
                  showVillageBoundary && boundaries?.village
                    ? 'border-[#EBE7DE]/60 bg-[#EBE7DE]/15 text-[#EBE7DE]'
                    : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
                }`}
              >
                <span className="inline-block h-0.5 w-3 bg-[#FFFFFF]" aria-hidden="true" />
                <span>Village Boundary</span>
              </button>

              <button
                type="button"
                disabled={!boundaries?.mandal}
                onClick={() => setShowMandalBoundary((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors disabled:opacity-45 ${
                  showMandalBoundary && boundaries?.mandal
                    ? 'border-[#D2C7B0]/60 bg-[#D2C7B0]/15 text-[#EBE7DE]'
                    : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
                }`}
              >
                <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-[#D2C7B0]" aria-hidden="true" />
                <span>Mandal (Konijerla)</span>
              </button>

              <button
                type="button"
                disabled={!boundaries?.district}
                onClick={() => setShowDistrictBoundary((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors disabled:opacity-45 ${
                  showDistrictBoundary && boundaries?.district
                    ? 'border-[#8C9A6E] bg-[#8C9A6E]/20 text-[#EBE7DE]'
                    : 'border-[#2B2E28] bg-[#1E201C] text-[#9A9484]'
                }`}
              >
                <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-[#8C9A6E]" aria-hidden="true" />
                <span>District (Khammam)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowStudyGrid((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  showStudyGrid
                    ? 'border-[#9A9484]/50 bg-[#1E201C] text-[#D2C7B0]'
                    : 'border-[#2B2E28] bg-[#141613] text-[#6E6A5E]'
                }`}
              >
                <span className="inline-block h-0.5 w-3 border-t border-dotted border-[#9A9484]" aria-hidden="true" />
                <span>Approx. Study Grid</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowInfoPanel((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                showInfoPanel
                  ? 'border-[#3B3F36] bg-[#1E201C] text-[#D2C7B0]'
                  : 'border-[#2B2E28] bg-[#141613] text-[#9A9484]'
              }`}
            >
              <Info className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
              <span>Map Info</span>
            </button>
          </div>

          {/* Row 3: Change Detection Overlay & 5-Color Category Filters */}
          <div className="flex flex-col gap-2 border-t border-[#242721] pt-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
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
                <span>Change Detection ({analysis?.changePolygons.length ?? 0} polygons)</span>
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
              {boundaries?.officialBoundariesAvailable
                ? `Official LGD boundaries loaded (${boundaries.village?.meta.areaKm2 ?? '10.0'} km² village) · Click any polygon to inspect`
                : boundaries?.studyAreaLabel ?? 'Click any highlighted polygon to inspect details'}
            </span>
          </div>
        </div>

        {/* Synchronized Map Stage */}
        <div
          ref={stageRef}
          className={`relative w-full ${
            isFullscreen
              ? 'flex-1 min-h-0'
              : mode === 'slider'
              ? 'h-[580px] lg:h-[640px]'
              : 'grid grid-cols-1 gap-px bg-[#2B2E28] lg:grid-cols-2'
          }`}
        >
          {loading && (
            <div className="absolute inset-0 z-[800] flex flex-col items-center justify-center bg-[#111210]/80 backdrop-blur-[2px]">
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
            <div className="absolute inset-0 z-[750] flex flex-col items-center justify-center bg-[#111210]/90 p-8 text-center">
              <p className="font-display text-lg font-medium text-[#D2C7B0]">
                Satellite Imagery Analysis Pending
              </p>
              <p className="mt-2 max-w-md text-sm text-[#9A9484]">{error}</p>
            </div>
          )}

          {/* In fullscreen side-by-side mode, ensure 2-column grid fills flex-1 */}
          <div
            className={
              isFullscreen && mode === 'side-by-side'
                ? 'grid h-full w-full grid-cols-1 gap-px bg-[#2B2E28] lg:grid-cols-2'
                : 'contents'
            }
          >
            {/* LEFT / 2016 VIEWPORT */}
            <div
              className={`relative ${
                mode === 'slider'
                  ? 'absolute inset-0 h-full w-full'
                  : isFullscreen
                  ? 'h-full w-full'
                  : 'h-[460px] lg:h-[560px] w-full'
              }`}
            >
              <div ref={leftContainerRef} className="h-full w-full" />

              <div className="pointer-events-none absolute top-3 left-3 z-[700] max-w-[calc(100%-2rem)] rounded border border-[#2B2E28] bg-[#111210]/90 px-3 py-2 backdrop-blur-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-mono font-semibold text-[#D2C7B0]">EARLIER · 2016</span>
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
                mode === 'slider'
                  ? 'absolute inset-0 h-full w-full'
                  : isFullscreen
                  ? 'h-full w-full'
                  : 'h-[460px] lg:h-[560px] w-full'
              }`}
              style={
                mode === 'slider'
                  ? { clipPath: `inset(0 0 0 ${sliderPct}%)` }
                  : undefined
              }
            >
              <div ref={rightContainerRef} className="h-full w-full" />

              <div className="pointer-events-none absolute top-3 right-3 z-[700] max-w-[calc(100%-2rem)] rounded border border-[#2B2E28] bg-[#111210]/90 px-3 py-2 text-right backdrop-blur-xs">
                <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-mono text-[#EBE7DE]">{rightDateLabel}</span>
                  <span className="text-[#5C594E]" aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-[#A3B47E]">LATEST · 2026</span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-[#9A9484] tabular-nums">
                  {rightSourceText}
                </p>
              </div>
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
              className="absolute top-0 bottom-0 z-[720] w-0.5 -translate-x-1/2 cursor-ew-resize bg-[#EBE7DE] focus-visible:outline-2 focus-visible:outline-[#A3B47E]"
              style={{ left: `${sliderPct}%` }}
            >
              <div className="absolute top-1/2 left-1/2 flex h-10 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border border-[#EBE7DE] bg-[#111210]/95 shadow-lg">
                <MoveHorizontal className="h-4 w-4 text-[#EBE7DE]" aria-hidden="true" />
              </div>
            </div>
          )}

          {/* Map Information Panel (corner HUD) */}
          {showInfoPanel && (
            <div className="pointer-events-auto absolute bottom-3 left-3 z-[710] w-[265px] rounded-md border border-[#2B2E28] bg-[#111210]/92 px-3.5 py-2.5 text-[11px] shadow-lg backdrop-blur-xs">
              <div className="flex items-center justify-between border-b border-[#242721] pb-1.5">
                <span className="font-mono font-semibold uppercase tracking-wider text-[#A3B47E]">
                  Map Information
                </span>
                <span className="font-mono text-[10px] text-[#857F70]">
                  {basemap === 'satellite' ? 'Esri Imagery' : 'Esri Terrain'}
                </span>
              </div>
              <dl className="mt-2 space-y-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-[#857F70]">Location:</dt>
                  <dd className="text-right font-medium text-[#EBE7DE]">Ammapalem, Khammam</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#857F70]">Coordinates:</dt>
                  <dd className="text-right font-mono text-[#D2C7B0] tabular-nums">
                    17.2237° N, 80.2483° E
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#857F70]">Earlier imagery:</dt>
                  <dd className="text-right font-mono text-[#D2C7B0] tabular-nums">
                    {leftDateLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#857F70]">Latest imagery:</dt>
                  <dd className="text-right font-mono text-[#A3B47E] tabular-nums">
                    {rightDateLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#857F70]">Satellite:</dt>
                  <dd className="text-right font-medium text-[#EBE7DE]">{satelliteInfoLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#857F70]">Resolution:</dt>
                  <dd className="text-right font-mono text-[#EBE7DE] tabular-nums">
                    {resolutionInfoLabel}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 border-t border-[#242721] pt-1.5 text-[10px] leading-snug text-[#857F70]">
                {boundaries?.officialBoundariesAvailable
                  ? `Official LGD village (${boundaries.village?.meta.areaKm2} km²) · Dashed box = 6×6 km analysis grid`
                  : 'Box = Approximate Study Area (6 × 6 km grid)'}
              </p>
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
                ? 'Sub-meter visual inspection mode for buildings & roads'
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
                Change Category: {selectedPolygon.categoryLabel}
              </h3>
              <span className="font-mono text-xs text-[#D2C7B0]">
                {selectedPolygon.centroid.lat.toFixed(5)}° N, {selectedPolygon.centroid.lon.toFixed(5)}° E
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-2 pt-1 text-xs sm:grid-cols-5">
              <div>
                <p className="text-[#9A9484]">Area (m²)</p>
                <p className="mt-0.5 font-mono font-medium text-[#EBE7DE] tabular-nums">
                  {selectedPolygon.areaM2.toLocaleString()} m²
                </p>
              </div>
              <div>
                <p className="text-[#9A9484]">Area (ha)</p>
                <p className="mt-0.5 font-mono font-medium text-[#EBE7DE] tabular-nums">
                  {selectedPolygon.areaHa.toFixed(2)} ha
                </p>
              </div>
              <div>
                <p className="text-[#9A9484]">Earlier Land Cover</p>
                <p className="mt-0.5 font-mono font-medium text-[#D2C7B0]">
                  {selectedPolygon.earlierClass} (NDVI {selectedPolygon.meanNdvi2016})
                </p>
              </div>
              <div>
                <p className="text-[#9A9484]">Latest Land Cover</p>
                <p className="mt-0.5 font-mono font-medium text-[#A3B47E]">
                  {selectedPolygon.latestClass} (NDVI {selectedPolygon.meanNdvi2026})
                </p>
              </div>
              <div>
                <p className="text-[#9A9484]">Confidence Score</p>
                <p className="mt-0.5 font-mono font-medium text-[#EBE7DE] tabular-nums">
                  {selectedPolygon.confidencePct.toFixed(1)}% ({selectedPolygon.pixelCount} px)
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
