/**
 * design9-last-tidy (tester, P3): the status bar says "Last tidy-up 15:04" after a run that left the inbox untouched:
 * a read of your changes (Tell Bower, a request) or a tidy-up that found nothing ready. The source only knows the
 * latest run, so after such a run the line says what waits, with no time, rather than a wrong one. Made-up words only.
 */
import { describe, expect, it } from 'vitest';
import { clock } from '@/app/words';
import type { RunReport, RunState } from '@/data/types';
import { statusLine } from './run-words';

const AT = Date.UTC(2026, 9, 4, 15, 4);
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const done = (scope: RunState['scope'], report: RunReport = empty()): RunState =>
  ({ id: 'r', scope, phase: 'done', requestedAt: AT - 60_000, phaseAt: AT, finishedAt: AT, seen: true, report });

describe('AC1 Last tidy-up names only a run that tidied the inbox', () => {
  it('AC1 design9-last-tidy-changes: after a read of your changes the line has no tidy-up time', () => {
    expect(statusLine(done('instructions', { ...empty(), yourChanges: 2 }), 0)).toBe('Nothing waiting');
    expect(statusLine(done('instructions', { ...empty(), created: [{ path: 'Areas/Home/Garden.md', what: 'Made' }] }), 3)).toBe('3 things waiting');
  });

  it('AC1 design9-last-tidy-nothing-ready: after a tidy-up that found nothing ready the line has no tidy-up time', () => {
    expect(statusLine(done('all', { ...empty(), nothingReady: true }), 2)).toBe('2 things waiting');
  });

  it('AC1 design9-last-tidy-tidied: a tidy-up keeps its time (control)', () => {
    const filed = { ...empty(), filed: [{ name: 'a.pdf', title: 'A', kind: 'pdf' as const, to: 'Areas/Money' }] };
    expect(statusLine(done('all', filed), 0)).toBe(`Last tidy-up ${clock(AT)}. Nothing waiting`);
    expect(statusLine(done('all'), 1)).toBe(`Last tidy-up ${clock(AT)}. 1 thing waiting`);
    expect(statusLine(null, undefined)).toBe('Looking at the inbox…');
  });
});
