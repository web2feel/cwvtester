import { useState } from 'react';
import { markerPercent, statusLabel } from '../lib/format';
import type { MetricValue } from '../types';

const STATUS_PILL = {
  good: { bg: '#ecfdf3', border: '#bbf7d0', text: '#15803d', dot: '#16a34a' },
  'needs-improvement': { bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#f59e0b' },
  poor: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', dot: '#ef4444' },
} as const;

const METRIC_TOOLTIP: Record<MetricValue['id'], { description: string; goodCaption: string; okCaption: string }> = {
  lcp: {
    description: 'Time until the largest visible element renders — marks when the main content feels loaded.',
    goodCaption: '≤2.5s good',
    okCaption: '≤4s ok',
  },
  inp: {
    description: 'How quickly the page responds to taps, clicks, and key presses across the whole visit.',
    goodCaption: '≤200ms good',
    okCaption: '≤500ms ok',
  },
  cls: {
    description: 'How much visible content shifts during load. Unexpected shifts cause misclicks and frustration.',
    goodCaption: '≤0.1 good',
    okCaption: '≤0.25 ok',
  },
  tbt: {
    description: 'Total time the main thread was blocked, delaying response to taps and clicks.',
    goodCaption: '≤200ms good',
    okCaption: '≤600ms ok',
  },
  si: {
    description: 'How quickly content is visually displayed — reflects perceived above-the-fold loading speed.',
    goodCaption: '≤3.4s good',
    okCaption: '≤5.8s ok',
  },
  fcp: {
    description: 'Time until the first text or image is painted — the first signal that the page is loading.',
    goodCaption: '≤1.8s good',
    okCaption: '≤3s ok',
  },
};

interface MetricCardProps {
  metric: MetricValue;
}

export function MetricCard({ metric }: MetricCardProps) {
  const [hovered, setHovered] = useState(false);
  const notMeasurable = metric.measurable === false;
  const pill = STATUS_PILL[metric.status];
  const tooltip = METRIC_TOOLTIP[metric.id];
  const markerPct = markerPercent(metric.value, metric.goodThreshold, metric.poorThreshold);

  return (
    <div className="relative rounded-2xl border border-border-card bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-[0.03em] text-text-tertiary">{metric.label}</span>
        <span
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="flex h-[18px] w-[18px] cursor-help items-center justify-center rounded-full border border-border-control font-mono text-[10px] font-semibold text-text-faint"
        >
          i
        </span>
      </div>
      <div className="mb-3 flex items-baseline gap-[3px]">
        <span
          className={`font-mono text-4xl font-semibold leading-none tracking-[-0.03em] ${
            notMeasurable ? 'text-text-faint' : ''
          }`}
        >
          {metric.displayValue}
        </span>
        {!notMeasurable && metric.unit && <span className="font-mono text-base text-text-faint">{metric.unit}</span>}
      </div>
      {notMeasurable ? (
        <div className="mb-3.5 inline-flex items-center gap-1.5 rounded-pill border border-border-control bg-surface-muted px-2.5 py-1 text-[11.5px] font-semibold text-text-tertiary">
          <span className="h-1.5 w-1.5 rounded-full bg-text-faint" />
          Not measurable
        </div>
      ) : (
        <div
          className="mb-3.5 inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold"
          style={{ background: pill.bg, borderColor: pill.border, color: pill.text }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: pill.dot }} />
          {statusLabel(metric.status)}
        </div>
      )}
      <div className="mb-[18px] text-[12.5px] leading-tight text-text-muted">{metric.fullName}</div>
      {notMeasurable ? (
        <div className="text-[11.5px] leading-snug text-text-faint">
          Not measurable in lab tests — requires real-user interaction (field data).
        </div>
      ) : (
        <>
          <div className="relative mb-2">
            <div className="flex h-1.5 overflow-hidden rounded-full">
              <div className="w-[40%]" style={{ background: '#bbf7d0' }} />
              <div className="w-[30%]" style={{ background: '#fde68a' }} />
              <div className="w-[30%]" style={{ background: '#fecaca' }} />
            </div>
            <div
              className="absolute -top-[3px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
              style={{ left: `${markerPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-medium text-text-faint">
            <span>Good</span>
            <span>Poor</span>
          </div>
        </>
      )}
      {hovered && (
        <div className="absolute right-3.5 top-[42px] z-20 w-[228px] animate-fadeInFast rounded-xl bg-text-primary p-3.5 text-xs leading-[1.5] text-surface-page shadow-tooltip">
          <div className="mb-[7px] font-semibold text-white">{metric.fullName}</div>
          <div className="mb-2.5 text-text-faint">{tooltip.description}</div>
          <div className="flex gap-2 font-mono text-[11px] text-[#d4d4d8]">
            <span>
              <span className="text-[#4ade80]">●</span> {tooltip.goodCaption}
            </span>
            <span>
              <span className="text-[#fbbf24]">●</span> {tooltip.okCaption}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
