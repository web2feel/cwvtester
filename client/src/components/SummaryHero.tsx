import { renderBoldSentence } from '../lib/format';
import type { AuditResult } from '../types';
import { ScoreGauge } from './ScoreGauge';

interface SummaryHeroProps {
  result: AuditResult;
}

export function SummaryHero({ result }: SummaryHeroProps) {
  const sentenceParts = renderBoldSentence(result.summarySentence);
  return (
    <div className="mt-[34px] grid grid-cols-[minmax(260px,320px)_1fr] items-center gap-8 rounded-[20px] border border-border-card bg-white p-[34px] shadow-card max-md:grid-cols-1">
      <ScoreGauge score={result.score} status={result.status} />
      <div>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-faint">Summary</div>
        <p className="mb-6 max-w-[540px] text-[19px] leading-[1.55] text-text-secondary">
          {sentenceParts.map((part, i) =>
            part.bold ? (
              <b key={i} className="font-semibold text-text-primary">
                {part.text}
              </b>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </p>
        <div className="grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
          <div className="rounded-xl border border-surface-muted3 bg-surface-muted p-[14px_16px]">
            <div className="font-mono text-2xl font-semibold tracking-[-0.02em]">{result.opportunitiesCount}</div>
            <div className="mt-0.5 text-xs text-text-muted">Opportunities</div>
          </div>
          <div className="rounded-xl border border-surface-muted3 bg-surface-muted p-[14px_16px]">
            <div className="font-mono text-2xl font-semibold tracking-[-0.02em] text-good-dot">
              {result.estimatedSavingsDisplay}
            </div>
            <div className="mt-0.5 text-xs text-text-muted">Est. total savings</div>
          </div>
          <div className="rounded-xl border border-surface-muted3 bg-surface-muted p-[14px_16px]">
            <div className="font-mono text-2xl font-semibold tracking-[-0.02em]">
              {result.pageWeightMB.toFixed(1)}
              <span className="text-sm text-text-faint"> MB</span>
            </div>
            <div className="mt-0.5 text-xs text-text-muted">Page weight</div>
          </div>
        </div>
      </div>
    </div>
  );
}
