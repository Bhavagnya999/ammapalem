import { AlertTriangle } from 'lucide-react';
import type { AnalysisResult } from '../types/earth';

interface SummaryCardsProps {
  analysis: AnalysisResult | null;
  loading: boolean;
  error: string | null;
}

export function SummaryCards({ analysis, loading, error }: SummaryCardsProps) {
  if (loading && !analysis) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="rounded-lg border border-[#2B2E28] bg-[#171916] p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-[#262923]" />
            <div className="mt-4 h-7 w-20 animate-pulse rounded bg-[#262923]" />
            <div className="mt-3 h-3 w-32 animate-pulse rounded bg-[#22251F]" />
          </div>
        ))}
      </div>
    );
  }

  if (!analysis || error) {
    const labels = [
      'Total Analyzed Area',
      'Newly Developed Land',
      'Vegetation Lost',
      'Vegetation Gained',
      'Agricultural Converted',
      'Water-body Changes',
    ];
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {labels.map((label) => (
          <div key={label} className="rounded-lg border border-[#2B2E28] bg-[#171916] p-4">
            <p className="text-xs font-medium text-[#9A9484]">{label}</p>
            <p className="mt-3 font-mono text-base font-medium text-[#D2C7B0]">
              Analysis pending
            </p>
            <p className="mt-1.5 text-xs text-[#7D7768]">
              {error ? 'Satellite dataset unavailable' : 'Awaiting STAC computation'}
            </p>
          </div>
        ))}
      </div>
    );
  }

  const { detectedChanges, spatialAlignment, geeStatus } = analysis;
  const netWaterKm2 = detectedChanges.netWaterChange.km2;

  const cards = [
    {
      title: 'Total Analyzed Area',
      primary: `${detectedChanges.totalAnalyzedArea.km2.toFixed(2)} km²`,
      subUnits: `${detectedChanges.totalAnalyzedArea.ha.toFixed(1)} ha · ${detectedChanges.totalAnalyzedArea.m2.toLocaleString()} m²`,
      detail: `${spatialAlignment.confirmedArea.km2.toFixed(2)} km² high-confidence (${spatialAlignment.meanDetectionConfidencePct.toFixed(1)}%)`,
      toneClass: 'text-[#EBE7DE]',
    },
    {
      title: 'Newly Developed Land',
      primary: `+${detectedChanges.newlyBuiltUp.km2.toFixed(2)} km²`,
      subUnits: `${detectedChanges.newlyBuiltUp.ha.toFixed(1)} ha · ${detectedChanges.newlyBuiltUp.m2.toLocaleString()} m²`,
      detail: `Includes ${detectedChanges.agriculturalToBuiltUp.ha.toFixed(1)} ha from agriculture`,
      toneClass: 'text-[#F97316]',
    },
    {
      title: 'Vegetation Lost',
      primary: `−${detectedChanges.vegetationLoss.km2.toFixed(2)} km²`,
      subUnits: `${detectedChanges.vegetationLoss.ha.toFixed(1)} ha · ${detectedChanges.vegetationLoss.m2.toLocaleString()} m²`,
      detail: `Confirmed canopy/veg decrease (≥${Math.round(analysis.confidenceThreshold * 100)}% conf.)`,
      toneClass: 'text-[#EF4444]',
    },
    {
      title: 'Vegetation Gained',
      primary: `+${detectedChanges.vegetationGain.km2.toFixed(2)} km²`,
      subUnits: `${detectedChanges.vegetationGain.ha.toFixed(1)} ha · ${detectedChanges.vegetationGain.m2.toLocaleString()} m²`,
      detail: `Net ΔVeg ${detectedChanges.netVegetationChange.km2 >= 0 ? '+' : '−'}${Math.abs(detectedChanges.netVegetationChange.km2).toFixed(2)} km²`,
      toneClass: 'text-[#22C55E]',
    },
    {
      title: 'Agricultural Converted',
      primary: `${detectedChanges.agriculturalConvertedTotal.km2.toFixed(2)} km²`,
      subUnits: `${detectedChanges.agriculturalConvertedTotal.ha.toFixed(1)} ha · ${detectedChanges.agriculturalConvertedTotal.m2.toLocaleString()} m²`,
      detail: `${detectedChanges.agriculturalToBuiltUp.ha.toFixed(1)} ha converted to built-up`,
      toneClass: 'text-[#EAB308]',
    },
    {
      title: 'Water-body Changes',
      primary: `${netWaterKm2 >= 0 ? '+' : '−'}${Math.abs(netWaterKm2).toFixed(2)} km²`,
      subUnits: `+${detectedChanges.waterGained.ha.toFixed(1)} ha gain · −${detectedChanges.waterLost.ha.toFixed(1)} ha loss`,
      detail: `Net ${Math.abs(detectedChanges.netWaterChange.m2).toLocaleString()} m² shift`,
      toneClass: 'text-[#3B82F6]',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {cards.map((card) => (
          <article
            key={card.title}
            className="flex flex-col justify-between rounded-lg border border-[#2B2E28] bg-[#171916] p-4"
          >
            <div>
              <h3 className="text-xs font-medium text-[#9A9484]">{card.title}</h3>
              <p
                className={`mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums ${card.toneClass}`}
              >
                {card.primary}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[#D2C7B0] tabular-nums">
                {card.subUnits}
              </p>
            </div>
            <p className="mt-3 border-t border-[#242721] pt-2 font-mono text-[11px] text-[#857F70] tabular-nums">
              {card.detail}
            </p>
          </article>
        ))}
      </div>

      {/* Honest Data Transparency & Confidence Gating Ribbon */}
      <div className="flex flex-col gap-2 rounded-lg border border-[#2B2E28] bg-[#141613] px-4 py-3 text-xs text-[#C7C0B0] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D2C7B0]" aria-hidden="true" />
          <p className="leading-relaxed">
            {!geeStatus.liveDynamicWorldActive ? (
              <>
                <strong className="font-medium text-[#EBE7DE]">Dataset Transparency:</strong> Direct Google Earth Engine <span className="font-mono">GOOGLE/DYNAMICWORLD/V1</span> API requires GEE service-account credentials not present in this runtime. Computed metrics above use real calibrated <span className="font-mono">10 m</span> Sentinel-2 L2A bands + <span className="font-mono">30 m</span> Landsat 8/9 C2 L2 + <span className="font-mono">io-lulc-annual-v02</span> (Dynamic World taxonomy) via STAC.
              </>
            ) : (
              <>
                <strong className="font-medium text-[#EBE7DE]">Google Earth Engine Connected:</strong> Live <span className="font-mono">GOOGLE/DYNAMICWORLD/V1</span> active.
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 font-mono text-[11px] text-[#9A9484] tabular-nums lg:text-right">
          Confidence ≥ {Math.round(analysis.confidenceThreshold * 100)}% · Excluded uncertain:{' '}
          <span className="text-[#D2C7B0]">
            {spatialAlignment.uncertainExcludedArea.ha.toFixed(1)} ha ({spatialAlignment.uncertainExcludedArea.km2.toFixed(2)} km²)
          </span>
        </div>
      </div>
    </div>
  );
}
