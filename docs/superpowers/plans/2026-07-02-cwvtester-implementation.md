# Core Web Vitals Tester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Node.js web app that runs a real Lighthouse performance audit against a URL and presents it as the polished dashboard specified in `README.md` / `Core Web Vitals Tester.dc.html`, plus an audit history view with a score trend chart.

**Architecture:** npm workspaces monorepo with two packages — `server` (Express + TypeScript + better-sqlite3 + chrome-launcher + lighthouse, running as one long-lived local process with an in-memory job map for async audit polling) and `client` (Vite + React + TypeScript + Tailwind CSS, an SPA with `dashboard`/`history` views). The Vite dev server proxies `/api/*` to the Express server.

**Tech Stack:** TypeScript everywhere. Server: Express 4, better-sqlite3, chrome-launcher, lighthouse, Vitest. Client: React 18, Vite 5, Tailwind CSS 3.

## Global Constraints

- Node v24 / npm 11 and a real Chrome install are confirmed present on this machine — the audit runner uses real `chrome-launcher` + `lighthouse`, not a mock.
- Design tokens (colors, spacing, radii, fonts) must match `README.md`'s "Design Tokens" section exactly — see `docs/superpowers/specs/2026-07-02-cwvtester-design.md`.
- Per the spec's real-data-only decision: the opportunity accordion has exactly 2 expanded fields ("Why it hurts", "Estimated impact") — do NOT add "Likely cause" or "Recommended fix". The "Prioritized recommendations" section from the mock is dropped entirely — do NOT build a `RecommendationsList` component.
- Status thresholds: LCP 2.5s/4s (2500/4000ms) · INP 200ms/500ms · CLS 0.1/0.25 · TBT 200ms/600ms (200/600ms) · SI 3.4s/5.8s (3400/5800ms) · FCP 1.8s/3s (1800/3000ms). Overall score bands: ≥90 good, ≥50 needs-improvement, else poor.
- No component-level UI test suite (per spec) — verify the frontend by running the dev servers and checking in a browser against `Core Web Vitals Tester.dc.html`.
- Don't add a shared types package — `server/src/types.ts` and `client/src/types.ts` are separately maintained, kept in sync by hand (YAGNI: two workspaces don't justify a third shared package for this scope).

---

### Task 1: Root workspace scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore`

**Interfaces:**
- Produces: npm workspaces `server` and `client` (created in Tasks 2 and 6), a root `npm run dev` that runs both concurrently, root `npm run typecheck`/`npm run test`/`npm run build`.

- [ ] **Step 1: Create the root `package.json`**

```json
{
  "name": "cwvtester",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm run dev -w server\" \"npm run dev -w client\"",
    "build": "npm run build -w server && npm run build -w client",
    "typecheck": "npm run typecheck -w server && npm run typecheck -w client",
    "test": "npm run test -w server"
  },
  "devDependencies": {
    "concurrently": "^9.0.1"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
server/data/*.sqlite
.env
*.log
```

- [ ] **Step 3: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold root npm workspace"
```

---

### Task 2: Server scaffolding + SQLite persistence

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/db.ts`

**Interfaces:**
- Consumes: nothing (first server file).
- Produces (used by Tasks 4 and 5):
  - `insertAudit(id: string, url: string, device: string, createdAt: number): void`
  - `updateStage(id: string, stage: string): void`
  - `completeAudit(id: string, resultJson: string, finishedAt: number): void`
  - `failAudit(id: string, error: string, finishedAt: number): void`
  - `getAudit(id: string): AuditRow | undefined`
  - `listAuditsForUrl(url: string): AuditRow[]`
  - `mostRecentUrl(): string | undefined`
  - `interface AuditRow { id: string; url: string; device: string; status: string; stage: string | null; created_at: number; finished_at: number | null; error: string | null; result_json: string | null }`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "server",
  "version": "0.0.1",
  "private": true,
  "type": "commonjs",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "chrome-launcher": "^1.1.2",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "lighthouse": "^12.2.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^22.7.4",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `server/src/db.ts`**

```ts
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'db.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS audits (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    device TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT,
    created_at INTEGER NOT NULL,
    finished_at INTEGER,
    error TEXT,
    result_json TEXT
  )
`);

export interface AuditRow {
  id: string;
  url: string;
  device: string;
  status: string;
  stage: string | null;
  created_at: number;
  finished_at: number | null;
  error: string | null;
  result_json: string | null;
}

export function insertAudit(id: string, url: string, device: string, createdAt: number): void {
  db.prepare(
    `INSERT INTO audits (id, url, device, status, stage, created_at) VALUES (?, ?, ?, 'queued', 'Launching Chrome…', ?)`
  ).run(id, url, device, createdAt);
}

export function updateStage(id: string, stage: string): void {
  db.prepare(`UPDATE audits SET status = 'running', stage = ? WHERE id = ?`).run(stage, id);
}

export function completeAudit(id: string, resultJson: string, finishedAt: number): void {
  db.prepare(
    `UPDATE audits SET status = 'done', stage = NULL, result_json = ?, finished_at = ? WHERE id = ?`
  ).run(resultJson, finishedAt, id);
}

export function failAudit(id: string, error: string, finishedAt: number): void {
  db.prepare(
    `UPDATE audits SET status = 'error', stage = NULL, error = ?, finished_at = ? WHERE id = ?`
  ).run(error, finishedAt, id);
}

export function getAudit(id: string): AuditRow | undefined {
  return db.prepare(`SELECT * FROM audits WHERE id = ?`).get(id) as AuditRow | undefined;
}

export function listAuditsForUrl(url: string): AuditRow[] {
  return db
    .prepare(`SELECT * FROM audits WHERE url = ? AND status = 'done' ORDER BY created_at DESC`)
    .all(url) as AuditRow[];
}

export function mostRecentUrl(): string | undefined {
  const row = db
    .prepare(`SELECT url FROM audits WHERE status = 'done' ORDER BY created_at DESC LIMIT 1`)
    .get() as { url: string } | undefined;
  return row?.url;
}
```

- [ ] **Step 4: Install dependencies and verify the TypeScript build has no errors**

Run: `cd server && npm install && npx tsc --noEmit`
Expected: exits 0, no output (db.ts has no other files importing it yet, so this only checks db.ts compiles standalone — that's fine since `include: ["src"]` and no other files exist yet).

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/tsconfig.json server/src/db.ts server/package-lock.json
git commit -m "feat(server): scaffold Express/TS workspace with SQLite persistence"
```

---

### Task 3: Shared server types + Lighthouse→UI mapping (with unit tests)

**Files:**
- Create: `server/src/types.ts`
- Create: `server/src/mapping.ts`
- Create: `server/test/mapping.test.ts`
- Modify: `server/package.json` (add `vitest.config.ts` reference is unnecessary; vitest works zero-config for a `test/` dir)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 4's runner and Task 5's routes):
  - Types: `Device`, `Status`, `AuditJobStatus`, `MetricValue`, `Opportunity`, `ResourceRow`, `DiagnosticsData`, `AuditResult`, `AuditJobStatusResponse`, `HistoryRun` (see code below for exact shape).
  - Functions: `getMetricStatus(id, value): Status`, `getScoreStatus(score): Status`, `mapAllMetrics(lhr): MetricValue[]`, `mapOpportunities(lhr): Opportunity[]`, `mapResources(lhr): ResourceRow[]`, `mapDiagnostics(lhr): DiagnosticsData`, `buildSummary(score, device, opportunities): { sentence: string; boldValues: string[] }`, `mapLhrToAuditResult(lhr, url, device): AuditResult`.

- [ ] **Step 1: Create `server/src/types.ts`**

```ts
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
```

- [ ] **Step 2: Create `server/src/mapping.ts`**

