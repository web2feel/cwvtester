import type { AuditResult, CwvVerdict, Device, DiagnosticsData, MetricValue, Opportunity, ResourceRow, Status } from './types';

const METRIC_THRESHOLDS: Record<MetricValue['id'], { good: number; poor: number }> = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  tbt: { good: 200, poor: 600 },
  si: { good: 3400, poor: 5800 },
  fcp: { good: 1800, poor: 3000 },
};

const METRIC_META: Record<MetricValue['id'], { auditKey: string; label: string; fullName: string }> = {
  lcp: { auditKey: 'largest-contentful-paint', label: 'LCP', fullName: 'Largest Contentful Paint' },
  inp: { auditKey: 'interaction-to-next-paint', label: 'INP', fullName: 'Interaction to Next Paint' },
  cls: { auditKey: 'cumulative-layout-shift', label: 'CLS', fullName: 'Cumulative Layout Shift' },
  tbt: { auditKey: 'total-blocking-time', label: 'TBT', fullName: 'Total Blocking Time' },
  si: { auditKey: 'speed-index', label: 'Speed Index', fullName: 'Speed Index' },
  fcp: { auditKey: 'first-contentful-paint', label: 'FCP', fullName: 'First Contentful Paint' },
};

const METRIC_FOR_AUDIT: Record<string, string> = {
  'render-blocking-resources': 'FCP and LCP',
  'unused-javascript': 'TBT',
  'unminified-javascript': 'TBT',
  'unminified-css': 'FCP',
  'unused-css-rules': 'FCP',
  'modern-image-formats': 'LCP',
  'uses-optimized-images': 'LCP',
  'uses-responsive-images': 'LCP',
  'offscreen-images': 'LCP',
  'efficient-animated-content': 'LCP',
  'uses-text-compression': 'FCP',
  'server-response-time': 'TTFB and FCP',
  'third-party-summary': 'TBT',
  'legacy-javascript': 'TBT',
  'duplicated-javascript': 'TBT',
};

const OPTIMIZATION_HINT: Record<ResourceRow['category'], string> = {
  Images: 'Convert to AVIF/WebP, resize',
  JavaScript: 'Code-split, tree-shake',
  'Third-party': 'Defer or load on interaction',
  CSS: 'Purge unused rules',
  Fonts: 'Subset, preload',
  Other: 'Review necessity',
};

const CATEGORY_BY_RESOURCE_TYPE: Record<string, ResourceRow['category']> = {
  Image: 'Images',
  Script: 'JavaScript',
  Stylesheet: 'CSS',
  Font: 'Fonts',
};

