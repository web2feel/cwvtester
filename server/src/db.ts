import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'db.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS audits (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    device TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT,
    created_at INTEGER NOT NULL,
    finished_at INTEGER,
    error TEXT,
    result_json TEXT
  )
`);

export interface AuditRow {
  id: string;
  url: string;
  device: string;
  status: string;
  stage: string | null;
  created_at: number;
  finished_at: number | null;
  error: string | null;
  result_json: string | null;
}

export function insertAudit(id: string, url: string, device: string, createdAt: number): void {
  db.prepare(
    `INSERT INTO audits (id, url, device, status, stage, created_at) VALUES (?, ?, ?, 'queued', 'Launching Chrome…', ?)`
  ).run(id, url, device, createdAt);
}

export function updateStage(id: string, stage: string): void {
  db.prepare(`UPDATE audits SET status = 'running', stage = ? WHERE id = ?`).run(stage, id);
}

export function completeAudit(id: string, resultJson: string, finishedAt: number): void {
  db.prepare(
    `UPDATE audits SET status = 'done', stage = NULL, result_json = ?, finished_at = ? WHERE id = ?`
  ).run(resultJson, finishedAt, id);
}

export function failAudit(id: string, error: string, finishedAt: number): void {
  db.prepare(
    `UPDATE audits SET status = 'error', stage = NULL, error = ?, finished_at = ? WHERE id = ?`
  ).run(error, finishedAt, id);
}

export function getAudit(id: string): AuditRow | undefined {
  return db.prepare(`SELECT * FROM audits WHERE id = ?`).get(id) as AuditRow | undefined;
}

export function listAuditsForUrl(url: string): AuditRow[] {
  return db
    .prepare(`SELECT * FROM audits WHERE url = ? AND status = 'done' ORDER BY created_at DESC`)
    .all(url) as AuditRow[];
}

export function mostRecentUrl(): string | undefined {
  const row = db
    .prepare(`SELECT url FROM audits WHERE status = 'done' ORDER BY created_at DESC LIMIT 1`)
    .get() as { url: string } | undefined;
  return row?.url;
}