```ts
import type { AuditResult, Device, DiagnosticsData, MetricValue, Opportunity, ResourceRow, Status } from './types';

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

export function mapMetric(lhr: any, id: MetricValue['id']): MetricValue {
  const meta = METRIC_META[id];
  const audit = lhr.audits[meta.auditKey];
  const value = (audit?.numericValue as number) ?? 0;
  const { display, unit } = parseDisplayValue(audit?.displayValue ?? String(value));
  const t = METRIC_THRESHOLDS[id];
  return {
    id,
    label: meta.label,
    fullName: meta.fullName,
    value,
    unit,
    displayValue: display,
    status: getMetricStatus(id, value),
    goodThreshold: t.good,
    poorThreshold: t.poor,
  };
}

export function mapAllMetrics(lhr: any): MetricValue[] {
  return (['lcp', 'inp', 'cls', 'tbt', 'si', 'fcp'] as const).map(id => mapMetric(lhr, id));
}

function getSeverity(savingsMs: number): 'high' | 'medium' | 'low' {
  if (savingsMs >= 800) return 'high';
  if (savingsMs >= 300) return 'medium';
  return 'low';
}

export function mapOpportunities(lhr: any): Opportunity[] {
  const opportunities: Opportunity[] = [];
  for (const [id, audit] of Object.entries<any>(lhr.audits ?? {})) {
    const details = audit?.details;
    if (!details || details.type !== 'opportunity') continue;
    const savingsMs = Math.round(details.overallSavingsMs ?? 0);
    if (savingsMs <= 0) continue;
    const items: any[] = Array.isArray(details.items) ? details.items : [];
    const affectedResources = items.slice(0, 5).map((item: any) => {
      let name = 'resource';
      if (item.url) {
        try {
          name = new URL(item.url).pathname.split('/').filter(Boolean).pop() || item.url;
        } catch {
          name = item.url;
        }
      }
      return { name, size: item.totalBytes ? formatBytes(item.totalBytes) : '' };
    });
    const description = stripMarkdownLinks(audit.description ?? '');
    const firstSentence = description.split('. ')[0];
    opportunities.push({
      id,
      title: audit.title,
      subtitle: firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`,
      severity: getSeverity(savingsMs),
      savingsMs,
      savingsDisplay: `−${(savingsMs / 1000).toFixed(2)}s`,
      whyItHurts: description,
      estimatedImpact: `~${(savingsMs / 1000).toFixed(2)}s faster ${METRIC_FOR_AUDIT[id] ?? 'load time'}.`,
      affectedResources,
    });
  }
  return opportunities.sort((a, b) => b.savingsMs - a.savingsMs);
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

export function mapLhrToAuditResult(lhr: any, url: string, device: Device): AuditResult {
  const score = Math.round((lhr.categories?.performance?.score ?? 0) * 100);
  const metrics = mapAllMetrics(lhr);
  const opportunities = mapOpportunities(lhr);
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
    lighthouseVersion: lhr.lighthouseVersion ?? 'unknown',
    chromeVersion: lhr.environment?.hostUserAgent?.match(/Chrome\/([\d.]+)/)?.[1] ?? 'unknown',
    timestamp: Date.now(),
  };
}
```

- [ ] **Step 3: Write `server/test/mapping.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { getMetricStatus, getScoreStatus, mapOpportunities } from '../src/mapping';

describe('getMetricStatus', () => {
  it('classifies LCP against the 2.5s/4s thresholds', () => {
    expect(getMetricStatus('lcp', 2000)).toBe('good');
    expect(getMetricStatus('lcp', 3000)).toBe('needs-improvement');
    expect(getMetricStatus('lcp', 5000)).toBe('poor');
  });

  it('classifies CLS against the 0.1/0.25 thresholds', () => {
    expect(getMetricStatus('cls', 0.05)).toBe('good');
    expect(getMetricStatus('cls', 0.2)).toBe('needs-improvement');
    expect(getMetricStatus('cls', 0.3)).toBe('poor');
  });
});

describe('getScoreStatus', () => {
  it('classifies score bands at 90/50', () => {
    expect(getScoreStatus(95)).toBe('good');
    expect(getScoreStatus(64)).toBe('needs-improvement');
    expect(getScoreStatus(30)).toBe('poor');
  });
});

describe('mapOpportunities', () => {
  it('extracts opportunity-type audits, sorted by savings, and ignores non-opportunities', () => {
    const lhr = {
      audits: {
        'render-blocking-resources': {
          title: 'Eliminate render-blocking resources',
          description: 'These resources are blocking the first paint of your page. Consider delivering critical JS/CSS inline.',
          details: {
            type: 'opportunity',
            overallSavingsMs: 1200,
            items: [{ url: 'https://example.com/main.css', totalBytes: 49152 }],
          },
        },
        'unused-css-rules': {
          title: 'Remove unused CSS',
          description: 'Reduce unused rules from stylesheets to decrease bytes consumed by network activity.',
          details: { type: 'opportunity', overallSavingsMs: 200, items: [] },
        },
        'not-an-opportunity': {
          title: 'Some diagnostic',
          description: 'Not an opportunity.',
          details: { type: 'table', overallSavingsMs: 999999, items: [] },
        },
        'zero-savings': {
          title: 'Zero savings opportunity',
          description: 'Should be excluded.',
          details: { type: 'opportunity', overallSavingsMs: 0, items: [] },
        },
      },
    };

    const result = mapOpportunities(lhr as any);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('render-blocking-resources');
    expect(result[0].severity).toBe('high');
    expect(result[0].savingsDisplay).toBe('−1.20s');
    expect(result[0].affectedResources).toEqual([{ name: 'main.css', size: '48 KB' }]);
    expect(result[1].id).toBe('unused-css-rules');
    expect(result[1].severity).toBe('low');
  });
});
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd server && npx vitest run`
Expected: `3 passed` (or similar), 0 failed.

- [ ] **Step 5: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/types.ts server/src/mapping.ts server/test/mapping.test.ts
git commit -m "feat(server): add Lighthouse-to-UI mapping with unit tests"
```

---

### Task 4: Audit runner (chrome-launcher + lighthouse)

**Files:**
- Create: `server/src/runner.ts`