function parseDisplayValue(displayValue: string): { display: string; unit: string } {
  const match = displayValue.trim().match(/^([\d,.]+)\s*(.*)$/);
  if (!match) return { display: displayValue, unit: '' };
  return { display: match[1], unit: match[2] };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

export function resourceDisplayName(resourceUrl: string, pageUrl: string): string {
  try {
    const resource = new URL(resourceUrl);
    const file = resource.pathname.split('/').filter(Boolean).pop() || resource.hostname;
    try {
      const page = new URL(pageUrl);
      if (resource.origin !== page.origin) return `${resource.hostname} · ${file}`;
    } catch {
      // No valid page origin to compare against — plain filename.
    }
    return file;
  } catch {
    return resourceUrl;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getMetricStatus(id: MetricValue['id'], value: number): Status {
  const t = METRIC_THRESHOLDS[id];
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

export function getScoreStatus(score: number): Status {
  if (score >= 90) return 'good';
  if (score >= 50) return 'needs-improvement';
  return 'poor';
}

export function buildCwvVerdict(metrics: MetricValue[]): CwvVerdict {
  const byId = new Map(metrics.map(m => [m.id, m]));
  const considered = [byId.get('lcp'), byId.get('cls')].filter((m): m is MetricValue => m !== undefined);
  const failing = considered
    .filter(m => m.measurable !== false && m.status !== 'good')
    .map(m => m.label);
  return {
    passes: failing.length === 0,
    failing,
    note: 'Lab verdict from LCP + CLS. INP requires field data.',
  };
}

export function mapMetric(lhr: any, id: MetricValue['id']): MetricValue {
  const meta = METRIC_META[id];
  const audit = lhr.audits[meta.auditKey];
  const t = METRIC_THRESHOLDS[id];
  if (typeof audit?.numericValue !== 'number') {
    // Lab runs cannot produce every metric (INP needs a real user interaction).
    return {
      id,
      label: meta.label,
      fullName: meta.fullName,
      value: 0,
      unit: '',
      displayValue: '—',
      status: 'good',
      measurable: false,
      goodThreshold: t.good,
      poorThreshold: t.poor,
    };
  }
  const value = audit.numericValue as number;
  const { display, unit } = parseDisplayValue(audit.displayValue ?? String(value));
  return {
    id,
    label: meta.label,
    fullName: meta.fullName,
    value,
    unit,
    displayValue: display,
    status: getMetricStatus(id, value),
    measurable: true,
    goodThreshold: t.good,
    poorThreshold: t.poor,
  };
}

export function mapAllMetrics(lhr: any): MetricValue[] {
  return (['lcp', 'inp', 'cls', 'tbt', 'si', 'fcp'] as const).map(id => mapMetric(lhr, id));
}

const BYTE_ONLY_FLOOR = 10 * 1024;

function getSeverity(savingsMs: number, savingsBytes: number): 'high' | 'medium' | 'low' {
  if (savingsMs > 0) {
    if (savingsMs >= 800) return 'high';
    if (savingsMs >= 300) return 'medium';
    return 'low';
  }
  if (savingsBytes >= 500 * 1024) return 'high';
  if (savingsBytes >= 100 * 1024) return 'medium';
  return 'low';
}

function impactFromMetricSavings(entries: [string, number][]): string {
  const parts = entries.map(([metric, value]) =>
    metric === 'CLS' ? `−${round2(value)} CLS` : `~${(value / 1000).toFixed(2)}s faster ${metric}`
  );
  return `${parts.join(' · ')}.`;
}

export function mapOpportunities(lhr: any, pageUrl = ''): Opportunity[] {
  const opportunities: Opportunity[] = [];
  for (const [id, audit] of Object.entries<any>(lhr.audits ?? {})) {
    const details = audit?.details;
    if (!details || details.type !== 'opportunity') continue;
    const savingsMs = Math.round(details.overallSavingsMs ?? 0);
    const savingsBytes = Math.round(details.overallSavingsBytes ?? 0);
    if (savingsMs <= 0 && savingsBytes < BYTE_ONLY_FLOOR) continue;

    const metricSavings = audit.metricSavings && typeof audit.metricSavings === 'object' ? audit.metricSavings : null;
    const affectsEntries: [string, number][] = metricSavings
      ? Object.entries(metricSavings).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
      : [];
    const affects =
      affectsEntries.length > 0
        ? affectsEntries.map(([metric]) => metric)
        : METRIC_FOR_AUDIT[id]
          ? METRIC_FOR_AUDIT[id].split(' and ')
          : [];

    let estimatedImpact: string;
    if (affectsEntries.length > 0) {
      estimatedImpact = impactFromMetricSavings(affectsEntries);
    } else if (savingsMs > 0) {
      estimatedImpact = `~${(savingsMs / 1000).toFixed(2)}s faster ${METRIC_FOR_AUDIT[id] ?? 'load time'}.`;
    } else {
      estimatedImpact = `${formatBytes(savingsBytes)} less to download.`;
    }

    const items: any[] = Array.isArray(details.items) ? details.items : [];
    const affectedResources = items.slice(0, 5).map((item: any) => ({
      name: typeof item.url === 'string' ? resourceDisplayName(item.url, pageUrl) : 'resource',
      size: item.totalBytes ? formatBytes(item.totalBytes) : '',
    }));

    const description = stripMarkdownLinks(audit.description ?? '');
    const firstSentence = description.split('. ')[0];
    opportunities.push({
      id,
      title: audit.title,
      subtitle: firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`,
      severity: getSeverity(savingsMs, savingsBytes),
      savingsMs,
      savingsDisplay: savingsMs > 0 ? `−${(savingsMs / 1000).toFixed(2)}s` : `−${formatBytes(savingsBytes)}`,
      whyItHurts: description,
      estimatedImpact,
      affectedResources,
      affects,
      savingsBytes: savingsBytes > 0 ? savingsBytes : undefined,
    });
  }
  return opportunities.sort((a, b) => b.savingsMs - a.savingsMs || (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0));
}

export function mapResources(lhr: any): ResourceRow[] {
  const details = lhr.audits?.['network-requests']?.details;
  const items: any[] = Array.isArray(details?.items) ? details.items : [];
  const totalBytes = items.reduce((sum: number, i: any) => sum + (i.transferSize ?? 0), 0) || 1;
  const thirdPartyEntries: any[] = lhr.audits?.['third-party-summary']?.details?.items ?? [];
  const thirdPartyUrls = new Set<string>();
  for (const entry of thirdPartyEntries) {
    for (const url of entry.subItems?.items?.map((s: any) => s.url) ?? []) thirdPartyUrls.add(url);
  }
  return items
    .filter(i => (i.transferSize ?? 0) > 0)
    .map(i => {
      const isThirdParty = thirdPartyUrls.has(i.url);
      const category: ResourceRow['category'] = isThirdParty
        ? 'Third-party'
        : CATEGORY_BY_RESOURCE_TYPE[i.resourceType] ?? 'Other';
      let name = i.url;
      try {
        name = new URL(i.url).pathname.split('/').filter(Boolean).pop() || i.url;
      } catch {
        /* keep full url as name */
      }
      return {
        category,
        resource: name,
        transferSize: formatBytes(i.transferSize),
        transferBytes: i.transferSize as number,
        loadContributionPct: Math.round((i.transferSize / totalBytes) * 100),
        optimization: OPTIMIZATION_HINT[category],
      };
    })
    .sort((a, b) => b.transferBytes - a.transferBytes)
    .slice(0, 12);
}

export function mapDiagnostics(lhr: any): DiagnosticsData {
  const bytesTotal = lhr.audits?.['total-byte-weight']?.numericValue ?? 0;
  return {
    ttfbSeconds: round2((lhr.audits?.['server-response-time']?.numericValue ?? 0) / 1000),
    ttiSeconds: round2((lhr.audits?.['interactive']?.numericValue ?? 0) / 1000),
    domSizeNodes: Math.round(lhr.audits?.['dom-size']?.numericValue ?? 0),
    networkRequests: (lhr.audits?.['network-requests']?.details?.items ?? []).length,
    transferSizeMB: round2(bytesTotal / (1024 * 1024)),
    mainThreadWorkSeconds: round2((lhr.audits?.['mainthread-work-breakdown']?.numericValue ?? 0) / 1000),
  };
}

export function buildSummary(
  score: number,
  device: Device,
  opportunities: Opportunity[]
): { sentence: string; boldValues: string[] } {
  const top = opportunities.slice(0, 2);
  const totalSavingsMs = opportunities.reduce((sum, o) => sum + o.savingsMs, 0);
  const totalSavingsDisplay = `~${(totalSavingsMs / 1000).toFixed(1)}s`;
  if (top.length === 0) {
    return {
      sentence: `This page scores **${score}** on ${device}. No major optimization opportunities were found.`,
      boldValues: [String(score)],
    };
  }
  const wins = top.map(o => o.title.charAt(0).toLowerCase() + o.title.slice(1)).join(' and ');
  return {
    sentence: `This page scores **${score}** on ${device}. The biggest wins are ${wins} — together an estimated **${totalSavingsDisplay}** faster load.`,
    boldValues: [String(score), totalSavingsDisplay],
  };
}

export function getLhrRuntimeError(lhr: any): string | null {
  const re = lhr?.runtimeError;
  if (re && re.code && re.code !== 'NO_ERROR') {
    return typeof re.message === 'string' && re.message.trim() ? re.message : `Lighthouse could not analyze this page (${re.code}).`;
  }
  return null;
}

export function mapLhrToAuditResult(lhr: any, url: string, device: Device): AuditResult {
  const pageUrl = typeof lhr.finalDisplayedUrl === 'string' ? lhr.finalDisplayedUrl : url;
  const score = Math.round((lhr.categories?.performance?.score ?? 0) * 100);
  const metrics = mapAllMetrics(lhr);
  const opportunities = mapOpportunities(lhr, pageUrl);
  const resources = mapResources(lhr);
  const diagnostics = mapDiagnostics(lhr);
  const { sentence, boldValues } = buildSummary(score, device, opportunities);
  const totalSavingsMs = opportunities.reduce((sum, o) => sum + o.savingsMs, 0);
  return {
    url,
    device,
    score,
    status: getScoreStatus(score),
    summarySentence: sentence,
    summaryBoldValues: boldValues,
    opportunitiesCount: opportunities.length,
    estimatedSavingsDisplay: `${(totalSavingsMs / 1000).toFixed(2)}s`,
    pageWeightMB: diagnostics.transferSizeMB,
    metrics,
    opportunities,
    resources,
    diagnostics,
    cwvVerdict: buildCwvVerdict(metrics),
    lighthouseVersion: lhr.lighthouseVersion ?? 'unknown',
    chromeVersion: lhr.environment?.hostUserAgent?.match(/Chrome\/([\d.]+)/)?.[1] ?? 'unknown',
    timestamp: Date.now(),
  };
}
