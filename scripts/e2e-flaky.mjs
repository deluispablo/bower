// Flaky e2e policy (TL-P4-20, entry c3-flaky-policy). A batch run (E2E_BATCH=1, see e2e/batch.ts) retries once and sets
// Playwright's failOnFlakyTests (https://playwright.dev/docs/api/class-testconfig#test-config-fail-on-flaky-tests), so a test
// that passes only on retry fails the run. This reporter names each one (test, project, first error).
// A test listed in testing/e2e-quarantine.json still runs; while its entry is valid its flake is reported, not failed
// (quarantine with an owner, a deadline and a defect: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const QUARANTINE_FILE = fileURLToPath(new URL('../testing/e2e-quarantine.json', import.meta.url));

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
      console.error(`\n${loud.length} test(s) passed only on retry; each is a defect to fix:`);
      for (const t of loud) console.error(`  passed only on retry: ${describe(t)}`);
    }
    const broken = tests.some((t) => t.outcome() === 'unexpected');
    return !loud.length && !broken && result.status === 'failed' ? { status: 'passed' } : undefined;
  }

  printsToStdio() {
    return false;
  }
}
