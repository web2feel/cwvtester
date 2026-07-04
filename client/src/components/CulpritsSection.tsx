import type { MetricCulpritGroup } from '../types';

interface CulpritsSectionProps {
  culprits: MetricCulpritGroup[];
}

export function CulpritsSection({ culprits }: CulpritsSectionProps) {
  if (culprits.length === 0) return null;
  return (
    <section>
      <div className="mb-4 mt-10 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">What's causing this</h2>
        <span className="font-mono text-xs text-text-faint">culprits for failing metrics</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {culprits.map(group => (
          <div key={group.metricId} className="rounded-2xl border border-border-card bg-white p-5 shadow-card">
            <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.03em] text-text-tertiary">
              {group.metricLabel}
            </div>
            <ul className="flex flex-col gap-2.5">
              {group.items.map((item, i) => (
                <li key={i} className="text-[13px] leading-snug">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words font-mono text-text-primary">{item.label}</span>
                    {item.value && <span className="flex-none font-mono text-xs text-text-muted">{item.value}</span>}
                  </div>
                  {item.detail && (
                    <div className="mt-0.5 break-words font-mono text-[11px] text-text-faint">{item.detail}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
