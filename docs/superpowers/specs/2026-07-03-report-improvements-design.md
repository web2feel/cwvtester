# Report Improvements: Robustness + Actionable Insights — Design

**Date:** 2026-07-03
**Status:** Approved
**Branch:** `feat/audit-authentication` (user chose to stack this work here; it is functionally independent of the auth plan)

## Goal

Two connected upgrades to the Core Web Vitals Tester:

1. **Robustness/correctness:** stop misreporting INP, serialize audit runs, add a run timeout, recover orphaned jobs, and bind the API to localhost as documented.
2. **Actionable insights:** turn the report from a restyled Lighthouse opportunity list into something that answers *"what exactly should I fix?"* — per-metric culprits, metric↔fix linkage, judged diagnostics, honest resource naming, a CWV verdict, a loading filmstrip, and history deltas.

## Non-Goals

- CrUX field data (needs an API key) — future work.
- Export report (intentional placeholder per the design handoff) — the dead button is removed instead.
- Run-diff of two arbitrary runs — only adjacent-run score deltas in History.
- HTTP Basic auth — separate, already-planned effort (`docs/superpowers/plans/2026-07-02-audit-authentication.md`).

## Architecture Decision

**Extend the server-side mapping (Option A).** `mapping.ts` keeps distilling the LHR into `AuditResult` at audit time, stored in `result_json`. No raw-LHR storage, no schema migration. Old stored runs simply lack new fields; the client treats every new field as optional and omits the corresponding UI.

Server and client `types.ts` remain hand-synced copies (existing convention).

---

## Part 1 — Server Robustness

### 1.1 Audit queue (concurrency 1) — `server/src/runner.ts`

- Module-level FIFO: `startAudit` inserts the DB row, sets the job to `{ status: 'queued', stage: 'Waiting in queue…' }`, pushes `{ id, url, device }` onto the queue, and kicks a drain loop.
- A single worker drains the queue: one Chrome/Lighthouse run at a time. Parallel POSTs no longer launch parallel Chromes (which skewed scores and exhausted CPU).
- The queued DB `stage` becomes `'Waiting in queue…'`; the run stages are unchanged.

### 1.2 Run timeout — `server/src/runner.ts`

- Each Lighthouse run races a **90-second** watchdog (`AUDIT_TIMEOUT_MS = 90_000`).
- On timeout: the job fails with `'The audit timed out after 90 seconds.'` and Chrome is killed (existing `finally` block).

### 1.3 Orphan recovery + job-map hygiene

- **Startup sweep** (`server/src/db.ts`, called from `index.ts` or module init):
  `UPDATE audits SET status='error', stage=NULL, error='Interrupted by server restart.', finished_at=? WHERE status IN ('queued','running')`.
- **Eviction:** when a job reaches a terminal state (`done`/`error`), delete its entry from the in-memory `jobs` map — the DB row is authoritative and `GET /api/audits/:id` already falls back to it.

### 1.4 Localhost binding — `server/src/index.ts`

`app.listen(PORT, '127.0.0.1', …)`, matching RUNNING.md's "localhost only" promise.

### 1.5 Header cleanup — `client/src/components/Header.tsx`

Remove the Export report button outright (replacing the uncommitted `hidden flex` hack). Update RUNNING.md's note: export is removed until actually implemented.

---

## Part 2 — Metric Truthfulness

### 2.1 INP is not measurable in lab — `mapping.ts`, `MetricCard`, `History`

- `MetricValue` gains `measurable: boolean`. `mapMetric` sets `measurable: false` when the audit is missing/scoreless — which is always the case for `interaction-to-next-paint` in navigation-mode lab runs.
- Card UI for a non-measurable metric: value "—", neutral (grey) styling, caption "Not measurable in lab tests" instead of the threshold bar.
- History table: the INP column renders "—" when `inp === 0` (covers both old rows and new ones, since lab INP is never produced).

### 2.2 CWV verdict — `mapping.ts`, `SummaryHero`

- New optional field on `AuditResult`:
  ```ts
  cwvVerdict?: {
    passes: boolean;          // lab LCP and CLS both 'good'
    failing: string[];        // e.g. ['LCP'] — metrics not 'good'
    note: string;             // 'Lab verdict from LCP + CLS. INP requires field data.'
  }
  ```
- Rendered as a single line in the summary hero: "✓ Passes Core Web Vitals (lab)" or "✗ Fails Core Web Vitals (lab) — LCP", with the note as muted small text.

---

## Part 3 — Actionable Insights

### 3.1 Per-metric culprits — `mapping.ts` + new `client/src/components/CulpritsSection.tsx`

New optional field on `AuditResult`:

```ts
culprits?: {
  metricId: 'lcp' | 'cls' | 'tbt';
  metricLabel: string;               // 'LCP'
  items: { label: string; detail?: string; value?: string }[];  // max 5 per group
}[];
```

Extraction (all defensive — every audit/shape may be absent):

- **LCP** — `largest-contentful-paint-element`: the LCP element (node `selector`/`nodeLabel` → `label`, `snippet` → `detail`) plus the phase breakdown rows (TTFB / load delay / load time / render delay → one item each with `value` = ms). Also `prioritize-lcp-image` when it fails (its item + savings).
- **CLS** — `layout-shifts` (LH 12) falling back to `layout-shift-elements`: shifted element node → `label`, shift score → `value` (e.g. "shift 0.18").
- **TBT** — `long-tasks`: script URL (named per §3.4) → `label`, duration → `value`; plus `third-party-summary` entities with `blockingTime > 0` → entity name + blocking ms.

