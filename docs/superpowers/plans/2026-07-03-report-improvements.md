# Report Robustness + Actionable Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CWV tester's server robust (serial queue, timeout, orphan recovery, localhost bind) and its report honest and actionable (INP truthfulness, CWV verdict, per-metric culprits, metric↔fix linkage, judged diagnostics, cross-origin resource naming, loading filmstrip).

**Architecture:** All new insight data is distilled server-side in `mapping.ts` at audit time and stored in `result_json` (existing pattern). Every new field is optional so old stored runs render unchanged. A new `queue.ts` module serializes audit runs; `runner.ts` consumes it.

**Tech Stack:** Existing only — server (Express + TypeScript + better-sqlite3 + lighthouse, Vitest), client (Vite + React + TypeScript + Tailwind). **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-03-report-improvements-design.md`

## Global Constraints

- **No new npm dependencies.**
- `server/src/types.ts` and `client/src/types.ts` are hand-synced identical copies; every new field added in this plan is **optional** in both.
- Old stored `result_json` rows lack all new fields — the client must render them without errors (guard on every new field).
- Exact copy strings (use verbatim): queued stage `'Waiting in queue…'`; orphan error `'Interrupted by server restart.'`; timeout error `'The audit timed out after 90 seconds.'`; verdict note `'Lab verdict from LCP + CLS. INP requires field data.'`.
- Exact numeric constants: `AUDIT_TIMEOUT_MS = 90_000`; byte-only opportunity floor `10 * 1024` bytes; byte severity tiers `>= 500 * 1024` high / `>= 100 * 1024` medium; diagnostics score bands `>= 0.9` good / `>= 0.5` needs-improvement; culprit item cap `5` per metric group.
- Verification commands: server `cd server && npx vitest run` and `npx tsc --noEmit`; client `cd client && npx tsc --noEmit`; root `npm run typecheck && npm run test && npm run build`.
- Note (already done): History score-delta chips from the spec's §3.6 already exist in `client/src/views/History.tsx` — do NOT re-implement them.
- Work happens directly on branch `feat/audit-authentication` (user's choice). Commit after every task.

---

### Task 1: Serial queue module + timeout helper

**Files:**
- Create: `server/src/queue.ts`
- Test: `server/test/queue.test.ts`

**Interfaces:**
- Consumes: nothing (self-contained).
- Produces (used by Task 3):
  - `createQueue(): { enqueue(task: () => Promise<void>): void }`
  - `withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T>`

- [ ] **Step 1: Write the failing tests**

Create `server/test/queue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createQueue, withTimeout } from '../src/queue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createQueue', () => {
  it('runs tasks serially in FIFO order', async () => {
    const queue = createQueue();
    const order: string[] = [];
    const firstGate = deferred();
    const done = deferred();

    queue.enqueue(async () => {
      order.push('first:start');
      await firstGate.promise;
      order.push('first:end');
    });
    queue.enqueue(async () => {
      order.push('second:start');
      done.resolve();
    });

    // Give the queue a tick to start the first task; the second must not have started.
    await new Promise(r => setTimeout(r, 10));
    expect(order).toEqual(['first:start']);

    firstGate.resolve();
    await done.promise;
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('continues to the next task when one throws', async () => {
    const queue = createQueue();
    const done = deferred();
    const order: string[] = [];

    queue.enqueue(async () => {
      order.push('bad');
      throw new Error('boom');
    });
    queue.enqueue(async () => {
      order.push('good');
      done.resolve();
    });

    await done.promise;
    expect(order).toEqual(['bad', 'good']);
  });
});

describe('withTimeout', () => {
  it('resolves with the value when the promise settles before the deadline', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'too slow')).resolves.toBe(42);
  });

  it('rejects with the given message when the deadline passes', async () => {
    const never = new Promise<void>(() => {});
    await expect(withTimeout(never, 20, 'The audit timed out after 90 seconds.')).rejects.toThrow(
      'The audit timed out after 90 seconds.'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run test/queue.test.ts`
Expected: FAIL — cannot resolve `../src/queue`.

- [ ] **Step 3: Implement the queue module**

Create `server/src/queue.ts`:

```ts
export interface SerialQueue {
  enqueue(task: () => Promise<void>): void;
}

// Serial FIFO task queue (concurrency 1). A failing task never blocks the
// tasks queued behind it.
export function createQueue(): SerialQueue {
  const pending: (() => Promise<void>)[] = [];
  let running = false;

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    while (pending.length > 0) {
      const task = pending.shift()!;
      try {
        await task();
      } catch {
        // The task owner is responsible for reporting its own failure.
      }
    }
    running = false;
  }

  return {
    enqueue(task: () => Promise<void>): void {
      pending.push(task);
      void drain();
    },
  };
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run test/queue.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/queue.ts server/test/queue.test.ts
git commit -m "feat(server): add serial task queue and withTimeout helper"
```

---

### Task 2: DB orphan sweep + configurable data dir; queued stage; localhost bind

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/db.test.ts`

**Interfaces:**
- Consumes: existing `insertAudit`, `updateStage`, `completeAudit`, `getAudit`.
- Produces (used by Task 14 verification and `index.ts`): `sweepOrphanedAudits(finishedAt: number): number` — returns count of rows swept.

- [ ] **Step 1: Write the failing test**

Create `server/test/db.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sweepOrphanedAudits', () => {
  it('marks queued/running rows as error and leaves done rows alone', async () => {
    // Must be set BEFORE the first import of ../src/db (module-level singleton).
    process.env.CWV_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'cwv-db-test-'));
    const { insertAudit, updateStage, completeAudit, sweepOrphanedAudits, getAudit } = await import('../src/db');

    insertAudit('a', 'https://a.com', 'mobile', 1000); // stays queued
    insertAudit('b', 'https://b.com', 'mobile', 1000);
    updateStage('b', 'Running Lighthouse…'); // now running
    insertAudit('c', 'https://c.com', 'mobile', 1000);
    completeAudit('c', '{"score":90}', 2000); // done — must be untouched

    const changed = sweepOrphanedAudits(3000);

    expect(changed).toBe(2);
    expect(getAudit('a')!.status).toBe('error');
    expect(getAudit('a')!.error).toBe('Interrupted by server restart.');
    expect(getAudit('a')!.finished_at).toBe(3000);
    expect(getAudit('b')!.status).toBe('error');
    expect(getAudit('c')!.status).toBe('done');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run test/db.test.ts`
Expected: FAIL — `sweepOrphanedAudits` is not a function (and note the queued-stage assertion comes in Step 3).

- [ ] **Step 3: Modify `server/src/db.ts`**

Change the data-dir line (top of file) from:

```ts
const dataDir = path.join(__dirname, '..', 'data');
```

to:

```ts
const dataDir = process.env.CWV_DATA_DIR ?? path.join(__dirname, '..', 'data');
```

(`??` is lazy, so `__dirname` is never touched when the env var is set — this keeps the module importable from Vitest's ESM context.)

Change `insertAudit`'s hardcoded initial stage from `'Launching Chrome…'` to `'Waiting in queue…'`:

```ts
export function insertAudit(id: string, url: string, device: string, createdAt: number): void {
  db.prepare(
    `INSERT INTO audits (id, url, device, status, stage, created_at) VALUES (?, ?, ?, 'queued', 'Waiting in queue…', ?)`
  ).run(id, url, device, createdAt);
}
```

Add at the end of the file:

```ts
export function sweepOrphanedAudits(finishedAt: number): number {
  const info = db
    .prepare(
      `UPDATE audits SET status = 'error', stage = NULL, error = 'Interrupted by server restart.', finished_at = ? WHERE status IN ('queued', 'running')`
    )
    .run(finishedAt);
  return info.changes;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && npx vitest run test/db.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Replace `server/src/index.ts` (sweep on boot + bind 127.0.0.1)**

Full new content:

```ts
import app from './app';
import { sweepOrphanedAudits } from './db';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const swept = sweepOrphanedAudits(Date.now());
if (swept > 0) {
  console.log(`Marked ${swept} audit(s) interrupted by the previous shutdown as errors.`);
}

// Bind to loopback only — this server can audit arbitrary URLs (SSRF primitive)
// and must never be reachable from the network. See RUNNING.md.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Core Web Vitals Tester API listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 6: Typecheck and run all server tests**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: 0 type errors; all tests pass (existing mapping tests + queue + db).

- [ ] **Step 7: Commit**

```bash
git add server/src/db.ts server/src/index.ts server/test/db.test.ts
git commit -m "feat(server): orphan-audit sweep on boot, queued stage, loopback-only bind"
```

---

### Task 3: Runner uses the queue, watchdog timeout, terminal job eviction

**Files:**
- Modify: `server/src/runner.ts`

**Interfaces:**
- Consumes: `createQueue`, `withTimeout` (Task 1); existing db functions; existing `mapLhrToAuditResult(lhr, url, device)` (3-arg — unchanged in this plan).
- Produces: `startAudit(url, device)` unchanged signature; runs now execute one at a time with a 90s cap; `jobs` entries are deleted on terminal states (the DB row is authoritative — `GET /api/audits/:id` already falls back to it).

- [ ] **Step 1: Replace `server/src/runner.ts`**

Full new content:

```ts
import * as chromeLauncher from 'chrome-launcher';
import { randomUUID } from 'node:crypto';
import { completeAudit, failAudit, insertAudit, updateStage } from './db';
import { getLhrRuntimeError, mapLhrToAuditResult } from './mapping';
import { createQueue, withTimeout } from './queue';
import type { AuditJobStatus, Device } from './types';

interface Job {
  status: AuditJobStatus;
  stage?: string;
  error?: string;
}

const jobs = new Map<string, Job>();
const auditQueue = createQueue();

const AUDIT_TIMEOUT_MS = 90_000;

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
  insertAudit(id, url, device, Date.now());
  jobs.set(id, { status: 'queued', stage: 'Waiting in queue…' });
  auditQueue.enqueue(() => runAudit(id, url, device));
  return id;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

function setStage(id: string, stage: string): void {
  jobs.set(id, { status: 'running', stage });
  updateStage(id, stage);
}

async function runAudit(id: string, url: string, device: Device): Promise<void> {
  setStage(id, 'Launching Chrome…');

  let chrome: chromeLauncher.LaunchedChrome;
  try {
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
  } catch {
    fail(id, 'Failed to launch Chrome. Confirm Chrome/Chromium is installed on this machine.');
    return;
  }

  try {
    setStage(id, 'Loading page…');
    setStage(id, 'Running Lighthouse…');
    // NOTE: lighthouse v12 is ESM-only; loading it via a static top-level import
    // under this CommonJS project caused a runtime "__name is not defined" error
    // when the .ts file was transpiled/required by tsx's CJS require hook. A
    // dynamic import sidesteps that interop path and loads cleanly. See task-4
    // report for details.
    const { default: lighthouse } = await import('lighthouse');
    const runnerResult = await withTimeout(
      lighthouse(url, { port: chrome.port, output: 'json' }, LIGHTHOUSE_CONFIG[device]),
      AUDIT_TIMEOUT_MS,
      'The audit timed out after 90 seconds.'
    );
    if (!runnerResult?.lhr) throw new Error('Lighthouse produced no report.');

    const runtimeErrorMessage = getLhrRuntimeError(runnerResult.lhr);
    if (runtimeErrorMessage) {
      fail(id, classifyError(new Error(runtimeErrorMessage), url));
      return;
    }

    setStage(id, 'Analyzing performance…');
    setStage(id, 'Generating report…');
    const result = mapLhrToAuditResult(runnerResult.lhr, url, device);

    completeAudit(id, JSON.stringify(result), Date.now());
    jobs.delete(id); // DB row is authoritative once terminal.
  } catch (err) {
    fail(id, classifyError(err, url));
  } finally {
    await chrome.kill();
  }
}

function fail(id: string, message: string): void {
  failAudit(id, message, Date.now());
  jobs.delete(id); // DB row is authoritative once terminal.
}

function classifyError(err: unknown, url: string): string {
  const message = err instanceof Error ? err.message : String(err);
  // Our own watchdog message is already user-readable — pass it through.
  if (message.includes('timed out after')) {
    return message;
  }
  if (
    message.includes('ENOTFOUND') ||
    message.includes('ERR_NAME_NOT_RESOLVED') ||
    message.includes('DNS_FAILURE') ||
    /\bDNS\b/i.test(message) ||
    /\bresolve\b/i.test(message)
  ) {
    return `Could not reach ${url}. Check the URL and try again.`;
  }
  if (message.includes('ERR_CONNECTION_REFUSED')) {
    return `Connection refused by ${url}.`;
  }
  if (message.includes('ERRORED_DOCUMENT_REQUEST') || message.includes('FAILED_DOCUMENT_REQUEST')) {
    return `Could not load ${url}. The site may be down or unreachable.`;
  }
  if (message.includes('NO_FCP')) {
    return `The page at ${url} never rendered any content Lighthouse could measure.`;
  }
  if (message.includes('NOT_HTML') || message.includes('non-HTML')) {
    return `${url} did not return an HTML page.`;
  }
  if (message.toLowerCase().includes('timeout')) {
    return 'The audit timed out. The site may be too slow to respond.';
  }
  return `Lighthouse failed: ${message}`;
}
```

- [ ] **Step 2: Typecheck the server**

Run: `cd server && npx tsc --noEmit`
Expected: PASS — 0 errors.

- [ ] **Step 3: Run all server tests**

Run: `cd server && npx vitest run`
Expected: PASS — runner has no direct unit tests; queue behavior is covered by Task 1's tests, and end-to-end queue/timeout behavior is verified in Task 14.

- [ ] **Step 4: Commit**

```bash
git add server/src/runner.ts
git commit -m "feat(server): serialize audits through queue, add 90s watchdog, evict terminal jobs"
```

---

### Task 4: New shared types (server + client, hand-synced)

**Files:**
- Modify: `server/src/types.ts`
- Modify: `client/src/types.ts`

**Interfaces:**
- Produces (used by every later task): `MetricValue.measurable?`, `Opportunity.affects?`/`savingsBytes?`, `DiagnosticStatus`, `DiagnosticsStatuses`, `DiagnosticsData.statuses?`, `CulpritItem`, `MetricCulpritGroup`, `CwvVerdict`, `FilmstripFrame`, `AuditResult.cwvVerdict?`/`culprits?`/`filmstrip?`.

- [ ] **Step 1: Apply identical additions to BOTH `server/src/types.ts` and `client/src/types.ts`**

In `interface MetricValue`, add after `poorThreshold: number;`:

```ts
  /** Absent = measurable. false = lab runs cannot produce this metric (e.g. INP). */
  measurable?: boolean;
```

In `interface Opportunity`, add after `affectedResources: { name: string; size: string }[];`:

```ts
  /** Metrics this fix improves, e.g. ['LCP', 'FCP']. From Lighthouse metricSavings. */
  affects?: string[];
  /** Set when the audit reports byte savings (may exist without ms savings). */
  savingsBytes?: number;
```

After `export type AuditJobStatus = …` (top of file), add:

```ts
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
```

In `interface DiagnosticsData`, add after `mainThreadWorkSeconds: number;`:

```ts
  statuses?: DiagnosticsStatuses;
```

In `interface AuditResult`, add after `diagnostics: DiagnosticsData;`:

```ts
  cwvVerdict?: CwvVerdict;
  culprits?: MetricCulpritGroup[];
  filmstrip?: FilmstripFrame[];
```

- [ ] **Step 2: Typecheck both packages**

Run: `cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
Expected: PASS for both — all new fields are optional, nothing consumes them yet.

- [ ] **Step 3: Commit**

```bash
git add server/src/types.ts client/src/types.ts
git commit -m "feat(types): add measurable, cwvVerdict, culprits, filmstrip, affects, diagnostics statuses"
```

---

### Task 5: `mapMetric` honesty — `measurable` flag (fixes the INP = 0 "good" bug)

**Files:**
- Modify: `server/src/mapping.ts`
- Test: `server/test/mapping.test.ts`

**Interfaces:**
- Consumes: `MetricValue.measurable?` (Task 4).
- Produces: `mapMetric` returns `measurable: false`, `displayValue: '—'` when the audit has no `numericValue` (always true for INP in lab navigation runs); `measurable: true` otherwise. Signature unchanged.

- [ ] **Step 1: Add the failing tests to `server/test/mapping.test.ts`**

Append this describe block:

```ts
describe('mapMetric measurable flag', () => {
  it('marks a metric not measurable when its audit is missing (lab INP)', () => {
    const lhr = {
      audits: {
        'largest-contentful-paint': { displayValue: '2.4 s', numericValue: 2400 },
        // no interaction-to-next-paint — lab navigation runs never produce it
      },
    };

    const inp = mapMetric(lhr as any, 'inp');
    expect(inp.measurable).toBe(false);
    expect(inp.displayValue).toBe('—');
    expect(inp.unit).toBe('');
    expect(inp.value).toBe(0);

    const lcp = mapMetric(lhr as any, 'lcp');
    expect(lcp.measurable).toBe(true);
    expect(lcp.displayValue).toBe('2.4');
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `cd server && npx vitest run test/mapping.test.ts`
Expected: FAIL — `measurable` is `undefined`, `displayValue` is `'0'`.

- [ ] **Step 3: Replace `mapMetric` in `server/src/mapping.ts`**

```ts
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
```

- [ ] **Step 4: Run all server tests to verify everything passes**

Run: `cd server && npx vitest run`
Expected: PASS — the new block plus all pre-existing tests (the existing tests all provide `numericValue` for the metrics they assert on).

- [ ] **Step 5: Commit**

```bash
git add server/src/mapping.ts server/test/mapping.test.ts
git commit -m "fix(mapping): mark metrics without lab data as not measurable instead of 0/good"
```

---

### Task 6: CWV verdict

**Files:**
- Modify: `server/src/mapping.ts`
- Test: `server/test/mapping.test.ts`

**Interfaces:**
- Consumes: `CwvVerdict`, `MetricValue` (Task 4), `mapAllMetrics` (existing).
- Produces (used by Task 10's UI): `buildCwvVerdict(metrics: MetricValue[]): CwvVerdict`; `mapLhrToAuditResult` now sets `cwvVerdict` on its return value.

- [ ] **Step 1: Add the failing tests to `server/test/mapping.test.ts`**

Add `buildCwvVerdict` to the existing import from `'../src/mapping'`, and `import type { MetricValue } from '../src/types';` then append:

```ts
function metricStub(id: MetricValue['id'], label: string, status: MetricValue['status'], measurable = true): MetricValue {
  return {
    id,
    label,
    fullName: label,
    value: 0,
    unit: '',
    displayValue: '0',
    status,
    measurable,
    goodThreshold: 1,
    poorThreshold: 2,
  };
}

describe('buildCwvVerdict', () => {
  it('passes when lab LCP and CLS are both good', () => {
    const verdict = buildCwvVerdict([
      metricStub('lcp', 'LCP', 'good'),
      metricStub('cls', 'CLS', 'good'),
      metricStub('inp', 'INP', 'good', false),
    ]);
    expect(verdict.passes).toBe(true);
    expect(verdict.failing).toEqual([]);
    expect(verdict.note).toBe('Lab verdict from LCP + CLS. INP requires field data.');
  });

  it('fails and names the failing metric', () => {
    const verdict = buildCwvVerdict([
      metricStub('lcp', 'LCP', 'needs-improvement'),
      metricStub('cls', 'CLS', 'good'),
    ]);
    expect(verdict.passes).toBe(false);
    expect(verdict.failing).toEqual(['LCP']);
  });

  it('lists both LCP and CLS when both fail', () => {
    const verdict = buildCwvVerdict([
      metricStub('lcp', 'LCP', 'poor'),
      metricStub('cls', 'CLS', 'poor'),
    ]);
    expect(verdict.failing).toEqual(['LCP', 'CLS']);
  });

  it('ignores non-measurable LCP/CLS rather than failing them', () => {
    const verdict = buildCwvVerdict([
      metricStub('lcp', 'LCP', 'good', false),
      metricStub('cls', 'CLS', 'good'),
    ]);
    expect(verdict.passes).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `cd server && npx vitest run test/mapping.test.ts`
Expected: FAIL — `buildCwvVerdict` is not exported.

- [ ] **Step 3: Implement `buildCwvVerdict` in `server/src/mapping.ts`**

Add near `getScoreStatus` (and add `CwvVerdict` to the existing `import type { ... } from './types';` line):

```ts
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
```

In `mapLhrToAuditResult`, add to the returned object literal, after `diagnostics,`:

```ts
    cwvVerdict: buildCwvVerdict(metrics),
```

- [ ] **Step 4: Run all server tests**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/mapping.ts server/test/mapping.test.ts
git commit -m "feat(mapping): add lab CWV pass/fail verdict from LCP + CLS"
```

---

### Task 7: Opportunities upgrade — `metricSavings` → `affects`, byte-only inclusion, honest resource names

**Files:**
- Modify: `server/src/mapping.ts`
- Test: `server/test/mapping.test.ts`

**Interfaces:**
- Consumes: `Opportunity.affects?`/`savingsBytes?` (Task 4).
- Produces (used by Tasks 8, 9, 12):
  - `resourceDisplayName(resourceUrl: string, pageUrl: string): string` — filename for same-origin, `` `${hostname} · ${filename}` `` for cross-origin, input returned verbatim when unparseable.
  - `mapOpportunities(lhr: any, pageUrl?: string): Opportunity[]` — new optional `pageUrl` param (defaults `''`, which makes every resource render as plain filename, preserving old behavior for existing tests).

- [ ] **Step 1: Add the failing tests to `server/test/mapping.test.ts`**

Add `resourceDisplayName` to the import from `'../src/mapping'`, then append:

```ts
describe('resourceDisplayName', () => {
  it('returns the filename for same-origin resources', () => {
    expect(resourceDisplayName('https://example.com/js/app.js', 'https://example.com/')).toBe('app.js');
  });

  it('prefixes the hostname for cross-origin resources', () => {
    expect(resourceDisplayName('https://cdn.example.com/js/app.js', 'https://example.com/')).toBe(
      'cdn.example.com · app.js'
    );
  });

  it('falls back to the hostname when the path has no filename', () => {
    expect(resourceDisplayName('https://cdn.example.com/', 'https://example.com/')).toBe(
      'cdn.example.com · cdn.example.com'
    );
  });

  it('returns the raw string when the resource URL is unparseable', () => {
    expect(resourceDisplayName('not a url', 'https://example.com/')).toBe('not a url');
  });
});

describe('mapOpportunities affects + byte-only', () => {
  it('derives affects and per-metric impact from metricSavings', () => {
    const lhr = {
      audits: {
        'unused-javascript': {
          title: 'Reduce unused JavaScript',
          description: 'Remove dead code.',
          metricSavings: { LCP: 500, FCP: 100, CLS: 0 },
          details: { type: 'opportunity', overallSavingsMs: 600, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result[0].affects).toEqual(['LCP', 'FCP']);
    expect(result[0].estimatedImpact).toBe('~0.50s faster LCP · ~0.10s faster FCP.');
  });

  it('formats CLS metricSavings in CLS units, not seconds', () => {
    const lhr = {
      audits: {
        'some-cls-fix': {
          title: 'Fix layout shifts',
          description: 'Reserve space.',
          metricSavings: { CLS: 0.12 },
          details: { type: 'opportunity', overallSavingsMs: 50, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result[0].affects).toEqual(['CLS']);
    expect(result[0].estimatedImpact).toBe('−0.12 CLS.');
  });

  it('falls back to the audit lookup table when metricSavings is absent', () => {
    const lhr = {
      audits: {
        'render-blocking-resources': {
          title: 'Eliminate render-blocking resources',
          description: 'Blocking render.',
          details: { type: 'opportunity', overallSavingsMs: 500, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result[0].affects).toEqual(['FCP', 'LCP']);
  });

  it('includes byte-only opportunities above the 10 KB floor with byte severity and display', () => {
    const lhr = {
      audits: {
        'big-bytes': {
          title: 'Serve smaller payloads',
          description: 'Big payloads.',
          details: { type: 'opportunity', overallSavingsMs: 0, overallSavingsBytes: 524288, items: [] },
        },
        'tiny-bytes': {
          title: 'Trivial savings',
          description: 'Too small to bother.',
          details: { type: 'opportunity', overallSavingsMs: 0, overallSavingsBytes: 5000, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('big-bytes');
    expect(result[0].severity).toBe('high'); // >= 500 KB
    expect(result[0].savingsBytes).toBe(524288);
    expect(result[0].savingsDisplay).toBe('−512 KB');
    expect(result[0].estimatedImpact).toBe('512 KB less to download.');
  });

  it('sorts ms-savings opportunities ahead of byte-only ones', () => {
    const lhr = {
      audits: {
        'byte-only': {
          title: 'Byte only',
          description: 'Bytes.',
          details: { type: 'opportunity', overallSavingsMs: 0, overallSavingsBytes: 204800, items: [] },
        },
        'ms-savings': {
          title: 'Time savings',
          description: 'Time.',
          details: { type: 'opportunity', overallSavingsMs: 400, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result.map(o => o.id)).toEqual(['ms-savings', 'byte-only']);
  });

  it('names cross-origin affected resources with their hostname', () => {
    const lhr = {
      audits: {
        'render-blocking-resources': {
          title: 'Eliminate render-blocking resources',
          description: 'Blocking render.',
          details: {
            type: 'opportunity',
            overallSavingsMs: 500,
            items: [{ url: 'https://cdn.example.com/lib/vendor.js', totalBytes: 102400 }],
          },
        },
      },
    };
    const result = mapOpportunities(lhr as any, 'https://example.com/');
    expect(result[0].affectedResources).toEqual([{ name: 'cdn.example.com · vendor.js', size: '100 KB' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new blocks fail**

Run: `cd server && npx vitest run test/mapping.test.ts`
Expected: FAIL — `resourceDisplayName` not exported; `affects`/`savingsBytes` undefined; byte-only audit excluded.

- [ ] **Step 3: Implement in `server/src/mapping.ts`**

Add `Opportunity`-related helpers near `getSeverity` (which it replaces) and export `resourceDisplayName` near `formatBytes`:

```ts
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
```

Replace `mapOpportunities` entirely:

```ts
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
```

In `mapLhrToAuditResult`, derive the page URL once and pass it (this also feeds Tasks 8–9). Change the top of the function to:

```ts
export function mapLhrToAuditResult(lhr: any, url: string, device: Device): AuditResult {
  const pageUrl = typeof lhr.finalDisplayedUrl === 'string' ? lhr.finalDisplayedUrl : url;
  const score = Math.round((lhr.categories?.performance?.score ?? 0) * 100);
  const metrics = mapAllMetrics(lhr);
  const opportunities = mapOpportunities(lhr, pageUrl);
```

- [ ] **Step 4: Run all server tests**

Run: `cd server && npx vitest run`
Expected: PASS — new blocks plus all pre-existing tests. (Existing `mapOpportunities` tests call with one arg and expect plain filenames + the pre-existing `severity`/`savingsDisplay`/`estimatedImpact` behavior for ms-bearing audits, all preserved. The pre-existing test's `estimatedImpact` for `render-blocking-resources` is unasserted, so the fallback path change is safe.)

- [ ] **Step 5: Commit**

```bash
git add server/src/mapping.ts server/test/mapping.test.ts
git commit -m "feat(mapping): metricSavings-driven affects/impact, byte-only opportunities, honest resource names"
```

---

### Task 8: Per-metric culprit extraction

**Files:**
- Modify: `server/src/mapping.ts`
- Test: `server/test/mapping.test.ts`

**Interfaces:**
- Consumes: `MetricCulpritGroup`, `CulpritItem` (Task 4); `resourceDisplayName` (Task 7); `metricStub` test helper (Task 6).
- Produces (used by Task 11's UI): `mapCulprits(lhr: any, metrics: MetricValue[], pageUrl: string): MetricCulpritGroup[]`; `mapLhrToAuditResult` sets `culprits`.

- [ ] **Step 1: Add the failing tests to `server/test/mapping.test.ts`**

Add `mapCulprits` to the import from `'../src/mapping'`, then append:

```ts
describe('mapCulprits', () => {
  const page = 'https://example.com/';

  it('extracts the LCP element and phase breakdown when LCP is failing', () => {
    const lhr = {
      audits: {
        'largest-contentful-paint-element': {
          details: {
            items: [
              { items: [{ node: { selector: 'div.hero > img', snippet: '<img src="hero.jpg">', nodeLabel: 'Hero image' } }] },
              {
                items: [
                  { phase: 'TTFB', timing: 600 },
                  { phase: 'Load Delay', timing: 1200 },
                  { phase: 'Load Time', timing: 800 },
                  { phase: 'Render Delay', timing: 400 },
                ],
              },
            ],
          },
        },
      },
    };
    const groups = mapCulprits(lhr as any, [metricStub('lcp', 'LCP', 'poor')], page);
    expect(groups).toHaveLength(1);
    expect(groups[0].metricId).toBe('lcp');
    expect(groups[0].metricLabel).toBe('LCP');
    expect(groups[0].items[0]).toEqual({ label: 'div.hero > img', detail: '<img src="hero.jpg">' });
    expect(groups[0].items[1]).toEqual({ label: 'TTFB', value: '600 ms' });
    expect(groups[0].items).toHaveLength(5); // element + 4 phases, capped at 5
  });

  it('extracts shifted elements from layout-shifts when CLS is failing', () => {
    const lhr = {
      audits: {
        'layout-shifts': {
          details: { items: [{ node: { selector: 'header.banner' }, score: 0.18 }] },
        },
      },
    };
    const groups = mapCulprits(lhr as any, [metricStub('cls', 'CLS', 'needs-improvement')], page);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toEqual([{ label: 'header.banner', value: 'shift 0.18' }]);
  });

  it('falls back to layout-shift-elements for older Lighthouse output', () => {
    const lhr = {
      audits: {
        'layout-shift-elements': {
          details: { items: [{ node: { nodeLabel: 'Cookie banner' }, score: 0.3 }] },
        },
      },
    };
    const groups = mapCulprits(lhr as any, [metricStub('cls', 'CLS', 'poor')], page);
    expect(groups[0].items).toEqual([{ label: 'Cookie banner', value: 'shift 0.3' }]);
  });

  it('extracts long tasks and blocking third parties when TBT is failing', () => {
    const lhr = {
      audits: {
        'long-tasks': {
          details: { items: [{ url: 'https://cdn.example.com/vendor.js', duration: 310 }] },
        },
        'third-party-summary': {
          details: {
            items: [
              { entity: 'Google Tag Manager', blockingTime: 250 },
              { entity: 'Harmless', blockingTime: 0 },
            ],
          },
        },
      },
    };
    const groups = mapCulprits(lhr as any, [metricStub('tbt', 'TBT', 'poor')], page);
    expect(groups[0].items).toEqual([
      { label: 'cdn.example.com · vendor.js', value: '310 ms' },
      { label: 'Google Tag Manager', value: '250 ms' },
    ]);
  });

  it('omits groups for passing metrics and for metrics with no extractable culprits', () => {
    const lhr = {
      audits: {
        'layout-shifts': { details: { items: [{ node: { selector: 'div.a' }, score: 0.2 }] } },
      },
    };
    const groups = mapCulprits(
      lhr as any,
      [metricStub('cls', 'CLS', 'good'), metricStub('lcp', 'LCP', 'poor'), metricStub('tbt', 'TBT', 'poor')],
      page
    );
    expect(groups).toEqual([]); // CLS is good; LCP/TBT failing but their audits are absent
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `cd server && npx vitest run test/mapping.test.ts`
Expected: FAIL — `mapCulprits` is not exported.

- [ ] **Step 3: Implement `mapCulprits` in `server/src/mapping.ts`**

Add `CulpritItem, MetricCulpritGroup` to the `import type { ... } from './types';` line, then add (near `mapOpportunities`):

```ts
const CULPRIT_ITEM_CAP = 5;

function nodeLabelOf(item: any): string | null {
  const node = item?.node;
  if (!node) return null;
  return node.selector || node.nodeLabel || null;
}

export function mapCulprits(lhr: any, metrics: MetricValue[], pageUrl: string): MetricCulpritGroup[] {
  const byId = new Map(metrics.map(m => [m.id, m]));
  const isFailing = (id: 'lcp' | 'cls' | 'tbt'): boolean => {
    const metric = byId.get(id);
    return !!metric && metric.measurable !== false && metric.status !== 'good';
  };
  const groups: MetricCulpritGroup[] = [];

  if (isFailing('lcp')) {
    const items: CulpritItem[] = [];
    const lcpDetails = lhr.audits?.['largest-contentful-paint-element']?.details?.items;
    if (Array.isArray(lcpDetails)) {
      // items[0] is a table holding the LCP element node; items[1] the phase table.
      const nodeItems: any[] = Array.isArray(lcpDetails[0]?.items) ? lcpDetails[0].items : [];
      const label = nodeLabelOf(nodeItems[0]);
      if (label) {
        const snippet = nodeItems[0]?.node?.snippet;
        items.push({ label, ...(typeof snippet === 'string' ? { detail: snippet } : {}) });
      }
      const phaseItems: any[] = Array.isArray(lcpDetails[1]?.items) ? lcpDetails[1].items : [];
      for (const phase of phaseItems) {
        if (typeof phase?.phase === 'string' && typeof phase?.timing === 'number') {
          items.push({ label: phase.phase, value: `${Math.round(phase.timing)} ms` });
        }
      }
    }
    const prioritize = lhr.audits?.['prioritize-lcp-image'];
    if (prioritize && typeof prioritize.score === 'number' && prioritize.score < 1) {
      items.push({ label: 'LCP image is not prioritized', detail: 'Preload it or raise its fetchpriority.' });
    }
    if (items.length > 0) {
      groups.push({ metricId: 'lcp', metricLabel: 'LCP', items: items.slice(0, CULPRIT_ITEM_CAP) });
    }
  }

  if (isFailing('cls')) {
    const shiftItems: any[] =
      lhr.audits?.['layout-shifts']?.details?.items ?? lhr.audits?.['layout-shift-elements']?.details?.items ?? [];
    const items: CulpritItem[] = [];
    for (const item of Array.isArray(shiftItems) ? shiftItems : []) {
      const label = nodeLabelOf(item);
      if (!label) continue;
      const score = typeof item?.score === 'number' ? item.score : null;
      items.push({ label, ...(score !== null ? { value: `shift ${round2(score)}` } : {}) });
    }
    if (items.length > 0) {
      groups.push({ metricId: 'cls', metricLabel: 'CLS', items: items.slice(0, CULPRIT_ITEM_CAP) });
    }
  }

  if (isFailing('tbt')) {
    const items: CulpritItem[] = [];
    const longTasks: any[] = lhr.audits?.['long-tasks']?.details?.items ?? [];
    for (const task of Array.isArray(longTasks) ? longTasks : []) {
      if (typeof task?.url === 'string' && typeof task?.duration === 'number') {
        items.push({ label: resourceDisplayName(task.url, pageUrl), value: `${Math.round(task.duration)} ms` });
      }
    }
    const thirdParties: any[] = lhr.audits?.['third-party-summary']?.details?.items ?? [];
    for (const entry of Array.isArray(thirdParties) ? thirdParties : []) {
      const name = typeof entry?.entity === 'string' ? entry.entity : entry?.entity?.text;
      if (typeof name === 'string' && typeof entry?.blockingTime === 'number' && entry.blockingTime > 0) {
        items.push({ label: name, value: `${Math.round(entry.blockingTime)} ms` });
      }
    }
    if (items.length > 0) {
      groups.push({ metricId: 'tbt', metricLabel: 'TBT', items: items.slice(0, CULPRIT_ITEM_CAP) });
    }
  }

  return groups;
}
```

In `mapLhrToAuditResult`, add after the `diagnostics` line:

```ts
  const culprits = mapCulprits(lhr, metrics, pageUrl);
```

and add to the returned object literal, after `cwvVerdict: buildCwvVerdict(metrics),`:

```ts
    culprits,
```

- [ ] **Step 4: Run all server tests**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/mapping.ts server/test/mapping.test.ts
git commit -m "feat(mapping): extract per-metric culprits (LCP element/phases, layout shifts, long tasks)"
```

---

### Task 9: Judged diagnostics, resource cross-link/naming, filmstrip

**Files:**
- Modify: `server/src/mapping.ts`
- Test: `server/test/mapping.test.ts`

**Interfaces:**
- Consumes: `DiagnosticsStatuses`, `FilmstripFrame` (Task 4); `resourceDisplayName`, `mapOpportunities(lhr, pageUrl)` (Task 7).
- Produces (used by Tasks 11–12 UI):
  - `mapDiagnostics(lhr: any): DiagnosticsData` — now includes `statuses`.
  - `mapResources(lhr: any, pageUrl: string, opportunities: Opportunity[]): ResourceRow[]` — **signature change** (was 1-arg).
  - `mapFilmstrip(lhr: any): FilmstripFrame[]`.
  - `mapLhrToAuditResult` sets `filmstrip`.

- [ ] **Step 1: Add the failing tests to `server/test/mapping.test.ts`**

Add `mapFilmstrip, mapResources` to the import from `'../src/mapping'`, then append:

```ts
describe('mapDiagnostics statuses', () => {
  it('maps Lighthouse audit scores to statuses with 0.9/0.5 bands, neutral when unscored', () => {
    const lhr = {
      audits: {
        'server-response-time': { numericValue: 600, score: 0.95 },
        interactive: { numericValue: 3000, score: 0.6 },
        'dom-size': { numericValue: 1842, score: 0.2 },
        'total-byte-weight': { numericValue: 1048576 }, // no score → neutral
        'mainthread-work-breakdown': { numericValue: 4000, score: 0.5 },
        'network-requests': { details: { items: [{ url: 'https://a.com/x.js' }] } },
      },
    };
    const diagnostics = mapDiagnostics(lhr as any);
    expect(diagnostics.statuses).toEqual({
      ttfb: 'good',
      tti: 'needs-improvement',
      domSize: 'poor',
      transferSize: 'neutral',
      mainThreadWork: 'needs-improvement',
      networkRequests: 'neutral',
    });
  });
});

describe('mapResources naming + opportunity cross-link', () => {
  it('names cross-origin resources with hostname and links rows to the opportunity that flagged them', () => {
    const lhr = {
      audits: {
        'network-requests': {
          details: {
            items: [
              { url: 'https://example.com/js/app.js', transferSize: 200000, resourceType: 'Script' },
              { url: 'https://cdn.example.com/lib/vendor.js', transferSize: 100000, resourceType: 'Script' },
            ],
          },
        },
        'unused-javascript': {
          title: 'Reduce unused JavaScript',
          description: 'Dead code.',
          details: {
            type: 'opportunity',
            overallSavingsMs: 400,
            items: [{ url: 'https://example.com/js/app.js', totalBytes: 150000 }],
          },
        },
      },
    };
    const opportunities = mapOpportunities(lhr as any, 'https://example.com/');
    const resources = mapResources(lhr as any, 'https://example.com/', opportunities);

    const appRow = resources.find(r => r.resource === 'app.js')!;
    expect(appRow.optimization).toBe('Reduce unused JavaScript');

    const vendorRow = resources.find(r => r.resource === 'cdn.example.com · vendor.js')!;
    expect(vendorRow.optimization).toBe('Code-split, tree-shake'); // generic hint fallback
  });
});

describe('mapFilmstrip', () => {
  it('maps screenshot-thumbnails frames to timing + data URI pairs', () => {
    const lhr = {
      audits: {
        'screenshot-thumbnails': {
          details: {
            items: [
              { timing: 375, data: 'data:image/jpeg;base64,AAA' },
              { timing: 750, data: 'data:image/jpeg;base64,BBB' },
            ],
          },
        },
      },
    };
    expect(mapFilmstrip(lhr as any)).toEqual([
      { timingMs: 375, dataUri: 'data:image/jpeg;base64,AAA' },
      { timingMs: 750, dataUri: 'data:image/jpeg;base64,BBB' },
    ]);
  });

  it('returns an empty array when the audit is missing', () => {
    expect(mapFilmstrip({ audits: {} } as any)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new blocks fail**

Run: `cd server && npx vitest run test/mapping.test.ts`
Expected: FAIL — `statuses` undefined; `mapResources` has wrong arity/behavior; `mapFilmstrip` not exported.

- [ ] **Step 3: Implement in `server/src/mapping.ts`**

Add `DiagnosticStatus, DiagnosticsStatuses, FilmstripFrame` to the `import type { ... } from './types';` line.

Add near `mapDiagnostics`:

```ts
function statusFromScore(score: unknown): DiagnosticStatus {
  if (typeof score !== 'number') return 'neutral';
  if (score >= 0.9) return 'good';
  if (score >= 0.5) return 'needs-improvement';
  return 'poor';
}
```

Replace `mapDiagnostics`:

```ts
export function mapDiagnostics(lhr: any): DiagnosticsData {
  const bytesTotal = lhr.audits?.['total-byte-weight']?.numericValue ?? 0;
  const statuses: DiagnosticsStatuses = {
    ttfb: statusFromScore(lhr.audits?.['server-response-time']?.score),
    tti: statusFromScore(lhr.audits?.['interactive']?.score),
    domSize: statusFromScore(lhr.audits?.['dom-size']?.score),
    transferSize: statusFromScore(lhr.audits?.['total-byte-weight']?.score),
    mainThreadWork: statusFromScore(lhr.audits?.['mainthread-work-breakdown']?.score),
    networkRequests: 'neutral', // Lighthouse does not score request count.
  };
  return {
    ttfbSeconds: round2((lhr.audits?.['server-response-time']?.numericValue ?? 0) / 1000),
    ttiSeconds: round2((lhr.audits?.['interactive']?.numericValue ?? 0) / 1000),
    domSizeNodes: Math.round(lhr.audits?.['dom-size']?.numericValue ?? 0),
    networkRequests: (lhr.audits?.['network-requests']?.details?.items ?? []).length,
    transferSizeMB: round2(bytesTotal / (1024 * 1024)),
    mainThreadWorkSeconds: round2((lhr.audits?.['mainthread-work-breakdown']?.numericValue ?? 0) / 1000),
    statuses,
  };
}
```

Replace `mapResources` (new signature + naming + cross-link):

```ts
export function mapResources(lhr: any, pageUrl: string, opportunities: Opportunity[]): ResourceRow[] {
  const urlToOpportunityTitle = new Map<string, string>();
  for (const opportunity of opportunities) {
    const oppItems: any[] = lhr.audits?.[opportunity.id]?.details?.items ?? [];
    for (const item of Array.isArray(oppItems) ? oppItems : []) {
      if (typeof item?.url === 'string' && !urlToOpportunityTitle.has(item.url)) {
        urlToOpportunityTitle.set(item.url, opportunity.title);
      }
    }
  }

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
      return {
        category,
        resource: resourceDisplayName(i.url, pageUrl),
        transferSize: formatBytes(i.transferSize),
        transferBytes: i.transferSize as number,
        loadContributionPct: Math.round((i.transferSize / totalBytes) * 100),
        optimization: urlToOpportunityTitle.get(i.url) ?? OPTIMIZATION_HINT[category],
      };
    })
    .sort((a, b) => b.transferBytes - a.transferBytes)
    .slice(0, 12);
}
```

Add `mapFilmstrip`:

```ts
export function mapFilmstrip(lhr: any): FilmstripFrame[] {
  const items = lhr.audits?.['screenshot-thumbnails']?.details?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((i: any) => typeof i?.data === 'string' && typeof i?.timing === 'number')
    .map((i: any) => ({ timingMs: i.timing, dataUri: i.data }));
}
```

In `mapLhrToAuditResult`, update the `resources` line to the new signature and add `filmstrip`:

```ts
  const resources = mapResources(lhr, pageUrl, opportunities);
```

and in the returned object literal, after `culprits,`:

```ts
    filmstrip: mapFilmstrip(lhr),
```

- [ ] **Step 4: Run all server tests + typecheck**

Run: `cd server && npx vitest run && npx tsc --noEmit`
Expected: PASS / 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/mapping.ts server/test/mapping.test.ts
git commit -m "feat(mapping): judged diagnostics, resource cross-links + hostnames, loading filmstrip"
```

---

### Task 10: Client truthfulness UI — MetricCard "not measurable", History INP dash, verdict line

**Files:**
- Modify: `client/src/components/MetricCard.tsx`
- Modify: `client/src/views/History.tsx`
- Modify: `client/src/components/SummaryHero.tsx`

**Interfaces:**
- Consumes: `MetricValue.measurable?`, `AuditResult.cwvVerdict?` (Task 4 client types).
- Produces: no new exports — visual behavior only.

- [ ] **Step 1: Update `MetricCard.tsx` for non-measurable metrics**

In the component body, after `const [hovered, setHovered] = useState(false);`, add:

```ts
  const notMeasurable = metric.measurable === false;
```

Replace the value block:

```tsx
      <div className="mb-3 flex items-baseline gap-[3px]">
        <span className="font-mono text-4xl font-semibold leading-none tracking-[-0.03em]">{metric.displayValue}</span>
        {metric.unit && <span className="font-mono text-base text-text-faint">{metric.unit}</span>}
      </div>
```

with:

```tsx
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
```

Replace the status pill block:

```tsx
      <div
        className="mb-3.5 inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold"
        style={{ background: pill.bg, borderColor: pill.border, color: pill.text }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: pill.dot }} />
        {statusLabel(metric.status)}
      </div>
```

with:

```tsx
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
```

Replace the threshold bar + Good/Poor labels (the two `div`s starting `<div className="relative mb-2">` through the `Good`/`Poor` row) with:

```tsx
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
```

(Leave the header, `fullName` line, and hover tooltip untouched — the tooltip still educates about what INP is.)

- [ ] **Step 2: Update the History INP cell in `client/src/views/History.tsx`**

Replace:

```tsx
                      <span className="font-mono text-text-tertiary">{Math.round(run.inp)}ms</span>
```

with:

```tsx
                      <span className="font-mono text-text-tertiary">
                        {run.inp === 0 ? '—' : `${Math.round(run.inp)}ms`}
                      </span>
```

- [ ] **Step 3: Add the verdict line to `client/src/components/SummaryHero.tsx`**

Insert directly after the closing `</p>` of the summary sentence paragraph (before the three-stat grid):

```tsx
        {result.cwvVerdict && (
          <div className="mb-5">
            <span
              className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1 text-[12.5px] font-semibold ${
                result.cwvVerdict.passes
                  ? 'border-[#bbf7d0] bg-[#ecfdf3] text-[#15803d]'
                  : 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
              }`}
            >
              {result.cwvVerdict.passes
                ? '✓ Passes Core Web Vitals (lab)'
                : `✗ Fails Core Web Vitals (lab) — ${result.cwvVerdict.failing.join(', ')}`}
            </span>
            <div className="mt-1.5 text-[11px] text-text-faint">{result.cwvVerdict.note}</div>
          </div>
        )}
```

Also change the summary paragraph's `mb-6` class to `mb-4` so spacing stays balanced with the new block.

- [ ] **Step 4: Typecheck the client**

Run: `cd client && npx tsc --noEmit`
Expected: PASS — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/MetricCard.tsx client/src/views/History.tsx client/src/components/SummaryHero.tsx
git commit -m "feat(client): honest INP display and lab CWV verdict line"
```

---

### Task 11: Client insights UI — CulpritsSection + Filmstrip components, Dashboard wiring

**Files:**
- Create: `client/src/components/CulpritsSection.tsx`
- Create: `client/src/components/Filmstrip.tsx`
- Modify: `client/src/views/Dashboard.tsx`

**Interfaces:**
- Consumes: `MetricCulpritGroup`, `FilmstripFrame`, `AuditResult.culprits?`/`filmstrip?` (Task 4 client types).
- Produces: `CulpritsSection({ culprits: MetricCulpritGroup[] })`, `Filmstrip({ frames: FilmstripFrame[] })`.

- [ ] **Step 1: Create `client/src/components/CulpritsSection.tsx`**

```tsx
import type { MetricCulpritGroup } from '../types';

interface CulpritsSectionProps {
  culprits: MetricCulpritGroup[];
}

export function CulpritsSection({ culprits }: CulpritsSectionProps) {
  if (culprits.length === 0) return null;
  return (
    <section>
      <div className="mb-4 mt-10 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">What's causing this</h2>
        <span className="font-mono text-xs text-text-faint">culprits for failing metrics</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {culprits.map(group => (
          <div key={group.metricId} className="rounded-2xl border border-border-card bg-white p-5 shadow-card">
            <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.03em] text-text-tertiary">
              {group.metricLabel}
            </div>
            <ul className="flex flex-col gap-2.5">
              {group.items.map((item, i) => (
                <li key={i} className="text-[13px] leading-snug">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words font-mono text-text-primary">{item.label}</span>
                    {item.value && <span className="flex-none font-mono text-xs text-text-muted">{item.value}</span>}
                  </div>
                  {item.detail && (
                    <div className="mt-0.5 break-words font-mono text-[11px] text-text-faint">{item.detail}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `client/src/components/Filmstrip.tsx`**

```tsx
import type { FilmstripFrame } from '../types';

interface FilmstripProps {
  frames: FilmstripFrame[];
}

export function Filmstrip({ frames }: FilmstripProps) {
  if (frames.length === 0) return null;
  return (
    <section>
      <div className="mb-4 mt-10 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Loading filmstrip</h2>
        <span className="font-mono text-xs text-text-faint">what users see while the page loads</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border-card bg-white p-4 shadow-card">
        <div className="flex gap-3">
          {frames.map((frame, i) => (
            <figure key={i} className="flex-none">
              <img
                src={frame.dataUri}
                alt={`Page at ${(frame.timingMs / 1000).toFixed(1)}s`}
                className="h-[120px] w-auto rounded-lg border border-border-inner"
              />
              <figcaption className="mt-1.5 text-center font-mono text-[11px] text-text-muted">
                {(frame.timingMs / 1000).toFixed(1)}s
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire both into `client/src/views/Dashboard.tsx`**

Add imports (alphabetical placement with the others):

```ts
import { CulpritsSection } from '../components/CulpritsSection';
import { Filmstrip } from '../components/Filmstrip';
```

Replace the done-phase render block:

```tsx
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
```

with:

```tsx
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
```

- [ ] **Step 4: Typecheck the client**

Run: `cd client && npx tsc --noEmit`
Expected: PASS — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CulpritsSection.tsx client/src/components/Filmstrip.tsx client/src/views/Dashboard.tsx
git commit -m "feat(client): culprits section and loading filmstrip"
```

---

### Task 12: Client insights UI — opportunity affects-chips + metric filters, judged diagnostics tiles

**Files:**
- Modify: `client/src/components/OpportunitiesList.tsx`
- Modify: `client/src/components/OpportunityCard.tsx`
- Modify: `client/src/components/Diagnostics.tsx`

**Interfaces:**
- Consumes: `Opportunity.affects?`, `DiagnosticsData.statuses?` (Task 4 client types).
- Produces: no new exports — visual behavior only.

- [ ] **Step 1: Replace `client/src/components/OpportunitiesList.tsx`**

Full new content:

```tsx
import { useState } from 'react';
import type { Opportunity } from '../types';
import { OpportunityCard } from './OpportunityCard';

const FILTERABLE_METRICS = ['LCP', 'CLS', 'TBT', 'FCP'] as const;

interface OpportunitiesListProps {
  opportunities: Opportunity[];
}

export function OpportunitiesList({ opportunities }: OpportunitiesListProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [metricFilter, setMetricFilter] = useState<string | null>(null);

  const availableFilters = FILTERABLE_METRICS.filter(metric =>
    opportunities.some(o => o.affects?.includes(metric))
  );
  const visible = metricFilter ? opportunities.filter(o => o.affects?.includes(metricFilter)) : opportunities;

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
      <div className="mb-4 mt-11 flex flex-wrap items-baseline justify-between gap-3 px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Top Performance Opportunities</h2>
        <div className="flex flex-wrap items-center gap-3">
          {availableFilters.length > 0 && (
            <div className="flex items-center gap-1.5">
              {availableFilters.map(metric => (
                <button
                  key={metric}
                  onClick={() => setMetricFilter(current => (current === metric ? null : metric))}
                  className={`rounded-pill border px-2.5 py-1 text-[11px] font-semibold ${
                    metricFilter === metric
                      ? 'border-brand bg-brand-tint text-brand-tintText'
                      : 'border-border-control bg-white text-text-tertiary hover:bg-surface-muted'
                  }`}
                >
                  {metric}
                  {metricFilter === metric && <span className="ml-1">✕</span>}
                </button>
              ))}
            </div>
          )}
          <span className="font-mono text-xs text-text-faint">
            {metricFilter ? `${visible.length} of ${opportunities.length}` : `${opportunities.length} found`} · ranked
            by savings
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {visible.map(opportunity => (
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

- [ ] **Step 2: Add affects-chips to `client/src/components/OpportunityCard.tsx`**

Inside the `<div className="min-w-0 flex-1">` block, after the subtitle line

```tsx
          <div className="text-[12.5px] text-text-muted">{opportunity.subtitle}</div>
```

add:

```tsx
          {opportunity.affects && opportunity.affects.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {opportunity.affects.map(metric => (
                <span
                  key={metric}
                  className="rounded-pill border border-border-control bg-surface-muted px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary"
                >
                  {metric}
                </span>
              ))}
            </div>
          )}
```

- [ ] **Step 3: Replace `client/src/components/Diagnostics.tsx`**

Full new content:

```tsx
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
```

(Hints render only for `needs-improvement`/`poor` tiles — advice appears when there's a problem; good/neutral tiles keep today's look apart from the green value on good.)

- [ ] **Step 4: Typecheck the client**

Run: `cd client && npx tsc --noEmit`
Expected: PASS — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/OpportunitiesList.tsx client/src/components/OpportunityCard.tsx client/src/components/Diagnostics.tsx
git commit -m "feat(client): metric filter chips on opportunities and judged diagnostics tiles"
```

---

### Task 13: Header cleanup + RUNNING.md updates

**Files:**
- Modify: `client/src/components/Header.tsx` (note: the working tree already has an uncommitted `hidden`-class hack on this button — this task replaces that hack with a proper removal)
- Modify: `RUNNING.md`

- [ ] **Step 1: Remove the Export button from `client/src/components/Header.tsx`**

Delete this entire block (the working-tree version has `hidden flex …` as the first classes; delete the whole button either way):

```tsx
          <button className="hidden flex items-center gap-[7px] rounded-[9px] border border-border-control bg-white px-3.5 py-2 text-[13px] font-semibold text-text-primary shadow-card hover:border-[#d4d4d8] hover:bg-surface-muted">
            Export report
            <span className="text-[10px] text-text-faint">▾</span>
          </button>
```

The right-side cluster keeps only the History button.

- [ ] **Step 2: Update `RUNNING.md`**

In the "Security note" section, after the sentence ending "It is intended to run on `localhost` only.", add:

```markdown
The API server now binds to `127.0.0.1` explicitly, so it is not reachable from other machines even if the host firewall allows it.
```

In "Notes", replace:

```markdown
- "Export report" in the header is an intentional **non-functional placeholder** (a future PDF/CSV export), per the design handoff.
```

with:

```markdown
- The design handoff's "Export report" button has been removed until export is actually implemented (it was a non-functional placeholder).
```

- [ ] **Step 3: Typecheck the client**

Run: `cd client && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Header.tsx RUNNING.md
git commit -m "chore: remove dead Export button; document loopback bind"
```

---

### Task 14: End-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Static checks from the repo root**

Run: `npm run typecheck && npm run test && npm run build`
Expected: both workspaces typecheck; all server tests pass (existing + queue + db + new mapping blocks); both builds succeed.

- [ ] **Step 2: Boot the full stack**

Run (repo root): `npm run dev > /tmp/cwv-report-e2e.log 2>&1 &` then wait ~5s.
Expected: log shows the API on :3001 and Vite on :5173. Also verify loopback-only binding:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

Expected: the node process listens on `127.0.0.1:3001` (not `*:3001`).

- [ ] **Step 3: Queue behavior — two concurrent audits**

```bash
curl -s -X POST http://localhost:5173/api/audits -H 'Content-Type: application/json' -d '{"url":"https://example.com","device":"mobile"}'
curl -s -X POST http://localhost:5173/api/audits -H 'Content-Type: application/json' -d '{"url":"https://example.org","device":"mobile"}'
```

Immediately poll both ids (`curl -s http://localhost:5173/api/audits/<id>`).
Expected: while the first is `running`, the second reports `status:"queued"` with `stage:"Waiting in queue…"`; both eventually reach `done`.

- [ ] **Step 4: New result fields present and honest**

For one completed id, fetch `curl -s http://localhost:5173/api/audits/<id>/full` and check:
- `.cwvVerdict` exists with `passes`, `failing`, and the exact note string.
- `.metrics[] | select(.id=="inp")` has `measurable: false` and `displayValue: "—"`.
- `.filmstrip` is a non-empty array of `{timingMs, dataUri}` (data URIs start `data:image/`).
- `.diagnostics.statuses` exists with the six keys.
- If any of LCP/CLS/TBT is not `good`, `.culprits` has a matching group; otherwise it may be `[]`.
- Opportunities (if any) carry `affects` arrays.

- [ ] **Step 5: Orphan sweep on restart**

Start a third audit against a slow-ish real URL, then within a few seconds kill the dev processes, restart `npm run dev`, and fetch that audit's status.
Expected: `status:"error"` with `error:"Interrupted by server restart."`; server log line mentions the swept audit count.

- [ ] **Step 6: Browser checklist (report for the human to confirm)**

Note in the final report that the human should verify at http://localhost:5173 after running an audit against a real-world (imperfect) site:
- INP card shows "—" with the grey "Not measurable" pill and the lab-data caption.
- Verdict pill under the summary sentence (green pass or red fail naming metrics).
- Loading filmstrip renders between summary and metrics.
- "What's causing this" section lists culprits for failing metrics only.
- Opportunity cards show affects-chips; header filter chips filter the list and toggle off.
- Diagnostics tiles color bad values and show hints only for problem tiles.
- Resource table shows `hostname · file` for CDN resources and opportunity titles in the Optimization column where applicable.
- History table shows "—" in the INP column; Export button gone from the header.

- [ ] **Step 7: Tear down**

Kill the dev processes; confirm `lsof -i :3001` and `lsof -i :5173` are both empty.

- [ ] **Step 8: Final commit** (only if fixes were needed during verification; otherwise skip)

```bash
git add -A
git commit -m "fix: address issues found during report-improvements e2e verification"
```
