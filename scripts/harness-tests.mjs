// The test names that exist now, listed fresh (a dry run: every test is collected, none runs),
// for check-harness.mjs (e2e titles) and scripts/precheck-verify.mjs. The finding and matching
// of names is harness-rules.mjs's; this only lists.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { reportTests } from './harness-rules.mjs';

const root = new URL('..', import.meta.url).pathname;

/** The browser tests under a playwright config. */
export function e2eTitles(config = 'playwright.config.ts') {
  const out = execFileSync('pnpm', ['exec', 'playwright', 'test', '--list', '--reporter=json', '-c', config], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  const listed = JSON.parse(out);
  const titles = [];
  const walk = (s) => {
    for (const spec of s.specs ?? []) for (const test of spec.tests ?? []) titles.push({ name: spec.title, file: relative(process.cwd(), resolve(listed.config.rootDir, spec.file)), config, project: test.projectName ?? '' });
    for (const sub of s.suites ?? []) walk(sub);
  };
  for (const s of listed.suites ?? []) walk(s);
  return titles;
}

/** A package's unit tests (dir '.' is the app): a vitest run whose name filter matches nothing still collects every test. */
export function unitTitles(dir) {
  const out = join(mkdtempSync(join(tmpdir(), 'harness-names-')), 'names.json');
  try {
    execFileSync('pnpm', ['exec', 'vitest', 'run', '-t', '^\\u0000$', '--reporter=json', `--outputFile=${out}`], { cwd: join(root, dir), stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    // vitest exits non-zero on a collect error; the report (if any) says which, below.
  }
  let report;
  try {
    report = JSON.parse(readFileSync(out, 'utf8'));
  } catch (e) {
    console.error(e);
    throw new Error(`Could not list the tests of ${dir}: run pnpm -C ${dir} test to see why.`);
  }
  return reportTests(report, dir === '.' ? 'vite.config.ts' : `${dir}/vitest.config.ts`, join(root));
}