A metric group is included only when that metric's status is not `'good'` **and** items were extracted. The client renders a "What's causing this" section directly below the metrics grid — one block per group; the whole section is absent when `culprits` is empty/missing.

### 3.2 Metric↔fix linkage — `mapping.ts`, `OpportunityCard`, `OpportunitiesList`

- `Opportunity` gains `affects: string[]` (e.g. `['LCP', 'FCP']`): keys of `audit.metricSavings` with value > 0, mapped to display labels; fallback to the existing `METRIC_FOR_AUDIT` table when `metricSavings` is absent.
- `estimatedImpact` uses real per-metric numbers when `metricSavings` is present ("~0.5s faster LCP").
- **Byte-only opportunities included:** an audit qualifies when `overallSavingsMs > 0` **or** `overallSavingsBytes >= 10240` (10 KB floor to skip noise). New `savingsBytes?: number`. Severity when ms = 0: bytes ≥ 500 KB → high, ≥ 100 KB → medium, else low. `savingsDisplay` when ms = 0: "−512 KB". Sort: `savingsMs` desc, then `savingsBytes` desc.
- **Filter chips** in the Opportunities section header (LCP / CLS / TBT / FCP — only chips that match at least one opportunity are shown). Clicking toggles a client-side filter (`affects` includes metric); an active chip shows an ✕. Cards show their `affects` values as small chips.

### 3.3 Judged diagnostics — `mapping.ts`, `Diagnostics.tsx`

- `DiagnosticsData` gains:
  ```ts
  statuses?: {
    ttfb: Status | 'neutral';
    tti: Status | 'neutral';
    domSize: Status | 'neutral';
    transferSize: Status | 'neutral';
    mainThreadWork: Status | 'neutral';
    networkRequests: 'neutral';    // Lighthouse doesn't score request count
  };
  ```
- Status from each underlying audit's Lighthouse `score`: ≥ 0.9 `good`, ≥ 0.5 `needs-improvement`, < 0.5 `poor`, missing score → `neutral`. (Audits: `server-response-time`, `interactive`, `dom-size`, `total-byte-weight`, `mainthread-work-breakdown`.)
- Tile UI: colored value (reusing metric-card status colors) + a static one-line hint per tile (client-side copy, e.g. DOM size → "Large DOMs slow style recalculation"). Neutral tiles keep today's look. Old runs (no `statuses`) render all-neutral.

### 3.4 Honest resource naming + opportunity cross-link — `mapping.ts`, `ResourceTable`

- Shared naming helper: same-origin (vs `lhr.finalDisplayedUrl ?? requestedUrl`) → filename (today's behavior); cross-origin → `hostname · filename` (e.g. `cdn.example.com · app.js`). Used by both the resource table and opportunity affected-resources chips.
- `mapResources` builds a URL → opportunity-title map from the already-computed opportunities' raw item URLs; a resource row's `optimization` becomes the matching opportunity title when one exists, else the existing generic category hint. (`mapLhrToAuditResult` passes opportunities into `mapResources`.)

### 3.5 Loading filmstrip — `mapping.ts` + new `client/src/components/Filmstrip.tsx`

- New optional field: `filmstrip?: { timingMs: number; dataUri: string }[]` from `screenshot-thumbnails` `details.items` (`timing`, `data`). Typically 8 frames, ~100–300 KB total — acceptable for local SQLite.
- Rendered as a horizontal strip (frame + timing label) between the summary hero and the metrics grid. Absent for old runs.

### 3.6 History score deltas — `client/src/views/History.tsx` only

- Computed client-side from the already-sorted runs list: for each run, delta vs the next-older run of the same URL. Rendered as a small chip per row: `▲ 4` (green) / `▼ 12` (red) / `—` (no previous run). No API or type changes.

---

## Error Handling

- All new mapping extractors are defensive (`?.`, `Array.isArray`, try/catch around `new URL`) and degrade to omitting the field — a malformed LHR section must never fail an otherwise-good audit.
- Queue worker: a thrown error in one run fails that job only; the worker continues with the next queued item.
- Timeout and restart-orphan failures produce user-readable `error` strings via the existing `fail()` path.

## Testing

Vitest (`server/test/mapping.test.ts` + new files as natural):

- INP maps `measurable: false`; measurable metrics map `true`.
- `cwvVerdict`: pass, fail-by-LCP, fail-by-CLS cases.
- Culprits: LCP element + phases, CLS shifts (both audit ids), TBT long tasks + third parties; group omitted when metric is good or audit missing.
- Opportunities: `metricSavings` → `affects` (+ fallback table); byte-only inclusion, 10 KB floor, byte severity tiers, byte `savingsDisplay`; sort order.
- Diagnostics statuses from scores incl. missing-score → neutral.
- Resource naming same-origin vs cross-origin; opportunity-title cross-link and generic-hint fallback.
- Filmstrip mapping (and absent audit → absent field).
- Queue: with a stubbed run function — serial execution of two enqueued jobs; one job's failure doesn't block the next; timeout path fails the job.
- Startup sweep marks `queued`/`running` rows as error (in-memory or temp-file DB).

Client: `tsc --noEmit` + production build; manual browser checklist at the end (culprits section, filter chips, filmstrip, verdict line, neutral INP card, history deltas).

## Compatibility Notes

- Old `result_json` rows lack every new field → client optionality handles them; no migration.
- The unexecuted auth plan (`2026-07-02-audit-authentication.md`) contains verbatim snippets of `runner.ts`/`types.ts`/`Dashboard.tsx` that will drift after this work; its architecture is unaffected but its literal snippets will need light adaptation when executed.