**Interfaces:**
- Consumes: `insertAudit`, `updateStage`, `completeAudit`, `failAudit` from `./db` (Task 2); `mapLhrToAuditResult` from `./mapping` (Task 3); `Device`, `AuditJobStatus` from `./types` (Task 3).
- Produces (used by Task 5's routes): `startAudit(url: string, device: Device): string` (returns a new audit id and kicks off the async job), `getJob(id: string): { status: AuditJobStatus; stage?: string; error?: string } | undefined`.

- [ ] **Step 1: Create `server/src/runner.ts`**

```ts
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { randomUUID } from 'node:crypto';
import { completeAudit, failAudit, insertAudit, updateStage } from './db';
import { mapLhrToAuditResult } from './mapping';
import type { AuditJobStatus, Device } from './types';

interface Job {
  status: AuditJobStatus;
  stage?: string;
  error?: string;
}

const jobs = new Map<string, Job>();

const LIGHTHOUSE_CONFIG: Record<Device, any> = {
  mobile: {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
    },
  },
  desktop: {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'desktop',
      screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    },
  },
};

export function startAudit(url: string, device: Device): string {
  const id = randomUUID();
  const createdAt = Date.now();
  insertAudit(id, url, device, createdAt);
  jobs.set(id, { status: 'queued', stage: 'Launching Chrome…' });
  void runAudit(id, url, device);
  return id;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

async function runAudit(id: string, url: string, device: Device): Promise<void> {
  jobs.set(id, { status: 'running', stage: 'Launching Chrome…' });
  updateStage(id, 'Launching Chrome…');

  let chrome: chromeLauncher.LaunchedChrome;
  try {
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
  } catch {
    fail(id, 'Failed to launch Chrome. Confirm Chrome/Chromium is installed on this machine.');
    return;
  }

  try {
    jobs.set(id, { status: 'running', stage: 'Loading page…' });
    updateStage(id, 'Loading page…');

    jobs.set(id, { status: 'running', stage: 'Running Lighthouse…' });
    updateStage(id, 'Running Lighthouse…');
    const runnerResult = await lighthouse(url, { port: chrome.port, output: 'json' }, LIGHTHOUSE_CONFIG[device]);
    if (!runnerResult?.lhr) throw new Error('Lighthouse produced no report.');

    jobs.set(id, { status: 'running', stage: 'Analyzing performance…' });
    updateStage(id, 'Analyzing performance…');

    jobs.set(id, { status: 'running', stage: 'Generating report…' });
    updateStage(id, 'Generating report…');
    const result = mapLhrToAuditResult(runnerResult.lhr, url, device);

    completeAudit(id, JSON.stringify(result), Date.now());
    jobs.set(id, { status: 'done' });
  } catch (err) {
    fail(id, classifyError(err, url));
  } finally {
    await chrome.kill();
  }
}

function fail(id: string, message: string): void {
  failAudit(id, message, Date.now());
  jobs.set(id, { status: 'error', error: message });
}

function classifyError(err: unknown, url: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('ENOTFOUND') || message.includes('ERR_NAME_NOT_RESOLVED')) {
    return `Could not reach ${url}. Check the URL and try again.`;
  }
  if (message.includes('ERR_CONNECTION_REFUSED')) {
    return `Connection refused by ${url}.`;
  }
  if (message.toLowerCase().includes('timeout')) {
    return 'The audit timed out. The site may be too slow to respond.';
  }
  return `Lighthouse failed: ${message}`;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: exits 0, no errors. (`chrome-launcher`'s `LaunchedChrome` type and `lighthouse`'s default export must resolve — if TS complains about missing types for `lighthouse`, add `"skipLibCheck": true` is already set in tsconfig, which should suffice; lighthouse ships its own `.d.ts`.)

- [ ] **Step 3: Manual smoke test — run one real audit end to end from a script**

Run:
```bash
cd server && node -e "
require('tsx/cjs');
const { startAudit, getJob } = require('./src/runner.ts');
const id = startAudit('https://example.com', 'mobile');
console.log('started', id);
const interval = setInterval(() => {
  const job = getJob(id);
  console.log(job);
  if (job.status === 'done' || job.status === 'error') { clearInterval(interval); process.exit(0); }
}, 1000);
"
```
Expected: prints stage transitions ending in `{ status: 'done' }` within roughly 10-30 seconds (real Chrome launch + Lighthouse run against example.com). If it prints `{ status: 'error', error: '...' }`, read the message — a Chrome launch failure here means Task 5+ manual verification will also fail, so resolve it now (e.g. confirm `/Applications/Google Chrome.app` exists, or set `CHROME_PATH` env var chrome-launcher respects).

- [ ] **Step 4: Commit**

```bash
git add server/src/runner.ts
git commit -m "feat(server): add real Lighthouse audit runner with stage tracking"
```

---

### Task 5: Express app + API routes

**Files:**
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`

**Interfaces:**
- Consumes: `getAudit`, `listAuditsForUrl`, `mostRecentUrl` from `./db`; `getJob`, `startAudit` from `./runner`; `AuditJobStatusResponse`, `AuditResult`, `Device`, `HistoryRun` from `./types`.
- Produces: the HTTP API the client (Task 7) calls — `POST /api/audits`, `GET /api/audits/:id`, `GET /api/audits/:id/full`, `GET /api/audits`.

- [ ] **Step 1: Create `server/src/app.ts`**

```ts
import cors from 'cors';
import express from 'express';
import { getAudit, listAuditsForUrl, mostRecentUrl } from './db';
import { getJob, startAudit } from './runner';
import type { AuditJobStatusResponse, AuditResult, Device, HistoryRun } from './types';

const app = express();
app.use(cors());
app.use(express.json());

function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

app.post('/api/audits', (req, res) => {
  const { url, device } = req.body ?? {};
  if (!isValidUrl(url)) {
    res.status(400).json({ error: 'A valid http(s) URL is required.' });
    return;
  }
  const normalizedDevice: Device = device === 'desktop' ? 'desktop' : 'mobile';
  const id = startAudit(url, normalizedDevice);
  res.status(201).json({ id });
});

app.get('/api/audits/:id', (req, res) => {
  const row = getAudit(req.params.id);
  if (!row) {
    res.status(404).json({ error: 'Unknown audit id.' });
    return;
  }
  const job = getJob(req.params.id);
  const response: AuditJobStatusResponse = {
    status: (job?.status ?? row.status) as AuditJobStatusResponse['status'],
    stage: job?.stage ?? row.stage ?? undefined,
    error: row.error ?? job?.error ?? undefined,
    result: row.result_json ? (JSON.parse(row.result_json) as AuditResult) : undefined,
  };
  res.json(response);
});

app.get('/api/audits/:id/full', (req, res) => {
  const row = getAudit(req.params.id);
  if (!row || !row.result_json) {
    res.status(404).json({ error: 'No completed result for this audit id.' });
    return;
  }
  res.json(JSON.parse(row.result_json) as AuditResult);
});

app.get('/api/audits', (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : mostRecentUrl();
  if (!url) {
    res.json({ url: null, runs: [] });
    return;
  }
  const rows = listAuditsForUrl(url);
  const runs: HistoryRun[] = rows.map(row => {
    const result = JSON.parse(row.result_json!) as AuditResult;
    const lcp = result.metrics.find(m => m.id === 'lcp')?.value ?? 0;
    const inp = result.metrics.find(m => m.id === 'inp')?.value ?? 0;
    const cls = result.metrics.find(m => m.id === 'cls')?.value ?? 0;
    return {
      id: row.id,
      url: row.url,
      device: row.device as Device,
      createdAt: row.created_at,
      score: result.score,
      status: result.status,
      lcp,
      inp,
      cls,
    };
  });
  res.json({ url, runs });
});

export default app;
```

- [ ] **Step 2: Create `server/src/index.ts`**

```ts
import app from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.listen(PORT, () => {
  console.log(`Core Web Vitals Tester API listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 4: Start the server and manually verify the full API loop against a real URL**

Run: `cd server && npm run dev` (leave running)

In another terminal:
```bash
curl -s -X POST http://localhost:3001/api/audits -H 'Content-Type: application/json' -d '{"url":"https://example.com","device":"mobile"}'
```
Expected: `{"id":"<uuid>"}`.

```bash
curl -s http://localhost:3001/api/audits/<uuid>
```
Expected: initially `{"status":"running","stage":"Launching Chrome…"}` or similar; poll again after ~15-30s and expect `{"status":"done","result":{...}}` with a populated `AuditResult`.

```bash
curl -s http://localhost:3001/api/audits
```
Expected: `{"url":"https://example.com","runs":[{...}]}` with one run.

```bash
curl -s http://localhost:3001/api/audits/<uuid>/full
```
Expected: the full `AuditResult` JSON.

Stop the dev server (Ctrl+C) once verified.

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts server/src/index.ts
git commit -m "feat(server): add Express API routes for the async audit job flow"
```

---

### Task 6: Client scaffolding (Vite + React + TS + Tailwind)

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/tsconfig.node.json`
- Create: `client/vite.config.ts`
- Create: `client/tailwind.config.ts`
- Create: `client/postcss.config.js`
- Create: `client/index.html`
- Create: `client/src/index.css`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx` (placeholder, replaced fully in Task 18)

**Interfaces:**
- Consumes: nothing (first client files).
- Produces: the Vite dev server on port 5173 proxying `/api` to `http://localhost:3001`; the Tailwind theme tokens (`brand`, `surface`, `border`, `text`, `good`, `warn`, `bad`, `selection` colors; `pill` radius; `card`/`button`/`tooltip` shadows; `fadeIn`/`fadeInFast` animations; `content` max-width) used by every component task from here on.

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.6"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `client/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `client/vite.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 5: Create `client/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: { DEFAULT: '#e35a2a', dark: '#cc4d20', tint: '#fff1ea', tintBorder: '#fed7c3', tintText: '#c2410c' },
        surface: { page: '#fafafa', card: '#ffffff', muted: '#fafafa', muted2: '#f7f7f8', muted3: '#f0f0f1' },
        border: { card: '#ececec', inner: '#f4f4f5', control: '#e4e4e7', diag: '#eaeaeb' },
        text: {
          primary: '#18181b',
          secondary: '#3f3f46',
          tertiary: '#52525b',
          muted: '#71717a',
          faint: '#a1a1aa',
          faintest: '#c4c4c8',
        },
        good: { text: '#15803d', dot: '#16a34a', bg: '#ecfdf3', border: '#bbf7d0' },
        warn: { text: '#b45309', dot: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
        bad: { text: '#b91c1c', dot: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
        selection: '#fbd9c9',
      },
      borderRadius: { pill: '999px' },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04)',
        button: '0 1px 2px rgba(227,90,42,0.35)',
        tooltip: '0 12px 32px rgba(0,0,0,0.28)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.18s ease',
        fadeInFast: 'fadeIn 0.12s ease',
      },
      maxWidth: { content: '1160px' },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 6: Create `client/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 7: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <title>Core Web Vitals Tester</title>
  </head>
  <body class="bg-surface-page font-sans text-text-primary antialiased selection:bg-selection">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `client/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: Create a placeholder `client/src/App.tsx`** (replaced fully in Task 18)

