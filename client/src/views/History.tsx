import { useEffect, useState } from 'react';
import { TrendChart } from '../components/TrendChart';
import { fetchHistory } from '../lib/api';
import { formatDate } from '../lib/format';
import type { HistoryRun } from '../types';

interface HistoryProps {
  onBack: () => void;
  onOpenRun: (run: HistoryRun) => void;
}

const STATUS_DOT: Record<HistoryRun['status'], string> = {
  good: '#16a34a',
  'needs-improvement': '#f59e0b',
  poor: '#ef4444',
};

export function History({ onBack, onOpenRun }: HistoryProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [runs, setRuns] = useState<HistoryRun[]>([]); // newest-first, as returned by the API

  useEffect(() => {
    fetchHistory().then(data => {
      setUrl(data.url);
      setRuns(data.runs);
    });
  }, []);

  const chronological = [...runs].reverse();
  const scores = runs.map(r => r.score);
  const latest = runs[0];
  const best = scores.length ? Math.max(...scores) : 0;
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const change = runs.length > 1 ? runs[0].score - runs[runs.length - 1].score : 0;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-3.5 inline-flex items-center gap-1.5 py-1.5 text-[13px] font-medium text-text-muted hover:text-brand"
      >
        <span className="text-[15px]">←</span> Back to report
      </button>

      <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[26px] font-semibold tracking-[-0.02em]">Audit history</h1>
          <p className="font-mono text-[14.5px] text-text-muted">{url ?? 'No audits yet'} · last {runs.length} runs</p>
        </div>
        <button
          onClick={onBack}
          className="flex h-[42px] items-center gap-2 rounded-[11px] bg-brand px-5 text-sm font-semibold text-white shadow-button hover:bg-brand-dark"
        >
          <span className="text-base leading-none">+</span> New audit
        </button>
      </div>

      {runs.length === 0 ? (
        <p className="text-[15px] text-text-muted">Run an audit to start building history for this URL.</p>
      ) : (
        <>
          <div className="mb-7 grid grid-cols-4 gap-4 max-sm:grid-cols-2">
            <div className="rounded-2xl border border-border-card bg-white p-[18px_20px] shadow-card">
              <div className="mb-2 text-[11.5px] text-text-muted">Latest score</div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[latest.status] }} />
                <span className="font-mono text-2xl font-semibold tracking-[-0.02em]">{latest.score}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-border-card bg-white p-[18px_20px] shadow-card">
              <div className="mb-2 text-[11.5px] text-text-muted">Best score</div>
              <div className="font-mono text-2xl font-semibold tracking-[-0.02em]">{best}</div>
            </div>
            <div className="rounded-2xl border border-border-card bg-white p-[18px_20px] shadow-card">
              <div className="mb-2 text-[11.5px] text-text-muted">Average</div>
              <div className="font-mono text-2xl font-semibold tracking-[-0.02em]">{average}</div>
            </div>
            <div className="rounded-2xl border border-border-card bg-white p-[18px_20px] shadow-card">
              <div className="mb-2 text-[11.5px] text-text-muted">Change since first run</div>
              <div
                className={`flex items-baseline gap-1 font-mono text-2xl font-semibold tracking-[-0.02em] ${
                  change >= 0 ? 'text-good-dot' : 'text-bad-dot'
                }`}
              >
                {change >= 0 ? `+${change}` : change}
                <span className="text-[13px]">{change >= 0 ? '▲' : '▼'}</span>
              </div>
            </div>
          </div>

          <TrendChart runs={chronological} />

          <div className="mb-4 mt-8 flex items-baseline justify-between px-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">All runs</h2>
            <span className="font-mono text-xs text-text-faint">newest first · click to open</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border-card bg-white shadow-card">
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[130px_92px_168px_1fr_1fr_1fr_24px] items-center gap-3 border-b border-border-card bg-surface-muted p-3 px-5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  <span>Date</span>
                  <span>Device</span>
                  <span>Score</span>
                  <span>LCP</span>
                  <span>INP</span>
                  <span>CLS</span>
                  <span />
                </div>
                {runs.map((run, i) => {
                  const previous = runs[i + 1];
                  const delta = previous ? run.score - previous.score : null;
                  return (
                    <button
                      key={run.id}
                      onClick={() => onOpenRun(run)}
                      className={`grid w-full grid-cols-[130px_92px_168px_1fr_1fr_1fr_24px] items-center gap-3 p-[15px_20px] text-left text-[13.5px] hover:bg-[#fcfcfc] ${
                        i < runs.length - 1 ? 'border-b border-border-inner' : ''
                      }`}
                    >
                      <span className="font-mono text-text-primary">{formatDate(run.createdAt)}</span>
                      <span className="w-fit rounded-pill bg-border-inner px-2.5 py-[3px] text-[11px] font-medium text-text-tertiary">
                        {run.device === 'mobile' ? 'Mobile' : 'Desktop'}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[run.status] }} />
                        <span className="font-mono text-[15px] font-semibold">{run.score}</span>
                        {delta !== null && (
                          <span className={`font-mono text-[11px] ${delta >= 0 ? 'text-good-dot' : 'text-bad-dot'}`}>
                            {delta === 0 ? '—' : delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-text-tertiary">{(run.lcp / 1000).toFixed(1)}s</span>
                      <span className="font-mono text-text-tertiary">
                        {run.inp === 0 ? '—' : `${Math.round(run.inp)}ms`}
                      </span>
                      <span className="font-mono text-text-tertiary">{run.cls.toFixed(2)}</span>
                      <span className="justify-self-end text-lg text-text-faintest">›</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
