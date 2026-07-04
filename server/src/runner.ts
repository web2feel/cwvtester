import * as chromeLauncher from 'chrome-launcher';
import { randomUUID } from 'node:crypto';
import { completeAudit, failAudit, insertAudit, updateStage } from './db';
import { buildAuthHeaders, getLhrRuntimeError, mapLhrToAuditResult } from './mapping';
import { createQueue, withTimeout } from './queue';
import type { AuthConfig, AuditJobStatus, Device } from './types';

interface Job {
  status: AuditJobStatus;
  stage?: string;
  error?: string;
}

const jobs = new Map<string, Job>();
const auditQueue = createQueue();

const AUDIT_TIMEOUT_MS = 90_000;

const LIGHTHOUSE_CONFIG: Record<Device, any> = {
  mobile: {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
    },
  },
  desktop: {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'desktop',
      screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    },
  },
};

export function startAudit(url: string, device: Device, auth?: AuthConfig): string {
  const id = randomUUID();
  insertAudit(id, url, device, Date.now());
  jobs.set(id, { status: 'queued', stage: 'Waiting in queue…' });
  auditQueue.enqueue(() => runAudit(id, url, device, auth));
  return id;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

function setStage(id: string, stage: string): void {
  jobs.set(id, { status: 'running', stage });
  updateStage(id, stage);
}

async function runAudit(id: string, url: string, device: Device, auth?: AuthConfig): Promise<void> {
  setStage(id, 'Launching Chrome…');

  let chrome: chromeLauncher.LaunchedChrome;
  try {
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
  } catch {
    fail(id, 'Failed to launch Chrome. Confirm Chrome/Chromium is installed on this machine.');
    return;
  }

  try {
    setStage(id, 'Loading page…');
    setStage(id, 'Running Lighthouse…');
    // NOTE: lighthouse v12 is ESM-only; loading it via a static top-level import
    // under this CommonJS project caused a runtime "__name is not defined" error
    // when the .ts file was transpiled/required by tsx's CJS require hook. A
    // dynamic import sidesteps that interop path and loads cleanly. See task-4
    // report for details.
    const { default: lighthouse } = await import('lighthouse');
    const baseConfig = LIGHTHOUSE_CONFIG[device];
    const extraHeaders = buildAuthHeaders(auth);
    const runConfig = {
      ...baseConfig,
      settings: { ...baseConfig.settings, extraHeaders },
    };
    const runnerResult = await withTimeout(
      lighthouse(url, { port: chrome.port, output: 'json' }, runConfig),
      AUDIT_TIMEOUT_MS,
      'The audit timed out after 90 seconds.'
    );
    if (!runnerResult?.lhr) throw new Error('Lighthouse produced no report.');

    const runtimeErrorMessage = getLhrRuntimeError(runnerResult.lhr);
    if (runtimeErrorMessage) {
      fail(id, classifyError(new Error(runtimeErrorMessage), url));
      return;
    }

    setStage(id, 'Analyzing performance…');
    setStage(id, 'Generating report…');
    const result = mapLhrToAuditResult(runnerResult.lhr, url, device, auth ? 'basic' : null);

    completeAudit(id, JSON.stringify(result), Date.now());
    jobs.delete(id); // DB row is authoritative once terminal.
  } catch (err) {
    fail(id, classifyError(err, url));
  } finally {
    await chrome.kill();
  }
}

function fail(id: string, message: string): void {
  failAudit(id, message, Date.now());
  jobs.delete(id); // DB row is authoritative once terminal.
}

function classifyError(err: unknown, url: string): string {
  const message = err instanceof Error ? err.message : String(err);
  // Our own watchdog message is already user-readable — pass it through.
  if (message.includes('timed out after')) {
    return message;
  }
  if (
    message.includes('ENOTFOUND') ||
    message.includes('ERR_NAME_NOT_RESOLVED') ||
    message.includes('DNS_FAILURE') ||
    /\bDNS\b/i.test(message) ||
    /\bresolve\b/i.test(message)
  ) {
    return `Could not reach ${url}. Check the URL and try again.`;
  }
  if (message.includes('ERR_CONNECTION_REFUSED')) {
    return `Connection refused by ${url}.`;
  }
  if (message.includes('ERRORED_DOCUMENT_REQUEST') || message.includes('FAILED_DOCUMENT_REQUEST')) {
    return `Could not load ${url}. The site may be down or unreachable.`;
  }
  if (message.includes('NO_FCP')) {
    return `The page at ${url} never rendered any content Lighthouse could measure.`;
  }
  if (message.includes('NOT_HTML') || message.includes('non-HTML')) {
    return `${url} did not return an HTML page.`;
  }
  if (message.toLowerCase().includes('timeout')) {
    return 'The audit timed out. The site may be too slow to respond.';
  }
  return `Lighthouse failed: ${message}`;
}
