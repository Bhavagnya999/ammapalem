import { Download } from 'lucide-react';

interface NavbarProps {
  activeSection: string;
  onNavigate: (id: string) => void;
  onExportReport: () => void;
  canExport: boolean;
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'comparison', label: 'Satellite Comparison' },
  { id: 'change-detection', label: 'Change Detection' },
  { id: 'land-cover', label: 'Land Cover Analysis' },
  { id: 'data-sources', label: 'Data Sources' },
];

export function Navbar({ activeSection, onNavigate, onExportReport, canExport }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#2B2E28] bg-[#111210]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('overview');
          }}
          className="font-display text-sm font-semibold tracking-[0.14em] text-[#EBE7DE] uppercase whitespace-nowrap shrink-0 transition-colors hover:text-[#D2C7B0]"
        >
          AMMAPALEM EARTH OBSERVATORY
        </a>

        <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.id);
                }}
                className={`text-sm font-medium whitespace-nowrap shrink-0 pb-0.5 transition-colors border-b ${
                  isActive
                    ? 'text-[#EBE7DE] border-[#8C9A6E]'
                    : 'text-[#9A9484] border-transparent hover:text-[#EBE7DE] hover:border-[#4A4E44]'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onExportReport}
            disabled={!canExport}
            className="inline-flex items-center gap-2 rounded-md border border-[#8C9A6E]/60 bg-[#8C9A6E]/15 px-3.5 py-2 text-xs font-medium text-[#EBE7DE] whitespace-nowrap shrink-0 transition-colors hover:bg-[#8C9A6E]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8C9A6E] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5 text-[#A3B47E]" aria-hidden="true" />
            <span>Export Report</span>
          </button>
        </div>
      </div>
    </header>
  );
}
