import { formatDate } from '../lib/format';
import type { HistoryRun } from '../types';

interface TrendChartProps {
  runs: HistoryRun[]; // oldest-first
}

const CHART_WIDTH = 760;
const CHART_HEIGHT = 244;
const PLOT_LEFT = 50;
const PLOT_RIGHT = 740;
const PLOT_TOP = 30;
const PLOT_BOTTOM = 200;

export function TrendChart({ runs }: TrendChartProps) {
  if (runs.length === 0) return null;

  const scores = runs.map(r => r.score);
  const minScore = Math.min(...scores, 40);
  const maxScore = Math.max(...scores, 100);
  const yFor = (score: number) => PLOT_BOTTOM - ((score - minScore) / (maxScore - minScore || 1)) * (PLOT_BOTTOM - PLOT_TOP);
  const xFor = (i: number) => (runs.length === 1 ? PLOT_LEFT : PLOT_LEFT + (i / (runs.length - 1)) * (PLOT_RIGHT - PLOT_LEFT));
  const points = runs.map((r, i) => ({ x: xFor(i), y: yFor(r.score) }));
  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `M${points.map(p => `${p.x},${p.y}`).join(' L')} L${PLOT_RIGHT},${PLOT_BOTTOM} L${PLOT_LEFT},${PLOT_BOTTOM} Z`;
  const latest = points[points.length - 1];

  return (
    <div className="mb-3 rounded-2xl border border-border-card bg-white p-[24px_24px_18px] shadow-card">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Performance score over time</div>
          <div className="mt-0.5 text-[12.5px] text-text-faint">
            {formatDate(runs[0].createdAt)} – {formatDate(runs[runs.length - 1].createdAt)}
          </div>
        </div>
        <div className="inline-flex rounded-lg bg-surface-muted3 p-[3px]">
          <span className="rounded-md bg-white px-3.5 py-1.5 text-[12.5px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
            Score
          </span>
          <span className="px-3.5 py-1.5 text-[12.5px] font-medium text-text-faint">LCP</span>
          <span className="px-3.5 py-1.5 text-[12.5px] font-medium text-text-faint">INP</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="block w-full" fontFamily="'Geist Mono', monospace">
        <rect
          x={PLOT_LEFT}
          y={PLOT_TOP}
          width={PLOT_RIGHT - PLOT_LEFT}
          height={(PLOT_BOTTOM - PLOT_TOP) * 0.67}
          fill="rgba(245,158,11,0.05)"
        />
        <rect
          x={PLOT_LEFT}
          y={PLOT_TOP + (PLOT_BOTTOM - PLOT_TOP) * 0.67}
          width={PLOT_RIGHT - PLOT_LEFT}
          height={(PLOT_BOTTOM - PLOT_TOP) * 0.33}
          fill="rgba(239,68,68,0.05)"
        />
        {[0, 1, 2, 3].map(i => (
          <line
            key={i}
            x1={PLOT_LEFT}
            y1={PLOT_TOP + (i * (PLOT_BOTTOM - PLOT_TOP)) / 3}
            x2={PLOT_RIGHT}
            y2={PLOT_TOP + (i * (PLOT_BOTTOM - PLOT_TOP)) / 3}
            stroke={i === 3 ? '#e4e4e7' : '#f0f0f1'}
            strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill="rgba(227,90,42,0.08)" />
        <polyline points={polyline} fill="none" stroke="#e35a2a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.slice(0, -1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#e35a2a" strokeWidth="2" />
        ))}
        <circle cx={latest.x} cy={latest.y} r="5.5" fill="#e35a2a" />
        <text x={latest.x} y={latest.y - 14} textAnchor="middle" fontSize="12" fontWeight="600" fill="#18181b">
          {runs[runs.length - 1].score}
        </text>
        {points.map((p, i) => (
          <text key={i} x={p.x} y={222} textAnchor="middle" fontSize="9.5" fill="#a1a1aa">
            {new Date(runs[i].createdAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
          </text>
        ))}
      </svg>
    </div>
  );
}
