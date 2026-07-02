import type { DiagnosticsData } from '../types';

interface DiagnosticsProps {
  diagnostics: DiagnosticsData;
}

export function Diagnostics({ diagnostics }: DiagnosticsProps) {
  const tiles = [
    { label: 'Time to First Byte', value: diagnostics.ttfbSeconds.toFixed(1), unit: 's' },
    { label: 'Time to Interactive', value: diagnostics.ttiSeconds.toFixed(1), unit: 's' },
    { label: 'DOM Size', value: diagnostics.domSizeNodes.toLocaleString(), unit: ' nodes' },
    { label: 'Network Requests', value: String(diagnostics.networkRequests), unit: '' },
    { label: 'Transfer Size', value: diagnostics.transferSizeMB.toFixed(1), unit: ' MB' },
    { label: 'Main-Thread Work', value: diagnostics.mainThreadWorkSeconds.toFixed(1), unit: 's' },
  ];
  return (
    <section>
      <div className="mb-4 mt-11 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-text-tertiary">Diagnostics</h2>
        <span className="font-mono text-xs text-text-faint">supporting metrics</span>
      </div>
      <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border-diag bg-surface-muted2 max-sm:grid-cols-1">
        {tiles.map((tile, i) => (
          <div
            key={tile.label}
            className="border-border-diag p-[18px_22px]"
            style={{ borderRightWidth: (i + 1) % 3 === 0 ? 0 : 1, borderBottomWidth: i < 3 ? 1 : 0 }}
          >
            <div className="mb-1.5 text-[11.5px] text-text-muted">{tile.label}</div>
            <div className="font-mono text-[22px] font-semibold tracking-[-0.02em]">
              {tile.value}
              <span className="text-[13px] text-text-faint">{tile.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
