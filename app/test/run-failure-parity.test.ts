import { describe, expect, it } from 'vitest';

import typesRaw from '../../api/src/types.ts?raw';
import runShRaw from '../../agent/run.sh?raw';
import { RUN_FAILURE_REASONS } from '../src/run-failure.js';

/**
 * The failure reasons live in three places that must agree (spec §7c item
 * 10, R-VAULT-14): the Worker's `RUN_FAILURE_REASONS` (`api/src/types.ts`),
 * the runner's `failed_sentence` (`agent/run.sh`) and the app's copy
 * (`app/src/run-failure.ts`). The first two are read as text.
 */

/** The quoted strings of the Worker's `RUN_FAILURE_REASONS` array. */
function workerReasons(source: string): string[] {
  const block = /RUN_FAILURE_REASONS = \[([^\]]*)\]/.exec(source)?.[1];
  if (block === undefined) throw new Error('RUN_FAILURE_REASONS not found');
  return [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1] ?? '');
}

/** The case labels of `failed_sentence` in `run.sh`, `*` left out. */
function runnerReasons(source: string): string[] {
  const body = /failed_sentence\(\) \{([\s\S]*?)\n\}/.exec(source)?.[1];
  if (body === undefined) throw new Error('failed_sentence not found');
  return [...body.matchAll(/^\s+([a-z_]+)\) /gm)].map(
    (match) => match[1] ?? '',
  );
}

describe('failure reasons parity (R-VAULT-14)', () => {
  it('the app knows exactly the reasons the Worker accepts', () => {
    expect([...RUN_FAILURE_REASONS]).toEqual(workerReasons(typesRaw));
  });

  it('includes vault_missing', () => {
    expect(RUN_FAILURE_REASONS).toContain('vault_missing');
  });

  it('run.sh gives no sentence for a reason the Worker does not accept', () => {
    const known: readonly string[] = RUN_FAILURE_REASONS;
    const runner = runnerReasons(runShRaw);
    expect(runner.length).toBeGreaterThan(0);
    for (const reason of runner) expect(known).toContain(reason);
  });

  // `unknown` is the `*` fallback in run.sh; every other reason has its own
  // case.
  it('run.sh has a sentence for every reason but unknown', () => {
    const runner = runnerReasons(runShRaw);
    const expected = workerReasons(typesRaw).filter(
      (reason) => reason !== 'unknown',
    );
    expect([...runner].sort()).toEqual([...expected].sort());
  });
});
