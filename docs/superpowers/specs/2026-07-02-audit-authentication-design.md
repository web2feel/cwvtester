# Design: Authentication for audits

Extends the Core Web Vitals Tester so audits can run against sites behind a login (staging/preview environments). Builds on the shipped app (see [2026-07-02-cwvtester-design.md](2026-07-02-cwvtester-design.md)). Reference mockup: an "Authentication" card with a METHOD segmented control, Username/Password fields, helper text, and a session-only credentials warning.

## Scope

- **HTTP Basic auth only** (plus a "None" default). The mockup's Token and Cookie methods are deliberately deferred — not built in this iteration.
- Mechanism: HTTP Basic `Authorization` header applied to every request Chrome makes during the audit, via Lighthouse's `settings.extraHeaders`.

## Security constraints (non-negotiable)

- **Credentials are never persisted.** They arrive in the `POST /api/audits` body, are used in-memory to build the request header, and are never written to SQLite, `result_json`, or logs.
- **Credentials are session-only on the client.** Held in React state; never written to `localStorage`/`sessionStorage`.
- The stored `AuditResult` records only `authUsed: 'basic' | null` — a masked flag, never the username or password.

## UI — `AuthCard` component

New component `client/src/components/AuthCard.tsx`, rendered on the Dashboard between the audit form (meta line) and the results/empty-state, matching the mockup:

- **Collapsible card** (white, `border-radius 16px`, `border 1px #ececec`, `shadow-card`): a lock icon + "Authentication" title + a "BASIC AUTH" pill (brand-tint, shown only when method is `basic`), and on the right a status label ("Basic auth configured" when basic + both fields filled, else "No authentication") with a chevron toggling collapse/expand. Default expanded state: collapsed when method is `none`, expanded otherwise; user can toggle.
- **METHOD segmented control**: **None** (default) / **Basic**, styled like the existing device segmented control (`bg-surface-muted3`, sliding white pill on the active side). (Token/Cookie tabs are out of scope this iteration.)
- **When method is `basic`:** a 2-column row of **Username** and **Password** inputs (password `type="password"`, both monospace like the URL input), then the helper line — "Sent as an HTTP Basic `Authorization` header. Works for most staging environments behind a simple login prompt." (the word `Authorization` rendered as an inline code chip) — then the amber warning callout (`bg-warn.bg`, `border-warn.border`, warn text, ⚠ icon): "Credentials are kept for this session only and masked in audit history. Use staging credentials — never a production password."
- **When method is `none`:** only the METHOD control shows (no fields, helper, or warning).

## State & data flow

- `App` owns `auth: { method: 'none' | 'basic'; username: string; password: string }` in React state, default `{ method: 'none', username: '', password: '' }`. Passed to the Dashboard, which passes method/fields + change handlers to `AuthCard`.
- Derived `authComplete = auth.method === 'basic' && auth.username.trim() !== '' && auth.password !== ''`.
- **Run Audit is disabled** when `phase === 'running'` OR (`auth.method === 'basic'` AND NOT `authComplete`). `AuthCard` shows an inline hint ("Enter a username and password") when basic is selected but incomplete.
- `runAudit(url)` attaches auth to the POST body only when `authComplete`:
  `POST /api/audits { url, device, auth?: { type: 'basic', username, password } }`.

## Backend

- **Route** (`app.ts`): accept an optional `auth` field on `POST /api/audits`. Validate: if present, it must be `{ type: 'basic', username: string, password: string }` (non-empty strings) → otherwise `400`. Pass the validated auth (or undefined) to `startAudit`.
- **Header builder** (`mapping.ts`, pure + unit-tested):
  `buildAuthHeaders(auth?: AuthConfig): Record<string, string>` → for `{ type: 'basic', username, password }` returns `{ Authorization: 'Basic ' + base64(`${username}:${password}`) }`; for undefined/none returns `{}`. (base64 via `Buffer.from(...).toString('base64')`.)
- **Runner** (`runner.ts`): `startAudit(url, device, auth?)` threads `auth` through; when building the Lighthouse config, merge `settings.extraHeaders = buildAuthHeaders(auth)` (only added when non-empty). Persist `authUsed = auth ? 'basic' : null` into the mapped result. **Never log the auth object or its values.**
- **Mapping/types:** `AuditResult` gains `authUsed: 'basic' | null`. `mapLhrToAuditResult(lhr, url, device, authUsed)` sets it. A new `AuthConfig` type `{ type: 'basic'; username: string; password: string }` is added to both `server/src/types.ts` and `client/src/types.ts` (kept hand-synced, as with the rest of the types).

## History indicator

- `HistoryRun` gains `authUsed: 'basic' | null` (read from the stored result). In the History runs table, rows where `authUsed === 'basic'` show a small `🔒 Basic auth` chip near the URL/device cell — no credentials. The Dashboard's completed meta line similarly appends a `🔒 Basic auth` segment when the shown result used auth.

## Error handling

- Wrong credentials are not special-cased: the target returns 401 and Lighthouse audits that response (a normal, poor-scoring result) or yields a `runtimeError` — both already handled by existing error/result states.
- Malformed `auth` body → `400 { error }` (existing JSON error contract).
- Client guards prevent submitting incomplete basic auth (Run Audit disabled + inline hint).

## Testing

- **Unit (Vitest, server):** `buildAuthHeaders` — Basic produces the correct `Authorization: Basic <base64>` header (verify the base64 of a known `user:pass`); none/undefined produce `{}`. Plus `mapLhrToAuditResult` sets `authUsed` correctly for both authed and non-authed runs.
- **Integration/e2e:** run an audit against `https://httpbin.org/basic-auth/<user>/<pass>` — it returns 401 without creds and 200 with them, so a completed (non-error) audit demonstrates the header reached Chrome. Then grep the SQLite DB and `result_json` for the password string to confirm it is absent from storage. Also confirm a same-URL run WITHOUT creds ends in an error/poor result (proving the header actually mattered).
- **Manual (browser):** the card renders/collapses, the None/Basic control toggles the fields+warning, Run Audit disables while basic auth is incomplete, and the history chip appears for authed runs.

## Out of scope

- Token and Cookie auth methods (deferred; the segmented control ships with None/Basic only).
- Persisting or "remembering" credentials across sessions.
- Per-request custom header names beyond HTTP Basic.
