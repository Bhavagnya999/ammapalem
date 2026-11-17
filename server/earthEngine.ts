import { fromArrayBuffer } from 'geotiff';
import { PNG } from 'pngjs';
import { checkGeeStatus, type GeeIntegrationStatus } from './geeClient.ts';

export const STUDY_LOCATION = {
  village: 'Ammapalem',
  mandal: 'Konijerla',
  district: 'Khammam',
  state: 'Telangana',
  country: 'India',
  pin: '507305',
  center: { lat: 17.2237, lon: 80.2483 },
  // Exact 6.00 km x 6.00 km (36.12 km^2 geodesic) study region centered on Ammapalem
  bbox: [80.22009, 17.19659, 80.27651, 17.25081] as [number, number, number, number],
  gridSize: 600,
};

export type LandCoverKey = 'vegetation' | 'agricultural' | 'builtUp' | 'water' | 'other';
export type ChangeOverlayCategory =
  | 'built_up'
  | 'veg_loss'
  | 'veg_gain'
  | 'water_change'
  | 'agri_conversion';

export const CHANGE_CATEGORY_META: Record<
  ChangeOverlayCategory,
  { label: string; color: string; stroke: string }
> = {
  built_up: { label: 'Newly Built-up Area', color: '#F97316', stroke: '#EA580C' },
  veg_loss: { label: 'Vegetation Loss', color: '#EF4444', stroke: '#DC2626' },
  veg_gain: { label: 'Vegetation Gain', color: '#22C55E', stroke: '#16A34A' },
  water_change: { label: 'Water-body Change', color: '#3B82F6', stroke: '#2563EB' },
  agri_conversion: { label: 'Agricultural Land Conversion', color: '#EAB308', stroke: '#CA8A04' },
};

export const LAND_COVER_META: Record<
  LandCoverKey,
  { id: number; label: string; color: string; rgb: [number, number, number]; description: string }
> = {
  vegetation: {
    id: 1,
    label: 'Vegetation',
    color: '#738C52',
    rgb: [115, 140, 82],
    description: 'Dense perennial tree cover, groves, riparian canopy, and thick scrub',
  },
  agricultural: {
    id: 2,
    label: 'Agricultural Land',
    color: '#C9AA6E',
    rgb: [201, 170, 110],
    description: 'Active Kharif/Rabi cropland, paddy/cotton fields, and managed agricultural parcels',
  },
  builtUp: {
    id: 3,
    label: 'Built-up Land',
    color: '#F97316',
    rgb: [249, 115, 22],
    description: 'Settlement core, paved roads, concrete surfaces, and impervious land expansion',
  },
  water: {
    id: 4,
    label: 'Water Bodies',
    color: '#3B82F6',
    rgb: [59, 130, 246],
    description: 'Irrigation tanks (cheruvus), canals, surface reservoirs, and ponded water',
  },
  other: {
    id: 5,
    label: 'Other Land',
    color: '#757166',
    rgb: [117, 113, 102],
    description: 'Exposed barren rock, dry fallow soil, uncultivated embankments, and open ground',
  },
};

export interface AreaMetrics {
  m2: number;
  ha: number;
  km2: number;
}

export interface StacSceneSummary {
  id: string;
  collection: 'sentinel-2-l2a' | 'landsat-c2-l2';
  mission: string;
  platform: string;
  instrument: string;
  datetime: string;
  dateLabel: string;
  month: number;
  year: number;
  cloudCover: number;
  resolutionMeters: number;
  processingBaseline: string | null;
  epsg: number | null;
  sunElevation: number | null;
  sunAzimuth: number | null;
  orbitOrPathRow: string;
  tileOrRow: string;
  bbox: number[];
  stacItemUrl: string;
  sourceLabel: string;
}

export interface WaybackReleaseInfo {
  id: string;
  title: string;
  captureDate: string;
  tileUrlTemplate: string;
}

export interface SeasonalPairPreset {
  id: string;
  label: string;
  seasonDescription: string;
  missionLabel: string;
  item2016Id: string;
  col2016: 'sentinel-2-l2a' | 'landsat-c2-l2';
  item2026Id: string;
  col2026: 'sentinel-2-l2a' | 'landsat-c2-l2';
}

