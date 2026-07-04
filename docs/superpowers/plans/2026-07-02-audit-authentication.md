# Audit Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let audits run against sites behind HTTP Basic auth (staging/preview), with credentials that are session-only and never persisted.

**Architecture:** The client collects Basic-auth username/password in a new `AuthCard` and sends them in the `POST /api/audits` body only for the current run. The server builds an `Authorization: Basic <base64>` header and injects it into Lighthouse's `settings.extraHeaders`. Credentials are never written to SQLite or logs; the stored result records only a masked `authUsed: 'basic' | null` flag, which drives a `🔒 Basic auth` indicator in history and the completed meta line.

**Tech Stack:** Existing stack — server (Express + TypeScript + better-sqlite3 + lighthouse, Vitest), client (Vite + React + TypeScript + Tailwind). No new dependencies (base64 via Node's `Buffer`).

## Global Constraints

- **Scope:** HTTP Basic auth + a "None" default ONLY. Do NOT build Token or Cookie methods — the METHOD segmented control ships with exactly two options: None / Basic.
- **Credentials are NEVER persisted or logged.** They travel in the POST body, are used in-memory to build the header, and are never written to SQLite, `result_json`, `console`, or any file. The only stored auth artifact is `authUsed: 'basic' | null`.
- **Credentials are session-only on the client** — React state only, never `localStorage`/`sessionStorage`.
- The Basic header value is exactly `'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')`.
- `AuthConfig` type is `{ type: 'basic'; username: string; password: string }`, hand-synced identically in `server/src/types.ts` and `client/src/types.ts` (the project keeps two copies, no shared package).
- Design tokens and Tailwind classes follow the existing components; the AuthCard mirrors the existing device segmented control's styling (`bg-surface-muted3`, sliding white pill).
- Run each package's `tsc --noEmit` after changes; server also has `npx vitest run`.

---

### Task 1: Shared `AuthConfig`/`authUsed` types + `buildAuthHeaders` + `authUsed` in mapping (with unit tests)

**Files:**
- Modify: `server/src/types.ts` (add `AuthConfig`; add `authUsed` to `AuditResult` and `HistoryRun`)
- Modify: `client/src/types.ts` (identical additions — hand-synced)
- Modify: `server/src/mapping.ts` (add `buildAuthHeaders`; add `authUsed` param to `mapLhrToAuditResult`)
- Modify: `server/test/mapping.test.ts` (tests for `buildAuthHeaders` and `authUsed`)

**Interfaces:**
- Consumes: existing `AuditResult`, `HistoryRun`, `Device` types; existing `mapLhrToAuditResult(lhr, url, device)`.
- Produces (used by Tasks 2, 3, 4, 5):
  - `type AuthConfig = { type: 'basic'; username: string; password: string }`
  - `AuditResult` and `HistoryRun` each gain `authUsed: 'basic' | null`
  - `buildAuthHeaders(auth?: AuthConfig): Record<string, string>`
  - `mapLhrToAuditResult(lhr: any, url: string, device: Device, authUsed: 'basic' | null): AuditResult`

- [ ] **Step 1: Add the failing tests to `server/test/mapping.test.ts`**

Add these imports/tests (append `buildAuthHeaders` to the existing import from `../src/mapping`, and add the new blocks):

```ts
import { buildAuthHeaders, mapLhrToAuditResult } from '../src/mapping';

describe('buildAuthHeaders', () => {
  it('builds a Basic Authorization header from username/password', () => {
    const headers = buildAuthHeaders({ type: 'basic', username: 'deploy-preview', password: 's3cret' });
    const expected = 'Basic ' + Buffer.from('deploy-preview:s3cret').toString('base64');
    expect(headers).toEqual({ Authorization: expected });
  });

  it('returns an empty object for undefined auth', () => {
    expect(buildAuthHeaders(undefined)).toEqual({});
  });
});

describe('mapLhrToAuditResult authUsed', () => {
  const minimalLhr = {
    categories: { performance: { score: 0.5 } },
    audits: {},
    lighthouseVersion: '12.0.0',
    environment: { hostUserAgent: 'Chrome/126.0.0.0' },
  };

  it("records authUsed 'basic' when passed", () => {
    const result = mapLhrToAuditResult(minimalLhr as any, 'https://x.com', 'mobile', 'basic');
    expect(result.authUsed).toBe('basic');
  });

  it('records authUsed null when passed null', () => {
    const result = mapLhrToAuditResult(minimalLhr as any, 'https://x.com', 'mobile', null);
    expect(result.authUsed).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx vitest run`
Expected: FAIL — `buildAuthHeaders` is not exported; `mapLhrToAuditResult` called with 4 args / `result.authUsed` undefined.

- [ ] **Step 3: Add the `AuthConfig` type and `authUsed` fields in `server/src/types.ts`**

Add near the top type aliases:

```ts
export interface AuthConfig {
  type: 'basic';
  username: string;
  password: string;
}
```

In `interface AuditResult`, add after `device: Device;`:

```ts
  authUsed: 'basic' | null;
```

In `interface HistoryRun`, add after `device: Device;`:

```ts
  authUsed: 'basic' | null;
```

- [ ] **Step 4: Mirror the exact same additions in `client/src/types.ts`**

Add the identical `AuthConfig` interface, and add `authUsed: 'basic' | null;` to both `AuditResult` (after `device`) and `HistoryRun` (after `device`) so the client and server type files stay identical in shape.

- [ ] **Step 5: Add `buildAuthHeaders` and thread `authUsed` in `server/src/mapping.ts`**

Add the import of the type at the top (the file already imports from `./types`):

```ts
import type { AuthConfig } from './types';
```

Add this exported function (place it near `getLhrRuntimeError`):

```ts
export function buildAuthHeaders(auth?: AuthConfig): Record<string, string> {
  if (auth && auth.type === 'basic') {
    const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}
```

Change the `mapLhrToAuditResult` signature and add `authUsed` to the returned object:

```ts
export function mapLhrToAuditResult(
  lhr: any,
  url: string,
  device: Device,
  authUsed: 'basic' | null
): AuditResult {
```

In the returned object literal, add after `device,`:

```ts
    authUsed,
```

(If `AuthConfig` isn't already covered by the existing `import type { ... } from './types'` line, add it there instead of a second import.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS — all prior tests plus the 4 new ones (buildAuthHeaders ×2, authUsed ×2).

- [ ] **Step 7: Typecheck the server**

Run: `cd server && npx tsc --noEmit`
Expected: FAIL — `mapLhrToAuditResult` is called with 3 args in `runner.ts`. This is expected; Task 2 fixes the caller. (Do NOT edit runner.ts in this task.) Note this expected error in your report and proceed. The client typecheck below must still pass.

- [ ] **Step 8: Typecheck the client**

Run: `cd client && npx tsc --noEmit`
Expected: PASS — the client type additions are self-consistent (no client code consumes `authUsed` yet).

- [ ] **Step 9: Commit**

```bash
git add server/src/types.ts client/src/types.ts server/src/mapping.ts server/test/mapping.test.ts
git commit -m "feat(auth): add AuthConfig type, buildAuthHeaders, and authUsed field"
```

---

### Task 2: Runner threads auth → Lighthouse `extraHeaders` and persists `authUsed`

**Files:**
- Modify: `server/src/runner.ts`

**Interfaces:**
- Consumes: `AuthConfig`, `buildAuthHeaders`, updated `mapLhrToAuditResult(lhr, url, device, authUsed)` from Task 1.
- Produces (used by Task 3): `startAudit(url: string, device: Device, auth?: AuthConfig): string`.

- [ ] **Step 1: Update imports in `server/src/runner.ts`**

Change the mapping import to include `buildAuthHeaders`:

```ts
import { buildAuthHeaders, getLhrRuntimeError, mapLhrToAuditResult } from './mapping';
```

Change the types import to include `AuthConfig`:

```ts
import type { AuthConfig, AuditJobStatus, Device } from './types';
```

- [ ] **Step 2: Thread `auth` through `startAudit` and `runAudit`**

Replace the current `startAudit` and the `runAudit` signature/body so auth flows through. Full updated `startAudit`:

```ts
export function startAudit(url: string, device: Device, auth?: AuthConfig): string {
  const id = randomUUID();
  const createdAt = Date.now();
  insertAudit(id, url, device, createdAt);
  jobs.set(id, { status: 'queued', stage: 'Launching Chrome…' });
  void runAudit(id, url, device, auth);
  return id;
}
```

Change `runAudit`'s signature to accept `auth`:

```ts
async function runAudit(id: string, url: string, device: Device, auth?: AuthConfig): Promise<void> {
```

- [ ] **Step 3: Inject `extraHeaders` into the Lighthouse config and persist `authUsed`**

Inside `runAudit`, the current Lighthouse call is:

```ts
    const { default: lighthouse } = await import('lighthouse');
    const runnerResult = await lighthouse(url, { port: chrome.port, output: 'json' }, LIGHTHOUSE_CONFIG[device]);
```

Replace those two lines with a per-run config clone that merges `extraHeaders` (never mutate the shared `LIGHTHOUSE_CONFIG`):

```ts
    const { default: lighthouse } = await import('lighthouse');
    const baseConfig = LIGHTHOUSE_CONFIG[device];
    const extraHeaders = buildAuthHeaders(auth);
    const runConfig = {
      ...baseConfig,
      settings: { ...baseConfig.settings, extraHeaders },
    };
    const runnerResult = await lighthouse(url, { port: chrome.port, output: 'json' }, runConfig);
```

Then change the mapping call (currently `mapLhrToAuditResult(runnerResult.lhr, url, device)`) to pass `authUsed`:

```ts
    const result = mapLhrToAuditResult(runnerResult.lhr, url, device, auth ? 'basic' : null);
```

**Do NOT** add any `console.log`/logging of `auth`, `extraHeaders`, or credentials anywhere.

- [ ] **Step 4: Typecheck the server**

Run: `cd server && npx tsc --noEmit`
Expected: FAIL — `app.ts` still calls `startAudit(url, device)` which is fine (auth is optional), but `app.ts` doesn't yet set `authUsed` on its `HistoryRun` objects, so the `HistoryRun` literal there is now missing the required `authUsed` field. This is expected; Task 3 fixes `app.ts`. Note the expected error and proceed. (If tsc reports 0 errors because the HistoryRun addition lands in Task 3, that's also fine.)

- [ ] **Step 5: Run the server unit tests (should still pass — runner has no unit tests, mapping tests unaffected)**

Run: `cd server && npx vitest run`
Expected: PASS — the 15 existing + Task-1 tests still pass (this task changed only `runner.ts`).

- [ ] **Step 6: Commit**

```bash
git add server/src/runner.ts
git commit -m "feat(auth): inject Basic auth header into Lighthouse run; persist authUsed"
```

---

### Task 3: API route validates `auth` and passes it through; `HistoryRun` carries `authUsed`

**Files:**
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `startAudit(url, device, auth?)` from Task 2; `AuthConfig` from Task 1.
- Produces: `POST /api/audits` accepting an optional `auth` body field; `GET /api/audits` returning `HistoryRun[]` with `authUsed`.

- [ ] **Step 1: Add `AuthConfig` to the types import in `server/src/app.ts`**

```ts
import type { AuthConfig, AuditJobStatusResponse, AuditResult, Device, HistoryRun } from './types';
```

- [ ] **Step 2: Add an auth validator and use it in the POST route**

Add this helper next to `isValidUrl`:

```ts
function parseAuth(value: unknown): AuthConfig | undefined | 'invalid' {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value === 'object' &&
    (value as any).type === 'basic' &&
    typeof (value as any).username === 'string' &&
    (value as any).username.length > 0 &&
    typeof (value as any).password === 'string' &&
    (value as any).password.length > 0
  ) {
    return { type: 'basic', username: (value as any).username, password: (value as any).password };
  }
  return 'invalid';
}
```

Replace the POST `/api/audits` handler body with:

```ts
app.post('/api/audits', (req, res) => {
  const { url, device, auth } = req.body ?? {};
  if (!isValidUrl(url)) {
    res.status(400).json({ error: 'A valid http(s) URL is required.' });
    return;
  }
  const parsedAuth = parseAuth(auth);
  if (parsedAuth === 'invalid') {
    res.status(400).json({ error: 'Invalid auth: expected { type: "basic", username, password }.' });
    return;
  }
  const normalizedDevice: Device = device === 'desktop' ? 'desktop' : 'mobile';
  const id = startAudit(url, normalizedDevice, parsedAuth);
  res.status(201).json({ id });
});
```

**Do NOT** log `auth`, `req.body`, or credentials.

- [ ] **Step 3: Add `authUsed` to the `HistoryRun` objects in the `GET /api/audits` handler**

In the `runs` map callback, add `authUsed: result.authUsed` to the returned object (after `cls`):

```ts
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
      authUsed: result.authUsed,
    };
```

- [ ] **Step 4: Typecheck the server**

Run: `cd server && npx tsc --noEmit`
Expected: PASS — 0 errors. (`startAudit` 3-arg call and `HistoryRun` now complete with `authUsed`.)

- [ ] **Step 5: Run the server unit tests**

Run: `cd server && npx vitest run`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts
git commit -m "feat(auth): validate optional auth on POST /api/audits; expose authUsed in history"
```

---

### Task 4: Client API sends `auth`; new `AuthCard` component

**Files:**
- Modify: `client/src/lib/api.ts`
- Create: `client/src/components/AuthCard.tsx`

**Interfaces:**
- Consumes: `AuthConfig` type from Task 1 (client copy).
- Produces (used by Task 5):
  - `submitAudit(url: string, device: Device, auth?: AuthConfig): Promise<string>`
  - `AuthCard` component with props `{ method: 'none' | 'basic'; username: string; password: string; onMethodChange: (m: 'none' | 'basic') => void; onUsernameChange: (v: string) => void; onPasswordChange: (v: string) => void }`

- [ ] **Step 1: Update `submitAudit` in `client/src/lib/api.ts` to send optional auth**

Change the import to include `AuthConfig`:

```ts
import type { AuthConfig, AuditJobStatusResponse, AuditResult, Device, HistoryRun } from '../types';
```

Replace `submitAudit`:

```ts
export async function submitAudit(url: string, device: Device, auth?: AuthConfig): Promise<string> {
  const res = await fetch(`${BASE}/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, device, ...(auth ? { auth } : {}) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to start audit.');
  }
  const body = await res.json();
  return body.id as string;
}
```

- [ ] **Step 2: Create `client/src/components/AuthCard.tsx`**

```tsx
import { useState } from 'react';

type AuthMethod = 'none' | 'basic';

interface AuthCardProps {
  method: AuthMethod;
  username: string;
  password: string;
  onMethodChange: (method: AuthMethod) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

export function AuthCard({
  method,
  username,
  password,
  onMethodChange,
  onUsernameChange,
  onPasswordChange,
}: AuthCardProps) {
  const [collapsed, setCollapsed] = useState(true);
  const isBasic = method === 'basic';
  const complete = isBasic && username.trim() !== '' && password !== '';
  const statusLabel = isBasic ? (complete ? 'Basic auth configured' : 'Basic auth — incomplete') : 'No authentication';

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border-card bg-white shadow-card">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        aria-controls="auth-card-panel"
        className="flex w-full items-center gap-3 p-[16px_20px] text-left"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-text-tertiary">
          <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <span className="text-[15px] font-semibold">Authentication</span>
        {isBasic && (
          <span className="rounded-pill bg-brand-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-brand-tintText">
            Basic auth
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 font-mono text-[13px] text-text-faint">
          {statusLabel}
          <span className={`transition-transform ${collapsed ? '' : 'rotate-180'}`}>⌄</span>
        </span>
      </button>

      {!collapsed && (
        <div id="auth-card-panel" className="border-t border-border-inner p-[18px_20px]">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-faint">Method</div>
          <div className="relative inline-flex rounded-[11px] bg-surface-muted3 p-1">
            <div
              className="absolute top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-all duration-200"
              style={{ left: method === 'none' ? 4 : undefined, right: method === 'basic' ? 4 : undefined }}
            />
            <button
              type="button"
              onClick={() => onMethodChange('none')}
              className={`relative z-10 rounded-lg px-[18px] py-2 text-[13px] ${
                method === 'none' ? 'font-semibold text-text-primary' : 'font-medium text-text-tertiary'
              }`}
            >
              None
            </button>
            <button
              type="button"
              onClick={() => onMethodChange('basic')}
              className={`relative z-10 rounded-lg px-[18px] py-2 text-[13px] ${
                method === 'basic' ? 'font-semibold text-text-primary' : 'font-medium text-text-tertiary'
              }`}
            >
              Basic
            </button>
          </div>

          {isBasic && (
            <>
              <div className="mt-5 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                <div>
                  <label className="mb-1.5 block text-[13px] text-text-secondary">Username</label>
                  <input
                    value={username}
                    onChange={e => onUsernameChange(e.target.value)}
                    autoComplete="off"
                    className="h-11 w-full rounded-[11px] border border-border-control px-3.5 font-mono text-sm text-text-primary outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgba(227,90,42,0.12)]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] text-text-secondary">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => onPasswordChange(e.target.value)}
                    autoComplete="off"
                    className="h-11 w-full rounded-[11px] border border-border-control px-3.5 font-mono text-sm text-text-primary outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgba(227,90,42,0.12)]"
                  />
                </div>
              </div>

              <p className="mt-3 text-[13px] text-text-muted">
                Sent as an HTTP Basic{' '}
                <code className="rounded bg-border-inner px-1.5 py-0.5 font-mono text-xs text-text-secondary">
                  Authorization
                </code>{' '}
                header. Works for most staging environments behind a simple login prompt.
              </p>

              {!complete && (
                <p className="mt-2 text-[12.5px] text-warn-text">Enter a username and password to run the audit.</p>
              )}

              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warn-border bg-warn-bg p-[12px_14px] text-[13px] text-warn-text">
                <span aria-hidden className="mt-px">
                  ⚠
                </span>
                <span>
                  Credentials are kept for this session only and masked in audit history. Use staging credentials —
                  never a production password.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck the client**

Run: `cd client && npx tsc --noEmit`
Expected: PASS — 0 errors (AuthCard is self-contained; nothing imports it yet).

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/api.ts client/src/components/AuthCard.tsx
git commit -m "feat(auth): client submitAudit sends auth; add AuthCard component"
```

---

### Task 5: Wire auth state into App/Dashboard; render `AuthCard`; disable Run Audit when incomplete; history + meta chips

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/views/Dashboard.tsx`
- Modify: `client/src/views/History.tsx`

**Interfaces:**
- Consumes: `AuthCard` (Task 4), `submitAudit(url, device, auth?)` (Task 4), `HistoryRun.authUsed`/`AuditResult.authUsed` (Task 1).
- Produces: the full working auth UX.

- [ ] **Step 1: Add auth state to `client/src/App.tsx` and pass it down**

Add state (after the `device` state):

```ts
  const [authMethod, setAuthMethod] = useState<'none' | 'basic'>('none');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
```

Compute completeness just before `runAudit`:

```ts
  const authComplete = authMethod === 'basic' && authUsername.trim() !== '' && authPassword !== '';
```

Replace `runAudit` so it attaches auth only when complete:

```ts
  const runAudit = async (url: string) => {
    setPhase('running');
    setError(null);
    try {
      const auth =
        authComplete ? ({ type: 'basic' as const, username: authUsername, password: authPassword }) : undefined;
      const id = await submitAudit(url, device, auth);
      setAuditId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the audit.');
      setPhase('error');
    }
  };
```

Pass the new props to `<Dashboard>` (add to the existing element):

```tsx
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
            authMethod={authMethod}
            authUsername={authUsername}
            authPassword={authPassword}
            onAuthMethodChange={setAuthMethod}
            onAuthUsernameChange={setAuthUsername}
            onAuthPasswordChange={setAuthPassword}
            authIncomplete={authMethod === 'basic' && !authComplete}
          />
```

- [ ] **Step 2: Extend `Dashboard` props and render `AuthCard` + disable Run Audit + meta chip in `client/src/views/Dashboard.tsx`**

Add the import:

```ts
import { AuthCard } from '../components/AuthCard';
```

Extend `DashboardProps`:

```ts
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
  authMethod: 'none' | 'basic';
  authUsername: string;
  authPassword: string;
  onAuthMethodChange: (m: 'none' | 'basic') => void;
  onAuthUsernameChange: (v: string) => void;
  onAuthPasswordChange: (v: string) => void;
  authIncomplete: boolean;
}
```

Add the new params to the destructured function signature:

```ts
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
  authMethod,
  authUsername,
  authPassword,
  onAuthMethodChange,
  onAuthUsernameChange,
  onAuthPasswordChange,
  authIncomplete,
}: DashboardProps) {
```

Change the `AuditForm` `disabled` prop to also block on incomplete auth:

```tsx
      <AuditForm
        device={device}
        onDeviceChange={onDeviceChange}
        onSubmit={onSubmit}
        disabled={phase === 'running' || authIncomplete}
      />
```

Add the `AuthCard` immediately after the `AuditForm` (before the meta line):

```tsx
      <AuthCard
        method={authMethod}
        username={authUsername}
        password={authPassword}
        onMethodChange={onAuthMethodChange}
        onUsernameChange={onAuthUsernameChange}
        onPasswordChange={onAuthPasswordChange}
      />
```

In the completed meta line, add a `🔒 Basic auth` segment when the shown result used auth. Insert this right before the closing `</div>` of the meta-line block (after the relative-time span):

```tsx
          {result.authUsed === 'basic' && (
            <>
              <span className="text-border-inner">·</span>
              <span className="text-text-tertiary">🔒 Basic auth</span>
            </>
          )}
```

- [ ] **Step 3: Add the `authUsed` chip to the History runs table in `client/src/views/History.tsx`**

In the runs-table row, the Device cell currently renders the device pill. Add a small auth chip next to it when `run.authUsed === 'basic'`. Find the device `<span>` in the row (the pill showing "Mobile"/"Desktop") and wrap/append so the cell becomes:

```tsx
                      <span className="flex items-center gap-1.5">
                        <span className="w-fit rounded-pill bg-border-inner px-2.5 py-[3px] text-[11px] font-medium text-text-tertiary">
                          {run.device === 'mobile' ? 'Mobile' : 'Desktop'}
                        </span>
                        {run.authUsed === 'basic' && (
                          <span title="Basic auth" className="text-[11px] text-text-faint">
                            🔒
                          </span>
                        )}
                      </span>
```

(If the existing device cell markup differs slightly, preserve its exact pill classes and only add the sibling `🔒` span gated on `run.authUsed === 'basic'`.)

- [ ] **Step 4: Typecheck the client**

Run: `cd client && npx tsc --noEmit`
Expected: PASS — 0 errors.

- [ ] **Step 5: Production build to confirm the whole client compiles**

Run: `cd client && npm run build`
Expected: build completes with no type or build errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx client/src/views/Dashboard.tsx client/src/views/History.tsx
git commit -m "feat(auth): wire AuthCard into dashboard; gate Run Audit; show auth chips"
```

---

### Task 6: End-to-end verification (real auth run + no-credential-leak check)

**Files:** none created — verification only.

**Interfaces:**
- Consumes: the full stack (`npm run dev` from root).

- [ ] **Step 1: Static checks from root**

Run: `npm run typecheck && npm run test`
Expected: both workspaces typecheck (0 errors); server Vitest passes (19 tests: 15 prior + 4 from Task 1).

- [ ] **Step 2: Boot the full stack**

Run (repo root): `npm run dev > /tmp/cwv-auth-e2e.log 2>&1 &` then wait ~5s.
Expected: log shows the API on :3001 and Vite "Local: http://localhost:5173/", no errors.

- [ ] **Step 3: Audit a Basic-auth-protected URL WITH correct credentials (through the client proxy on :5173)**

`https://httpbin.org/basic-auth/demo/secretpw` returns 401 without creds and 200 with `demo:secretpw`.

```bash
curl -s -X POST http://localhost:5173/api/audits \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://httpbin.org/basic-auth/demo/secretpw","device":"mobile","auth":{"type":"basic","username":"demo","password":"secretpw"}}'
```
Take the `id`, then poll `curl -s http://localhost:5173/api/audits/<id>` every ~2s until terminal.
Expected: `status:"done"` with a populated result and `result.authUsed === "basic"` (Lighthouse successfully loaded the 200 response because the header was sent). Record the score.

- [ ] **Step 4: Confirm the credential is NOT anywhere in storage**

```bash
grep -rc "secretpw" server/data/db.sqlite ; echo "exit: $?"
```
Expected: `0` matches (grep prints `0` and exits non-zero) — the password string does not appear in the SQLite file. Also confirm the dev log has no credential: `grep -c "secretpw" /tmp/cwv-auth-e2e.log` → `0`.

- [ ] **Step 5: Audit the SAME URL WITHOUT credentials — should fail/degrade**

```bash
curl -s -X POST http://localhost:5173/api/audits \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://httpbin.org/basic-auth/demo/secretpw","device":"mobile"}'
```
Poll to terminal. Expected: it does NOT produce a normal healthy audit of the protected content — it ends in `status:"error"` (runtimeError/NO_FCP on the 401) OR a `done` result whose `authUsed` is `null` and which reflects the 401 page. Either way it must differ from Step 3, proving the header mattered.

- [ ] **Step 6: Malformed auth → 400**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5173/api/audits \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","device":"mobile","auth":{"type":"basic","username":""}}'
```
Expected: `400`.

- [ ] **Step 7: Tear down**

Kill the dev processes; confirm `lsof -i :3001` and `lsof -i :5173` are both empty. Leave nothing running.

- [ ] **Step 8: Manual browser checklist (report for the human to confirm)**

Note in the report that the human should verify in a browser: the Authentication card renders and collapses; the None/Basic control toggles the fields + warning; Run Audit is disabled while Basic is selected with empty fields and re-enables when both are filled; after an authed run the `🔒 Basic auth` chip appears in the meta line and in the History table row.

- [ ] **Step 9: Final commit** (only if fixes were needed during verification; otherwise skip)

```bash
git add -A
git commit -m "fix(auth): address issues found during end-to-end verification"
```
