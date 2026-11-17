import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalysisResult, LandCoverKey } from '../types/earth';

interface LandCoverSectionProps {
  analysis: AnalysisResult | null;
}

const CLASS_LABELS: Record<LandCoverKey, string> = {
  vegetation: 'Vegetation',
  agricultural: 'Agricultural Land',
  builtUp: 'Built-up Land',
  water: 'Water Bodies',
  other: 'Other Land',
};

function YearPiePanel({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: Array<{ name: string; value: number; ha: number; pct: number; color: string }>;
}) {
  return (
    <div className="rounded-lg border border-[#2B2E28] bg-[#171916] p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-[#EBE7DE]">{title}</h3>
        <span className="font-mono text-xs text-[#9A9484]">{subtitle}</span>
      </div>

      <div className="mt-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={84}
                paddingAngle={2}
                stroke="#111210"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${Number(value ?? 0).toFixed(2)} km²`, String(name ?? '')]}
                contentStyle={{
                  backgroundColor: '#111210',
                  border: '1px solid #2B2E28',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#EBE7DE',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="divide-y divide-[#232620] border-y border-[#232620]">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="text-[#EBE7DE]">{item.name}</span>
              </div>
              <div className="font-mono tabular-nums text-right">
                <span className="text-[#EBE7DE]">{item.value.toFixed(2)} km²</span>
                <span className="ml-1.5 text-[#9A9484]">({item.pct.toFixed(1)}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandCoverSection({ analysis }: LandCoverSectionProps) {
  if (!analysis) {
    return (
      <section id="land-cover" className="scroll-mt-20 space-y-4">
        <h2 className="font-display text-2xl font-semibold text-[#EBE7DE]">
          Land Cover Analysis · 2016 &amp; 2026
        </h2>
        <div className="rounded-lg border border-[#2B2E28] bg-[#171916] p-8 text-center text-sm text-[#9A9484]">
          Land cover distribution pending active satellite computation.
        </div>
      </section>
    );
  }

  const data2016 = analysis.landCover.map((c) => ({
    name: c.label,
    value: c.area2016.km2,
    ha: c.area2016.ha,
    pct: c.pct2016,
    color: c.color,
  }));

  const data2026 = analysis.landCover.map((c) => ({
    name: c.label,
    value: c.area2026.km2,
    ha: c.area2026.ha,
    pct: c.pct2026,
    color: c.color,
  }));

  const comparisonBarData = analysis.landCover.map((c) => ({
    category: c.label.replace(' Land', ''),
    y2016: c.area2016.km2,
    y2026: c.area2026.km2,
  }));

  const topTransitions = analysis.transitionMatrix.filter((t) => t.from !== t.to).slice(0, 6);

  return (
    <section id="land-cover" className="scroll-mt-20 space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#A3B47E]">
          Five-Class Spectral Classification &amp; Historical Verification
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#EBE7DE]">
          Land Cover Analysis · 2016 vs 2026
        </h2>
        <p className="mt-1 text-sm text-[#9A9484]">
          Separate 2016 and 2026 distributions in km², hectares, and share of the {analysis.spatialAlignment.analyzedArea.km2.toFixed(2)} km² cloud-free study region.
        </p>
      </div>

      {/* Separate 2016 and 2026 Visualizations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <YearPiePanel
          title="2016 Land Cover Distribution"
          subtitle={`${analysis.scene2016.dateLabel} · ${analysis.scene2016.platform}`}
          data={data2016}
        />
        <YearPiePanel
          title="2026 Land Cover Distribution"
          subtitle={`${analysis.scene2026.dateLabel} · ${analysis.scene2026.platform}`}
          data={data2026}
        />
      </div>

      {/* Comparative Bar Chart + Area Change Table */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-[#2B2E28] bg-[#171916] p-5 lg:col-span-5">
          <h3 className="font-display text-base font-semibold text-[#EBE7DE]">
            Decade Area Comparison (km²)
          </h3>
          <p className="mt-0.5 text-xs text-[#9A9484]">
            Direct class-by-class footprint in 2016 vs 2026.
          </p>
          <div className="mt-4 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonBarData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#252822" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="category"
                  tick={{ fill: '#9A9484', fontSize: 11 }}
                  axisLine={{ stroke: '#2B2E28' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#9A9484', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  unit=" km²"
                />
                <Tooltip
                  formatter={(value) => [`${Number(value ?? 0).toFixed(2)} km²`]}
                  contentStyle={{
                    backgroundColor: '#111210',
                    border: '1px solid #2B2E28',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#EBE7DE',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="y2016" name="2016 (km²)" fill="#D2C7B0" radius={[3, 3, 0, 0]} />
                <Bar dataKey="y2026" name="2026 (km²)" fill="#8C9A6E" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-7">
          <div className="overflow-hidden rounded-lg border border-[#2B2E28] bg-[#171916]">
            <div className="border-b border-[#2B2E28] px-5 py-3">
              <h3 className="font-display text-base font-semibold text-[#EBE7DE]">
                Class-Wise Area (km² &amp; ha) &amp; Net Delta
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#2B2E28] bg-[#141613] text-[#9A9484]">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Land Cover Class</th>
                    <th className="px-3 py-2.5 text-right font-medium">2016 (km² / ha)</th>
                    <th className="px-3 py-2.5 text-right font-medium">2026 (km² / ha)</th>
                    <th className="px-5 py-2.5 text-right font-medium">Net Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#22251F] font-mono tabular-nums">
                  {analysis.landCover.map((row) => (
                    <tr key={row.key} className="hover:bg-[#1C1E1A]">
                      <td className="px-5 py-2.5 font-sans">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-xs"
                            style={{ backgroundColor: row.color }}
                            aria-hidden="true"
                          />
                          <span className="font-medium text-[#EBE7DE]">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#C7C0B0]">
                        {row.area2016.km2.toFixed(2)} km² ({row.area2016.ha.toFixed(0)} ha)
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#EBE7DE]">
                        {row.area2026.km2.toFixed(2)} km² ({row.area2026.ha.toFixed(0)} ha)
                      </td>
                      <td
                        className={`px-5 py-2.5 text-right font-semibold ${
                          row.deltaKm2 >= 0 ? 'text-[#A3B47E]' : 'text-[#EF4444]'
                        }`}
                      >
                        {row.deltaKm2 >= 0 ? '+' : '−'}
                        {Math.abs(row.deltaKm2).toFixed(2)} km² ({row.deltaPctPoints >= 0 ? '+' : '−'}
                        {Math.abs(row.deltaPctPoints).toFixed(1)} pp)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dominant Confirmed Transitions */}
          <div className="overflow-hidden rounded-lg border border-[#2B2E28] bg-[#171916]">
            <div className="border-b border-[#2B2E28] px-5 py-3">
              <h3 className="font-display text-sm font-semibold text-[#EBE7DE]">
                Dominant Confirmed Transitions (≥{Math.round(analysis.confidenceThreshold * 100)}% Confidence)
              </h3>
            </div>
            <div className="grid grid-cols-1 divide-y divide-[#22251F] sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
              {topTransitions.map((tr) => (
                <div
                  key={`${tr.from}_${tr.to}`}
                  className="flex items-center justify-between gap-2 border-b border-[#22251F] px-5 py-2.5 text-xs"
                >
                  <span className="text-[#C7C0B0]">
                    {CLASS_LABELS[tr.from]} <span className="text-[#857F70]">→</span>{' '}
                    <strong className="font-medium text-[#EBE7DE]">{CLASS_LABELS[tr.to]}</strong>
                  </span>
                  <span className="font-mono text-[#D2C7B0] tabular-nums">
                    {tr.areaHa.toFixed(1)} ha ({tr.areaKm2.toFixed(2)} km²)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Independent Dynamic-World-Taxonomy Archive Cross-Verification (io-lulc-annual-v02) */}
      {analysis.historicalLulcVerification?.available && (
        <div className="overflow-hidden rounded-lg border border-[#2B2E28] bg-[#171916]">
          <div className="border-b border-[#2B2E28] px-5 py-3.5">
            <h3 className="font-display text-base font-semibold text-[#EBE7DE]">
              Independent Historical LULC Cross-Verification ({analysis.historicalLulcVerification.yearEarlier} vs {analysis.historicalLulcVerification.yearLatest})
            </h3>
            <p className="mt-0.5 text-xs text-[#9A9484]">
              {analysis.historicalLulcVerification.source} · {analysis.historicalLulcVerification.taxonomy}. {analysis.historicalLulcVerification.note}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#2B2E28] bg-[#141613] text-[#9A9484]">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Dynamic World Class</th>
                  <th className="px-4 py-2.5 text-right font-medium">{analysis.historicalLulcVerification.yearEarlier} Area</th>
                  <th className="px-4 py-2.5 text-right font-medium">{analysis.historicalLulcVerification.yearLatest} Area</th>
                  <th className="px-5 py-2.5 text-right font-medium">2017→2023 Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#22251F] font-mono tabular-nums">
                {analysis.historicalLulcVerification.classes.map((cls) => (
                  <tr key={cls.label} className="hover:bg-[#1C1E1A]">
                    <td className="px-5 py-2.5 font-sans text-[#EBE7DE]">{cls.label}</td>
                    <td className="px-4 py-2.5 text-right text-[#C7C0B0]">
                      {cls.earlierKm2.toFixed(2)} km² ({cls.earlierPct.toFixed(1)}%)
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#EBE7DE]">
                      {cls.latestKm2.toFixed(2)} km² ({cls.latestPct.toFixed(1)}%)
                    </td>
                    <td
                      className={`px-5 py-2.5 text-right font-semibold ${
                        cls.deltaKm2 >= 0 ? 'text-[#A3B47E]' : 'text-[#EF4444]'
                      }`}
                    >
                      {cls.deltaKm2 >= 0 ? '+' : '−'}
                      {Math.abs(cls.deltaKm2).toFixed(2)} km²
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
