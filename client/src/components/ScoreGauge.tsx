import { useEffect, useRef, useState } from 'react';
import type { Status } from '../types';

interface ScoreGaugeProps {
  score: number;
  status: Status;
}

const STATUS_ARC_COLOR: Record<Status, string> = {
  good: '#16a34a',
  'needs-improvement': '#f59e0b',
  poor: '#ef4444',
};

const STATUS_PILL: Record<Status, { bg: string; border: string; text: string; dot: string; label: string }> = {
  good: { bg: '#ecfdf3', border: '#bbf7d0', text: '#15803d', dot: '#16a34a', label: 'Good' },
  'needs-improvement': { bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#f59e0b', label: 'Needs Improvement' },
  poor: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', dot: '#ef4444', label: 'Poor' },
};

const PATH_LENGTH = 282.74;

export function ScoreGauge({ score, status }: ScoreGaugeProps) {
  const [displayed, setDisplayed] = useState(0);
  const frame = useRef<number>();

  useEffect(() => {
    const start = performance.now();
    const duration = 1100;
    const step = (t: number) => {
      const progress = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * score));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [score]);

  const pill = STATUS_PILL[status];
  const dashArray = `${(score / 100) * PATH_LENGTH} ${PATH_LENGTH}`;

  return (
    <div className="flex flex-col items-center border-r border-border-inner pr-4">
      <div className="relative h-[126px] w-[220px]">
        <svg width="220" height="130" viewBox="0 0 220 130">
          <path
            d="M20 110 A90 90 0 0 1 200 110"
            fill="none"
            stroke="#f0f0f1"
            strokeWidth="15"
            strokeLinecap="round"
          />
          <path
            d="M20 110 A90 90 0 0 1 200 110"
            fill="none"
            stroke={STATUS_ARC_COLOR[status]}
            strokeWidth="15"
            strokeLinecap="round"
            strokeDasharray={dashArray}
          />
        </svg>
        <div className="absolute left-0 right-0 top-12 text-center">
          <div className="font-mono text-[54px] font-semibold leading-none tracking-[-0.03em]">{displayed}</div>
          <div className="mt-0.5 font-mono text-[11px] text-text-faint">/ 100</div>
        </div>
      </div>
      <div
        className="mt-2 inline-flex items-center gap-2 rounded-pill border px-[15px] py-1.5 text-[13px] font-semibold"
        style={{ background: pill.bg, borderColor: pill.border, color: pill.text }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: pill.dot }} />
        {pill.label}
      </div>
    </div>
  );
}
