import app from './app';
import { sweepOrphanedAudits } from './db';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const swept = sweepOrphanedAudits(Date.now());
if (swept > 0) {
  console.log(`Marked ${swept} audit(s) interrupted by the previous shutdown as errors.`);
}

// Bind to loopback only — this server can audit arbitrary URLs (SSRF primitive)
// and must never be reachable from the network. See RUNNING.md.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Core Web Vitals Tester API listening on http://localhost:${PORT}`);
});
