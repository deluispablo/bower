import { describe, expect, it } from 'vitest';
import type { RunState } from '@/data/types';
import { landedSummary, runClock, runDetail, runTitle, stepState } from './run-words';

const base: RunState = { id: 'r', scope: 'all', phase: 'writing', requestedAt: Date.UTC(2026, 9, 4, 15, 0), phaseAt: 0, seen: false, total: 6 };

describe('what a run says', () => {
  it('names the real phase, never a made-up percentage', () => {
    expect(runTitle({ ...base, phase: 'reading' })).toBe('Reading 6 things');
    expect(runTitle(base)).toBe('Writing your notes');
  });
  it('counts time honestly', () => {
    expect(runClock(base, base.requestedAt + 3 * 60_000 + 5_000)).toMatch(/3 min so far\. Usually about 5\.$/);
    expect(runClock({ ...base, phase: 'queued' }, base.requestedAt + 10_000)).toMatch(/Less than a minute so far/);
  });
  it('marks the steps before, at and after the phase', () => {
    expect(stepState(base, 'reading')).toBe('done');
    expect(stepState(base, 'writing')).toBe('now');
    expect(stepState(base, 'saving')).toBe('later');
  });
  it('sums up a done run', () => {
    const done: RunState = {
      ...base,
      phase: 'done',
      report: {
        filed: [
          { name: 'a', title: 'A', kind: 'pdf', to: 'Projects/Flat hunt' },
          { name: 'b', title: 'B', kind: 'pdf', to: 'Projects/Flat hunt' },
          { name: 'c', title: 'C', kind: 'pdf', to: 'Areas/Money' },
        ],
        created: [],
        updated: [{ path: 'x', what: 'y' }],
        setAside: [],
        questions: [{ id: 'q', text: 't', yes: 'y', no: 'n', askedAt: 0 }],
      },
    };
    expect(runTitle(done)).toBe('Done. 3 things filed');
    expect(runDetail(done)).toBe('1 note brought up to date and 1 question for you.');
    expect(landedSummary(done)).toBe('Flat hunt got 2, Money got 1.');
  });
});
