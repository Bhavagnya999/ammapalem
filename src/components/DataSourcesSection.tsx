import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AnalysisResult, CatalogResponse, StacSceneSummary } from '../types/earth';

interface DataSourcesSectionProps {
  catalog: CatalogResponse | null;
  analysis: AnalysisResult | null;
  onSelectCustomScenes: (s16: StacSceneSummary, s26: StacSceneSummary) => void;
  loadingAnalysis: boolean;
}

function SceneMetadataCard({
  yearLabel,
  scene,
  maskedPixels,
  maskedPct,
}: {
  yearLabel: string;
  scene: StacSceneSummary;
  maskedPixels: number;
  maskedPct: number;
}) {
  const rows = [
    { k: 'Satellite Mission', v: scene.mission },
    { k: 'Sensor / Instrument', v: `${scene.platform} · ${scene.instrument}` },
    { k: 'Acquisition Date (UTC)', v: scene.datetime.replace('T', ' ').replace('Z', ' UTC') },
    { k: 'Spatial Resolution', v: `${scene.resolutionMeters} m / pixel` },
    { k: 'Scene Cloud Cover', v: `${scene.cloudCover.toFixed(2)}%` },
    { k: 'AOI Cloud-Masked Pixels', v: `${maskedPixels.toLocaleString()} px (${maskedPct.toFixed(2)}%)` },
    { k: 'Processing Baseline', v: scene.processingBaseline ?? 'Collection 2 L2' },
    { k: 'Orbit / Tile Reference', v: `${scene.orbitOrPathRow} · ${scene.tileOrRow}` },
    { k: 'Projection (EPSG)', v: scene.epsg ? `EPSG:${scene.epsg}` : 'WGS 84 / UTM 44N' },
    { k: 'Data Source', v: scene.sourceLabel },
  ];

  return (
    <div className="rounded-lg border border-[#2B2E28] bg-[#171916] p-5">
      <div className="flex items-start justify-between gap-4 border-b border-[#252822] pb-3">
        <div>
          <p className="font-mono text-xs font-semibold text-[#D2C7B0]">{yearLabel}</p>
          <h3 className="mt-1 font-mono text-xs break-all text-[#EBE7DE]">{scene.id}</h3>
        </div>
        <a
          href={scene.stacItemUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border border-[#2B2E28] px-2.5 py-1 text-[11px] font-medium text-[#C7C0B0] whitespace-nowrap shrink-0 hover:border-[#8C9A6E] hover:text-[#EBE7DE]"
        >
          <span>STAC JSON</span>
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      <dl className="mt-3 divide-y divide-[#22251F] text-xs">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-[#9A9484]">{r.k}</dt>
            <dd className="text-right font-mono text-[#EBE7DE] tabular-nums">{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DataSourcesSection({
  catalog,
  analysis,
  onSelectCustomScenes,
  loadingAnalysis,
}: DataSourcesSectionProps) {
  const [archiveTab, setArchiveTab] = useState<'2016' | '2026'>('2016');
  const [staged2016, setStaged2016] = useState<StacSceneSummary | null>(null);
  const [staged2026, setStaged2026] = useState<StacSceneSummary | null>(null);

  const effective2016 = staged2016 ?? analysis?.scene2016 ?? null;
  const effective2026 = staged2026 ?? analysis?.scene2026 ?? null;
  const hasStagedDiff =
    effective2016 &&
    effective2026 &&
    analysis &&
    (effective2016.id !== analysis.scene2016.id || effective2026.id !== analysis.scene2026.id);

  const archiveList =
    archiveTab === '2016' ? catalog?.scenes2016 ?? [] : catalog?.scenes2026 ?? [];

  return (
    <section id="data-sources" className="scroll-mt-20 space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#A3B47E]">
          Data Transparency &amp; Scientific Methodology
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#EBE7DE]">
          Data Sources, Calibration &amp; Dataset Availability
        </h2>
        <p className="mt-1 text-sm text-[#9A9484]">
          Full transparency of satellite missions, acquisition timestamps, spatial resolution, cloud masking, Google Earth Engine status, and high-resolution historical imagery scope.
        </p>
      </div>

      {/* Active Observation Metadata Cards */}
      {analysis && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SceneMetadataCard
            yearLabel="2016 BASELINE OBSERVATION"
            scene={analysis.scene2016}
            maskedPixels={analysis.spatialAlignment.cloudMaskedPixels2016}
            maskedPct={
              (analysis.spatialAlignment.cloudMaskedPixels2016 /
                (analysis.spatialAlignment.gridWidth * analysis.spatialAlignment.gridHeight)) *
              100
            }
          />
          <SceneMetadataCard
            yearLabel="2026 TARGET OBSERVATION"
            scene={analysis.scene2026}
            maskedPixels={analysis.spatialAlignment.cloudMaskedPixels2026}
            maskedPct={
              (analysis.spatialAlignment.cloudMaskedPixels2026 /
                (analysis.spatialAlignment.gridWidth * analysis.spatialAlignment.gridHeight)) *
              100
            }
          />
        </div>
      )}

      {/* GEE, High-Res Wayback, and Methodology Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-[#2B2E28] bg-[#171916] p-5">
          <h3 className="font-display text-sm font-semibold text-[#EBE7DE]">
            Google Earth Engine &amp; Dynamic World Status
          </h3>
          <p className="mt-2.5 text-xs leading-relaxed text-[#C7C0B0]">
            {catalog?.geeStatus.reason ??
              'Checking Google Earth Engine REST API v1 configuration…'}
          </p>
          <dl className="mt-3 space-y-1.5 border-t border-[#252822] pt-3 font-mono text-[11px] text-[#9A9484]">
            <div className="flex justify-between gap-2">
              <dt>GEE Live Dynamic World:</dt>
              <dd className={catalog?.geeStatus.liveDynamicWorldActive ? 'text-[#22C55E]' : 'text-[#D2C7B0]'}>
                {catalog?.geeStatus.liveDynamicWorldActive ? 'Active' : 'Credentials Pending'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Active STAC Pipeline:</dt>
              <dd className="text-[#EBE7DE]">Sentinel-2 L2A + Landsat C2 L2</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Historical LULC Benchmark:</dt>
              <dd className="text-[#EBE7DE]">IO 10 m LULC (2017–2023)</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-[#2B2E28] bg-[#171916] p-5">
          <h3 className="font-display text-sm font-semibold text-[#EBE7DE]">
            High-Res Building &amp; Road Scope
          </h3>
          <p className="mt-2.5 text-xs leading-relaxed text-[#C7C0B0]">
            Automated pixel classification at <strong className="text-[#EBE7DE]">10 m</strong> Sentinel-2 resolution detects built-up land expansion clusters (≥100 m²), not individual houses or narrow village lanes.
          </p>
          <p className="mt-2.5 text-xs leading-relaxed text-[#9A9484]">
            {catalog?.waybackPair.available
              ? `Sub-meter Esri World Imagery Wayback (${catalog.waybackPair.earlier?.captureDate} vs ${catalog.waybackPair.latest?.captureDate}) is integrated in the Comparison Viewer for visual inspection of individual rooftops and roads.`
              : 'Historical sub-meter Wayback imagery was unavailable; built-up expansion clusters are shown at 10 m resolution.'}
          </p>
        </div>

        <div className="rounded-lg border border-[#2B2E28] bg-[#171916] p-5">
          <h3 className="font-display text-sm font-semibold text-[#EBE7DE]">
            Processing &amp; Confidence Gating
          </h3>
          <ul className="mt-2.5 space-y-2 text-xs text-[#C7C0B0]">
            <li>
              <strong className="font-medium text-[#EBE7DE]">Cloud Masking:</strong>{' '}
              ESA SCL classes (0, 1, 3, 8, 9, 10) and USGS QA_PIXEL cloud/shadow bits masked prior to comparison.
            </li>
            <li>
              <strong className="font-medium text-[#EBE7DE]">Radiometric Calibration:</strong>{' '}
              Applies ESA Baseline ≥ 04.00 BOA_ADD_OFFSET (−1000 DN) and USGS C2 L2 scale factors.
            </li>
            <li>
              <strong className="font-medium text-[#EBE7DE]">Confidence Threshold:</strong>{' '}
              {analysis
                ? `Mean confidence ${analysis.spatialAlignment.meanDetectionConfidencePct.toFixed(1)}%; pixels below ${Math.round(analysis.confidenceThreshold * 100)}% are excluded from confirmed changes.`
                : 'Filters uncertain classifications from confirmed statistics.'}
            </li>
          </ul>
        </div>
      </div>

      {/* Live STAC Archive Explorer */}
      {catalog && (
        <div className="overflow-hidden rounded-lg border border-[#2B2E28] bg-[#171916]">
          <div className="flex flex-col gap-3 border-b border-[#2B2E28] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-[#EBE7DE]">
                Discovered STAC Archive Over Ammapalem (&lt;12% Scene Cloud)
              </h3>
              <p className="mt-0.5 text-xs text-[#9A9484]">
                Stage any 2016 and 2026 observation covering 100% of the Ammapalem AOI to run custom change detection.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border border-[#2B2E28] bg-[#141613] p-0.5">
                <button
                  type="button"
                  onClick={() => setArchiveTab('2016')}
                  className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    archiveTab === '2016'
                      ? 'bg-[#8C9A6E]/25 text-[#EBE7DE]'
                      : 'text-[#9A9484] hover:text-[#EBE7DE]'
                  }`}
                >
                  2016 Scenes ({catalog.scenes2016.length})
                </button>
                <button
                  type="button"
                  onClick={() => setArchiveTab('2026')}
                  className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    archiveTab === '2026'
                      ? 'bg-[#8C9A6E]/25 text-[#EBE7DE]'
                      : 'text-[#9A9484] hover:text-[#EBE7DE]'
                  }`}
                >
                  2026 Scenes ({catalog.scenes2026.length})
                </button>
              </div>

              {hasStagedDiff && effective2016 && effective2026 && (
                <button
                  type="button"
                  disabled={loadingAnalysis}
                  onClick={() => onSelectCustomScenes(effective2016, effective2026)}
                  className="rounded-md bg-[#8C9A6E] px-3 py-1.5 text-xs font-semibold text-[#111210] whitespace-nowrap shrink-0 transition-colors hover:bg-[#9DAD7D] disabled:opacity-50"
                >
                  Run Custom Pair ({effective2016.dateLabel} vs {effective2026.dateLabel})
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[300px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b border-[#2B2E28] bg-[#141613] text-[#9A9484]">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Acquisition Date</th>
                  <th className="px-4 py-2.5 font-medium">Mission</th>
                  <th className="px-4 py-2.5 font-medium">Scene Identifier</th>
                  <th className="px-4 py-2.5 text-right font-medium">Resolution</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cloud %</th>
                  <th className="px-5 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#22251F] font-mono tabular-nums">
                {archiveList.map((scene) => {
                  const isActive =
                    archiveTab === '2016'
                      ? effective2016?.id === scene.id
                      : effective2026?.id === scene.id;
                  return (
                    <tr
                      key={scene.id}
                      className={isActive ? 'bg-[#8C9A6E]/10' : 'hover:bg-[#1C1E1A]'}
                    >
                      <td className="px-5 py-2.5 text-[#EBE7DE]">{scene.dateLabel}</td>
                      <td className="px-4 py-2.5 font-sans text-[#C7C0B0]">{scene.mission}</td>
                      <td className="px-4 py-2.5 text-[11px] text-[#9A9484]">{scene.id}</td>
                      <td className="px-4 py-2.5 text-right text-[#C7C0B0]">
                        {scene.resolutionMeters} m
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#D2C7B0]">
                        {scene.cloudCover.toFixed(2)}%
                      </td>
                      <td className="px-5 py-2.5 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => {
                            if (archiveTab === '2016') setStaged2016(scene);
                            else setStaged2026(scene);
                          }}
                          className={`rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                            isActive
                              ? 'bg-[#8C9A6E] text-[#111210]'
                              : 'border border-[#2B2E28] bg-[#1E201C] text-[#EBE7DE] hover:border-[#8C9A6E]'
                          }`}
                        >
                          {isActive ? 'Selected' : `Stage ${archiveTab}`}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
