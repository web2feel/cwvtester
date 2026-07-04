import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sweepOrphanedAudits', () => {
  it('marks queued/running rows as error and leaves done rows alone', async () => {
    // Must be set BEFORE the first import of ../src/db (module-level singleton).
    process.env.CWV_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'cwv-db-test-'));
    const { insertAudit, updateStage, completeAudit, sweepOrphanedAudits, getAudit } = await import('../src/db');

    insertAudit('a', 'https://a.com', 'mobile', 1000); // stays queued
    insertAudit('b', 'https://b.com', 'mobile', 1000);
    updateStage('b', 'Running Lighthouse…'); // now running
    insertAudit('c', 'https://c.com', 'mobile', 1000);
    completeAudit('c', '{"score":90}', 2000); // done — must be untouched

    const changed = sweepOrphanedAudits(3000);

    expect(changed).toBe(2);
    expect(getAudit('a')!.status).toBe('error');
    expect(getAudit('a')!.error).toBe('Interrupted by server restart.');
    expect(getAudit('a')!.finished_at).toBe(3000);
    expect(getAudit('b')!.status).toBe('error');
    expect(getAudit('c')!.status).toBe('done');
  });
});
