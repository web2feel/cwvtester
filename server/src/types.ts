export type Device = 'desktop' | 'mobile';
export type Status = 'good' | 'needs-improvement' | 'poor';
export type AuditJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface AuthConfig {
  type: 'basic';
  username: string;
  password: string;
}

export type DiagnosticStatus = Status | 'neutral';

export interface DiagnosticsStatuses {
  ttfb: DiagnosticStatus;
  tti: DiagnosticStatus;
  domSize: DiagnosticStatus;
  networkRequests: DiagnosticStatus;
  transferSize: DiagnosticStatus;
  mainThreadWork: DiagnosticStatus;
}

export interface CulpritItem {
  label: string;
  detail?: string;
  value?: string;
}

export interface MetricCulpritGroup {
  metricId: 'lcp' | 'cls' | 'tbt';
  metricLabel: string;
  items: CulpritItem[];
}

export interface CwvVerdict {
  passes: boolean;
  failing: string[];
  note: string;
}

export interface FilmstripFrame {
  timingMs: number;
  dataUri: string;
}

export interface MetricValue {
  id: 'lcp' | 'inp' | 'cls' | 'tbt' | 'si' | 'fcp';
  label: string;
  fullName: string;
  value: number;
  unit: string;
  displayValue: string;
  status: Status;
  goodThreshold: number;
  poorThreshold: number;
  /** Absent = measurable. false = lab runs cannot produce this metric (e.g. INP). */
  measurable?: boolean;
}

export interface Opportunity {
  id: string;
  title: string;
  subtitle: string;
  severity: 'high' | 'medium' | 'low';
  savingsMs: number;
  savingsDisplay: string;
  whyItHurts: string;
  estimatedImpact: string;
  affectedResources: { name: string; size: string }[];
  /** Metrics this fix improves, e.g. ['LCP', 'FCP']. From Lighthouse metricSavings. */
  affects?: string[];
  /** Set when the audit reports byte savings (may exist without ms savings). */
  savingsBytes?: number;
}

export interface ResourceRow {
  category: 'Images' | 'JavaScript' | 'Third-party' | 'CSS' | 'Fonts' | 'Other';
  resource: string;
  transferSize: string;
  transferBytes: number;
  loadContributionPct: number;
  optimization: string;
}

export interface DiagnosticsData {
  ttfbSeconds: number;
  ttiSeconds: number;
  domSizeNodes: number;
  networkRequests: number;
  transferSizeMB: number;
  mainThreadWorkSeconds: number;
  statuses?: DiagnosticsStatuses;
}

export interface AuditResult {
  url: string;
  device: Device;
  authUsed: 'basic' | null;
  score: number;
  status: Status;
  summarySentence: string;
  summaryBoldValues: string[];
  opportunitiesCount: number;
  estimatedSavingsDisplay: string;
  pageWeightMB: number;
  metrics: MetricValue[];
  opportunities: Opportunity[];
  resources: ResourceRow[];
  diagnostics: DiagnosticsData;
  cwvVerdict?: CwvVerdict;
  culprits?: MetricCulpritGroup[];
  filmstrip?: FilmstripFrame[];
  lighthouseVersion: string;
  chromeVersion: string;
  timestamp: number;
}

export interface AuditJobStatusResponse {
  status: AuditJobStatus;
  stage?: string;
  result?: AuditResult;
  error?: string;
}

export interface HistoryRun {
  id: string;
  url: string;
  device: Device;
  authUsed: 'basic' | null;
  createdAt: number;
  score: number;
  status: Status;
  lcp: number;
  inp: number;
  cls: number;
}