export interface ChangePolygonFeature {
  id: string;
  category: ChangeOverlayCategory;
  categoryLabel: string;
  color: string;
  earlierClass: string;
  latestClass: string;
  areaM2: number;
  areaHa: number;
  areaKm2: number;
  pixelCount: number;
  confidencePct: number;
  centroid: { lat: number; lon: number };
  meanNdvi2016: number;
  meanNdvi2026: number;
  meanNdbi2016: number;
  meanNdbi2026: number;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

export interface HistoricalLulcVerification {
  source: string;
  taxonomy: string;
  available: boolean;
  yearEarlier: number;
  yearLatest: number;
  classes: Array<{
    label: string;
    earlierKm2: number;
    earlierPct: number;
    latestKm2: number;
    latestPct: number;
    deltaKm2: number;
  }>;
  note: string;
}

export interface LandCoverClassStat {
  key: LandCoverKey;
  label: string;
  color: string;
  area2016: AreaMetrics;
  pct2016: number;
  area2026: AreaMetrics;
  pct2026: number;
  deltaKm2: number;
  deltaHa: number;
  deltaM2: number;
  deltaPctPoints: number;
}

export interface SpectralMetricSummary {
  mean2016: number;
  mean2026: number;
  deltaMean: number;
  min2016: number;
  max2016: number;
  min2026: number;
  max2026: number;
}

export interface QuadrantChange {
  name: string;
  boundsLabel: string;
  analyzedKm2: number;
  vegDeltaKm2: number;
  agriDeltaKm2: number;
  builtUpDeltaKm2: number;
  waterDeltaKm2: number;
  meanDeltaNdvi: number;
  meanDeltaNdbi: number;
}

export interface TransitionCell {
  from: LandCoverKey;
  to: LandCoverKey;
  areaKm2: number;
  areaHa: number;
  areaM2: number;
  pctOfAnalyzed: number;
}

export interface AnalysisResult {
  key: string;
  status: 'ready';
  computedAt: string;
  confidenceThreshold: number;
  location: typeof STUDY_LOCATION;
  scene2016: StacSceneSummary;
  scene2026: StacSceneSummary;
  geeStatus: GeeIntegrationStatus;
  waybackPair: {
    available: boolean;
    earlier: WaybackReleaseInfo | null;
    latest: WaybackReleaseInfo | null;
    limitationNote: string;
  };
  historicalLulcVerification: HistoricalLulcVerification | null;
  spatialAlignment: {
    gridWidth: number;
    gridHeight: number;
    cellSizeMeters: number;
    cellAreaKm2: number;
    totalBboxArea: AreaMetrics;
    validJointPixels: number;
    analyzedArea: AreaMetrics;
    confirmedPixels: number;
    confirmedArea: AreaMetrics;
    uncertainExcludedPixels: number;
    uncertainExcludedArea: AreaMetrics;
    meanDetectionConfidencePct: number;
    cloudMaskedPixels2016: number;
    cloudMaskedPixels2026: number;
    cloudMaskedJointPixels: number;
    cloudMaskedArea: AreaMetrics;
    cloudMaskedPct: number;
  };
  spectralIndices: {
    ndvi: SpectralMetricSummary;
    ndwi: SpectralMetricSummary;
    ndbi: SpectralMetricSummary;
    bsi: SpectralMetricSummary;
  };
  detectedChanges: {
    totalAnalyzedArea: AreaMetrics;
    confirmedChangedArea: AreaMetrics;
    newlyBuiltUp: AreaMetrics; // A
    vegetationLoss: AreaMetrics; // B
    vegetationGain: AreaMetrics; // C
    netVegetationChange: AreaMetrics;
    agriculturalToBuiltUp: AreaMetrics; // D (strict)
    agriculturalConvertedTotal: AreaMetrics; // D (all conversions from agri)
    waterGained: AreaMetrics; // E
    waterLost: AreaMetrics; // E
    netWaterChange: AreaMetrics;
    otherChanges: AreaMetrics; // F
  };
  landCover: LandCoverClassStat[];
  transitionMatrix: TransitionCell[];
  changePolygons: ChangePolygonFeature[];
  quadrants: QuadrantChange[];
  spectralHistograms: Array<{
    bin: string;
    ndvi2016Pct: number;
    ndvi2026Pct: number;
  }>;
  layers: Record<string, string>;
}

export interface CatalogResponse {
  location: typeof STUDY_LOCATION;
  presets: SeasonalPairPreset[];
  scenes2016: StacSceneSummary[];
  scenes2026: StacSceneSummary[];
  geeStatus: GeeIntegrationStatus;
  waybackPair: {
    available: boolean;
    earlier: WaybackReleaseInfo | null;
    latest: WaybackReleaseInfo | null;
  };
  copernicusVerification: {
    endpoint: string;
    reachable: boolean;
    matched2026Count: number;
    sampleProductId: string | null;
  };
}

interface CachedRasterState {
  width: number;
  height: number;
  bbox: [number, number, number, number];
  valid2016: Uint8Array;
  valid2026: Uint8Array;
  ndvi2016: Float32Array;
  ndvi2026: Float32Array;
  ndwi2016: Float32Array;
  ndwi2026: Float32Array;
  ndbi2016: Float32Array;
  ndbi2026: Float32Array;
  class2016: Uint8Array;
  class2026: Uint8Array;
  conf2016: Float32Array;
  conf2026: Float32Array;
  layers: Map<string, Buffer>;
}

const analysisCache = new Map<string, AnalysisResult>();
const rasterCache = new Map<string, CachedRasterState>();
let catalogCache: { data: CatalogResponse; expiresAt: number } | null = null;
let ioLulcCache: HistoricalLulcVerification | null = null;

function toAreaMetrics(km2: number): AreaMetrics {
  return {
    km2: Number(km2.toFixed(3)),
    ha: Number((km2 * 100).toFixed(2)),
    m2: Math.round(km2 * 1_000_000),
  };
}

function computeGeodesicAreaKm2(bbox: [number, number, number, number]): number {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(maxLon - minLon);
  const sinPhi1 = Math.sin(toRad(minLat));
  const sinPhi2 = Math.sin(toRad(maxLat));
  return Math.abs(R * R * dLon * (sinPhi2 - sinPhi1));
}

function coversFullStudyBbox(sceneBbox: number[] | undefined, studyBbox: [number, number, number, number]): boolean {
  if (!sceneBbox || sceneBbox.length < 4) return false;
  return (
    sceneBbox[0] <= studyBbox[0] &&
    sceneBbox[1] <= studyBbox[1] &&
    sceneBbox[2] >= studyBbox[2] &&
    sceneBbox[3] >= studyBbox[3]
  );
}

function mapStacFeature(f: any): StacSceneSummary {
  const col = f.collection as 'sentinel-2-l2a' | 'landsat-c2-l2';
  const props = f.properties || {};
  const dt = String(props.datetime || '');
  const d = new Date(dt);
  const platform = String(props.platform || (col === 'sentinel-2-l2a' ? 'Sentinel-2' : 'Landsat'));
  const isS2 = col === 'sentinel-2-l2a';
  const mission = isS2
    ? `Copernicus ${platform}`
    : `USGS ${platform.replace('landsat-', 'Landsat ').toUpperCase()} C2 L2`;

  const orbitOrPathRow = isS2
    ? `Orbit R${String(props['sat:relative_orbit'] ?? '019').padStart(3, '0')}`
    : `WRS ${props['landsat:wrs_path'] ?? '143'}/${props['landsat:wrs_row'] ?? '048'}`;

  const tileOrRow = isS2
    ? `Tile ${props['s2:mgrs_tile'] ?? '44QME'}`
    : `Tier ${props['landsat:collection_category'] ?? 'T1'}`;

  return {
    id: f.id,
    collection: col,
    mission,
    platform,
    instrument: Array.isArray(props.instruments) ? props.instruments.join(', ').toUpperCase() : isS2 ? 'MSI' : 'OLI/TIRS',
    datetime: dt,
    dateLabel: dt.slice(0, 10),
    month: d.getUTCMonth() + 1,
    year: d.getUTCFullYear(),
    cloudCover: Number(props['eo:cloud_cover'] ?? 0),
    resolutionMeters: isS2 ? 10 : 30,
    processingBaseline: isS2 ? String(props['s2:processing_baseline'] ?? 'N/A') : 'Collection 2 L2',
    epsg: props['proj:epsg'] ?? null,
    sunElevation: typeof props['view:sun_elevation'] === 'number' ? Number(props['view:sun_elevation'].toFixed(2)) : null,
    sunAzimuth: typeof props['view:sun_azimuth'] === 'number' ? Number(props['view:sun_azimuth'].toFixed(2)) : null,
    orbitOrPathRow,
    tileOrRow,
    bbox: f.bbox,
    stacItemUrl: `https://planetarycomputer.microsoft.com/api/stac/v1/collections/${col}/items/${f.id}`,
    sourceLabel: isS2 ? 'Copernicus Sentinel-2 L2A (STAC)' : 'USGS Landsat C2 L2 (STAC)',
  };
}

async function queryYearScenes(year: number): Promise<StacSceneSummary[]> {
  const studyBbox = STUDY_LOCATION.bbox;
  const poly = {
    type: 'Polygon',
    coordinates: [[
      [studyBbox[0], studyBbox[1]],
      [studyBbox[2], studyBbox[1]],
      [studyBbox[2], studyBbox[3]],
      [studyBbox[0], studyBbox[3]],
      [studyBbox[0], studyBbox[1]],
    ]],
  };

  const resp = await fetch('https://planetarycomputer.microsoft.com/api/stac/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a', 'landsat-c2-l2'],
      intersects: poly,
      datetime: `${year}-01-01T00:00:00Z/${year}-12-31T23:59:59Z`,
      query: { 'eo:cloud_cover': { lt: 12 } },
      limit: 80,
    }),
  });

  if (!resp.ok) {
    throw new Error(`STAC catalog search failed for ${year}: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  const features: any[] = data.features || [];

  return features
    .filter((f) => coversFullStudyBbox(f.bbox, studyBbox))
    .filter((f) => f.properties?.platform !== 'landsat-7')
    .map(mapStacFeature)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
}

async function fetchWaybackPair(): Promise<{
  available: boolean;
  earlier: WaybackReleaseInfo | null;
  latest: WaybackReleaseInfo | null;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const resp = await fetch('https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return { available: false, earlier: null, latest: null };
    const cfg = (await resp.json()) as Record<string, { itemTitle: string; itemURL: string }>;
    const list = Object.entries(cfg)
      .map(([id, v]) => {
        const m = /\((\s*Wayback\s+)?(\d{4}-\d{2}-\d{2})\)/.exec(v.itemTitle || '');
        const captureDate = m ? m[2] : '';
        const tileUrlTemplate = String(v.itemURL || '')
          .replace('{level}', '{z}')
          .replace('{row}', '{y}')
          .replace('{col}', '{x}');
        return { id, title: v.itemTitle, captureDate, tileUrlTemplate };
      })
      .filter((x) => x.captureDate && x.tileUrlTemplate)
      .sort((a, b) => b.captureDate.localeCompare(a.captureDate));

    const oct2016 = list.find((x) => x.captureDate.startsWith('2016-10')) || list.find((x) => x.captureDate.startsWith('2016'));
    const latest = list[0] || null;
    if (!oct2016 || !latest) return { available: false, earlier: null, latest: null };
    return { available: true, earlier: oct2016, latest };
  } catch {
    return { available: false, earlier: null, latest: null };
  }
}

async function checkCopernicusDataSpace(): Promise<CatalogResponse['copernicusVerification']> {
  const endpoint = 'https://catalogue.dataspace.copernicus.eu/stac/search';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        collections: ['SENTINEL-2'],
        bbox: STUDY_LOCATION.bbox,
        datetime: '2026-01-01T00:00:00Z/2026-11-16T23:59:59Z',
        limit: 5,
      }),
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return { endpoint, reachable: false, matched2026Count: 0, sampleProductId: null };
    }
    const json = await resp.json();
    const feats = Array.isArray(json.features) ? json.features : [];
    return {
      endpoint,
      reachable: true,
      matched2026Count: feats.length,
      sampleProductId: feats[0]?.id ?? null,
    };
  } catch {
    return { endpoint, reachable: false, matched2026Count: 0, sampleProductId: null };
  }
}

async function fetchIoLulcVerification(): Promise<HistoricalLulcVerification> {
  if (ioLulcCache) return ioLulcCache;
  try {
    const bboxStr = STUDY_LOCATION.bbox.join(',');
    const url17 = `https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${bboxStr}/300x300.tif?collection=io-lulc-annual-v02&item=44Q-2017&assets=data`;
    const url23 = `https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${bboxStr}/300x300.tif?collection=io-lulc-annual-v02&item=44Q-2023&assets=data`;
    const [r17, r23] = await Promise.all([fetch(url17), fetch(url23)]);
    if (!r17.ok || !r23.ok) throw new Error('IO LULC unavailable');
    const [b17, b23] = await Promise.all([r17.arrayBuffer(), r23.arrayBuffer()]);
    const [img17, img23] = await Promise.all([
      (await fromArrayBuffer(b17)).getImage(),
      (await fromArrayBuffer(b23)).getImage(),
    ]);
    const [ras17, ras23] = await Promise.all([img17.readRasters(), img23.readRasters()]);
    const arr17 = ras17[0] as Uint8Array;
    const arr23 = ras23[0] as Uint8Array;

    // IO LULC v02 codes: 1=Water, 2=Trees, 4=Flooded Veg, 5=Crops, 7=Built Area, 8=Bare Ground, 11=Rangeland
    const groups: Array<{ label: string; codes: number[] }> = [
      { label: 'Trees / Dense Vegetation', codes: [2, 4] },
      { label: 'Crops (Agricultural Land)', codes: [5] },
      { label: 'Built Area', codes: [7] },
      { label: 'Water', codes: [1] },
      { label: 'Rangeland & Bare Ground', codes: [8, 11] },
    ];
    const totalAreaKm2 = computeGeodesicAreaKm2(STUDY_LOCATION.bbox);
    const totalPx = arr17.length;
    const pxKm2 = totalAreaKm2 / totalPx;

    const classes = groups.map((g) => {
      let c17 = 0;
      let c23 = 0;
      for (let i = 0; i < totalPx; i++) {
        if (g.codes.includes(arr17[i])) c17++;
        if (g.codes.includes(arr23[i])) c23++;
      }
      const km17 = c17 * pxKm2;
      const km23 = c23 * pxKm2;
      return {
        label: g.label,
        earlierKm2: Number(km17.toFixed(3)),
        earlierPct: Number(((c17 / totalPx) * 100).toFixed(2)),
        latestKm2: Number(km23.toFixed(3)),
        latestPct: Number(((c23 / totalPx) * 100).toFixed(2)),
        deltaKm2: Number((km23 - km17).toFixed(3)),
      };
    });

    ioLulcCache = {
      source: 'Impact Observatory 10 m Annual LULC (Planetary Computer io-lulc-annual-v02)',
      taxonomy: 'Dynamic World 9-Class Taxonomy (Water, Trees, Crops, Built Area, Rangeland/Bare)',
      available: true,
      yearEarlier: 2017,
      yearLatest: 2023,
      classes,
      note: 'Independent 10 m Sentinel-2 deep-learning classification archive (2017–2023) corroborating long-term built-up and agricultural trends over Ammapalem.',
    };
    return ioLulcCache;
  } catch {
    return {
      source: 'Impact Observatory 10 m Annual LULC (io-lulc-annual-v02)',
      taxonomy: 'Dynamic World 9-Class Taxonomy',
      available: false,
      yearEarlier: 2017,
      yearLatest: 2023,
      classes: [],
      note: 'Historical IO LULC verification archive temporarily unreachable.',
    };
  }
}

function buildPresets(scenes2016: StacSceneSummary[], scenes2026: StacSceneSummary[]): SeasonalPairPreset[] {
  const findBest = (
    list: StacSceneSummary[],
    col: 'sentinel-2-l2a' | 'landsat-c2-l2',
    months: number[]
  ): StacSceneSummary | undefined => {
    const candidates = list.filter((s) => s.collection === col && months.includes(s.month));
    if (candidates.length === 0) return undefined;
    return candidates.sort((a, b) => a.cloudCover - b.cloudCover)[0];
  };

  const presets: SeasonalPairPreset[] = [];

  const s2Oct16 = findBest(scenes2016, 'sentinel-2-l2a', [10]);
  const s2Oct26 = findBest(scenes2026, 'sentinel-2-l2a', [10]);
  if (s2Oct16 && s2Oct26) {
    presets.push({
      id: 's2-october',
      label: 'Oct 2016 vs Oct 2026 (Sentinel-2 · 10 m)',
      seasonDescription: 'Comparable October post-monsoon observations (2 days apart seasonally) minimizing seasonal crop phenology bias.',
      missionLabel: 'Copernicus Sentinel-2 L2A (10 m)',
      item2016Id: s2Oct16.id,
      col2016: 'sentinel-2-l2a',
      item2026Id: s2Oct26.id,
      col2026: 'sentinel-2-l2a',
    });
  }

  const lsNov16 = findBest(scenes2016, 'landsat-c2-l2', [11, 12]);
  const lsNov26 = findBest(scenes2026, 'landsat-c2-l2', [11, 10]);
  if (lsNov16 && lsNov26) {
    presets.push({
      id: 'landsat-nov',
      label: 'Nov 2016 vs Nov 2026 (Landsat 8/9 · 30 m)',
      seasonDescription: 'USGS Collection 2 Level-2 November cross-verification at 30 m spatial resolution (<0.02% cloud).',
      missionLabel: 'USGS Landsat 8 & 9 C2 L2 (30 m)',
      item2016Id: lsNov16.id,
      col2016: 'landsat-c2-l2',
      item2026Id: lsNov26.id,
      col2026: 'landsat-c2-l2',
    });
  }

  const s2Rabi16 = findBest(scenes2016, 'sentinel-2-l2a', [2, 3]);
  const s2Rabi26 = findBest(scenes2026, 'sentinel-2-l2a', [3, 2]);
  if (s2Rabi16 && s2Rabi26) {
    presets.push({
      id: 's2-rabi',
      label: 'Feb 2016 vs Mar 2026 (Sentinel-2 · 10 m)',
      seasonDescription: 'Cloud-free (<0.05%) Rabi winter-crop comparison at 10 m spatial resolution.',
      missionLabel: 'Copernicus Sentinel-2 L2A (10 m)',
      item2016Id: s2Rabi16.id,
      col2016: 'sentinel-2-l2a',
      item2026Id: s2Rabi26.id,
      col2026: 'sentinel-2-l2a',
    });
  }

  const s2Apr16 = findBest(scenes2016, 'sentinel-2-l2a', [4]);
  const s2Apr26 = findBest(scenes2026, 'sentinel-2-l2a', [4]);
  if (s2Apr16 && s2Apr26) {
    presets.push({
      id: 's2-april',
      label: 'Apr 2016 vs Apr 2026 (Sentinel-2 · 10 m)',
      seasonDescription: 'Dry-season April comparison isolating perennial canopy and dry-season surface reservoirs.',
      missionLabel: 'Copernicus Sentinel-2 L2A (10 m)',
      item2016Id: s2Apr16.id,
      col2016: 'sentinel-2-l2a',
      item2026Id: s2Apr26.id,
      col2026: 'sentinel-2-l2a',
    });
  }

  return presets;
}

export async function getCatalog(): Promise<CatalogResponse> {
  if (catalogCache && Date.now() < catalogCache.expiresAt) {
    return catalogCache.data;
  }

  const [scenes2016, scenes2026, copernicusVerification, geeStatus, waybackPair] = await Promise.all([
    queryYearScenes(2016),
    queryYearScenes(2026),
    checkCopernicusDataSpace(),
    checkGeeStatus(),
    fetchWaybackPair(),
  ]);

  const presets = buildPresets(scenes2016, scenes2026);
  const data: CatalogResponse = {
    location: STUDY_LOCATION,
    presets,
    scenes2016,
    scenes2026,
    geeStatus,
    waybackPair,
    copernicusVerification,
  };

  catalogCache = { data, expiresAt: Date.now() + 15 * 60 * 1000 };
  return data;
}

async function fetchStacItem(collection: 'sentinel-2-l2a' | 'landsat-c2-l2', itemId: string): Promise<StacSceneSummary> {
  const url = `https://planetarycomputer.microsoft.com/api/stac/v1/collections/${collection}/items/${itemId}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Unable to fetch STAC item ${itemId} (${resp.status})`);
  }
  const feature = await resp.json();
  return mapStacFeature(feature);
}

