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