```tsx
export default function App() {
  return <div className="p-8 text-text-primary">Core Web Vitals Tester — scaffolding in progress.</div>;
}
```

- [ ] **Step 10: Create `client/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 11: Install dependencies and verify the dev server boots**

Run: `cd client && npm install && npm run dev` (then Ctrl+C once you see "Local: http://localhost:5173/")
Expected: Vite prints a local URL with no errors. Open it in a browser and confirm the placeholder text renders with Geist font applied (check via browser devtools computed font-family).

- [ ] **Step 12: Commit**

```bash
git add client/
git commit -m "feat(client): scaffold Vite/React/TS workspace with Tailwind design tokens"
```

---

### Task 7: Client types + API/polling library + formatting helpers

**Files:**
- Create: `client/src/types.ts`
- Create: `client/src/lib/api.ts`
- Create: `client/src/lib/format.ts`

**Interfaces:**
- Consumes: nothing new (mirrors server's `types.ts` from Task 3 — kept in sync by hand per the Global Constraints).
- Produces (used by every component/view task from here on):
  - Types: same shapes as `server/src/types.ts`.
  - `submitAudit(url: string, device: Device): Promise<string>`
  - `fetchAuditStatus(id: string): Promise<AuditJobStatusResponse>`
  - `fetchAuditFull(id: string): Promise<AuditResult>`
  - `fetchHistory(url?: string): Promise<{ url: string | null; runs: HistoryRun[] }>`
  - `usePollAudit(id: string | null): AuditJobStatusResponse | null`
  - `formatRelativeTime(timestamp: number): string`
  - `formatDate(timestamp: number): string`
  - `statusLabel(status: Status): string`
  - `renderBoldSentence(sentence: string): { text: string; bold: boolean }[]`
  - `markerPercent(value: number, good: number, poor: number): number`

- [ ] **Step 1: Create `client/src/types.ts`** (identical shape to `server/src/types.ts`)

```ts
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
```

- [ ] **Step 2: Create `client/src/lib/api.ts`**

```ts
import { useEffect, useRef, useState } from 'react';
import type { AuditJobStatusResponse, AuditResult, Device, HistoryRun } from '../types';

const BASE = '/api';

