import { useState } from 'react';
import type { Opportunity } from '../types';
import { OpportunityCard } from './OpportunityCard';

const FILTERABLE_METRICS = ['LCP', 'CLS', 'TBT', 'FCP'] as const;

interface OpportunitiesListProps {
  opportunities: Opportunity[];
}

export function OpportunitiesList({ opportunities }: OpportunitiesListProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [metricFilter, setMetricFilter] = useState<string | null>(null);

  const availableFilters = FILTERABLE_METRICS.filter(metric =>
    opportunities.some(o => o.affects?.includes(metric))
  );
  const visible = metricFilter ? opportunities.filter(o => o.affects?.includes(metricFilter)) : opportunities;

  const toggle = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section>
      <div className="mb-4 mt-11 flex flex-wrap items-baseline justify-between gap-3 px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Top Performance Opportunities</h2>
        <div className="flex flex-wrap items-center gap-3">
          {availableFilters.length > 0 && (
            <div className="flex items-center gap-1.5">
              {availableFilters.map(metric => (
                <button
                  key={metric}
                  onClick={() => setMetricFilter(current => (current === metric ? null : metric))}
                  className={`rounded-pill border px-2.5 py-1 text-[11px] font-semibold ${
                    metricFilter === metric
                      ? 'border-brand bg-brand-tint text-brand-tintText'
                      : 'border-border-control bg-white text-text-tertiary hover:bg-surface-muted'
                  }`}
                >
                  {metric}
                  {metricFilter === metric && <span className="ml-1">✕</span>}
                </button>
              ))}
            </div>
          )}
          <span className="font-mono text-xs text-text-faint">
            {metricFilter ? `${visible.length} of ${opportunities.length}` : `${opportunities.length} found`} · ranked
            by savings
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {visible.map(opportunity => (
          <OpportunityCard
            key={opportunity.id}
            opportunity={opportunity}
            open={openIds.has(opportunity.id)}
            onToggle={() => toggle(opportunity.id)}
          />
        ))}
      </div>
    </section>
  );
}
