import type { Opportunity } from '../types';

const SEVERITY_STYLE = {
  high: { border: '#ef4444', pillBg: '#fef2f2', pillBorder: '#fecaca', pillText: '#b91c1c', dot: '#ef4444', label: 'High' },
  medium: { border: '#f59e0b', pillBg: '#fffbeb', pillBorder: '#fde68a', pillText: '#b45309', dot: '#f59e0b', label: 'Medium' },
  low: { border: '#d4d4d8', pillBg: '#f4f4f5', pillBorder: '#e4e4e7', pillText: '#52525b', dot: '#a1a1aa', label: 'Low' },
} as const;

interface OpportunityCardProps {
  opportunity: Opportunity;
  open: boolean;
  onToggle: () => void;
}

export function OpportunityCard({ opportunity, open, onToggle }: OpportunityCardProps) {
  const style = SEVERITY_STYLE[opportunity.severity];
  return (
    <div
      className="overflow-hidden rounded-[14px] border border-border-card bg-white shadow-card"
      style={{ borderLeft: `3px solid ${style.border}` }}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`opp-panel-${opportunity.id}`} className="flex w-full items-center gap-4 p-[18px_20px] text-left hover:bg-[#fcfcfc]">
        <span
          className="inline-flex flex-none items-center gap-1.5 rounded-pill px-[9px] py-1 text-[10.5px] font-semibold uppercase tracking-[0.03em]"
          style={{ background: style.pillBg, borderWidth: 1, borderColor: style.pillBorder, color: style.pillText }}
        >
          <span className="h-[5px] w-[5px] rounded-full" style={{ background: style.dot }} />
          {style.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-[3px] text-[14.5px] font-semibold">{opportunity.title}</div>
          <div className="text-[12.5px] text-text-muted">{opportunity.subtitle}</div>
        </div>
        <div className="flex-none text-right">
          <div className="font-mono text-base font-semibold text-good-dot">{opportunity.savingsDisplay}</div>
          <div className="text-[10.5px] text-text-faint">est. savings</div>
        </div>
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-border-inner text-lg leading-none text-text-secondary">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div id={`opp-panel-${opportunity.id}`} className="animate-fadeIn border-t border-border-inner p-[0_20px_20px]">
          <div className="grid grid-cols-2 gap-[20px_36px] pt-[18px] max-sm:grid-cols-1">
            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                Why it hurts
              </div>
              <div className="text-[13px] leading-[1.55] text-text-secondary">{opportunity.whyItHurts}</div>
            </div>
            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                Estimated impact
              </div>
              <div className="text-[13px] leading-[1.55] text-text-secondary">{opportunity.estimatedImpact}</div>
            </div>
          </div>
          {opportunity.affectedResources.length > 0 && (
            <div className="mt-[18px]">
              <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                Affected resources
              </div>
              <div className="flex flex-wrap gap-2">
                {opportunity.affectedResources.map((resource, i) => (
                  <span
                    key={i}
                    className="rounded-lg border border-border-card bg-surface-muted px-2.5 py-[5px] font-mono text-xs text-text-tertiary"
                  >
                    {resource.name} <b className="font-medium text-text-faint">{resource.size}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