export async function submitAudit(url: string, device: Device): Promise<string> {
  const res = await fetch(`${BASE}/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, device }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to start audit.');
  }
  const body = await res.json();
  return body.id as string;
}

export async function fetchAuditStatus(id: string): Promise<AuditJobStatusResponse> {
  const res = await fetch(`${BASE}/audits/${id}`);
  if (!res.ok) throw new Error('Audit not found.');
  return res.json();
}

export async function fetchAuditFull(id: string): Promise<AuditResult> {
  const res = await fetch(`${BASE}/audits/${id}/full`);
  if (!res.ok) throw new Error('Failed to load this run.');
  return res.json();
}

export async function fetchHistory(url?: string): Promise<{ url: string | null; runs: HistoryRun[] }> {
  const query = url ? `?url=${encodeURIComponent(url)}` : '';
  const res = await fetch(`${BASE}/audits${query}`);
  if (!res.ok) throw new Error('Failed to load history.');
  return res.json();
}

export function usePollAudit(id: string | null): AuditJobStatusResponse | null {
  const [status, setStatus] = useState<AuditJobStatusResponse | null>(null);
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    if (!id) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await fetchAuditStatus(id);
        if (cancelled || idRef.current !== id) return;
        setStatus(result);
        if (result.status === 'queued' || result.status === 'running') {
          setTimeout(poll, 1000);
        }
      } catch (err) {
        if (!cancelled) setStatus({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return status;
}
```

- [ ] **Step 3: Create `client/src/lib/format.ts`**

```ts
import type { Status } from '../types';

export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function statusLabel(status: Status): string {
  if (status === 'good') return 'Good';
  if (status === 'needs-improvement') return 'Needs Improvement';
  return 'Poor';
}

export function renderBoldSentence(sentence: string): { text: string; bold: boolean }[] {
  return sentence.split('**').map((chunk, i) => ({ text: chunk, bold: i % 2 === 1 }));
}

export function markerPercent(value: number, good: number, poor: number): number {
  if (value <= good) return (value / good) * 40;
  if (value <= poor) return 40 + ((value - good) / (poor - good)) * 30;
  const overshoot = Math.min(1, (value - poor) / poor);
  return 70 + overshoot * 30;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/types.ts client/src/lib/
git commit -m "feat(client): add types, API/polling hook, and formatting helpers"
```

---

### Task 8: Header component

**Files:**
- Create: `client/src/components/Header.tsx`

**Interfaces:**
- Consumes: no props from other components; takes `view`, `onGoDashboard`, `onGoHistory` (wired in Task 18).
- Produces: `Header` component used by `App.tsx` (Task 18).

- [ ] **Step 1: Create `client/src/components/Header.tsx`**

```tsx
interface HeaderProps {
  view: 'dashboard' | 'history';
  onGoDashboard: () => void;
  onGoHistory: () => void;
}

export function Header({ view, onGoDashboard, onGoHistory }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border-card bg-[rgba(250,250,250,0.82)] backdrop-blur-md backdrop-saturate-[1.8]">
      <div className="mx-auto flex h-[60px] max-w-content items-center justify-between gap-5 px-6">
        <div onClick={onGoDashboard} className="flex cursor-pointer items-center gap-[11px]">
          <div className="flex h-[30px] w-[30px] items-end justify-center gap-[2.5px] rounded-[9px] bg-brand px-1.5 py-[7px] shadow-[0_1px_2px_rgba(227,90,42,0.4)]">
            <span className="h-[7px] w-[3px] rounded-sm bg-white opacity-70" />
            <span className="h-[12px] w-[3px] rounded-sm bg-white" />
            <span className="h-[9px] w-[3px] rounded-sm bg-white opacity-85" />
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Core Web Vitals Tester</span>
          <span className="rounded-pill border border-border-control px-[7px] py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-faint">
            Beta
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onGoHistory}
            className={
              view === 'history'
                ? 'rounded-lg bg-brand-tint px-3 py-2 text-[13px] font-semibold text-brand-tintText'
                : 'rounded-lg px-3 py-2 text-[13px] font-medium text-text-muted hover:bg-surface-muted3 hover:text-text-primary'
            }
          >
            History
          </button>
          <button className="flex items-center gap-[7px] rounded-[9px] border border-border-control bg-white px-3.5 py-2 text-[13px] font-semibold text-text-primary shadow-card hover:border-[#d4d4d8] hover:bg-surface-muted">
            Export report
            <span className="text-[10px] text-text-faint">▾</span>
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0 (unused-file warnings don't occur since nothing imports it yet, and TS with `noEmit` doesn't flag unused exports).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Header.tsx
git commit -m "feat(client): add Header component"
```

---

### Task 9: AuditForm component

**Files:**
- Create: `client/src/components/AuditForm.tsx`

**Interfaces:**
- Consumes: `Device` type from `../types` (Task 7).
- Produces: `AuditForm` component with props `{ device: Device; onDeviceChange: (device: Device) => void; onSubmit: (url: string) => void; disabled: boolean }`, used by `Dashboard.tsx` (Task 16).

- [ ] **Step 1: Create `client/src/components/AuditForm.tsx`**

```tsx
import { FormEvent, useState } from 'react';
import type { Device } from '../types';

interface AuditFormProps {
  device: Device;
  onDeviceChange: (device: Device) => void;
  onSubmit: (url: string) => void;
  disabled: boolean;
}

export function AuditForm({ device, onDeviceChange, onSubmit, disabled }: AuditFormProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    onSubmit(withProtocol);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-border-card bg-white p-[18px_20px] shadow-card"
    >
      <div className="relative flex min-w-[280px] flex-1 items-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="absolute left-3.5 opacity-50">
          <circle cx="12" cy="12" r="9" stroke="#71717a" strokeWidth="1.8" />
          <path
            d="M3 12h18M12 3c2.5 2.4 3.8 5.6 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3Z"
            stroke="#71717a"
            strokeWidth="1.6"
          />
        </svg>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          disabled={disabled}
          className="h-11 w-full rounded-[11px] border border-border-control pl-10 pr-3.5 font-mono text-sm text-text-primary outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgba(227,90,42,0.12)] disabled:opacity-60"
        />
      </div>

      <div className="relative inline-flex rounded-[11px] bg-surface-muted3 p-1">
        <div
          className="absolute top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-all duration-200"
          style={{ left: device === 'desktop' ? 4 : undefined, right: device === 'mobile' ? 4 : undefined }}
        />
        <button
          type="button"
          onClick={() => onDeviceChange('desktop')}
          className={`relative z-10 rounded-lg px-[18px] py-2 text-[13px] ${
            device === 'desktop' ? 'font-semibold text-text-primary' : 'font-medium text-text-tertiary'
          }`}
        >
          Desktop
        </button>
        <button
          type="button"
          onClick={() => onDeviceChange('mobile')}
          className={`relative z-10 rounded-lg px-[18px] py-2 text-[13px] ${
            device === 'mobile' ? 'font-semibold text-text-primary' : 'font-medium text-text-tertiary'
          }`}
        >
          Mobile
        </button>
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="flex h-11 items-center gap-2 rounded-[11px] bg-brand px-6 text-sm font-semibold text-white shadow-button hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M8 5v14l11-7z" fill="#fff" />
        </svg>
        Run Audit
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AuditForm.tsx
git commit -m "feat(client): add AuditForm component with device toggle"
```

---

### Task 10: ScoreGauge component

**Files:**
- Create: `client/src/components/ScoreGauge.tsx`

**Interfaces:**
- Consumes: `Status` type from `../types` (Task 7).
- Produces: `ScoreGauge` component with props `{ score: number; status: Status }`, used by `SummaryHero.tsx` (Task 11).

- [ ] **Step 1: Create `client/src/components/ScoreGauge.tsx`**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ScoreGauge.tsx
git commit -m "feat(client): add ScoreGauge with count-up animation"
```

---

### Task 11: SummaryHero component

**Files:**
- Create: `client/src/components/SummaryHero.tsx`

**Interfaces:**
- Consumes: `AuditResult` type from `../types` (Task 7); `renderBoldSentence` from `../lib/format` (Task 7); `ScoreGauge` from `./ScoreGauge` (Task 10).
- Produces: `SummaryHero` component with props `{ result: AuditResult }`, used by `Dashboard.tsx` (Task 16).

- [ ] **Step 1: Create `client/src/components/SummaryHero.tsx`**

```tsx
import { renderBoldSentence } from '../lib/format';
import type { AuditResult } from '../types';
import { ScoreGauge } from './ScoreGauge';

interface SummaryHeroProps {
  result: AuditResult;
}

export function SummaryHero({ result }: SummaryHeroProps) {
  const sentenceParts = renderBoldSentence(result.summarySentence);
  return (
    <div className="mt-[34px] grid grid-cols-[minmax(260px,320px)_1fr] items-center gap-8 rounded-[20px] border border-border-card bg-white p-[34px] shadow-card max-md:grid-cols-1">
      <ScoreGauge score={result.score} status={result.status} />
      <div>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-faint">Summary</div>
        <p className="mb-6 max-w-[540px] text-[19px] leading-[1.55] text-text-secondary">
          {sentenceParts.map((part, i) =>
            part.bold ? (
              <b key={i} className="font-semibold text-text-primary">
                {part.text}
              </b>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </p>
        <div className="grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
          <div className="rounded-xl border border-surface-muted3 bg-surface-muted p-[14px_16px]">
            <div className="font-mono text-2xl font-semibold tracking-[-0.02em]">{result.opportunitiesCount}</div>
            <div className="mt-0.5 text-xs text-text-muted">Opportunities</div>
          </div>
          <div className="rounded-xl border border-surface-muted3 bg-surface-muted p-[14px_16px]">
            <div className="font-mono text-2xl font-semibold tracking-[-0.02em] text-good-dot">
              {result.estimatedSavingsDisplay}
            </div>
            <div className="mt-0.5 text-xs text-text-muted">Est. total savings</div>
          </div>
          <div className="rounded-xl border border-surface-muted3 bg-surface-muted p-[14px_16px]">
            <div className="font-mono text-2xl font-semibold tracking-[-0.02em]">
              {result.pageWeightMB.toFixed(1)}
              <span className="text-sm text-text-faint"> MB</span>
            </div>
            <div className="mt-0.5 text-xs text-text-muted">Page weight</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/SummaryHero.tsx
git commit -m "feat(client): add SummaryHero component"
```

---

### Task 12: MetricCard + MetricsGrid components

**Files:**
- Create: `client/src/components/MetricCard.tsx`
- Create: `client/src/components/MetricsGrid.tsx`

**Interfaces:**
- Consumes: `MetricValue`, `AuditResult` types from `../types` (Task 7); `statusLabel`, `markerPercent` from `../lib/format` (Task 7).
- Produces: `MetricCard` (props `{ metric: MetricValue }`) and `MetricsGrid` (props `{ result: AuditResult }`), used by `Dashboard.tsx` (Task 16).

- [ ] **Step 1: Create `client/src/components/MetricCard.tsx`**

```tsx
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
        <span className="font-mono text-4xl font-semibold leading-none tracking-[-0.03em]">{metric.displayValue}</span>
        {metric.unit && <span className="font-mono text-base text-text-faint">{metric.unit}</span>}
      </div>
      <div
        className="mb-3.5 inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold"
        style={{ background: pill.bg, borderColor: pill.border, color: pill.text }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: pill.dot }} />
        {statusLabel(metric.status)}
      </div>
      <div className="mb-[18px] text-[12.5px] leading-tight text-text-muted">{metric.fullName}</div>
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
```

- [ ] **Step 2: Create `client/src/components/MetricsGrid.tsx`**

```tsx
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
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/MetricCard.tsx client/src/components/MetricsGrid.tsx
git commit -m "feat(client): add MetricCard and MetricsGrid components"
```

---

### Task 13: OpportunityCard + OpportunitiesList components

**Files:**
- Create: `client/src/components/OpportunityCard.tsx`
- Create: `client/src/components/OpportunitiesList.tsx`

**Interfaces:**
- Consumes: `Opportunity` type from `../types` (Task 7).
- Produces: `OpportunitiesList` component with props `{ opportunities: Opportunity[] }`, used by `Dashboard.tsx` (Task 16). Note: per Global Constraints, the expanded panel has exactly 2 fields (Why it hurts / Estimated impact) — no Likely cause / Recommended fix.

- [ ] **Step 1: Create `client/src/components/OpportunityCard.tsx`**

```tsx
import type { Opportunity } from '../types';

const SEVERITY_STYLE = {
  high: { border: '#ef4444', pillBg: '#fef2f2', pillBorder: '#fecaca', pillText: '#b91c1c', dot: '#ef4444', label: 'High' },
  medium: { border: '#f59e0b', pillBg: '#fffbeb', pillBorder: '#fde68a', pillText: '#b45309', dot: '#f59e0b', label: 'Medium' },
  low: { border: '#d4d4d8', pillBg: '#f4f4f5', pillBorder: '#e4e4e7', pillText: '#52525b', dot: '#a1a1aa', label: 'Low' },
} as const;

interface OpportunityCardProps {
  opportunity: Opportunity;
  open: boolean;
  onToggle: () => void;
}

export function OpportunityCard({ opportunity, open, onToggle }: OpportunityCardProps) {
  const style = SEVERITY_STYLE[opportunity.severity];
  return (
    <div
      className="overflow-hidden rounded-[14px] border border-border-card bg-white shadow-card"
      style={{ borderLeft: `3px solid ${style.border}` }}
    >
      <button onClick={onToggle} className="flex w-full items-center gap-4 p-[18px_20px] text-left hover:bg-[#fcfcfc]">
        <span
          className="inline-flex flex-none items-center gap-1.5 rounded-pill px-[9px] py-1 text-[10.5px] font-semibold uppercase tracking-[0.03em]"
          style={{ background: style.pillBg, borderWidth: 1, borderColor: style.pillBorder, color: style.pillText }}
        >
          <span className="h-[5px] w-[5px] rounded-full" style={{ background: style.dot }} />
          {style.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-[3px] text-[14.5px] font-semibold">{opportunity.title}</div>
          <div className="text-[12.5px] text-text-muted">{opportunity.subtitle}</div>
        </div>
        <div className="flex-none text-right">
          <div className="font-mono text-base font-semibold text-good-dot">{opportunity.savingsDisplay}</div>
          <div className="text-[10.5px] text-text-faint">est. savings</div>
        </div>
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-border-inner text-lg leading-none text-text-secondary">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="animate-fadeIn border-t border-border-inner p-[0_20px_20px]">
          <div className="grid grid-cols-2 gap-[20px_36px] pt-[18px] max-sm:grid-cols-1">
            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                Why it hurts
              </div>
              <div className="text-[13px] leading-[1.55] text-text-secondary">{opportunity.whyItHurts}</div>
            </div>
            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                Estimated impact
              </div>
              <div className="text-[13px] leading-[1.55] text-text-secondary">{opportunity.estimatedImpact}</div>
            </div>
          </div>
          {opportunity.affectedResources.length > 0 && (
            <div className="mt-[18px]">
              <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                Affected resources
              </div>
              <div className="flex flex-wrap gap-2">
                {opportunity.affectedResources.map((resource, i) => (
                  <span
                    key={i}
                    className="rounded-lg border border-border-card bg-surface-muted px-2.5 py-[5px] font-mono text-xs text-text-tertiary"
                  >
                    {resource.name} <b className="font-medium text-text-faint">{resource.size}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/components/OpportunitiesList.tsx`**

```tsx
import { useState } from 'react';
import type { Opportunity } from '../types';
import { OpportunityCard } from './OpportunityCard';

interface OpportunitiesListProps {
  opportunities: Opportunity[];
}

export function OpportunitiesList({ opportunities }: OpportunitiesListProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section>
      <div className="mb-4 mt-11 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Top Performance Opportunities</h2>
        <span className="font-mono text-xs text-text-faint">{opportunities.length} found · ranked by savings</span>
      </div>
      <div className="flex flex-col gap-3">
        {opportunities.map(opportunity => (
          <OpportunityCard
            key={opportunity.id}
            opportunity={opportunity}
            open={openIds.has(opportunity.id)}
            onToggle={() => toggle(opportunity.id)}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/OpportunityCard.tsx client/src/components/OpportunitiesList.tsx
git commit -m "feat(client): add OpportunityCard accordion and OpportunitiesList"
```

---

### Task 14: ResourceTable + Diagnostics + Footer components

**Files:**
- Create: `client/src/components/ResourceTable.tsx`
- Create: `client/src/components/Diagnostics.tsx`
- Create: `client/src/components/Footer.tsx`

**Interfaces:**
- Consumes: `ResourceRow`, `DiagnosticsData` types from `../types` (Task 7).
- Produces: `ResourceTable` (props `{ resources: ResourceRow[] }`), `Diagnostics` (props `{ diagnostics: DiagnosticsData }`), `Footer` (no props) — all used by `Dashboard.tsx` (Task 16).

- [ ] **Step 1: Create `client/src/components/ResourceTable.tsx`**

```tsx
import type { ResourceRow } from '../types';

const CATEGORY_DOT: Record<ResourceRow['category'], string> = {
  Images: '#e35a2a',
  JavaScript: '#a1a1aa',
  'Third-party': '#71717a',
  CSS: '#c4c4c8',
  Fonts: '#d4d4d8',
  Other: '#d4d4d8',
};

interface ResourceTableProps {
  resources: ResourceRow[];
}

export function ResourceTable({ resources }: ResourceTableProps) {
  return (
    <section>
      <div className="mb-4 mt-11 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Resource breakdown</h2>
        <span className="font-mono text-xs text-text-faint">by load contribution</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border-card bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-border-card bg-surface-muted">
                <th className="p-3 px-5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Category
                </th>
                <th className="p-3 px-5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Resource
                </th>
                <th className="p-3 px-5 text-right text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Transfer
                </th>
                <th className="p-3 px-5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Load contribution
                </th>
                <th className="p-3 px-5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  Optimization
                </th>
              </tr>
            </thead>
            <tbody>
              {resources.map((row, i) => (
                <tr key={i} className={i < resources.length - 1 ? 'border-b border-border-inner' : ''}>
                  <td className="p-3.5 px-5">
                    <span className="inline-flex items-center gap-2 text-text-secondary">
                      <span className="h-[7px] w-[7px] rounded-sm" style={{ background: CATEGORY_DOT[row.category] }} />
                      {row.category}
                    </span>
                  </td>
                  <td className="p-3.5 px-5 font-mono text-text-primary">{row.resource}</td>
                  <td className="p-3.5 px-5 text-right font-mono font-semibold">{row.transferSize}</td>
                  <td className="p-3.5 px-5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-surface-muted3">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${row.loadContributionPct}%` }} />
                      </div>
                      <span className="font-mono text-xs text-text-muted">{row.loadContributionPct}%</span>
                    </div>
                  </td>
                  <td className="p-3.5 px-5 text-text-muted">{row.optimization}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `client/src/components/Diagnostics.tsx`**

```tsx
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
```

- [ ] **Step 3: Create `client/src/components/Footer.tsx`**

```tsx
export function Footer() {
  return (
    <div className="mt-10 text-center font-mono text-xs text-text-faintest">
      Lab data collected with Lighthouse · Field data not available for this URL
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ResourceTable.tsx client/src/components/Diagnostics.tsx client/src/components/Footer.tsx
git commit -m "feat(client): add ResourceTable, Diagnostics, and Footer components"
```

---

### Task 15: EmptyState + LoadingState + ErrorState components

**Files:**
- Create: `client/src/components/EmptyState.tsx`
- Create: `client/src/components/LoadingState.tsx`
- Create: `client/src/components/ErrorState.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EmptyState` (no props), `LoadingState` (props `{ stage: string }`), `ErrorState` (props `{ message: string; onRetry: () => void }`) — all used by `Dashboard.tsx` (Task 16).

- [ ] **Step 1: Create `client/src/components/EmptyState.tsx`**

```tsx
export function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <p className="text-[15px] text-text-muted">Enter a website URL above to analyze its performance.</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/components/LoadingState.tsx`**

```tsx
interface LoadingStateProps {
  stage: string;
}

export function LoadingState({ stage }: LoadingStateProps) {
  return (
    <div className="mt-16 flex flex-col items-center gap-4 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-control border-t-brand" />
      <p key={stage} className="animate-fadeIn font-mono text-sm text-text-muted">
        {stage}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/components/ErrorState.tsx`**

```tsx
interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="mt-16 flex flex-col items-center gap-4 text-center">
      <div className="max-w-md rounded-2xl border border-bad-border bg-bad-bg p-5 text-[13.5px] text-bad-text">
        {message}
      </div>
      <button
        onClick={onRetry}
        className="rounded-lg border border-border-control bg-white px-4 py-2 text-[13px] font-semibold text-text-primary hover:bg-surface-muted"
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/EmptyState.tsx client/src/components/LoadingState.tsx client/src/components/ErrorState.tsx
git commit -m "feat(client): add EmptyState, LoadingState, and ErrorState components"
```

---

### Task 16: Dashboard view

**Files:**
- Create: `client/src/views/Dashboard.tsx`

**Interfaces:**
- Consumes: `AuditResult`, `Device` types from `../types` (Task 7); `formatRelativeTime` from `../lib/format` (Task 7); `AuditForm` (Task 9), `EmptyState`/`LoadingState`/`ErrorState` (Task 15), `SummaryHero` (Task 11), `MetricsGrid` (Task 12), `OpportunitiesList` (Task 13), `ResourceTable`/`Diagnostics`/`Footer` (Task 14).
- Produces: `Dashboard` component with props `{ device, onDeviceChange, onSubmit, onRetry, phase, stage, error, result, completedAt }`, used by `App.tsx` (Task 18). `phase` is `'idle' | 'running' | 'error' | 'done'`.

- [ ] **Step 1: Create `client/src/views/Dashboard.tsx`**

```tsx
import { AuditForm } from '../components/AuditForm';
import { Diagnostics } from '../components/Diagnostics';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
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
          <MetricsGrid result={result} />
          <OpportunitiesList opportunities={result.opportunities} />
          <ResourceTable resources={result.resources} />
          <Diagnostics diagnostics={result.diagnostics} />
          <Footer />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add client/src/views/Dashboard.tsx
git commit -m "feat(client): add Dashboard view composing all audit sections"
```

---

### Task 17: TrendChart + History view

**Files:**
- Create: `client/src/components/TrendChart.tsx`
- Create: `client/src/views/History.tsx`

**Interfaces:**
- Consumes: `HistoryRun` type from `../types` (Task 7); `fetchHistory` from `../lib/api` (Task 7); `formatDate` from `../lib/format` (Task 7).
- Produces: `TrendChart` (props `{ runs: HistoryRun[] }`, expects oldest-first order) and `History` view (props `{ onBack: () => void; onOpenRun: (run: HistoryRun) => void }`), used by `App.tsx` (Task 18).

- [ ] **Step 1: Create `client/src/components/TrendChart.tsx`**

```tsx
import { formatDate } from '../lib/format';
import type { HistoryRun } from '../types';

interface TrendChartProps {
  runs: HistoryRun[]; // oldest-first
}

const CHART_WIDTH = 760;
const CHART_HEIGHT = 244;
const PLOT_LEFT = 50;
const PLOT_RIGHT = 740;
const PLOT_TOP = 30;
const PLOT_BOTTOM = 200;

export function TrendChart({ runs }: TrendChartProps) {
  if (runs.length === 0) return null;

  const scores = runs.map(r => r.score);
  const minScore = Math.min(...scores, 40);
  const maxScore = Math.max(...scores, 100);
  const yFor = (score: number) => PLOT_BOTTOM - ((score - minScore) / (maxScore - minScore || 1)) * (PLOT_BOTTOM - PLOT_TOP);
  const xFor = (i: number) => (runs.length === 1 ? PLOT_LEFT : PLOT_LEFT + (i / (runs.length - 1)) * (PLOT_RIGHT - PLOT_LEFT));
  const points = runs.map((r, i) => ({ x: xFor(i), y: yFor(r.score) }));
  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `M${points.map(p => `${p.x},${p.y}`).join(' L')} L${PLOT_RIGHT},${PLOT_BOTTOM} L${PLOT_LEFT},${PLOT_BOTTOM} Z`;
  const latest = points[points.length - 1];

  return (
    <div className="mb-3 rounded-2xl border border-border-card bg-white p-[24px_24px_18px] shadow-card">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Performance score over time</div>
          <div className="mt-0.5 text-[12.5px] text-text-faint">
            {formatDate(runs[0].createdAt)} – {formatDate(runs[runs.length - 1].createdAt)}
          </div>
        </div>
        <div className="inline-flex rounded-lg bg-surface-muted3 p-[3px]">
          <span className="rounded-md bg-white px-3.5 py-1.5 text-[12.5px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
            Score
          </span>
          <span className="px-3.5 py-1.5 text-[12.5px] font-medium text-text-faint">LCP</span>
          <span className="px-3.5 py-1.5 text-[12.5px] font-medium text-text-faint">INP</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="block w-full" fontFamily="'Geist Mono', monospace">
        <rect
          x={PLOT_LEFT}
          y={PLOT_TOP}
          width={PLOT_RIGHT - PLOT_LEFT}
          height={(PLOT_BOTTOM - PLOT_TOP) * 0.67}
          fill="rgba(245,158,11,0.05)"
        />
        <rect
          x={PLOT_LEFT}
          y={PLOT_TOP + (PLOT_BOTTOM - PLOT_TOP) * 0.67}
          width={PLOT_RIGHT - PLOT_LEFT}
          height={(PLOT_BOTTOM - PLOT_TOP) * 0.33}
          fill="rgba(239,68,68,0.05)"
        />
        {[0, 1, 2, 3].map(i => (
          <line
            key={i}
            x1={PLOT_LEFT}
            y1={PLOT_TOP + (i * (PLOT_BOTTOM - PLOT_TOP)) / 3}
            x2={PLOT_RIGHT}
            y2={PLOT_TOP + (i * (PLOT_BOTTOM - PLOT_TOP)) / 3}
            stroke={i === 3 ? '#e4e4e7' : '#f0f0f1'}
            strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill="rgba(227,90,42,0.08)" />
        <polyline points={polyline} fill="none" stroke="#e35a2a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.slice(0, -1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#e35a2a" strokeWidth="2" />
        ))}
        <circle cx={latest.x} cy={latest.y} r="5.5" fill="#e35a2a" />
        <text x={latest.x} y={latest.y - 14} textAnchor="middle" fontSize="12" fontWeight="600" fill="#18181b">
          {runs[runs.length - 1].score}
        </text>
        {points.map((p, i) => (
          <text key={i} x={p.x} y={222} textAnchor="middle" fontSize="9.5" fill="#a1a1aa">
            {new Date(runs[i].createdAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
          </text>
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/views/History.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { TrendChart } from '../components/TrendChart';
import { fetchHistory } from '../lib/api';
import { formatDate } from '../lib/format';
import type { HistoryRun } from '../types';

interface HistoryProps {
  onBack: () => void;
  onOpenRun: (run: HistoryRun) => void;
}

const STATUS_DOT: Record<HistoryRun['status'], string> = {
  good: '#16a34a',
  'needs-improvement': '#f59e0b',
  poor: '#ef4444',
};

export function History({ onBack, onOpenRun }: HistoryProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [runs, setRuns] = useState<HistoryRun[]>([]); // newest-first, as returned by the API

  useEffect(() => {
    fetchHistory().then(data => {
      setUrl(data.url);
      setRuns(data.runs);
    });
  }, []);

  const chronological = [...runs].reverse();
  const scores = runs.map(r => r.score);
  const latest = runs[0];
  const best = scores.length ? Math.max(...scores) : 0;
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const change = runs.length > 1 ? runs[0].score - runs[runs.length - 1].score : 0;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-3.5 inline-flex items-center gap-1.5 py-1.5 text-[13px] font-medium text-text-muted hover:text-brand"
      >
        <span className="text-[15px]">←</span> Back to report
      </button>

      <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[26px] font-semibold tracking-[-0.02em]">Audit history</h1>
          <p className="font-mono text-[14.5px] text-text-muted">{url ?? 'No audits yet'} · last {runs.length} runs</p>
        </div>
        <button
          onClick={onBack}
          className="flex h-[42px] items-center gap-2 rounded-[11px] bg-brand px-5 text-sm font-semibold text-white shadow-button hover:bg-brand-dark"
        >
          <span className="text-base leading-none">+</span> New audit
        </button>
      </div>

      {runs.length === 0 ? (
        <p className="text-[15px] text-text-muted">Run an audit to start building history for this URL.</p>
      ) : (
        <>
          <div className="mb-7 grid grid-cols-4 gap-4 max-sm:grid-cols-2">
            <div className="rounded-2xl border border-border-card bg-white p-[18px_20px] shadow-card">
              <div className="mb-2 text-[11.5px] text-text-muted">Latest score</div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[latest.status] }} />
                <span className="font-mono text-2xl font-semibold tracking-[-0.02em]">{latest.score}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-border-card bg-white p-[18px_20px] shadow-card">
              <div className="mb-2 text-[11.5px] text-text-muted">Best score</div>
              <div className="font-mono text-2xl font-semibold tracking-[-0.02em]">{best}</div>
            </div>
            <div className="rounded-2xl border border-border-card bg-white p-[18px_20px] shadow-card">
              <div className="mb-2 text-[11.5px] text-text-muted">Average</div>
              <div className="font-mono text-2xl font-semibold tracking-[-0.02em]">{average}</div>
            </div>
            <div className="rounded-2xl border border-border-card bg-white p-[18px_20px] shadow-card">
              <div className="mb-2 text-[11.5px] text-text-muted">Change since first run</div>
              <div
                className={`flex items-baseline gap-1 font-mono text-2xl font-semibold tracking-[-0.02em] ${
                  change >= 0 ? 'text-good-dot' : 'text-bad-dot'
                }`}
              >
                {change >= 0 ? `+${change}` : change}
                <span className="text-[13px]">{change >= 0 ? '▲' : '▼'}</span>
              </div>
            </div>
          </div>

          <TrendChart runs={chronological} />

          <div className="mb-4 mt-8 flex items-baseline justify-between px-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">All runs</h2>
            <span className="font-mono text-xs text-text-faint">newest first · click to open</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border-card bg-white shadow-card">
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[130px_92px_168px_1fr_1fr_1fr_24px] items-center gap-3 border-b border-border-card bg-surface-muted p-3 px-5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-faint">
                  <span>Date</span>
                  <span>Device</span>
                  <span>Score</span>
                  <span>LCP</span>
                  <span>INP</span>
                  <span>CLS</span>
                  <span />
                </div>
                {runs.map((run, i) => {
                  const previous = runs[i + 1];
                  const delta = previous ? run.score - previous.score : null;
                  return (
                    <button
                      key={run.id}
                      onClick={() => onOpenRun(run)}
                      className={`grid w-full grid-cols-[130px_92px_168px_1fr_1fr_1fr_24px] items-center gap-3 p-[15px_20px] text-left text-[13.5px] hover:bg-[#fcfcfc] ${
                        i < runs.length - 1 ? 'border-b border-border-inner' : ''
                      }`}
                    >
                      <span className="font-mono text-text-primary">{formatDate(run.createdAt)}</span>
                      <span className="w-fit rounded-pill bg-border-inner px-2.5 py-[3px] text-[11px] font-medium text-text-tertiary">
                        {run.device === 'mobile' ? 'Mobile' : 'Desktop'}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[run.status] }} />
                        <span className="font-mono text-[15px] font-semibold">{run.score}</span>
                        {delta !== null && (
                          <span className={`font-mono text-[11px] ${delta >= 0 ? 'text-good-dot' : 'text-bad-dot'}`}>
                            {delta === 0 ? '—' : delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-text-tertiary">{(run.lcp / 1000).toFixed(1)}s</span>
                      <span className="font-mono text-text-tertiary">{Math.round(run.inp)}ms</span>
                      <span className="font-mono text-text-tertiary">{run.cls.toFixed(2)}</span>
                      <span className="justify-self-end text-lg text-text-faintest">›</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/TrendChart.tsx client/src/views/History.tsx
git commit -m "feat(client): add TrendChart and History view"
```

---

### Task 18: App.tsx wiring — state, view switch, audit lifecycle

**Files:**
- Modify: `client/src/App.tsx` (replace the Task 6 placeholder entirely)

**Interfaces:**
- Consumes: `Header` (Task 8), `Dashboard` (Task 16), `History` (Task 17), `submitAudit`/`usePollAudit`/`fetchAuditFull` (Task 7), `AuditResult`/`Device`/`HistoryRun` types (Task 7).
- Produces: the fully wired app — this is the top of the component tree, nothing consumes it except `main.tsx` (already created in Task 6).

- [ ] **Step 1: Replace `client/src/App.tsx`**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(client): wire App state, view switching, and audit lifecycle"
```

---

### Task 19: End-to-end manual verification

**Files:** none created — verification only, per the spec's testing plan (no component-level UI test suite; visual fidelity is checked by eye against `Core Web Vitals Tester.dc.html`).

**Interfaces:**
- Consumes: the full app (Tasks 1-18) and a running `npm run dev` at the root (Task 1's script).

- [ ] **Step 1: Run the full stack**

Run (from repo root): `npm install && npm run dev`
Expected: both `server` (port 3001) and `client` (port 5173) start without errors; the terminal shows both `Core Web Vitals Tester API listening on http://localhost:3001` and Vite's `Local: http://localhost:5173/`.

- [ ] **Step 2: Verify the empty state and audit form**

Open `http://localhost:5173` in a browser.
Expected: Header renders (logo, wordmark, Beta pill, History/Export buttons). Page title "Performance audit" + subtitle render. Audit form renders with URL input, Desktop/Mobile toggle (Mobile selected by default), Run Audit button. Below the form: the empty-state prompt "Enter a website URL above to analyze its performance." is visible (no meta line, since no audit has completed yet).

- [ ] **Step 3: Run a real audit and verify the loading state**

Type `example.com` into the URL input, leave device on Mobile, click "Run Audit".
Expected: the Run Audit button becomes disabled; the empty state is replaced by a spinner + rotating stage text ("Launching Chrome…" → "Loading page…" → "Running Lighthouse…" → "Analyzing performance…" → "Generating report…"), matching the wording specified in the handoff.

- [ ] **Step 4: Verify the completed dashboard**

Wait for the audit to complete (roughly 10-30s for a real Lighthouse run).
Expected: the meta line appears ("● Audit complete · Moto G Power · Slow 4G throttle · Lighthouse ... · Chrome ... · just now"). The score gauge counts up from 0 to the final score over ~1.1s. The Summary hero, 6 Core Web Vitals cards (LCP/INP/CLS/TBT/Speed Index/FCP), Top Performance Opportunities accordion, Resource breakdown table, Diagnostics tiles, and Footer all render with real data from the audit (not mock numbers). Compare visually against `Core Web Vitals Tester.dc.html` opened directly in a browser (`open "Core Web Vitals Tester.dc.html"`) for layout/spacing/color fidelity — the actual numbers will differ since this is real data for example.com, not the mock's acme-store.com data.

- [ ] **Step 5: Verify interactions**

- Hover the "i" icon on a metric card: tooltip should fade in with the metric's description and good/ok thresholds; mouse-leave hides it.
- Click an opportunity's row: it expands to show "Why it hurts" and "Estimated impact" (exactly 2 fields, no "Likely cause"/"Recommended fix"), plus affected resources if the audit had any; the +/− icon toggles; clicking again collapses it.
- Toggle the device segmented control (Desktop/Mobile) before running a new audit: the white pill should slide to the other side.
- Run a second audit (e.g., a different URL or the same one again): Run Audit should disable during the run and the dashboard should update with the new result on completion.

- [ ] **Step 6: Verify the History view**

Click "History" in the header.
Expected: the header's History button switches to its active/tinted style; the History view shows "Audit history", the audited URL + run count, 4 summary tiles (Latest/Best/Average/Change), a trend chart (with at least the runs completed so far plotted left-to-right oldest-to-newest, latest point highlighted with its score label), and an "All runs" table listing runs newest-first with Date/Device/Score+delta/LCP/INP/CLS. Click a row: it should navigate back to the Dashboard showing that specific run's full data (verify the score/metrics shown match what was displayed when that run originally completed, not the most recent run). Click "+ New audit" or "← Back to report": both return to the Dashboard.

- [ ] **Step 7: Verify error handling**

Submit an unreachable/invalid host, e.g. `https://this-domain-should-not-exist-12345.example`.
Expected: after Lighthouse/Chrome attempts to load it and fails, the dashboard shows the error state with a human-readable message (not a raw stack trace) and a "Try again" button that returns to the empty state.

- [ ] **Step 8: Verify responsiveness**

Resize the browser to a narrow (mobile) width, then a medium (tablet) width.
Expected: the Core Web Vitals grid collapses from 3 columns to 2 to 1; the summary hero's gauge/text grid stacks vertically on narrow widths; the Resource breakdown table and History runs table remain horizontally scrollable rather than squashing illegibly.

- [ ] **Step 9: Run full verification suite and stop servers**

Run: `npm run typecheck && npm run test` (from repo root)
Expected: typecheck passes for both workspaces; server unit tests pass (3+ tests). Stop the dev servers (Ctrl+C).

- [ ] **Step 10: Final commit** (only if any fixes were needed during verification; otherwise skip)

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```
