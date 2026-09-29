import { describe, expect, it } from 'vitest';

import { parseLastRun } from '../src/last-run.js';
import {
  buildLastRun,
  buildRun,
  lastRunJson,
} from './fixtures/run-outcome-builders.js';

describe('run outcome fixture builders (spec 7c item 5)', () => {
  it('builds a last-run.json the parser reads, in every state it writes', () => {
    for (const state of ['done', 'partial', 'failed', 'stale'] as const) {
      const parsed = parseLastRun(lastRunJson(state));
      expect(parsed).not.toBeNull();
      expect(parsed?.state).toBe(buildLastRun(state).state);
    }
  });

  it('builds a partial run as a failed run that wrote notes (R-RUNNER-5)', () => {
    const run = buildRun('partial');
    expect(run.state).toBe('failed');
    expect((run.created?.length ?? 0) + (run.updated?.length ?? 0)).toBe(2);
    expect(buildRun('failed').created).toEqual([]);
    expect(buildRun('stale')).toMatchObject({ state: 'failed', error: 'stale' });
    expect(buildRun('running', { done: 2 })).toMatchObject({
      phase: 'writing',
      done: 2,
    });
  });
});
