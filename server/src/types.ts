export type Device = 'desktop' | 'mobile';
export type Status = 'good' | 'needs-improvement' | 'poor';
export type AuditJobStatus = 'queued' | 'running' | 'done' | 'error';

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
}

export interface AuditResult {
  url: string;
  device: Device;
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
  createdAt: number;
  score: number;
  status: Status;
  lcp: number;
  inp: number;
  cls: number;
}
