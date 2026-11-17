import { useCallback, useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { SummaryCards } from './components/SummaryCards';
import { SatelliteComparison } from './components/SatelliteComparison';
import { ChangeDetectionSection } from './components/ChangeDetectionSection';
import { LandCoverSection } from './components/LandCoverSection';
import { DataSourcesSection } from './components/DataSourcesSection';
import type { AnalysisResult, CatalogResponse, StacSceneSummary } from './types/earth';

const CONFIDENCE_OPTIONS = [0.5, 0.55, 0.65, 0.75];

export default function App() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [customPair, setCustomPair] = useState<{ s16: StacSceneSummary; s26: StacSceneSummary } | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.55);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('overview');

  const fetchAnalysis = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis?${query}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Satellite observation analysis failed');
      }
      setAnalysis(json as AnalysisResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach satellite STAC services';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const catRes = await fetch('/api/catalog');
        const catJson = await catRes.json();
        if (!catRes.ok) {
          throw new Error(catJson.error || 'STAC catalog query failed');
        }
        if (cancelled) return;
        const cat = catJson as CatalogResponse;
        setCatalog(cat);

        const defaultPreset = cat.presets[0];
        if (!defaultPreset) {
          throw new Error('No cloud-free comparable 2016 and 2026 scenes found over Ammapalem.');
        }
        setSelectedPresetId(defaultPreset.id);

        const anaRes = await fetch(
          `/api/analysis?pair=${encodeURIComponent(defaultPreset.id)}&confidence=0.55`
        );
        const anaJson = await anaRes.json();
        if (!anaRes.ok) {
          throw new Error(anaJson.error || 'Spectral computation failed');
        }
        if (!cancelled) {
          setAnalysis(anaJson as AnalysisResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Satellite data temporarily unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sectionIds = ['overview', 'comparison', 'change-detection', 'land-cover', 'data-sources'];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-25% 0px -65% 0px' }
    );
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const handleNavigate = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    setCustomPair(null);
    fetchAnalysis(`pair=${encodeURIComponent(presetId)}&confidence=${confidenceThreshold}`);
  };

  const handleSelectCustomScenes = (s16: StacSceneSummary, s26: StacSceneSummary) => {
    setSelectedPresetId('custom');
    setCustomPair({ s16, s26 });
    const q = new URLSearchParams({
      item2016: s16.id,
      col2016: s16.collection,
      item2026: s26.id,
      col2026: s26.collection,
      confidence: String(confidenceThreshold),
    }).toString();
    fetchAnalysis(q);
  };

  const handleConfidenceChange = (nextThreshold: number) => {
    setConfidenceThreshold(nextThreshold);
    if (customPair) {
      const q = new URLSearchParams({
        item2016: customPair.s16.id,
        col2016: customPair.s16.collection,
        item2026: customPair.s26.id,
        col2026: customPair.s26.collection,
        confidence: String(nextThreshold),
      }).toString();
      fetchAnalysis(q);
    } else if (selectedPresetId) {
      fetchAnalysis(`pair=${encodeURIComponent(selectedPresetId)}&confidence=${nextThreshold}`);
    }
  };

  const handleExportReport = () => {
    if (!analysis) return;
    const payload = {
      reportTitle: 'Ammapalem Earth Observation & Land Change Analysis (2016–2026)',
      generatedAt: new Date().toISOString(),
      confidenceThreshold: analysis.confidenceThreshold,
      studyLocation: analysis.location,
      observations: {
        baseline2016: analysis.scene2016,
        target2026: analysis.scene2026,
      },
      geeStatus: analysis.geeStatus,
      spatialAlignment: analysis.spatialAlignment,
      spectralIndices: analysis.spectralIndices,
      detectedChanges: analysis.detectedChanges,
      landCoverDistribution: analysis.landCover,
      changePolygonsCount: analysis.changePolygons.length,
      changePolygons: analysis.changePolygons.map(({ geometry: _g, ...rest }) => rest),
      quadrantBreakdown: analysis.quadrants,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ammapalem-change-detection-${analysis.scene2016.dateLabel}-to-${analysis.scene2026.dateLabel}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#111210] text-[#EBE7DE]">
      <Navbar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onExportReport={handleExportReport}
        canExport={Boolean(analysis)}
      />

      <main className="mx-auto max-w-[1440px] space-y-14 px-6 py-8 lg:py-10">
        {/* SECTION 1: OVERVIEW & CONTEXT RIBBON */}
        <section id="overview" className="scroll-mt-20 space-y-6">
          <div className="flex flex-col gap-6 border-b border-[#252822] pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs text-[#A3B47E]">
                <span>A Decade of Transformation | 2016–2026</span>
                <span className="text-[#4A4E44]" aria-hidden="true">·</span>
                <span className="text-[#D2C7B0]">17.2237° N, 80.2483° E</span>
              </div>

              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#EBE7DE] [text-wrap:balance] sm:text-4xl">
                AMMAPALEM – EARTH OBSERVATION &amp; LAND CHANGE ANALYSIS
              </h1>

              <p className="mt-2.5 text-sm leading-relaxed text-[#9A9484]">
                Ammapalem · Konijerla Mandal · Khammam District · Telangana · India · PIN 507305
                <span className="mx-2 text-[#4A4E44]" aria-hidden="true">·</span>
                <span className="font-mono text-xs text-[#C7C0B0]">
                  6.00 × 6.00 km Co-Registered AOI (36.12 km² / 3,612 ha)
                </span>
              </p>
            </div>

            {/* Seasonal Pair + Confidence Threshold Controls */}
            <div className="flex flex-col items-start gap-3 lg:items-end">
              {catalog && catalog.presets.length > 0 && (
                <div className="flex flex-col items-start gap-1.5 lg:items-end">
                  <span className="text-xs font-medium text-[#9A9484]">
                    Comparable Seasonal Pair
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {catalog.presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={loading}
                        onClick={() => handleSelectPreset(preset.id)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 ${
                          selectedPresetId === preset.id
                            ? 'border-[#8C9A6E] bg-[#8C9A6E]/20 text-[#EBE7DE]'
                            : 'border-[#2B2E28] bg-[#171916] text-[#9A9484] hover:border-[#4A4E44] hover:text-[#EBE7DE]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#9A9484]">Confidence Threshold:</span>
                <div className="inline-flex rounded-md border border-[#2B2E28] bg-[#171916] p-0.5">
                  {CONFIDENCE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={loading}
                      onClick={() => handleConfidenceChange(opt)}
                      className={`rounded px-2.5 py-1 font-mono text-xs whitespace-nowrap transition-colors disabled:opacity-50 ${
                        confidenceThreshold === opt
                          ? 'bg-[#8C9A6E] font-semibold text-[#111210]'
                          : 'text-[#9A9484] hover:text-[#EBE7DE]'
                      }`}
                    >
                      {Math.round(opt * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <SummaryCards analysis={analysis} loading={loading} error={error} />
        </section>

        {/* SECTION 2: PRIMARY INTERACTIVE BEFORE/AFTER COMPARISON */}
        <SatelliteComparison analysis={analysis} loading={loading} error={error} />

        {/* SECTION 3: AUTOMATIC PIXEL-BASED CHANGE DETECTION */}
        <ChangeDetectionSection analysis={analysis} loading={loading} />

        {/* SECTION 4: LAND COVER ANALYSIS */}
        <LandCoverSection analysis={analysis} />

        {/* SECTION 5: DATA TRANSPARENCY & SOURCES */}
        <DataSourcesSection
          catalog={catalog}
          analysis={analysis}
          onSelectCustomScenes={handleSelectCustomScenes}
          loadingAnalysis={loading}
        />
      </main>

      <footer className="mt-12 border-t border-[#252822] bg-[#0E0F0D] py-6">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-6 text-xs text-[#857F70] sm:flex-row sm:items-center sm:justify-between">
          <p>
            Ammapalem Earth Observatory · Konijerla Mandal, Khammam, Telangana 507305 (17.2237° N, 80.2483° E)
          </p>
          <p className="font-mono">
            Copernicus Sentinel-2 L2A · USGS Landsat C2 L2 · Esri World Imagery Wayback · STAC
          </p>
        </div>
      </footer>
    </div>
  );
}
