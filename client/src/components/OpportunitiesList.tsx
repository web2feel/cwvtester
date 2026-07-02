import { useState } from 'react';
import type { Opportunity } from '../types';
import { OpportunityCard } from './OpportunityCard';

interface OpportunitiesListProps {
  opportunities: Opportunity[];
}

export function OpportunitiesList({ opportunities }: OpportunitiesListProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

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
      <div className="mb-4 mt-11 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Top Performance Opportunities</h2>
        <span className="font-mono text-xs text-text-faint">{opportunities.length} found · ranked by savings</span>
      </div>
      <div className="flex flex-col gap-3">
        {opportunities.map(opportunity => (
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
