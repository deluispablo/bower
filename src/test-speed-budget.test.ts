/// <reference types="node" />
/**
 * test-speed-budget: one worker budget for every vitest config and Playwright, and affected-only runs for implementers.
 * Inside the heavy-run lock (testing/with-lock.sh sets HARNESS_LOCK_HELD) a run is the only heavy one and takes a large
 * share; outside it a run takes a small fixed number, so unlocked runs never oversubscribe the machine.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const scripts = (): Record<string, string> => (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

describe('the worker budget', () => {
  it('takes a large share inside the heavy lock and a small fixed number outside it', async () => {
    const { workerBudget } = (await import(/* @vite-ignore */ join(ROOT, 'testing/workers.ts'))) as {
      workerBudget: (env?: Record<string, string | undefined>) => { vitest: number | string; playwright: number | string };
    };
    expect(workerBudget({ HARNESS_LOCK_HELD: '/tmp/bower-heavy.lockf' })).toEqual({ vitest: '75%', playwright: '50%' });
    expect(workerBudget({})).toEqual({ vitest: 2, playwright: 1 });
    expect(workerBudget({ HARNESS_LOCK_HELD: '' })).toEqual({ vitest: 2, playwright: 1 });
  });

  it('is the one home of the worker counts of the three vitest configs and Playwright', () => {
    for (const config of ['vite.config.ts', 'api/vitest.config.ts', 'runner/vitest.config.ts', 'playwright.config.ts']) {
      const text = read(config);
      expect(text, config).toMatch(/import \{ workerBudget \} from '(\.\.?\/)+testing\/workers(\.ts)?'/);
      expect(text, config).toMatch(/\b(maxWorkers|workers): workerBudget\(\)\.(vitest|playwright)/);
      expect(text, config).not.toMatch(/\b(maxWorkers|workers): ['"\d]/);
    }
  });
});

describe('affected runs', () => {
  const run = (name: string, args: string[] = [], fail = '', empty = false) => {
    const script = scripts()[name];
    expect(script, `${name} exists`).toBeTruthy();
    const dir = mkdtempSync(join(tmpdir(), 'affected-'));
    try {
      // Execute the package script with pnpm's appended arguments; only the test runners are stubs.
      const stub = `#!${process.execPath}
const args = process.argv.slice(2);
const suite = args[0] === '-C' ? args[1] : args.includes('test') ? 'e2e' : 'app';
console.log(JSON.stringify({ suite, args, source: process.env.E2E_SOURCE }));
process.exit(suite === process.env.FAIL_SUITE ? 7 : process.env.EMPTY_SELECTION && !args.some(a => a === '--passWithNoTests' || a === '--pass-with-no-tests') ? 1 : 0);
`;
      for (const bin of ['pnpm', 'vitest', 'playwright']) writeFileSync(join(dir, bin), stub, { mode: 0o755 });
      const result = spawnSync('sh', ['-c', `${script} "$@"`, 'test-script', ...args], {
        encoding: 'utf8', timeout: 5000,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, E2E_SOURCE: 'demo', FAIL_SUITE: fail, EMPTY_SELECTION: empty ? '1' : '' },
      });
      expect(result.error).toBeUndefined();
      return { status: result.status, calls: result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as {
        suite: string; args: string[]; source: string;
      }) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it.each([[], [''], ['feature/affected-base']])('forwards the base to all runners: %j', (...args) => {
    const base = args[0] || 'main';
    const unit = run('test:affected', args);
    expect(unit.status).toBe(0);
    expect(unit.calls.map(call => call.args)).toEqual([
      ['run', '--changed', base, '--passWithNoTests'],
      ['-C', 'api', 'exec', 'vitest', 'run', '--changed', base, '--passWithNoTests'],
      ['-C', 'runner', 'exec', 'vitest', 'run', '--changed', base, '--passWithNoTests'],
    ]);
    const e2e = run('e2e:affected', args);
    expect(e2e).toEqual({ status: 0, calls: [{ suite: 'e2e', source: 'fake',
      args: ['test', `--only-changed=${base}`, '--pass-with-no-tests'] }] });
  });

  it.each(['app', 'api'])('stops at a failing %s suite', (suite) => {
    const result = run('test:affected', [], suite);
    expect(result.status).toBe(7);
    expect(result.calls.map(call => call.suite)).toEqual(suite === 'app' ? ['app'] : ['app', 'api']);
  });

  it('preserves a Playwright failure', () => {
    expect(run('e2e:affected', [], 'e2e').status).toBe(7);
  });

  it('succeeds with empty selections in every suite', () => {
    expect(run('test:affected', [], '', true).status).toBe(0);
    expect(run('e2e:affected', [], '', true).status).toBe(0);
  });

  it('pnpm test:affected runs vitest --changed for app, api and runner, against main by default', () => {
    const script = scripts()['test:affected'] ?? '';
    expect(script).toMatch(/\$\{1:-main\}/);
    expect(script).toMatch(/(^|[;&] *)(pnpm exec )?vitest run --changed "\$base"/);
    expect(script).toMatch(/pnpm -C api exec vitest run --changed "\$base"/);
    expect(script).toMatch(/pnpm -C runner exec vitest run --changed "\$base"/);
    expect(script.match(/--passWithNoTests/g)).toHaveLength(3);
  });

  it('pnpm e2e:affected runs Playwright --only-changed on the pretend Drive, against main by default', () => {
    const script = scripts()['e2e:affected'] ?? '';
    expect(script).toMatch(/E2E_SOURCE=fake/);
    expect(script).toMatch(/\$\{1:-main\}/);
    expect(script).toMatch(/playwright test --only-changed="\$base"/);
    expect(script).toMatch(/--pass-with-no-tests/);
  });

  it('CLAUDE.md lists both runs and keeps the batch gate full', () => {
    const map = read('CLAUDE.md');
    const commands = map.slice(map.indexOf('## Commands'), map.indexOf('## Where things are'));
    expect(commands).toMatch(/pnpm test:affected \[base\]/);
    expect(commands).toMatch(/pnpm e2e:affected \[base\]/);
    expect(commands).toMatch(/^Gates:.*implementers.*`pnpm test:affected`.*`pnpm e2e:affected`/m);
    expect(commands).toMatch(/^Gates:.*batch gate stays full/m);
  });
});
