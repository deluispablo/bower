// Flaky e2e policy (TL-P4-20, entry c3-flaky-policy). A batch run (E2E_BATCH=1, see e2e/batch.ts) retries once and sets
// Playwright's failOnFlakyTests (https://playwright.dev/docs/api/class-testconfig#test-config-fail-on-flaky-tests), so a test
// that passes only on retry fails the run. This reporter names each one for the DEFECT_LOG line (test, project, first error).
// A test listed in harness/e2e-quarantine.json still runs; while its entry is valid its flake is reported, not failed
// (quarantine with an owner, a deadline and a defect: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const QUARANTINE_FILE = fileURLToPath(new URL('../harness/e2e-quarantine.json', import.meta.url));
const DEFECT_LOG = fileURLToPath(new URL('../docs/harness/DEFECT_LOG.md', import.meta.url));

/** The problems with the quarantine entries: no owner, expired, or a defect that is not a line of the DEFECT_LOG. */
export function quarantineProblems(entries, today, defectLog) {
  if (!Array.isArray(entries)) return ['the quarantine file must be a list'];
  const logged = new Set([...defectLog.matchAll(/^- \d{4}-\d\d-\d\d (\S+) \|/gm)].map((m) => m[1]));
  const bad = [];
  for (const e of entries) {
    const name = typeof e?.test === 'string' && e.test ? e.test : '(no test name)';
    if (name === '(no test name)') bad.push(`${name}: a quarantine entry needs the test's name`);
    if (typeof e?.owner !== 'string' || !e.owner.trim()) bad.push(`${name}: quarantine entry has no owner`);
    if (typeof e?.expires !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(e.expires)) bad.push(`${name}: quarantine entry needs an expiry date (YYYY-MM-DD)`);
    else if (e.expires < today) bad.push(`${name}: quarantine expired on ${e.expires}; fix the test or remove the entry`);
    if (typeof e?.defect !== 'string' || !logged.has(e.defect)) bad.push(`${name}: quarantine entry names defect "${e?.defect ?? ''}", which is not a line of docs/harness/DEFECT_LOG.md`);
  }
  return bad;
}

/** Reads and checks the quarantine file (check-harness and the tests call this). */
export function quarantineFileProblems(file = QUARANTINE_FILE, logFile = DEFECT_LOG, today = new Date().toISOString().slice(0, 10)) {
  if (!existsSync(file)) return [];
  return quarantineProblems(JSON.parse(readFileSync(file, 'utf8')), today, readFileSync(logFile, 'utf8'));
}

const today = () => new Date().toISOString().slice(0, 10);
const firstLine = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim()) ?? '';

/** Playwright reporter: names the tests that passed only on retry and lets valid quarantine entries through. */
export default class FlakyReporter {
  onBegin(config, suite) {
    this.suite = suite;
  }

  onEnd(result) {
    const file = process.env.E2E_QUARANTINE ?? QUARANTINE_FILE;
    const entries = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    const valid = new Set(entries.filter((e) => e?.owner && e?.expires >= today()).map((e) => e.test));
    const tests = this.suite.allTests();
    const flaky = tests.filter((t) => t.outcome() === 'flaky');
    if (!flaky.length) return undefined;
    const describe = (t) => `${t.parent.project()?.name ?? ''} | ${t.title} | first failure: ${firstLine(t.results.find((r) => r.status !== 'passed')?.error?.message)}`;
    const loud = flaky.filter((t) => !valid.has(t.title));
    const quiet = flaky.filter((t) => valid.has(t.title));
    for (const t of quiet) console.log(`quarantined (passed only on retry, not failed): ${describe(t)}`);
    if (loud.length) {
      console.error(`\n${loud.length} test(s) passed only on retry; each is a defect to log (docs/harness/DEFECTS.md):`);
      for (const t of loud) console.error(`  passed only on retry: ${describe(t)}`);
    }
    const broken = tests.some((t) => t.outcome() === 'unexpected');
    return !loud.length && !broken && result.status === 'failed' ? { status: 'passed' } : undefined;
  }

  printsToStdio() {
    return false;
  }
}
