import type { AuditResult, MetricValue } from '../types';
import { MetricCard } from './MetricCard';

interface MetricsGridProps {
  result: AuditResult;
}

const ORDER: MetricValue['id'][] = ['lcp', 'inp', 'cls', 'tbt', 'si', 'fcp'];

export function MetricsGrid({ result }: MetricsGridProps) {
  const byId = new Map(result.metrics.map(m => [m.id, m]));
  return (
    <section>
      <div className="mb-4 mt-10 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Core Web Vitals</h2>
        <span className="font-mono text-xs text-text-faint">Lab data · {result.device}</span>
      </div>
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-2 max-sm:grid-cols-1">
        {ORDER.map(id => {
          const metric = byId.get(id);
          return metric ? <MetricCard key={id} metric={metric} /> : null;
        })}
      </div>
    </section>
  );
}
