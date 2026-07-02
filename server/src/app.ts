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

// Ensure any uncaught error in a route returns a JSON body, not Express's default HTML.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error.';
  res.status(500).json({ error: message });
});

export default app;
