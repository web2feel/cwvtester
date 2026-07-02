import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { fetchAuditFull, submitAudit, usePollAudit } from './lib/api';
import type { AuditResult, Device, HistoryRun } from './types';
import { Dashboard } from './views/Dashboard';
import { History } from './views/History';

type View = 'dashboard' | 'history';
type AuditPhase = 'idle' | 'running' | 'error' | 'done';

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [device, setDevice] = useState<Device>('mobile');
  const [auditId, setAuditId] = useState<string | null>(null);
  const [phase, setPhase] = useState<AuditPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);

  const jobStatus = usePollAudit(auditId);

  useEffect(() => {
    if (!jobStatus) return;
    if (jobStatus.status === 'done' && jobStatus.result) {
      setResult(jobStatus.result);
      setCompletedAt(Date.now());
      setPhase('done');
      setAuditId(null);
    } else if (jobStatus.status === 'error') {
      setError(jobStatus.error ?? 'The audit failed.');
      setPhase('error');
      setAuditId(null);
    }
  }, [jobStatus]);

  const goDashboard = () => {
    setView('dashboard');
    window.scrollTo(0, 0);
  };
  const goHistory = () => {
    setView('history');
    window.scrollTo(0, 0);
  };

  const runAudit = async (url: string) => {
    setPhase('running');
    setError(null);
    try {
      const id = await submitAudit(url, device);
      setAuditId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the audit.');
      setPhase('error');
    }
  };

  const retry = () => setPhase('idle');

  const openRun = async (run: HistoryRun) => {
    try {
      const full = await fetchAuditFull(run.id);
      setResult(full);
      setCompletedAt(run.createdAt);
      setPhase('done');
      setDevice(run.device);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this run.');
      setPhase('error');
    }
    goDashboard();
  };

  return (
    <div className="min-h-screen bg-surface-page">
      <Header view={view} onGoDashboard={goDashboard} onGoHistory={goHistory} />
      <main className="mx-auto max-w-content p-[34px_24px_96px]">
        {view === 'dashboard' ? (
          <Dashboard
            device={device}
            onDeviceChange={setDevice}
            onSubmit={runAudit}
            onRetry={retry}
            phase={phase}
            stage={jobStatus?.stage ?? 'Launching Chrome…'}
            error={error}
            result={result}
            completedAt={completedAt}
          />
        ) : (
          <History onBack={goDashboard} onOpenRun={openRun} />
        )}
      </main>
    </div>
  );
}
