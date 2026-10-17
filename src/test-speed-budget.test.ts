/// <reference types="node" />
/**
 * test-speed-budget: one worker budget for every vitest config and Playwright, and affected-only runs for implementers.
 * Inside the heavy-run lock (testing/with-lock.sh sets HARNESS_LOCK_HELD) a run is the only heavy one and takes a large
 * share; outside it a run takes a small fixed number, so unlocked runs never oversubscribe the machine.
 */
import { readFileSync } from 'node:fs';
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
