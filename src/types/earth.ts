export type LandCoverKey = 'vegetation' | 'agricultural' | 'builtUp' | 'water' | 'other';
export type ChangeOverlayCategory =
  | 'built_up'
  | 'veg_loss'
  | 'veg_gain'
  | 'water_change'
  | 'agri_conversion';

export interface AreaMetrics {
  m2: number;
  ha: number;
  km2: number;
}

export interface StudyLocation {
  village: string;
  mandal: string;
  district: string;
  state: string;
  country: string;
  pin: string;
  center: { lat: number; lon: number };
  bbox: [number, number, number, number];
  gridSize: number;
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

export interface GeeIntegrationStatus {
  configured: boolean;
  provider: string;
  dynamicWorldDataset: string;
  sentinelDataset: string;
  landsatDataset: string;
  projectId: string | null;
  liveDynamicWorldActive: boolean;
  reason: string;
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

export interface CatalogResponse {
  location: StudyLocation;
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
  location: StudyLocation;
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
    newlyBuiltUp: AreaMetrics;
    vegetationLoss: AreaMetrics;
    vegetationGain: AreaMetrics;
    netVegetationChange: AreaMetrics;
    agriculturalToBuiltUp: AreaMetrics;
    agriculturalConvertedTotal: AreaMetrics;
    waterGained: AreaMetrics;
    waterLost: AreaMetrics;
    netWaterChange: AreaMetrics;
    otherChanges: AreaMetrics;
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

export interface PixelProbeResult {
  outOfBounds: boolean;
  lat?: number;
  lon?: number;
  pixel?: { row: number; col: number };
  masked2016?: boolean;
  masked2026?: boolean;
  jointConfidencePct?: number | null;
  year2016?: {
    ndvi: number;
    ndwi: number;
    ndbi: number;
    confidencePct: number;
    landCover: string;
  } | null;
  year2026?: {
    ndvi: number;
    ndwi: number;
    ndbi: number;
    confidencePct: number;
    landCover: string;
  } | null;
}

export interface VillageLabelItem {
  name: string;
  localName: string | null;
  lgdCode: string | null;
  lat: number;
  lon: number;
  areaKm2: number | null;
  isTarget: boolean;
}

export interface AdminBoundaryMeta {
  name: string;
  localName?: string | null;
  lgdCode: string | null;
  parentLabel: string;
  areaKm2: number | null;
  pop2011?: number | null;
  pop2026?: number | null;
  bounds?: [number, number, number, number];
}

export interface AdminBoundariesResponse {
  officialBoundariesAvailable: boolean;
  source: string;
  studyAreaLabel: string;
  village: {
    meta: AdminBoundaryMeta;
    feature: GeoJSON.Feature;
  } | null;
  mandal: {
    meta: AdminBoundaryMeta;
    feature: GeoJSON.Feature;
  } | null;
  district: {
    meta: AdminBoundaryMeta;
    feature: GeoJSON.Feature;
  } | null;
  villageLabels: VillageLabelItem[];
}

