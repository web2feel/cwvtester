import type { ResourceRow } from '../types';

const CATEGORY_DOT: Record<ResourceRow['category'], string> = {
  Images: '#e35a2a',
  JavaScript: '#a1a1aa',
  'Third-party': '#71717a',
  CSS: '#c4c4c8',
  Fonts: '#d4d4d8',
  Other: '#d4d4d8',
};

interface ResourceTableProps {
  resources: ResourceRow[];
}

export function ResourceTable({ resources }: ResourceTableProps) {
  return (
    <section>
      <div className="mb-4 mt-11 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Resource breakdown</h2>
        <span className="font-mono text-xs text-text-faint">by load contribution</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border-card bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-border-card bg-surface-muted">
                <th className="p-3 px-5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Category
                </th>
                <th className="p-3 px-5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Resource
                </th>
                <th className="p-3 px-5 text-right text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Transfer
                </th>
                <th className="p-3 px-5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Load contribution
                </th>
                <th className="p-3 px-5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Optimization
                </th>
              </tr>
            </thead>
            <tbody>
              {resources.map((row, i) => (
                <tr key={i} className={i < resources.length - 1 ? 'border-b border-border-inner' : ''}>
                  <td className="p-3.5 px-5">
                    <span className="inline-flex items-center gap-2 text-text-secondary">
                      <span className="h-[7px] w-[7px] rounded-sm" style={{ background: CATEGORY_DOT[row.category] }} />
                      {row.category}
                    </span>
                  </td>
                  <td className="p-3.5 px-5 font-mono text-text-primary">{row.resource}</td>
                  <td className="p-3.5 px-5 text-right font-mono font-semibold">{row.transferSize}</td>
                  <td className="p-3.5 px-5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-surface-muted3">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${row.loadContributionPct}%` }} />
                      </div>
                      <span className="font-mono text-xs text-text-muted">{row.loadContributionPct}%</span>
                    </div>
                  </td>
                  <td className="p-3.5 px-5 text-text-muted">{row.optimization}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
