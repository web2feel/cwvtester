# Running the Core Web Vitals Tester

A local web app that runs a real [Lighthouse](https://developer.chrome.com/docs/lighthouse) performance audit against a URL and presents the results as a dashboard, with an audit-history view and score trend chart.

This is the implementation of the design in [`README.md`](README.md). Architecture and decisions are documented in [`docs/superpowers/specs/`](docs/superpowers/specs/) and [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Prerequisites

- **Node.js 20+** (developed on Node 24).
- **Google Chrome** (or Chromium) installed locally — the audit runner launches real headless Chrome via `chrome-launcher`. On macOS the default `/Applications/Google Chrome.app` is auto-detected; otherwise set `CHROME_PATH`.

## Install

```bash
npm install
```

This is an npm-workspaces monorepo; a single install at the root installs both the `server` and `client` workspaces.

## Run (development)

```bash
npm run dev
```

This starts both processes concurrently:

- **API server** → http://localhost:3001 (Express + SQLite + Lighthouse)
- **Web client** → http://localhost:5173 (Vite dev server; proxies `/api/*` to the server)

Open **http://localhost:5173** and enter a URL to audit. A real Lighthouse run takes roughly 10–40 seconds depending on the target site.

Audit history is persisted to `server/data/db.sqlite` (git-ignored) and drives the History view and trend chart.

## Other scripts

```bash
npm run typecheck   # tsc --noEmit for both workspaces
npm run test        # server unit tests (Vitest) — Lighthouse→UI mapping
npm run build       # production build of both workspaces
```

## Security note — local single-user tool only

The server runs Lighthouse against **any URL the client submits**, which means it can reach internal/loopback/metadata addresses (an SSRF primitive). Chrome runs headless with `--no-sandbox` in-process. This is acceptable for a **local, single-user** tool.

**Do not expose this server on a shared network interface or multi-user host** without first adding URL/host allow-listing. It is intended to run on `localhost` only.

## Notes

- "Export report" in the header is an intentional **non-functional placeholder** (a future PDF/CSV export), per the design handoff.
- Opportunity cards show two real-data fields (**Why it hurts** / **Estimated impact**); the design mock's "Likely cause"/"Recommended fix" and the "Prioritized recommendations" section were intentionally omitted because real Lighthouse output can't honestly populate them (see the spec's "Deviations from the mock's curated copy").
