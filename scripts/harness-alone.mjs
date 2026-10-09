// The time one unit test takes alone (TL-P4-17 addendum 6): the test is run again by itself with vitest's name filter
// (https://vitest.dev/guide/filtering), so load from the rest of the suite cannot make it slow. Used by check-harness.mjs
// for tests over the limit in the full run, and to rebuild harness/slow-tests.json.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Milliseconds `test` takes alone, or its full-run time when the rerun cannot find it. */
export function aloneMs(test, cwd = process.cwd()) {
  const dir = mkdtempSync(join(tmpdir(), 'alone-'));
  const out = join(dir, 'alone.json');
  try {
    spawnSync('pnpm', ['exec', 'vitest', 'run', test.file, '-t', `^${escape(test.path ?? test.name)}$`, '--reporter=json', `--outputFile=${out}`], { cwd, encoding: 'utf8' });
    const report = JSON.parse(readFileSync(out, 'utf8'));
    const found = report.testResults.flatMap((r) => r.assertionResults).filter((a) => a.fullName === test.name && a.status === 'passed');
    return found.length === 1 ? (found[0].duration ?? test.duration) : test.duration;
  } catch {
    return test.duration;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
