import type { DiagnosticsData } from '../types';

type TileId = 'ttfb' | 'tti' | 'domSize' | 'networkRequests' | 'transferSize' | 'mainThreadWork';
type TileStatus = 'good' | 'needs-improvement' | 'poor' | 'neutral';

const STATUS_COLOR: Record<Exclude<TileStatus, 'neutral'>, string> = {
  good: '#15803d',
  'needs-improvement': '#b45309',
  poor: '#b91c1c',
};

const PROBLEM_HINT: Record<TileId, string> = {
  ttfb: 'Slow server responses delay everything that follows.',
  tti: 'Late interactivity makes the page feel frozen.',
  domSize: 'Large DOMs slow style recalculation.',
  networkRequests: '',
  transferSize: 'Heavy pages load slowly on mobile networks.',
  mainThreadWork: 'A busy main thread cannot respond to input.',
};

interface DiagnosticsProps {
  diagnostics: DiagnosticsData;
}

export function Diagnostics({ diagnostics }: DiagnosticsProps) {
  const tiles: { id: TileId; label: string; value: string; unit: string }[] = [
    { id: 'ttfb', label: 'Time to First Byte', value: diagnostics.ttfbSeconds.toFixed(1), unit: 's' },
    { id: 'tti', label: 'Time to Interactive', value: diagnostics.ttiSeconds.toFixed(1), unit: 's' },
    { id: 'domSize', label: 'DOM Size', value: diagnostics.domSizeNodes.toLocaleString(), unit: ' nodes' },
    { id: 'networkRequests', label: 'Network Requests', value: String(diagnostics.networkRequests), unit: '' },
    { id: 'transferSize', label: 'Transfer Size', value: diagnostics.transferSizeMB.toFixed(1), unit: ' MB' },
    { id: 'mainThreadWork', label: 'Main-Thread Work', value: diagnostics.mainThreadWorkSeconds.toFixed(1), unit: 's' },
  ];
  return (
    <section>
      <div className="mb-4 mt-11 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-text-tertiary">Diagnostics</h2>
        <span className="font-mono text-xs text-text-faint">supporting metrics</span>
      </div>
      <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border-diag bg-surface-muted2 max-sm:grid-cols-1">
        {tiles.map((tile, i) => {
          const status: TileStatus = diagnostics.statuses?.[tile.id] ?? 'neutral';
          const showHint = (status === 'needs-improvement' || status === 'poor') && PROBLEM_HINT[tile.id] !== '';
          return (
            <div
              key={tile.id}
              className="border-border-diag p-[18px_22px]"
              style={{ borderRightWidth: (i + 1) % 3 === 0 ? 0 : 1, borderBottomWidth: i < 3 ? 1 : 0 }}
            >
              <div className="mb-1.5 text-[11.5px] text-text-muted">{tile.label}</div>
              <div
                className="font-mono text-[22px] font-semibold tracking-[-0.02em]"
                style={status !== 'neutral' ? { color: STATUS_COLOR[status] } : undefined}
              >
                {tile.value}
                <span className="text-[13px] text-text-faint">{tile.unit}</span>
              </div>
              {showHint && <div className="mt-1 text-[11px] leading-snug text-text-muted">{PROBLEM_HINT[tile.id]}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
