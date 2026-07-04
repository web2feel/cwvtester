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
