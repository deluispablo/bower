/// <reference types="node" />
/** The harness's own rules (scripts/harness-rules.mjs): what makes the feature list dishonest. */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module, checked by these tests
import { apiTests, doneArgs, REAL_TIMER_CEILING, slowReport, timerListProblems, hashOf, nextProblems, notStaged, othersFlipped, problems, readProofs, redKind, runnerTests } from '../scripts/harness-rules.mjs';

type Entry = { id: string; task: string | number; steps?: string[]; verify: string; passes: boolean };
const S = ['Open Home.', 'See it.'];
const V = 'pnpm vitest run src/x.test.ts -t "it works"';
const proofOf = (e: Entry): Map<string, string> => readProofs(`${e.id}\t${hashOf(e.verify)}\t2026-10-04\tred\n`) as Map<string, string>;

describe('the harness', () => {
  it('an entry that passes needs a proof from done.sh', () => {
    const e: Entry = { id: 'a', task: 'qa-6', steps: S, verify: V, passes: true };
    expect(problems([e], new Map())).toHaveLength(1);
    expect(problems([e], proofOf(e))).toEqual([]);
  });

  it('a verify changed after closing loses its proof', () => {
    const e: Entry = { id: 'a', task: 'qa-6', steps: S, verify: V, passes: true };
    const proofs = proofOf(e);
    expect(problems([{ ...e, verify: `${V} || true` }], proofs)).toHaveLength(1);
  });

  it('a verify must name its test', () => {
    const bad: Entry[] = [
      { id: 'u', task: 'qa-6', steps: S, verify: 'pnpm vitest run src/data', passes: false },
      { id: 'e', task: 'qa-6', steps: S, verify: 'bash scripts/e2e-both.sh e2e/qa6.spec.ts', passes: false },
    ];
    expect(problems(bad, new Map())).toHaveLength(2);
    expect(problems([{ id: 'ok', task: 'qa-6', steps: S, verify: 'bash scripts/e2e-both.sh e2e/a.spec.ts -g "a whole name"', passes: false }], new Map())).toEqual([]);
  });

  it('one entry per commit', () => {
    const before = [{ id: 'a', passes: false }, { id: 'b', passes: false }];
    expect(othersFlipped(before, [{ id: 'a', passes: true }, { id: 'b', passes: false }], 'a')).toEqual([]);
    expect(othersFlipped(before, [{ id: 'a', passes: true }, { id: 'b', passes: true }], 'a')).toEqual(['b']);
  });

  it('one entry per commit: only what is staged goes in', () => {
    // git status --porcelain: column 1 is the index, column 2 the working tree.
    const status = ['M  src/a.ts', 'MM src/b.ts', ' M src/c.ts', '?? src/d.ts', 'A  src/e.ts', ' M harness/features.json', '?? harness/proof.log'].join('\n');
    expect(notStaged(status)).toEqual(['src/b.ts', 'src/c.ts', 'src/d.ts']);
    expect(notStaged('M  src/a.ts\n')).toEqual([]);
  });

  it('a pattern must match a test, and be a real name', () => {
    const tests = { unit: ['the journal outbox: a line waits'], e2e: ['Add warns about a file you already have'] };
    const ok: Entry = { id: 'a', task: 'qa-7', steps: S, verify: 'pnpm vitest run src/x -t "outbox: a line waits" && bash scripts/e2e-both.sh e2e/x.spec.ts -g "already have"', passes: false };
    expect(problems([ok], new Map(), tests)).toEqual([]);
    const gone: Entry = { ...ok, verify: 'pnpm vitest run src/x -t "a test that is gone"' };
    // An open entry may name a test not written yet; a closed one may not.
    expect(problems([gone], new Map(), tests)).toEqual([]);
    expect(problems([{ ...gone, passes: true }], new Map(), tests).some((m: string) => /matches no test/.test(m))).toBe(true);
    const loose: Entry = { ...ok, verify: 'pnpm vitest run src/x -t ""' };
    expect(problems([loose], new Map(), tests)[0]).toMatch(/too short/);
    const pwa: Entry = { ...ok, verify: 'pnpm build && pnpm exec playwright test -c e2e/pwa.config.ts' };
    expect(problems([pwa], new Map(), tests)[0]).toMatch(/names no test/);
  });

  it('reproved only for the entries before the rule', () => {
    const legacy: Entry = { id: 'old', task: 3, verify: V, passes: true };
    const recent: Entry = { id: 'new', task: 'qa-7', steps: S, verify: V, passes: true };
    const proofs = readProofs(`old\t${hashOf(V)}\t2026-10-04\treproved\nnew\t${hashOf(V)}\t2026-10-04\treproved\n`);
    expect(problems([legacy], proofs)).toEqual([]);
    expect(problems([recent], proofs)[0]).toMatch(/reproved/);
  });

  it('done.sh takes fixed-in, or a known-green reason only with a note', () => {
    expect(doneArgs(['a', 'msg'], {})).toMatchObject({ id: 'a', mode: 'red' });
    expect(doneArgs(['a', 'msg', '--fixed-in', 'abc1234'], {})).toMatchObject({ mode: 'fixed-in', sha: 'abc1234' });
    expect(() => doneArgs(['a', 'msg', '--green-befor', 'x'], {})).toThrow(/unknown/);
    expect(() => doneArgs(['a', 'msg', '--known-green', 'why'], {})).toThrow(/note/);
    expect(doneArgs(['a', 'msg', '--known-green', 'why'], { note: 'decided' }, { note: 'decided' })).toMatchObject({ mode: 'known-green', reason: 'why' });
  });

  it('every finding has steps an evaluator can replay', () => {
    const tests = { unit: ['it works'], e2e: [] };
    const bare = { id: 'a', task: 'qa-7', verify: V, passes: false };
    expect(problems([bare], new Map(), tests).some((m: string) => /no steps/.test(m))).toBe(true);
    expect(problems([{ ...bare, steps: ['Open Home.', 'See the card.'] }], new Map(), tests)).toEqual([]);
    // The phase plan's numbered tasks have their steps in the plan.
    expect(problems([{ ...bare, task: 3 }], new Map(), tests)).toEqual([]);
  });

  it('the progress log says the next step', () => {
    expect(nextProblems('# Progress\n\n- 2026-10-04: a passes\n')).toMatch(/Next/);
    expect(nextProblems('# Progress\n\n## Next\n\n## Log\n')).toMatch(/Next/);
    expect(nextProblems('# Progress\n\n## Next\n\n- Fix the rest of qa-7.\n\n## Log\n')).toBeNull();
  });

  it('a red is a failed assertion, not a test file that failed to load', () => {
    expect(redKind('AssertionError: expected true to be false\n Test Files  1 failed | 3 passed (4)\n      Tests  2 failed | 10 passed (12)\n')).toBe('assert');
    expect(redKind(' Test Files  1 failed (1)\n      Tests  no tests\n')).toBe('load');
    expect(redKind(' Test Files  1 failed | 3 passed (4)\n      Tests  10 passed (10)\n')).toBe('load');
    expect(redKind('Error: expect(locator).toHaveText() failed\n  1 failed\n    [desktop] › e2e/a.spec.ts:3:1 › x\n  2 passed (4s)\n')).toBe('assert');
    expect(redKind('Error: Cannot find module\n')).toBe('none');
  });

  it('every name in a verify matches a test, not just one of them', () => {
    const tests = { unit: ['ConfirmBin asks first', 'the tour goes at sign-out'], e2e: [] };
    const both: Entry = { id: 'a', task: 'qa-9', steps: S, verify: 'pnpm vitest run src -t "ConfirmBin|tour goes"', passes: true };
    expect(problems([both], proofOf(both), tests)).toEqual([]);
    const half: Entry = { ...both, verify: 'pnpm vitest run src -t "ConfirmBin|a test that is gone"' };
    expect(problems([half], proofOf(half), tests).some((m: string) => /"a test that is gone" matches no test/.test(m))).toBe(true);
    // A group keeps its own alternatives: "row.s menu (opens|shows)" is one name.
    const grouped: Entry = { ...both, verify: 'pnpm vitest run src -t "the (tour|walk) goes"' };
    expect(problems([grouped], proofOf(grouped), tests)).toEqual([]);
  });

  it('known-green needs a note already committed, not one written in the same change', () => {
    expect(() => doneArgs(['a', 'msg', '--known-green', 'why'], { note: 'decided now' }, {})).toThrow(/committed/);
    expect(() => doneArgs(['a', 'msg', '--known-green', 'why'], { note: 'decided now' }, undefined)).toThrow(/committed/);
  });

  it('a browser timeout is not an assertion red', () => {
    const failed = '\n  1 failed\n    [desktop] › e2e/a.spec.ts:3:1 › app boots\n';
    for (const error of [
      'Test timeout of 30000ms exceeded.',
      'Error: browserType.launch: Target page, context or browser has been closed',
      'Error: page.goto: net::ERR_CONNECTION_REFUSED',
      '"beforeEach" hook timeout of 30000ms exceeded.',
      'Error: "beforeAll" hook failed\nAssertionError: expected setup to finish',
      'Error: page.goto timed out\n  42 | expect(page).toBeDefined()',
    ]) expect(redKind(error + failed)).toBe('none');
    expect(redKind('Error: expect(locator).toBeVisible() failed\nCall log:\n  - Expect "toBeVisible" with timeout 5000ms' + failed)).toBe('assert');
    expect(redKind('AssertionError: expected false to be true\n      Tests  1 failed | 2 passed (3)\n')).toBe('assert');
    expect(redKind('Error: Failed to fetch\n      Tests  1 failed | 2 passed (3)\n')).toBe('none');
    // A source excerpt with assertion text is not the reporter's error diagnostic.
    expect(redKind('Error: page.goto failed\n  42 | throw new Error("AssertionError: expected a value")' + failed)).toBe('none');
  });

  it('every verify name runs in the files that verify selects', () => {
    // String coercion also exercises the old global-name matcher: the regression
    // must fail because of scope, rather than merely because metadata is new.
    const named = (name: string, file: string, extra: { config?: string; project?: string } = {}) => ({ name, file, ...extra, toString: () => name });
    const tests = {
      unit: [
        named('selected first behavior', 'src/a.test.ts'),
        named('selected second behavior', 'src/b.test.ts'),
      ],
      e2e: [
        named('selected first behavior', 'e2e/a.spec.ts', { config: 'playwright.config.ts', project: 'phone' }),
        named('selected second behavior', 'e2e/b.spec.ts', { config: 'playwright.config.ts', project: 'desktop' }),
        named('selected production behavior', 'e2e/pwa.spec.ts', { config: 'e2e/pwa.config.ts', project: '' }),
      ],
    };
    const check = (verify: string): string[] => {
      const entry = { id: 'selected', task: 'qa-11', steps: S, verify, passes: true };
      return problems([entry], proofOf(entry), tests) as string[];
    };
    expect(check('pnpm vitest run src/a.test.ts -t "selected first|selected second"')).toContainEqual(expect.stringMatching(/selected second.*matches no test/));
    expect(check('pnpm vitest run src/a.test.ts src/b.test.ts -t "selected first|selected second"')).toEqual([]);
    expect(check('pnpm vitest run src -t "selected first|selected second"')).toEqual([]);
    expect(check('bash scripts/e2e-both.sh e2e/a.spec.ts -g "selected first|selected second"')).toContainEqual(expect.stringMatching(/selected second.*matches no test/));
    expect(check('bash scripts/e2e-both.sh e2e/a.spec.ts e2e/b.spec.ts -g "selected first|selected second"')).toEqual([]);
    expect(check('pnpm exec playwright test -c e2e/pwa.config.ts -g "selected first"')).toContainEqual(expect.stringMatching(/selected first.*matches no test/));
    expect(check('pnpm exec playwright test -c e2e/pwa.config.ts -g "selected production"')).toEqual([]);
    expect(check('pnpm exec playwright test --project=phone -g "selected second"')).toContainEqual(expect.stringMatching(/selected second.*matches no test/));
    expect(check('pnpm exec playwright test --project desktop -g "selected second"')).toEqual([]);
  });

  it("the harness check finds a verify's titles among the api tests", () => {
    // The report the api's vitest run writes, collected the way check-harness.mjs does.
    const root = mkdtempSync(join(tmpdir(), 'harness-api-'));
    mkdirSync(join(root, 'api/test-results'), { recursive: true });
    const report = { testResults: [{ name: join(root, 'api/test/skeleton.test.ts'), assertionResults: [{ fullName: 'the skeleton answers health' }] }] };
    writeFileSync(join(root, 'api/test-results/unit.json'), JSON.stringify(report));
    const api = apiTests(root, root);
    expect(api).toEqual([{ name: 'the skeleton answers health', file: 'api/test/skeleton.test.ts', config: 'api/vitest.config.ts', project: '' }]);
    const tests = { unit: [], e2e: [], api };
    const entry = (verify: string): Entry => ({ id: 'api-entry', task: 'p3-1', steps: S, verify, passes: true });
    const check = (verify: string): string[] => problems([entry(verify)], proofOf(entry(verify)), tests) as string[];
    expect(check('pnpm -C api exec vitest run -t "skeleton answers health"')).toEqual([]);
    expect(check('pnpm -C api exec vitest run test/skeleton.test.ts -t "skeleton answers health"')).toEqual([]);
    expect(check('pnpm -C api exec vitest run -t "a title that is gone"')).toContainEqual(expect.stringMatching(/a title that is gone.*matches no test/));
    // An app verify does not see the api's tests.
    expect(check('pnpm vitest run src -t "skeleton answers health"')).toContainEqual(expect.stringMatching(/matches no test/));
  });

  it('the harness check finds a verify\'s titles among the runner tests', () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-runner-'));
    mkdirSync(join(root, 'runner/test-results'), { recursive: true });
    const report = { testResults: [{ name: join(root, 'runner/test/fence.test.ts'), assertionResults: [{ fullName: 'the fence refuses a stale write' }] }] };
    writeFileSync(join(root, 'runner/test-results/unit.json'), JSON.stringify(report));
    const runner = runnerTests(root, root);
    expect(runner).toEqual([{ name: 'the fence refuses a stale write', file: 'runner/test/fence.test.ts', config: 'runner/vitest.config.ts', project: '' }]);
    const tests = { unit: [], e2e: [], runner };
    const entry = (verify: string): Entry => ({ id: 'runner-entry', task: 'p3-9', steps: S, verify, passes: true });
    const check = (verify: string): string[] => problems([entry(verify)], proofOf(entry(verify)), tests) as string[];
    expect(check('pnpm -C runner exec vitest run -t "fence refuses a stale write"')).toEqual([]);
    expect(check('pnpm --dir runner exec vitest run test/fence.test.ts -t "fence refuses a stale write"')).toEqual([]);
    expect(check('pnpm -C runner exec vitest run -t "a title that is gone"')).toContainEqual(expect.stringMatching(/a title that is gone.*matches no test/));
    expect(check('pnpm vitest run src -t "fence refuses a stale write"')).toContainEqual(expect.stringMatching(/matches no test/));
  });
  it('a verify naming no test is refused before merge', () => {
    // scripts/precheck-verify.mjs, fed the test names that exist (as the report of a vitest run lists them).
    const dir = mkdtempSync(join(tmpdir(), 'harness-precheck-'));
    const t = (name: string, file: string, config: string) => ({ name, file, config, project: '' });
    const tests = { unit: [t('a src test that exists', 'src/a.test.ts', 'vite.config.ts')], api: [], runner: [t('a runner test that exists', 'runner/test/a.test.ts', 'runner/vitest.config.ts')], e2e: [] };
    const entry = (id: string, verify: string): Entry => ({ id, task: 'p4-a', steps: S, verify, passes: false });
    const features = [
      entry('good-entry', 'pnpm vitest run -t "a src test that exists" && pnpm -C runner exec vitest run -t "a runner test that exists"'),
      entry('missing-entry', 'pnpm vitest run -t "a test nobody wrote"'),
      entry('wrong-package-entry', 'pnpm -C runner exec vitest run -t "a src test that exists"'),
    ];
    writeFileSync(join(dir, 'features.json'), JSON.stringify(features));
    writeFileSync(join(dir, 'tests.json'), JSON.stringify(tests));
    const run = (...ids: string[]) => spawnSync('node', ['scripts/precheck-verify.mjs', '--features', join(dir, 'features.json'), '--tests', join(dir, 'tests.json'), ...ids], { encoding: 'utf8' });
    const all = run();
    expect(all.status).toBe(1);
    expect(all.stderr).toContain('missing-entry');
    expect(all.stderr).toContain('a test nobody wrote');
    expect(all.stderr).toContain('wrong-package-entry');
    expect(all.stderr).toContain('a src test that exists');
    expect(all.stderr).not.toContain('good-entry');
    expect(run('good-entry').status).toBe(0);
    expect(run('missing-entry').status).toBe(1);
  });
  it('a verify with a src part and an api part looks for each name in its own package', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-precheck-'));
    const t = (name: string, file: string, config: string) => ({ name, file, config, project: '' });
    const tests = { unit: [t('a src test that exists', 'src/a.test.ts', 'vite.config.ts')], api: [t('an api test that exists', 'api/test/a.test.ts', 'api/vitest.config.ts')], runner: [], e2e: [] };
    const entry = (id: string, verify: string): Entry => ({ id, task: 'p4-a', steps: S, verify, passes: false });
    const features = [
      entry('mixed-entry', 'pnpm vitest run -t "a src test that exists" && pnpm -C api exec vitest run -t "an api test that exists"'),
      entry('mixed-wrong-entry', 'pnpm vitest run -t "an api test that exists" && pnpm -C api exec vitest run -t "a src test that exists"'),
    ];
    writeFileSync(join(dir, 'features.json'), JSON.stringify(features));
    writeFileSync(join(dir, 'tests.json'), JSON.stringify(tests));
    const run = (id: string) => spawnSync('node', ['scripts/precheck-verify.mjs', '--features', join(dir, 'features.json'), '--tests', join(dir, 'tests.json'), id], { encoding: 'utf8' });
    const mixed = run('mixed-entry');
    expect(mixed.stderr).toBe('');
    expect(mixed.status).toBe(0);
    const wrong = run('mixed-wrong-entry');
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('"an api test that exists" matches no test (unit');
    expect(wrong.stderr).toContain('"a src test that exists" matches no test (api');
  });

  // The marker lines are built here, so this file holds none itself.
  const marker = (c: string, tail = ''): string => c.repeat(7) + tail;
  const scratch = (files: Record<string, string>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-gate-'));
    const git = (...a: string[]): void => void spawnSync('git', a, { cwd: dir });
    git('init', '-q');
    git('config', 'user.email', 'you@example.com');
    git('config', 'user.name', 'Alex');
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'harness'));
    for (const f of ['harness-rules.mjs', 'harness-tests.mjs', 'check-harness.mjs']) copyFileSync(join(process.cwd(), 'scripts', f), join(dir, 'scripts', f));
    copyFileSync(join(process.cwd(), 'harness/done.sh'), join(dir, 'harness/done.sh'));
    writeFileSync(join(dir, 'harness/features.json'), '[]\n');
    writeFileSync(join(dir, 'harness/proof-legacy.txt'), readFileSync(join(process.cwd(), 'harness/proof-legacy.txt')));
    writeFileSync(join(dir, 'harness/progress.md'), '## Next\n- x\n');
    for (const [f, c] of Object.entries(files)) {
      mkdirSync(join(dir, f, '..'), { recursive: true });
      writeFileSync(join(dir, f), c);
    }
    git('add', '-A');
    git('commit', '-qm', 'base');
    return dir;
  };

  it('the harness check fails on a conflict-marker line and names file and line', () => {
    const dir = scratch({ 'src/a.ts': `one\n${marker('<', ' HEAD')}\ntwo\n${marker('=')}\nthree\n${marker('>', ' branch')}\n`, 'src/ok.ts': 'a == b\n// =======x\n' });
    const run = spawnSync('node', ['scripts/check-harness.mjs'], { cwd: dir, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('src/a.ts:2: conflict marker');
    expect(run.stderr).toContain('src/a.ts:4: conflict marker');
    expect(run.stderr).toContain('src/a.ts:6: conflict marker');
    expect(run.stderr).not.toContain('src/ok.ts');
  });

  const escalated = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'e1', task: 'p4-consolidation', steps: S, verify: V, passes: true, note: 'Rules. Starting model: bower-escalated. More.', ...over });

  it('an escalated consolidation entry cannot pass without a review PASS', () => {
    const check = (e: Record<string, unknown>): string[] => problems([e], readProofs(`e1\t${hashOf(V)}\t2026-10-09\tred\n`), undefined, new Set()) as string[];
    expect(check(escalated())).toEqual([expect.stringContaining('e1: escalated, passes without a review PASS')]);
    expect(check(escalated({ review: 'P4-37 BLOCK' }))).toHaveLength(1);
    expect(check(escalated({ review: 'P4-37f PASS' }))).toEqual([]);
    expect(check(escalated({ passes: false }))).toEqual([]);
    expect(check(escalated({ note: 'Starting model: bower-implementer.' }))).toEqual([]);
    expect(check(escalated({ task: 7 }))).toEqual([]);
  });

  it('done.sh refuses to close an escalated entry with no review PASS', () => {
    const entry = escalated({ passes: false });
    const dir = scratch({ 'harness/features.json': JSON.stringify([entry]), 'scripts/harness-rules.mjs': readFileSync(join(process.cwd(), 'scripts/harness-rules.mjs'), 'utf8') });
    const run = spawnSync('bash', ['harness/done.sh', 'e1', 'close e1'], { cwd: dir, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr + run.stdout).toContain('e1: escalated, passes without a review PASS');
    expect(run.stderr + run.stdout).toContain('e1 stays open');
  });
  it('the timer allowlist may only shrink', () => {
    const names = ['a', 'b'];
    expect(timerListProblems(names, ['a', 'b'], 2)).toEqual([]);
    // A line that matches no test is stale: it goes.
    expect(timerListProblems(names, ['a', 'gone'], 2)).toEqual([expect.stringContaining('"gone"')]);
    // A name added beyond the recorded size fails, even for a test that exists.
    expect(timerListProblems(names, ['a', 'b'], 1)).toEqual([expect.stringContaining('may only shrink')]);
    const list = JSON.parse(readFileSync(join(process.cwd(), 'harness/real-timers.json'), 'utf8')) as { tests: string[] };
    expect(list.tests.length).toBeLessThanOrEqual(REAL_TIMER_CEILING);
    expect(new Set(list.tests).size).toBe(list.tests.length);
  });

  it('wall-clock times are reported, never failed', () => {
    const tests = [{ name: 'quick', duration: 40 }, { name: 'very slow', duration: 9000 }, { name: 'slow', duration: 2600.4 }];
    // The slowest come first, with their time; a test far over any old limit adds no problem to the check.
    expect(slowReport(tests, 2)).toEqual(['9000 ms  very slow', '2600 ms  slow']);
    expect(timerListProblems(tests.map((t) => t.name), [], 0)).toEqual([]);
    // The report never fails the check: check-harness.mjs prints it and takes its exit status from the problems alone.
    const source = readFileSync(join(process.cwd(), 'scripts/check-harness.mjs'), 'utf8');
    expect(source).toContain('slowReport(unit)');
    expect(source).not.toMatch(/bad\.push\([^)]*slowReport/);
  });
  // harness/with-lock.sh is the one lock done.sh and integrate.sh share around the heavy runs.
  const lockScript = join(process.cwd(), 'harness/with-lock.sh');
  const stamp = "node -e 'console.log(Date.now())'";
  const runLocked = (lock: string, command: string): Promise<{ status: number | null; out: string }> =>
    new Promise((resolve) => {
      const child = spawn('bash', [lockScript, 'bash', '-c', command], { env: { ...process.env, HARNESS_LOCK: lock } });
      let out = '';
      child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { out += d.toString(); });
      child.on('close', (status) => resolve({ status, out }));
    });
  const fixtureDir = () => mkdtempSync(join(tmpdir(), 'lock-'));

  it('two checks started together run one after the other', async () => {
    const dir = fixtureDir();
    const times = join(dir, 'times.txt');
    const stub = `echo "start $(${stamp})" >> ${times}; sleep 0.5; echo "end $(${stamp})" >> ${times}`;
    const [a, b] = await Promise.all([runLocked(join(dir, 'lock'), stub), runLocked(join(dir, 'lock'), stub)]);
    expect([a.status, b.status]).toEqual([0, 0]);
    const lines = existsSync(times) ? readFileSync(times, 'utf8').trim().split('\n') : [];
    expect(lines.map((l) => l.split(' ')[0])).toEqual(['start', 'end', 'start', 'end']);
    const t = lines.map((l) => Number(l.split(' ')[1]));
    // The second run starts only after the first ended.
    expect(t[2] ?? 0).toBeGreaterThanOrEqual(t[1] ?? Infinity);
    expect(existsSync(join(dir, 'lock'))).toBe(false);
  });

  it('a second check waits and prints who holds the lock', async () => {
    const dir = fixtureDir();
    const first = runLocked(join(dir, 'lock'), 'sleep 0.6');
    for (let i = 0; i < 50 && !existsSync(join(dir, 'lock')); i += 1) await new Promise<void>((r) => { setImmediate(r); });
    const second = await runLocked(join(dir, 'lock'), 'true');
    await first;
    expect(second.status).toBe(0);
    expect(second.out).toMatch(/waiting.*pid \d+.*sleep 0\.6.*started \d{4}-\d\d-\d\d \d\d:\d\d:\d\d/i);
  });

  it('a lock whose holder is gone is taken over with a printed line', async () => {
    const dir = fixtureDir();
    mkdirSync(join(dir, 'lock'));
    writeFileSync(join(dir, 'lock/holder'), '999999\n2026-01-01 00:00:00\nold check\n');
    const run = await runLocked(join(dir, 'lock'), 'echo ran');
    expect(run.status).toBe(0);
    expect(run.out).toMatch(/stale.*pid 999999.*taking it over/i);
    expect(run.out).toContain('ran');
  });
});