interface BandCube {
  width: number;
  height: number;
  red: Float32Array;
  nir: Float32Array;
  green: Float32Array;
  swir: Float32Array;
  blue: Float32Array;
  valid: Uint8Array;
  maskedCount: number;
}

async function fetchAndCalibrateSceneBands(scene: StacSceneSummary): Promise<BandCube> {
  const w = STUDY_LOCATION.gridSize;
  const h = STUDY_LOCATION.gridSize;
  const bboxStr = STUDY_LOCATION.bbox.join(',');
  const isS2 = scene.collection === 'sentinel-2-l2a';

  const assets = isS2
    ? 'assets=B04&assets=B08&assets=B03&assets=B11&assets=B02&assets=SCL'
    : 'assets=red&assets=nir08&assets=green&assets=swir16&assets=blue&assets=qa_pixel';

  const tifUrl = `https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${bboxStr}/${w}x${h}.tif?collection=${scene.collection}&item=${scene.id}&${assets}`;
  const resp = await fetch(tifUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch GeoTIFF bands for ${scene.id}: HTTP ${resp.status}`);
  }
  const buf = await resp.arrayBuffer();
  const tiff = await fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const rasters = await img.readRasters();

  const bRed = rasters[0] as Uint16Array | Int16Array | Float32Array;
  const bNir = rasters[1] as Uint16Array | Int16Array | Float32Array;
  const bGreen = rasters[2] as Uint16Array | Int16Array | Float32Array;
  const bSwir = rasters[3] as Uint16Array | Int16Array | Float32Array;
  const bBlue = rasters[4] as Uint16Array | Int16Array | Float32Array;
  const bQa = rasters[5] as Uint16Array | Uint8Array | Int16Array;

  const n = w * h;
  const red = new Float32Array(n);
  const nir = new Float32Array(n);
  const green = new Float32Array(n);
  const swir = new Float32Array(n);
  const blue = new Float32Array(n);
  const valid = new Uint8Array(n);

  const baselineNum = scene.processingBaseline ? parseFloat(scene.processingBaseline) : 0;
  const s2Offset = isS2 && !Number.isNaN(baselineNum) && baselineNum >= 4.0 ? 1000 : 0;
  let maskedCount = 0;

  for (let i = 0; i < n; i++) {
    const qa = bQa[i];
    if (isS2) {
      if (qa === 0 || qa === 1 || qa === 3 || qa === 8 || qa === 9 || qa === 10) {
        valid[i] = 0;
        maskedCount++;
        continue;
      }
      red[i] = Math.max(0.0001, (bRed[i] - s2Offset) / 10000);
      nir[i] = Math.max(0.0001, (bNir[i] - s2Offset) / 10000);
      green[i] = Math.max(0.0001, (bGreen[i] - s2Offset) / 10000);
      swir[i] = Math.max(0.0001, (bSwir[i] - s2Offset) / 10000);
      blue[i] = Math.max(0.0001, (bBlue[i] - s2Offset) / 10000);
      valid[i] = 1;
    } else {
      if ((qa & 0b11111) !== 0 || bRed[i] === 0) {
        valid[i] = 0;
        maskedCount++;
        continue;
      }
      red[i] = Math.max(0.0001, bRed[i] * 0.0000275 - 0.2);
      nir[i] = Math.max(0.0001, bNir[i] * 0.0000275 - 0.2);
      green[i] = Math.max(0.0001, bGreen[i] * 0.0000275 - 0.2);
      swir[i] = Math.max(0.0001, bSwir[i] * 0.0000275 - 0.2);
      blue[i] = Math.max(0.0001, bBlue[i] * 0.0000275 - 0.2);
      valid[i] = 1;
    }
  }

  return { width: w, height: h, red, nir, green, swir, blue, valid, maskedCount };
}

async function fetchTrueColorPng(scene: StacSceneSummary): Promise<Buffer> {
  const w = STUDY_LOCATION.gridSize;
  const h = STUDY_LOCATION.gridSize;
  const bboxStr = STUDY_LOCATION.bbox.join(',');
  const url =
    scene.collection === 'sentinel-2-l2a'
      ? `https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${bboxStr}/${w}x${h}.png?collection=sentinel-2-l2a&item=${scene.id}&assets=visual`
      : `https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${bboxStr}/${w}x${h}.png?collection=landsat-c2-l2&item=${scene.id}&assets=red&assets=green&assets=blue&color_formula=gamma%20RGB%202.7,%20saturation%201.5,%20sigmoidal%20RGB%2015%200.55`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch true-color imagery for ${scene.id}: HTTP ${resp.status}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Computes soft Dynamic-World-inspired class likelihood probabilities & confidence score [0..1]
 * from calibrated Sentinel-2 / Landsat surface reflectance & spectral indices.
 */
function classifyPixelWithConfidence(
  ndvi: number,
  ndwi: number,
  ndbi: number,
  bsi: number,
  swir: number,
  red: number
): { classId: number; confidence: number } {
  // Logit scores for each of the 5 classes: 1=Veg, 2=Agri, 3=BuiltUp, 4=Water, 5=Other
  const sWater =
    ndwi > 0.02
      ? 3.8 + (ndwi - 0.02) * 14.0 - Math.max(0, ndvi) * 4.0
      : -4.0 + ndwi * 8.0;

  const builtTrigger = (ndbi > 0.0 && ndvi < 0.28) || (ndbi > -0.04 && ndvi < 0.22 && swir > 0.14 && red > 0.075);
  const sBuilt = builtTrigger
    ? 2.8 + Math.max(0, ndbi + 0.04) * 10.0 + Math.max(0, 0.28 - ndvi) * 5.0 + Math.max(0, bsi) * 3.0
    : -2.0 + ndbi * 4.0 - Math.max(0, ndvi - 0.25) * 8.0;

  const sVeg =
    ndvi >= 0.62
      ? 2.6 + (ndvi - 0.62) * 12.0 - Math.max(0, ndbi) * 3.0
      : 1.5 - Math.abs(ndvi - 0.68) * 10.0;

  const sAgri =
    ndvi >= 0.24 && ndvi < 0.62
      ? 2.5 + (0.19 - Math.abs(ndvi - 0.43)) * 8.0 - (builtTrigger ? 4.0 : 0)
      : 1.2 - Math.abs(ndvi - 0.43) * 9.0;

  const sOther =
    ndvi < 0.24 && !builtTrigger && ndwi <= 0.02
      ? 2.4 + (0.24 - ndvi) * 6.0 - Math.max(0, ndbi) * 2.0
      : -1.5;

  const logits = [sVeg, sAgri, sBuilt, sWater, sOther];
  const maxLogit = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(Math.min(18, l - maxLogit)));
  const sumExp = exps.reduce((a, b) => a + b, 0);

  let bestIdx = 0;
  let bestProb = 0;
  for (let k = 0; k < 5; k++) {
    const p = exps[k] / sumExp;
    if (p > bestProb) {
      bestProb = p;
      bestIdx = k;
    }
  }

  return {
    classId: bestIdx + 1,
    confidence: Math.min(0.99, Math.max(0.25, bestProb)),
  };
}

const ID_TO_KEY: Record<number, LandCoverKey> = {
  1: 'vegetation',
  2: 'agricultural',
  3: 'builtUp',
  4: 'water',
  5: 'other',
};

function encodePng(
  width: number,
  height: number,
  pixelCallback: (i: number, setRgba: (r: number, g: number, b: number, a: number) => void) => void
): Buffer {
  const png = new PNG({ width, height });
  const data = png.data;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    pixelCallback(i, (r, g, b, a) => {
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    });
  }
  return PNG.sync.write(png);
}

function lerpColor(t: number, stops: Array<[number, [number, number, number]]>): [number, number, number] {
  if (t <= stops[0][0]) return stops[0][1];
  for (let s = 1; s < stops.length; s++) {
    const [t0, c0] = stops[s - 1];
    const [t1, c1] = stops[s];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

function buildFalseColorPng(cube: BandCube): Buffer {
  return encodePng(cube.width, cube.height, (i, set) => {
    if (!cube.valid[i]) {
      set(26, 28, 25, 220);
      return;
    }
    const r = Math.min(255, Math.max(0, Math.round((cube.nir[i] / 0.45) * 255)));
    const g = Math.min(255, Math.max(0, Math.round((cube.red[i] / 0.28) * 255)));
    const b = Math.min(255, Math.max(0, Math.round((cube.green[i] / 0.25) * 255)));
    set(r, g, b, 255);
  });
}

/**
 * Extracts 8-connected components for each of the 5 visual change highlight categories
 * and builds simplified orthogonal GeoJSON polygons in WGS84 coordinates.
 */
function extractChangePolygons(
  w: number,
  h: number,
  bbox: [number, number, number, number],
  cellAreaKm2: number,
  overlayCatGrid: Uint8Array, // 0=none, 1=built_up, 2=veg_loss, 3=veg_gain, 4=water_change, 5=agri_conversion
  class2016: Uint8Array,
  class2026: Uint8Array,
  conf2016: Float32Array,
  conf2026: Float32Array,
  ndvi2016: Float32Array,
  ndvi2026: Float32Array,
  ndbi2016: Float32Array,
  ndbi2026: Float32Array
): ChangePolygonFeature[] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const dLon = (maxLon - minLon) / w;
  const dLat = (maxLat - minLat) / h;

  const codeToCategory: Record<number, ChangeOverlayCategory> = {
    1: 'built_up',
    2: 'veg_loss',
    3: 'veg_gain',
    4: 'water_change',
    5: 'agri_conversion',
  };

  const visited = new Uint8Array(w * h);
  const clusters: Array<{
    catCode: number;
    pixels: number[];
    minR: number;
    maxR: number;
    minC: number;
    maxC: number;
  }> = [];

  const queue = new Int32Array(w * h);
  const dirs = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];

  for (let i = 0; i < w * h; i++) {
    const cat = overlayCatGrid[i];
    if (cat === 0 || visited[i]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;
    const pixels: number[] = [];
    let minR = h, maxR = 0, minC = w, maxC = 0;

    while (head < tail) {
      const idx = queue[head++];
      pixels.push(idx);
      const r = Math.floor(idx / w);
      const c = idx % w;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;

      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
        const nIdx = nr * w + nc;
        if (!visited[nIdx] && overlayCatGrid[nIdx] === cat) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    // Keep meaningful clusters >= 16 pixels (~1,600 m^2 = 0.16 ha)
    if (pixels.length >= 16) {
      clusters.push({ catCode: cat, pixels, minR, maxR, minC, maxC });
    }
  }

  // Sort by area descending and keep top ~18 per category (max ~90 polygons total for crisp map speed)
  clusters.sort((a, b) => b.pixels.length - a.pixels.length);
  const perCatCount: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const selected = clusters.filter((cl) => {
    if (perCatCount[cl.catCode] >= 18) return false;
    perCatCount[cl.catCode]++;
    return true;
  });

  // Trace clean outer polygon boundary via downsampled/local grid edge-walk
  const features: ChangePolygonFeature[] = [];
  let polyIndex = 1;

  for (const cl of selected) {
    const category = codeToCategory[cl.catCode];
    const meta = CHANGE_CATEGORY_META[category];

    // Local bounding grid
    const rows = cl.maxR - cl.minR + 1;
    const cols = cl.maxC - cl.minC + 1;
    const mask = new Uint8Array(rows * cols);

    let sumLat = 0, sumLon = 0;
    let sumConf = 0, sumN16 = 0, sumN26 = 0, sumB16 = 0, sumB26 = 0;
    const earlierCounts: Record<number, number> = {};
    const latestCounts: Record<number, number> = {};

    for (const idx of cl.pixels) {
      const r = Math.floor(idx / w);
      const c = idx % w;
      mask[(r - cl.minR) * cols + (c - cl.minC)] = 1;

      sumLat += maxLat - (r + 0.5) * dLat;
      sumLon += minLon + (c + 0.5) * dLon;
      sumConf += Math.min(conf2016[idx], conf2026[idx]);
      sumN16 += ndvi2016[idx];
      sumN26 += ndvi2026[idx];
      sumB16 += ndbi2016[idx];
      sumB26 += ndbi2026[idx];
      earlierCounts[class2016[idx]] = (earlierCounts[class2016[idx]] || 0) + 1;
      latestCounts[class2026[idx]] = (latestCounts[class2026[idx]] || 0) + 1;
    }

    // Build smooth scanline-envelope ring across local rows (step 1 or 2 for large clusters)
    const step = rows > 60 ? 2 : 1;
    const leftEdge: Array<[number, number]> = [];
    const rightEdge: Array<[number, number]> = [];

    for (let lr = 0; lr < rows; lr += step) {
      let firstC = -1;
      let lastC = -1;
      for (let lc = 0; lc < cols; lc++) {
        if (mask[lr * cols + lc]) {
          if (firstC === -1) firstC = lc;
          lastC = lc;
        }
      }
      if (firstC !== -1) {
        const gRowTop = cl.minR + lr;
        const gRowBot = Math.min(cl.maxR + 1, cl.minR + lr + step);
        const latTop = Number((maxLat - gRowTop * dLat).toFixed(6));
        const latBot = Number((maxLat - gRowBot * dLat).toFixed(6));
        const lonLeft = Number((minLon + (cl.minC + firstC) * dLon).toFixed(6));
        const lonRight = Number((minLon + (cl.minC + lastC + 1) * dLon).toFixed(6));

        leftEdge.push([lonLeft, latTop]);
        if (lr + step >= rows) leftEdge.push([lonLeft, latBot]);
        rightEdge.push([lonRight, latTop]);
        if (lr + step >= rows) rightEdge.push([lonRight, latBot]);
      }
    }

    if (leftEdge.length === 0) continue;
    const ring: number[][] = [...leftEdge, ...rightEdge.reverse(), leftEdge[0]];

    const topEarlier = Number(Object.entries(earlierCounts).sort((a, b) => b[1] - a[1])[0][0]);
    const topLatest = Number(Object.entries(latestCounts).sort((a, b) => b[1] - a[1])[0][0]);
    const px = cl.pixels.length;
    const areaKm2 = px * cellAreaKm2;
    const areaHa = areaKm2 * 100;
    const areaM2 = Math.round(areaKm2 * 1_000_000);

    features.push({
      id: `chg-${polyIndex++}`,
      category,
      categoryLabel: meta.label,
      color: meta.color,
      earlierClass: LAND_COVER_META[ID_TO_KEY[topEarlier] || 'other'].label,
      latestClass: LAND_COVER_META[ID_TO_KEY[topLatest] || 'other'].label,
      areaM2,
      areaHa: Number(areaHa.toFixed(2)),
      areaKm2: Number(areaKm2.toFixed(4)),
      pixelCount: px,
      confidencePct: Number(((sumConf / px) * 100).toFixed(1)),
      centroid: {
        lat: Number((sumLat / px).toFixed(5)),
        lon: Number((sumLon / px).toFixed(5)),
      },
      meanNdvi2016: Number((sumN16 / px).toFixed(3)),
      meanNdvi2026: Number((sumN26 / px).toFixed(3)),
      meanNdbi2016: Number((sumB16 / px).toFixed(3)),
      meanNdbi2026: Number((sumB26 / px).toFixed(3)),
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    });
  }

  return features;
}

export async function runAnalysis(params?: {
  pairId?: string;
  item2016Id?: string;
  col2016?: 'sentinel-2-l2a' | 'landsat-c2-l2';
  item2026Id?: string;
  col2026?: 'sentinel-2-l2a' | 'landsat-c2-l2';
  confidenceThreshold?: number;
}): Promise<AnalysisResult> {
  const catalog = await getCatalog();
  const confidenceThreshold = Math.min(
    0.85,
    Math.max(0.35, Number(params?.confidenceThreshold ?? 0.55))
  );

  let item2016Id = params?.item2016Id;
  let col2016 = params?.col2016;
  let item2026Id = params?.item2026Id;
  let col2026 = params?.col2026;

  if (!item2016Id || !item2026Id) {
    const preset = catalog.presets.find((p) => p.id === params?.pairId) || catalog.presets[0];
    if (!preset) {
      throw new Error('No comparable cloud-free 2016/2026 satellite observation pair available from STAC.');
    }
    item2016Id = preset.item2016Id;
    col2016 = preset.col2016;
    item2026Id = preset.item2026Id;
    col2026 = preset.col2026;
  }

  col2016 = col2016 || 'sentinel-2-l2a';
  col2026 = col2026 || 'sentinel-2-l2a';
  const key = `${col2016}__${item2016Id}__VS__${col2026}__${item2026Id}__C${Math.round(confidenceThreshold * 100)}`;

  const cached = analysisCache.get(key);
  if (cached) return cached;

  const [scene2016, scene2026, historicalLulc] = await Promise.all([
    fetchStacItem(col2016, item2016Id),
    fetchStacItem(col2026, item2026Id),
    fetchIoLulcVerification(),
  ]);

  const [cube2016, cube2026, rgb2016Png, rgb2026Png] = await Promise.all([
    fetchAndCalibrateSceneBands(scene2016),
    fetchAndCalibrateSceneBands(scene2026),
    fetchTrueColorPng(scene2016),
    fetchTrueColorPng(scene2026),
  ]);

  const w = STUDY_LOCATION.gridSize;
  const h = STUDY_LOCATION.gridSize;
  const n = w * h;
  const totalBboxAreaKm2 = computeGeodesicAreaKm2(STUDY_LOCATION.bbox);
  const cellAreaKm2 = totalBboxAreaKm2 / n;
  const cellSizeMeters = Math.sqrt(cellAreaKm2 * 1_000_000);

  const ndvi2016 = new Float32Array(n);
  const ndvi2026 = new Float32Array(n);
  const ndwi2016 = new Float32Array(n);
  const ndwi2026 = new Float32Array(n);
  const ndbi2016 = new Float32Array(n);
  const ndbi2026 = new Float32Array(n);
  const bsi2016 = new Float32Array(n);
  const bsi2026 = new Float32Array(n);
  const class2016 = new Uint8Array(n);
  const class2026 = new Uint8Array(n);
  const conf2016 = new Float32Array(n);
  const conf2026 = new Float32Array(n);
  const overlayCatGrid = new Uint8Array(n);

  const count16: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const count26: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const transMatrix: Record<string, number> = {};

  let validJointPixels = 0;
  let cloudMaskedJointPixels = 0;
  let confirmedPixels = 0;
  let uncertainExcludedPixels = 0;
  let confSum = 0;

  let sumNdvi16 = 0, sumNdvi26 = 0, minNdvi16 = 1, maxNdvi16 = -1, minNdvi26 = 1, maxNdvi26 = -1;
  let sumNdwi16 = 0, sumNdwi26 = 0, minNdwi16 = 1, maxNdwi16 = -1, minNdwi26 = 1, maxNdwi26 = -1;
  let sumNdbi16 = 0, sumNdbi26 = 0, minNdbi16 = 1, maxNdbi16 = -1, minNdbi26 = 1, maxNdbi26 = -1;
  let sumBsi16 = 0, sumBsi26 = 0, minBsi16 = 1, maxBsi16 = -1, minBsi26 = 1, maxBsi26 = -1;

  let newlyBuiltUpPx = 0;
  let vegLossPx = 0;
  let vegGainPx = 0;
  let agriToBuiltPx = 0;
  let agriConvertedTotalPx = 0;
  let waterGainedPx = 0;
  let waterLostPx = 0;
  let otherChangesPx = 0;
  let confirmedChangedPx = 0;

  const histBins16 = new Array(10).fill(0);
  const histBins26 = new Array(10).fill(0);

  const quadStats = [
    { name: 'Northwest Sector', boundsLabel: '17.2237°–17.2508° N · 80.2201°–80.2483° E', valid: 0, vegD: 0, agriD: 0, builtD: 0, waterD: 0, dNdviSum: 0, dNdbiSum: 0 },
    { name: 'Northeast Sector', boundsLabel: '17.2237°–17.2508° N · 80.2483°–80.2765° E', valid: 0, vegD: 0, agriD: 0, builtD: 0, waterD: 0, dNdviSum: 0, dNdbiSum: 0 },
    { name: 'Southwest Sector', boundsLabel: '17.1966°–17.2237° N · 80.2201°–80.2483° E', valid: 0, vegD: 0, agriD: 0, builtD: 0, waterD: 0, dNdviSum: 0, dNdbiSum: 0 },
    { name: 'Southeast Sector', boundsLabel: '17.1966°–17.2237° N · 80.2483°–80.2765° E', valid: 0, vegD: 0, agriD: 0, builtD: 0, waterD: 0, dNdviSum: 0, dNdbiSum: 0 },
  ];

  for (let i = 0; i < n; i++) {
    const v16 = cube2016.valid[i] === 1;
    const v26 = cube2026.valid[i] === 1;

    if (v16) {
      const r = cube2016.red[i], nir = cube2016.nir[i], g = cube2016.green[i], s = cube2016.swir[i], b = cube2016.blue[i];
      ndvi2016[i] = (nir - r) / (nir + r + 1e-6);
      ndwi2016[i] = (g - nir) / (g + nir + 1e-6);
      ndbi2016[i] = (s - nir) / (s + nir + 1e-6);
      bsi2016[i] = ((s + r) - (nir + b)) / ((s + r) + (nir + b) + 1e-6);
      const res16 = classifyPixelWithConfidence(ndvi2016[i], ndwi2016[i], ndbi2016[i], bsi2016[i], s, r);
      class2016[i] = res16.classId;
      conf2016[i] = res16.confidence;
    }

    if (v26) {
      const r = cube2026.red[i], nir = cube2026.nir[i], g = cube2026.green[i], s = cube2026.swir[i], b = cube2026.blue[i];
      ndvi2026[i] = (nir - r) / (nir + r + 1e-6);
      ndwi2026[i] = (g - nir) / (g + nir + 1e-6);
      ndbi2026[i] = (s - nir) / (s + nir + 1e-6);
      bsi2026[i] = ((s + r) - (nir + b)) / ((s + r) + (nir + b) + 1e-6);
      const res26 = classifyPixelWithConfidence(ndvi2026[i], ndwi2026[i], ndbi2026[i], bsi2026[i], s, r);
      class2026[i] = res26.classId;
      conf2026[i] = res26.confidence;
    }

    if (!v16 || !v26) {
      cloudMaskedJointPixels++;
      continue;
    }

    validJointPixels++;
    const jointConf = Math.min(conf2016[i], conf2026[i]);
    confSum += jointConf;

    const c16 = class2016[i];
    const c26 = class2026[i];
    count16[c16]++;
    count26[c26]++;

    const vN16 = ndvi2016[i], vN26 = ndvi2026[i];
    const vW16 = ndwi2016[i], vW26 = ndwi2026[i];
    const vB16 = ndbi2016[i], vB26 = ndbi2026[i];
    const vS16 = bsi2016[i], vS26 = bsi2026[i];

    sumNdvi16 += vN16; sumNdvi26 += vN26;
    if (vN16 < minNdvi16) minNdvi16 = vN16; if (vN16 > maxNdvi16) maxNdvi16 = vN16;
    if (vN26 < minNdvi26) minNdvi26 = vN26; if (vN26 > maxNdvi26) maxNdvi26 = vN26;

    sumNdwi16 += vW16; sumNdwi26 += vW26;
    if (vW16 < minNdwi16) minNdwi16 = vW16; if (vW16 > maxNdwi16) maxNdwi16 = vW16;
    if (vW26 < minNdwi26) minNdwi26 = vW26; if (vW26 > maxNdwi26) maxNdwi26 = vW26;

    sumNdbi16 += vB16; sumNdbi26 += vB26;
    if (vB16 < minNdbi16) minNdbi16 = vB16; if (vB16 > maxNdbi16) maxNdbi16 = vB16;
    if (vB26 < minNdbi26) minNdbi26 = vB26; if (vB26 > maxNdbi26) maxNdbi26 = vB26;

    sumBsi16 += vS16; sumBsi26 += vS26;
    if (vS16 < minBsi16) minBsi16 = vS16; if (vS16 > maxBsi16) maxBsi16 = vS16;
    if (vS26 < minBsi26) minBsi26 = vS26; if (vS26 > maxBsi26) maxBsi26 = vS26;

    const b16 = Math.min(9, Math.max(0, Math.floor((vN16 + 0.1) * 10)));
    const b26 = Math.min(9, Math.max(0, Math.floor((vN26 + 0.1) * 10)));
    histBins16[b16]++;
    histBins26[b26]++;

    // Quadrant tracking over all valid pixels
    const row = Math.floor(i / w);
    const col = i % w;
    const qIdx = (row >= h / 2 ? 2 : 0) + (col >= w / 2 ? 1 : 0);
    const q = quadStats[qIdx];
    q.valid++;
    if (c26 === 1) q.vegD++; if (c16 === 1) q.vegD--;
    if (c26 === 2) q.agriD++; if (c16 === 2) q.agriD--;
    if (c26 === 3) q.builtD++; if (c16 === 3) q.builtD--;
    if (c26 === 4) q.waterD++; if (c16 === 4) q.waterD--;
    q.dNdviSum += vN26 - vN16;
    q.dNdbiSum += vB26 - vB16;

    // Confidence threshold gating for confirmed change statistics
    if (jointConf < confidenceThreshold) {
      uncertainExcludedPixels++;
      continue;
    }

    confirmedPixels++;
    const tKey = `${c16}_${c26}`;
    transMatrix[tKey] = (transMatrix[tKey] || 0) + 1;

    if (c16 === c26) continue;

    confirmedChangedPx++;
    if (c26 === 3) newlyBuiltUpPx++;
    if (c16 === 1 && c26 !== 1) vegLossPx++;
    if (c16 !== 1 && c26 === 1) vegGainPx++;
    if (c16 === 2 && c26 === 3) agriToBuiltPx++;
    if (c16 === 2 && c26 !== 2) agriConvertedTotalPx++;
    if (c16 !== 4 && c26 === 4) waterGainedPx++;
    if (c16 === 4 && c26 !== 4) waterLostPx++;

    // Assign primary mutually-exclusive overlay category for the 5-color spatial layer & polygons:
    // 1=Orange (Newly Built-up), 2=Red (Veg Loss), 3=Green (Veg Gain), 4=Blue (Water Change), 5=Yellow (Agri Conversion)
    if (c16 === 4 || c26 === 4) {
      overlayCatGrid[i] = 4; // Blue: Water expansion/reduction
    } else if (c26 === 3 && c16 !== 2) {
      overlayCatGrid[i] = 1; // Orange: Newly built-up (from veg/other)
    } else if (c16 === 2 && c26 === 3) {
      overlayCatGrid[i] = 5; // Yellow: Agricultural land converted to built-up (distinct yellow highlight!)
    } else if (c16 === 1 && c26 !== 1) {
      overlayCatGrid[i] = 2; // Red: Vegetation loss
    } else if (c16 !== 1 && c26 === 1) {
      overlayCatGrid[i] = 3; // Green: Vegetation gain
    } else if (c16 === 2 && c26 !== 2) {
      overlayCatGrid[i] = 5; // Yellow: Other agricultural conversion
    } else {
      otherChangesPx++;
    }
  }

  const denom = Math.max(1, validJointPixels);
  const confirmedDenom = Math.max(1, confirmedPixels);
  const analyzedAreaKm2 = validJointPixels * cellAreaKm2;

  const landCoverKeys: LandCoverKey[] = ['vegetation', 'agricultural', 'builtUp', 'water', 'other'];
  const landCover: LandCoverClassStat[] = landCoverKeys.map((k) => {
    const meta = LAND_COVER_META[k];
    const c16 = count16[meta.id] || 0;
    const c26 = count26[meta.id] || 0;
    const km16 = c16 * cellAreaKm2;
    const km26 = c26 * cellAreaKm2;
    const pct16 = (c16 / denom) * 100;
    const pct26 = (c26 / denom) * 100;
    const dKm2 = km26 - km16;
    return {
      key: k,
      label: meta.label,
      color: meta.color,
      area2016: toAreaMetrics(km16),
      pct2016: Number(pct16.toFixed(2)),
      area2026: toAreaMetrics(km26),
      pct2026: Number(pct26.toFixed(2)),
      deltaKm2: Number(dKm2.toFixed(3)),
      deltaHa: Number((dKm2 * 100).toFixed(2)),
      deltaM2: Math.round(dKm2 * 1_000_000),
      deltaPctPoints: Number((pct26 - pct16).toFixed(2)),
    };
  });

  const transitionMatrix: TransitionCell[] = [];
  for (let fromId = 1; fromId <= 5; fromId++) {
    for (let toId = 1; toId <= 5; toId++) {
      const px = transMatrix[`${fromId}_${toId}`] || 0;
      if (px > 0) {
        const km2 = px * cellAreaKm2;
        transitionMatrix.push({
          from: ID_TO_KEY[fromId],
          to: ID_TO_KEY[toId],
          areaKm2: Number(km2.toFixed(3)),
          areaHa: Number((km2 * 100).toFixed(2)),
          areaM2: Math.round(km2 * 1_000_000),
          pctOfAnalyzed: Number(((px / confirmedDenom) * 100).toFixed(2)),
        });
      }
    }
  }
  transitionMatrix.sort((a, b) => b.areaKm2 - a.areaKm2);

  const changePolygons = extractChangePolygons(
    w,
    h,
    STUDY_LOCATION.bbox,
    cellAreaKm2,
    overlayCatGrid,
    class2016,
    class2026,
    conf2016,
    conf2026,
    ndvi2016,
    ndvi2026,
    ndbi2016,
    ndbi2026
  );

  const binLabels = ['<0.0', '0.0–0.1', '0.1–0.2', '0.2–0.3', '0.3–0.4', '0.4–0.5', '0.5–0.6', '0.6–0.7', '0.7–0.8', '>=0.8'];
  const spectralHistograms = binLabels.map((bin, idx) => ({
    bin,
    ndvi2016Pct: Number(((histBins16[idx] / denom) * 100).toFixed(2)),
    ndvi2026Pct: Number(((histBins26[idx] / denom) * 100).toFixed(2)),
  }));

  const ndviRamp: Array<[number, [number, number, number]]> = [
    [-0.1, [48, 86, 128]],
    [0.05, [138, 122, 98]],
    [0.25, [189, 169, 107]],
    [0.45, [142, 163, 94]],
    [0.65, [92, 132, 68]],
    [0.85, [44, 88, 42]],
  ];

  const ndwiRamp: Array<[number, [number, number, number]]> = [
    [-0.6, [68, 56, 44]],
    [-0.2, [135, 118, 92]],
    [0.0, [96, 132, 148]],
    [0.15, [54, 136, 184]],
    [0.4, [24, 96, 168]],
  ];

  const ndbiRamp: Array<[number, [number, number, number]]> = [
    [-0.5, [62, 102, 64]],
    [-0.15, [142, 148, 112]],
    [0.0, [196, 168, 120]],
    [0.15, [232, 116, 42]],
    [0.35, [198, 58, 32]],
  ];

  const renderIndexPng = (arr: Float32Array, validMask: Uint8Array, ramp: Array<[number, [number, number, number]]>) =>
    encodePng(w, h, (i, set) => {
      if (!validMask[i]) {
        set(20, 21, 19, 150);
        return;
      }
      const [r, g, b] = lerpColor(arr[i], ramp);
      set(r, g, b, 235);
    });

  const renderLulcPng = (cls: Uint8Array, validMask: Uint8Array) =>
    encodePng(w, h, (i, set) => {
      if (!validMask[i]) {
        set(20, 21, 19, 140);
        return;
      }
      const k = ID_TO_KEY[cls[i]] || 'other';
      const [r, g, b] = LAND_COVER_META[k].rgb;
      set(r, g, b, 230);
    });

  const renderHighlight5ClassPng = () =>
    encodePng(w, h, (i, set) => {
      const cat = overlayCatGrid[i];
      if (cat === 1) set(249, 115, 22, 230); // Orange: Newly built-up
      else if (cat === 2) set(239, 68, 68, 225); // Red: Vegetation loss
      else if (cat === 3) set(34, 197, 94, 225); // Green: Vegetation gain
      else if (cat === 4) set(59, 130, 246, 235); // Blue: Water change
      else if (cat === 5) set(234, 179, 8, 225); // Yellow: Agricultural conversion
      else set(0, 0, 0, 0); // Transparent for unchanged / uncertain
    });

  const renderChangeVegPng = () =>
    encodePng(w, h, (i, set) => {
      if (!cube2016.valid[i] || !cube2026.valid[i]) {
        set(20, 21, 19, 120);
        return;
      }
      const d = ndvi2026[i] - ndvi2016[i];
      if (d > 0.14) set(34, 197, 94, 225);
      else if (d < -0.14) set(239, 68, 68, 225);
      else set(32, 34, 30, 120);
    });

  const renderChangeBuiltupPng = () =>
    encodePng(w, h, (i, set) => {
      if (!cube2016.valid[i] || !cube2026.valid[i]) {
        set(20, 21, 19, 120);
        return;
      }
      if (class2016[i] !== 3 && class2026[i] === 3) set(249, 115, 22, 240);
      else if (class2016[i] === 3 && class2026[i] === 3) set(210, 194, 165, 200);
      else set(32, 34, 30, 115);
    });

  const renderChangeWaterPng = () =>
    encodePng(w, h, (i, set) => {
      if (!cube2016.valid[i] || !cube2026.valid[i]) {
        set(20, 21, 19, 120);
        return;
      }
      if (class2016[i] !== 4 && class2026[i] === 4) set(59, 130, 246, 240);
      else if (class2016[i] === 4 && class2026[i] !== 4) set(234, 179, 8, 240);
      else if (class2016[i] === 4 && class2026[i] === 4) set(37, 99, 235, 210);
      else set(30, 32, 28, 115);
    });

  const layers = new Map<string, Buffer>([
    ['rgb-2016', rgb2016Png],
    ['rgb-2026', rgb2026Png],
    ['fcc-2016', buildFalseColorPng(cube2016)],
    ['fcc-2026', buildFalseColorPng(cube2026)],
    ['ndvi-2016', renderIndexPng(ndvi2016, cube2016.valid, ndviRamp)],
    ['ndvi-2026', renderIndexPng(ndvi2026, cube2026.valid, ndviRamp)],
    ['ndwi-2016', renderIndexPng(ndwi2016, cube2016.valid, ndwiRamp)],
    ['ndwi-2026', renderIndexPng(ndwi2026, cube2026.valid, ndwiRamp)],
    ['ndbi-2016', renderIndexPng(ndbi2016, cube2016.valid, ndbiRamp)],
    ['ndbi-2026', renderIndexPng(ndbi2026, cube2026.valid, ndbiRamp)],
    ['lulc-2016', renderLulcPng(class2016, cube2016.valid)],
    ['lulc-2026', renderLulcPng(class2026, cube2026.valid)],
    ['change-highlight', renderHighlight5ClassPng()],
    ['change-veg', renderChangeVegPng()],
    ['change-builtup', renderChangeBuiltupPng()],
    ['change-water', renderChangeWaterPng()],
  ]);

  rasterCache.set(key, {
    width: w,
    height: h,
    bbox: STUDY_LOCATION.bbox,
    valid2016: cube2016.valid,
    valid2026: cube2026.valid,
    ndvi2016,
    ndvi2026,
    ndwi2016,
    ndwi2026,
    ndbi2016,
    ndbi2026,
    class2016,
    class2026,
    conf2016,
    conf2026,
    layers,
  });

  const layerUrls: Record<string, string> = {};
  for (const name of layers.keys()) {
    layerUrls[name] = `/api/layer/${encodeURIComponent(key)}/${name}.png`;
  }

  const result: AnalysisResult = {
    key,
    status: 'ready',
    computedAt: new Date().toISOString(),
    confidenceThreshold,
    location: STUDY_LOCATION,
    scene2016,
    scene2026,
    geeStatus: catalog.geeStatus,
    waybackPair: {
      available: catalog.waybackPair.available,
      earlier: catalog.waybackPair.earlier,
      latest: catalog.waybackPair.latest,
      limitationNote:
        'Automated pixel-based change detection uses 10 m Copernicus Sentinel-2 (and 30 m Landsat verification), which detects built-up land expansion clusters (≥100 m²) rather than individual house footprints or narrow village roads. Switch to the High-Res Historical (Wayback) layer to visually inspect sub-meter construction differences between Oct 2016 and Oct 2026.',
    },
    historicalLulcVerification: historicalLulc,
    spatialAlignment: {
      gridWidth: w,
      gridHeight: h,
      cellSizeMeters: Number(cellSizeMeters.toFixed(2)),
      cellAreaKm2,
      totalBboxArea: toAreaMetrics(totalBboxAreaKm2),
      validJointPixels,
      analyzedArea: toAreaMetrics(analyzedAreaKm2),
      confirmedPixels,
      confirmedArea: toAreaMetrics(confirmedPixels * cellAreaKm2),
      uncertainExcludedPixels,
      uncertainExcludedArea: toAreaMetrics(uncertainExcludedPixels * cellAreaKm2),
      meanDetectionConfidencePct: Number(((confSum / denom) * 100).toFixed(1)),
      cloudMaskedPixels2016: cube2016.maskedCount,
      cloudMaskedPixels2026: cube2026.maskedCount,
      cloudMaskedJointPixels,
      cloudMaskedArea: toAreaMetrics(cloudMaskedJointPixels * cellAreaKm2),
      cloudMaskedPct: Number(((cloudMaskedJointPixels / n) * 100).toFixed(2)),
    },
    spectralIndices: {
      ndvi: {
        mean2016: Number((sumNdvi16 / denom).toFixed(3)),
        mean2026: Number((sumNdvi26 / denom).toFixed(3)),
        deltaMean: Number(((sumNdvi26 - sumNdvi16) / denom).toFixed(3)),
        min2016: Number(minNdvi16.toFixed(3)),
        max2016: Number(maxNdvi16.toFixed(3)),
        min2026: Number(minNdvi26.toFixed(3)),
        max2026: Number(maxNdvi26.toFixed(3)),
      },
      ndwi: {
        mean2016: Number((sumNdwi16 / denom).toFixed(3)),
        mean2026: Number((sumNdwi26 / denom).toFixed(3)),
        deltaMean: Number(((sumNdwi26 - sumNdwi16) / denom).toFixed(3)),
        min2016: Number(minNdwi16.toFixed(3)),
        max2016: Number(maxNdwi16.toFixed(3)),
        min2026: Number(minNdwi26.toFixed(3)),
        max2026: Number(maxNdwi26.toFixed(3)),
      },
      ndbi: {
        mean2016: Number((sumNdbi16 / denom).toFixed(3)),
        mean2026: Number((sumNdbi26 / denom).toFixed(3)),
        deltaMean: Number(((sumNdbi26 - sumNdbi16) / denom).toFixed(3)),
        min2016: Number(minNdbi16.toFixed(3)),
        max2016: Number(maxNdbi16.toFixed(3)),
        min2026: Number(minNdbi26.toFixed(3)),
        max2026: Number(maxNdbi26.toFixed(3)),
      },
      bsi: {
        mean2016: Number((sumBsi16 / denom).toFixed(3)),
        mean2026: Number((sumBsi26 / denom).toFixed(3)),
        deltaMean: Number(((sumBsi26 - sumBsi16) / denom).toFixed(3)),
        min2016: Number(minBsi16.toFixed(3)),
        max2016: Number(maxBsi16.toFixed(3)),
        min2026: Number(minBsi26.toFixed(3)),
        max2026: Number(maxBsi26.toFixed(3)),
      },
    },
    detectedChanges: {
      totalAnalyzedArea: toAreaMetrics(analyzedAreaKm2),
      confirmedChangedArea: toAreaMetrics(confirmedChangedPx * cellAreaKm2),
      newlyBuiltUp: toAreaMetrics(newlyBuiltUpPx * cellAreaKm2),
      vegetationLoss: toAreaMetrics(vegLossPx * cellAreaKm2),
      vegetationGain: toAreaMetrics(vegGainPx * cellAreaKm2),
      netVegetationChange: toAreaMetrics((vegGainPx - vegLossPx) * cellAreaKm2),
      agriculturalToBuiltUp: toAreaMetrics(agriToBuiltPx * cellAreaKm2),
      agriculturalConvertedTotal: toAreaMetrics(agriConvertedTotalPx * cellAreaKm2),
      waterGained: toAreaMetrics(waterGainedPx * cellAreaKm2),
      waterLost: toAreaMetrics(waterLostPx * cellAreaKm2),
      netWaterChange: toAreaMetrics((waterGainedPx - waterLostPx) * cellAreaKm2),
      otherChanges: toAreaMetrics(otherChangesPx * cellAreaKm2),
    },
    landCover,
    transitionMatrix,
    changePolygons,
    quadrants: quadStats.map((q) => {
      const qDen = Math.max(1, q.valid);
      return {
        name: q.name,
        boundsLabel: q.boundsLabel,
        analyzedKm2: Number((q.valid * cellAreaKm2).toFixed(3)),
        vegDeltaKm2: Number((q.vegD * cellAreaKm2).toFixed(3)),
        agriDeltaKm2: Number((q.agriD * cellAreaKm2).toFixed(3)),
        builtUpDeltaKm2: Number((q.builtD * cellAreaKm2).toFixed(3)),
        waterDeltaKm2: Number((q.waterD * cellAreaKm2).toFixed(3)),
        meanDeltaNdvi: Number((q.dNdviSum / qDen).toFixed(3)),
        meanDeltaNdbi: Number((q.dNdbiSum / qDen).toFixed(3)),
      };
    }),
    spectralHistograms,
    layers: layerUrls,
  };

  analysisCache.set(key, result);
  return result;
}

export function getLayerBuffer(key: string, layerName: string): Buffer | null {
  const state = rasterCache.get(key);
  if (!state) return null;
  return state.layers.get(layerName) || null;
}

export function probeCoordinate(key: string, lat: number, lon: number) {
  const state = rasterCache.get(key);
  if (!state) return null;
  const [minLon, minLat, maxLon, maxLat] = state.bbox;
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
    return { outOfBounds: true };
  }
  const col = Math.min(state.width - 1, Math.max(0, Math.floor(((lon - minLon) / (maxLon - minLon)) * state.width)));
  const row = Math.min(state.height - 1, Math.max(0, Math.floor(((maxLat - lat) / (maxLat - minLat)) * state.height)));
  const idx = row * state.width + col;

  const v16 = state.valid2016[idx] === 1;
  const v26 = state.valid2026[idx] === 1;

  return {
    outOfBounds: false,
    lat: Number(lat.toFixed(5)),
    lon: Number(lon.toFixed(5)),
    pixel: { row, col },
    masked2016: !v16,
    masked2026: !v26,
    jointConfidencePct:
      v16 && v26 ? Number((Math.min(state.conf2016[idx], state.conf2026[idx]) * 100).toFixed(1)) : null,
    year2016: v16
      ? {
          ndvi: Number(state.ndvi2016[idx].toFixed(3)),
          ndwi: Number(state.ndwi2016[idx].toFixed(3)),
          ndbi: Number(state.ndbi2016[idx].toFixed(3)),
          confidencePct: Number((state.conf2016[idx] * 100).toFixed(1)),
          landCover: LAND_COVER_META[ID_TO_KEY[state.class2016[idx]] || 'other'].label,
        }
      : null,
    year2026: v26
      ? {
          ndvi: Number(state.ndvi2026[idx].toFixed(3)),
          ndwi: Number(state.ndwi2026[idx].toFixed(3)),
          ndbi: Number(state.ndbi2026[idx].toFixed(3)),
          confidencePct: Number((state.conf2026[idx] * 100).toFixed(1)),
          landCover: LAND_COVER_META[ID_TO_KEY[state.class2026[idx]] || 'other'].label,
        }
      : null,
  };
}
