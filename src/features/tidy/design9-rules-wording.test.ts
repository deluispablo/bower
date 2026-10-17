/**
 * design9-rules-wording (tester, P3): while Bower reads your changes, the sheet, Home and the Now card say "Wording
 * your rules and doing what you asked." (and, before it, "...the rules you typed..."), even when the person has no
 * rule and asked nothing. A running run does not know yet what its changes hold, so its words name only what is
 * always true. Made-up words only.
 */
import { describe, expect, it } from 'vitest';
import type { RunState } from '@/data/types';
import { runDetail } from './run-words';

const run = (scope: RunState['scope'], phase: RunState['phase']): RunState =>
  ({ id: 'r', scope, phase, requestedAt: 0, phaseAt: 1, seen: false });

describe('AC1 a running read of your changes never claims rules', () => {
  it('AC1 design9-rules-wording-writing: the writing step says what is always true', () => {
    expect(runDetail(run('instructions', 'writing'))).toBe('Doing what your changes call for. Your inbox waits for a tidy-up.');
  });

  it('AC1 design9-rules-wording-reading: the reading step names no rules', () => {
    expect(runDetail(run('instructions', 'reading'))).toBe('Reading the changes you made and anything you asked.');
  });

  it('AC1 design9-rules-wording-none: no running step of a read of your changes names a rule', () => {
    for (const phase of ['queued', 'reading', 'writing', 'saving'] as const) expect(runDetail(run('instructions', phase))).not.toMatch(/\brules?\b/i);
  });

  it('AC1 design9-rules-wording-tidy: a tidy-up\'s steps and the saving step stay (control)', () => {
    expect(runDetail(run('instructions', 'saving'))).toBe('Saving it in your Drive.');
    expect(runDetail(run('all', 'writing'))).toBe('The longest part. Bower names each thing, writes its note and updates the notes it touches.');
    expect(runDetail(run('all', 'reading'))).toBe('Copying your inbox and reading what each thing is.');
  });
});
