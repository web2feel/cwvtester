import { AuditForm } from '../components/AuditForm';
import { CulpritsSection } from '../components/CulpritsSection';
import { Diagnostics } from '../components/Diagnostics';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Filmstrip } from '../components/Filmstrip';
import { Footer } from '../components/Footer';
import { LoadingState } from '../components/LoadingState';
import { MetricsGrid } from '../components/MetricsGrid';
import { OpportunitiesList } from '../components/OpportunitiesList';
import { ResourceTable } from '../components/ResourceTable';
import { SummaryHero } from '../components/SummaryHero';
import { formatRelativeTime } from '../lib/format';
import type { AuditResult, Device } from '../types';

type AuditPhase = 'idle' | 'running' | 'error' | 'done';

interface DashboardProps {
  device: Device;
  onDeviceChange: (device: Device) => void;
  onSubmit: (url: string) => void;
  onRetry: () => void;
  phase: AuditPhase;
  stage: string;
  error: string | null;
  result: AuditResult | null;
  completedAt: number | null;
}

export function Dashboard({
  device,
  onDeviceChange,
  onSubmit,
  onRetry,
  phase,
  stage,
  error,
  result,
  completedAt,
}: DashboardProps) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1.5 text-[26px] font-semibold tracking-[-0.02em]">Performance audit</h1>
        <p className="max-w-[640px] text-[14.5px] leading-normal text-text-muted">
          Analyze website performance and identify the biggest opportunities for improvement.
        </p>
      </div>

      <AuditForm device={device} onDeviceChange={onDeviceChange} onSubmit={onSubmit} disabled={phase === 'running'} />

      {result && completedAt && phase === 'done' && (
        <div className="mt-3 flex flex-wrap items-center gap-3 px-1 font-mono text-xs text-text-faint">
          <span className="flex items-center gap-1.5 text-good-dot">
            <span className="h-1.5 w-1.5 rounded-full bg-good-dot" />
            Audit complete
          </span>
          <span className="text-border-inner">·</span>
          <span>{result.device === 'mobile' ? 'Moto G Power · Slow 4G throttle' : 'Desktop · no throttle'}</span>
          <span className="text-border-inner">·</span>
          <span>
            Lighthouse {result.lighthouseVersion} · Chrome {result.chromeVersion}
          </span>
          <span className="text-border-inner">·</span>
          <span>{formatRelativeTime(completedAt)}</span>
        </div>
      )}

      {phase === 'idle' && <EmptyState />}
      {phase === 'running' && <LoadingState stage={stage} />}
      {phase === 'error' && error && <ErrorState message={error} onRetry={onRetry} />}
      {phase === 'done' && result && (
        <>
          <SummaryHero result={result} />
          {result.filmstrip && result.filmstrip.length > 0 && <Filmstrip frames={result.filmstrip} />}
          <MetricsGrid result={result} />
          {result.culprits && result.culprits.length > 0 && <CulpritsSection culprits={result.culprits} />}
          <OpportunitiesList opportunities={result.opportunities} />
          <ResourceTable resources={result.resources} />
          <Diagnostics diagnostics={result.diagnostics} />
          <Footer />
        </>
      )}
    </div>
  );
}
