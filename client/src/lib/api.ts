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
