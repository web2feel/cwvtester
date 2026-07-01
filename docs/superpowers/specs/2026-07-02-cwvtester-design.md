# Design: Core Web Vitals Tester (Node.js app + UI)

Source handoff: [README.md](../../../README.md) and `Core Web Vitals Tester.dc.html` (design reference, mock data only).

## Goal

Build a local, single-user web app that runs a real Lighthouse performance audit against a URL and presents it as the polished SaaS dashboard specified in the handoff, plus an audit history view with a score trend chart. Recreate the `.dc.html` prototype's visual design in React/TypeScript; wire it to a real Node/Lighthouse backend instead of mock data.

## Decisions

- **Repo layout:** npm workspaces monorepo — root `package.json` with `server` and `client` workspaces.
- **Frontend:** Vite + React + TypeScript + Tailwind CSS (custom theme mapping the handoff's design tokens).
- **Backend:** Express + TypeScript, running in a single long-lived local Node process (no serverless split — this avoids the awkward fit of long-running Chrome/Lighthouse work inside serverless-style route handlers).
- **Persistence:** SQLite via `better-sqlite3`.
- **Audit runner:** Real `chrome-launcher` + `lighthouse`, run in-process, one audit at a time (no queue/concurrency system needed for a local single-user tool).
- Chrome (`/Applications/Google Chrome.app`) and Node v24 / npm 11 are confirmed present on this machine.

## Architecture

```
/cwvtester
  package.json          (root, npm workspaces: "server", "client")
  server/                Express + TypeScript
  client/                Vite + React + TypeScript + Tailwind
```

- **client** (Vite dev server, default port 5173): React SPA, two views (`dashboard` / `history`) toggled by client state per the handoff. Talks to the backend via `fetch`; Vite dev server proxies `/api/*` to `http://localhost:3001` to avoid CORS.
- **server** (port 3001): Express app exposing an async job API — client submits an audit, gets an id back immediately, and polls for status/result while Lighthouse runs.
- **Audit runner:** in-memory job map (`Map<id, job>`) tracks stage transitions matching the handoff's loading copy: "Launching Chrome…" → "Loading page…" → "Running Lighthouse…" → "Analyzing performance…" → "Generating report…" → `done`/`error`. On completion, the mapped result is persisted to SQLite and the in-memory job is marked done.

## Backend: Data Model & API

**SQLite schema** (`server/data/db.sqlite`):

```sql
CREATE TABLE audits (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  device TEXT NOT NULL,          -- 'desktop' | 'mobile'
  status TEXT NOT NULL,          -- 'queued' | 'running' | 'done' | 'error'
  stage TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  error TEXT,
  result_json TEXT               -- JSON blob: scores, metrics, opportunities, recommendations, resources, diagnostics
);
```

One table is sufficient: the full audit result is stored as a single JSON blob per completed run. History/trend queries pull `id, url, device, status, created_at, result_json` and parse out score/metrics per row — cheap for a local single-user tool; no need to normalize into separate metric columns.

**API surface:**
- `POST /api/audits` — body `{ url, device }`. Validates the URL parses as http/https. Creates a row (`status: 'queued'`), starts the async job, returns `201 { id }`.
- `GET /api/audits/:id` — poll endpoint. Returns `{ status, stage, result?, error? }`. `404` if unknown id.
- `GET /api/audits?url=<url>` — list runs for that URL, newest first, for the History view. Defaults to the most recently audited URL if no `url` param is given.
- `GET /api/audits/:id/full` — full stored result for a given past run (same shape as the poll endpoint's `done` state), used when a history row is clicked.

**Audit runner internals** (`server/src/runner.ts`):
- `chrome-launcher` starts headless Chrome; `lighthouse(url, {port}, config)` runs with the built-in `mobile`/`desktop` presets per the requested device.
- Stage labels are approximated by wrapping the launch/audit lifecycle (`chrome-launcher.launch()` → "Launching Chrome…"; pre-audit → "Loading page…"; the `lighthouse()` call → "Running Lighthouse…" / "Analyzing performance…"; post-processing/mapping → "Generating report…") since Lighthouse doesn't emit granular stage events natively.
- Result mapping follows the handoff's "Mapping Lighthouse → this UI" section exactly:
  - Overall score: `lhr.categories.performance.score * 100` (rounded).
  - Metrics: LCP/INP/CLS/TBT/Speed Index/FCP via the specified `audits[...]` keys, using `.numericValue` for scale math and `.displayValue` for the label.
  - Opportunities: `audits` where `details.type === 'opportunity'`, sorted by `details.overallSavingsMs` desc, using `title`/`description`/`details.items`.
  - Diagnostics: TTFB, TTI, DOM size, network requests + transfer size, main-thread work via the named audits.
  - Status thresholds (good/needs-improvement/poor): LCP 2.5s/4s · INP 200ms/500ms · CLS 0.1/0.25 · TBT 200ms/600ms · SI 3.4s/5.8s · FCP 1.8s/3s.
- Errors are caught and classified (DNS/unreachable, timeout, Chrome launch failure, Lighthouse failure) and stored as `{ status: 'error', error }` rather than thrown past the API boundary.

### Deviations from the mock's curated copy (real-data-only decisions)

The `.dc.html` mock hand-writes editorial copy (per-issue "Likely cause" / "Recommended fix" text, and "Quick Win" / "Long Term" / effort labels) that real Lighthouse output cannot honestly reproduce — Lighthouse gives a title, one description paragraph, and savings numbers per audit, nothing more granular. Rather than fabricate plausible-sounding but unverified text, the real app deviates from the mock as follows:

- **Opportunity accordion collapses from 4 fields to 2:** "Why it hurts" (the real audit's `description`, stripped of markdown links) and "Estimated impact" (computed from `details.overallSavingsMs` and the metric it primarily affects). "Likely cause" and "Recommended fix" are dropped — no lookup-table copy is fabricated per audit id.
- **"Prioritized recommendations" section is removed entirely.** Its "Quick Win / High Impact / Medium Impact / Long Term" tags and "effort" labels are editorial judgments not derivable from Lighthouse's real output. The Opportunities accordion (already ranked by savings) is the single actionable list in the real app; the History view, Diagnostics, and Resource breakdown sections are unaffected.

## Frontend Structure & Components

```
client/src/
  main.tsx, App.tsx               top-level view switch (dashboard/history), owns shared state
  lib/api.ts                      fetch wrappers + usePollAudit hook
  lib/format.ts                   number/time formatting, status-band threshold logic
  types.ts                        AuditResult, Opportunity, Recommendation, ResourceRow, HistoryRun, etc.
  components/
    Header.tsx                    logo, wordmark, BETA pill, History/Export buttons
    AuditForm.tsx                 URL input, device segmented control, Run Audit button, meta line
    LoadingState.tsx              rotating status text driven by `stage`
    EmptyState.tsx
    ErrorState.tsx
    ScoreGauge.tsx                SVG semicircle + count-up animation (local rAF-based hook)
    SummaryHero.tsx                gauge + summary sentence + stat tiles
    MetricCard.tsx                 one CWV/lab metric card incl. threshold bar + tooltip
    MetricsGrid.tsx                6 MetricCards
    OpportunityCard.tsx            accordion issue row (collapsed/expanded), 2-field expanded panel
    OpportunitiesList.tsx
    ResourceTable.tsx
    Diagnostics.tsx
    Footer.tsx
  views/
    Dashboard.tsx                  composes AuditForm + (Empty|Loading|Error|results sections)
    History.tsx                    summary tiles, TrendChart.tsx, runs table
```

**State** (per the handoff's State Management section) lives in `App.tsx`: `view`, `device`, current `auditId`/`auditStatus`/`stage`/`auditResult`/`error`, `history[]`. `openIssues` is local to `OpportunitiesList`; `hoveredMetric` is local to `MetricsGrid`. `usePollAudit(id)` owns the polling interval and cleans up on unmount/completion.

**Styling:** `client/tailwind.config.ts` extends `theme.colors`/`spacing`/`borderRadius`/`fontFamily` with the exact tokens from the handoff's Design Tokens section (brand `#e35a2a`, status colors, greys, radii, Geist/Geist Mono). The gauge's SVG path math and count-up animation are hand-written — Tailwind doesn't help there.

## Error Handling & Responsive Behavior

- Frontend: URL input validates non-empty + parses as a URL before enabling submit. `ErrorState.tsx` surfaces backend error messages with a "Try again" affordance back to the empty/form state.
- Backend: classifies failures (DNS/unreachable, timeout, Chrome launch failure, Lighthouse failure) into human-readable messages stored on the audit row.
- Responsive: Tailwind breakpoints collapse the metrics/summary grids 3-col → 2-col → 1-col; tables and the trend chart keep `overflow-x-auto` wrappers with the doc's specified `min-width` values.

## Testing Plan

- `tsc --noEmit` on both workspaces for type safety.
- A few backend unit tests (Vitest) for the Lighthouse→UI mapping function and status-threshold logic (clear correct/incorrect outputs).
- Manual end-to-end verification in a real browser: run a live audit, confirm the dashboard renders correctly, confirm history accumulates across multiple runs, confirm loading/error/empty states — matching the visual reference in `.dc.html`.
- No component-level UI test suite — not enough logic-per-component to justify it for a single-user local tool; visual fidelity is checked by eye against the design reference.
