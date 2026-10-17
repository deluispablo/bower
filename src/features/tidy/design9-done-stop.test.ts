/**
 * design9-done-stop (tester, P3): a finished run's title is two sentences, "Done. Bower read your changes", and the
 * second one has no full stop, on the sheet, Home's card, the Now card and the toast. A title made of sentences ends
 * with a full stop, both shapes of it ("Done. 3 things filed." too); a one-phrase title or the status line does not.
 * Made-up words only.
 */
import { describe, expect, it } from 'vitest';
import type { RunReport, RunState } from '@/data/types';
import { runShort, runTitle } from './run-words';

const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const run = (scope: RunState['scope'], phase: RunState['phase'], report: RunReport = empty()): RunState =>
  ({ id: 'r', scope, phase, requestedAt: 0, phaseAt: 1, finishedAt: 1, seen: false, total: 3, report });

describe('AC1 a finished run title ends with a full stop', () => {
  it('AC1 design9-done-stop-changes: a read of your changes is "Done. Bower read your changes."', () => {
    expect(runTitle(run('instructions', 'done'))).toBe('Done. Bower read your changes.');
  });

  it('AC1 design9-done-stop-filed: a tidy-up is "Done. 3 things filed." and "Done. 1 thing already saved."', () => {
    const filed = { ...empty(), filed: ['a', 'b', 'c'].map((n) => ({ name: `${n}.pdf`, title: n, kind: 'pdf' as const, to: 'Areas/Money' })) };
    expect(runTitle(run('all', 'done', filed))).toBe('Done. 3 things filed.');
    expect(runTitle(run('all', 'done', { ...empty(), alreadySaved: [{ name: 'a.pdf', as: 'Areas/Money/a.pdf' }] }))).toBe('Done. 1 thing already saved.');
  });

  it('AC1 design9-done-stop-phrases: one-phrase titles and the short line stay without a stop (control)', () => {
    expect(runTitle(run('all', 'writing'))).toBe('Writing your notes');
    expect(runTitle(run('instructions', 'reading'))).toBe('Reading your changes');
    expect(runTitle(run('all', 'failed'))).toBe('The tidy-up stopped');
    expect(runShort(run('instructions', 'done'))).toBe('Bower read your changes');
  });
});
