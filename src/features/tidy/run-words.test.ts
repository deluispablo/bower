import { describe, expect, it } from 'vitest';
import type { RunState } from '@/data/types';
import { landedSummary, runClock, runDetail, runLinkRows, runShort, runTitle, stepState } from './run-words';

const base: RunState = { id: 'r', scope: 'all', phase: 'writing', requestedAt: Date.UTC(2026, 9, 4, 15, 0), phaseAt: 0, seen: false, total: 6 };

describe('what a run says', () => {
  it('names the real phase, never a made-up percentage', () => {
    expect(runTitle({ ...base, phase: 'reading' })).toBe('Reading 6 things');
    expect(runTitle(base)).toBe('Writing your notes');
  });
  it('counts time honestly', () => {
    expect(runClock(base, base.requestedAt + 3 * 60_000 + 5_000)).toMatch(/3 min so far\. Usually about 5 minutes\.$/);
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
    expect(landedSummary(done)).toBe('Flat hunt got 2 and Money got 1.');
  });
});

import { statusLine } from './run-words';

describe('the status line', () => {
  it('says it is looking while the inbox loads, never "Nothing waiting"', () => {
    expect(statusLine(null, undefined)).toBe('Looking at the inbox…');
    expect(statusLine(null, 0)).toBe('Nothing waiting');
    expect(statusLine(null, 3)).toBe('3 things waiting');
  });
});


describe('how long a run takes', () => {
  it('says minutes', () => {
    const r = { id: 'r', scope: 'all' as const, phase: 'writing' as const, requestedAt: 0, phaseAt: 0, seen: false };
    expect(runClock(r, 30_000)).toMatch(/Usually about 5 minutes\.$/);
  });
  it('the report says what it did with your words: requests done, rules worded', () => {
    const empty = { filed: [], created: [], updated: [], setAside: [], questions: [] };
    const one = runDetail({ ...base, phase: 'done', report: { ...empty, requests: ['Put my visa papers together'], rulesWorded: 1, yourChanges: 2 } });
    expect(one).toContain('"Put my visa papers together" done');
    expect(one).toContain('1 rule worded');
    expect(runDetail({ ...base, phase: 'done', report: { ...empty, requests: ['a', 'b'] } })).toContain('2 things you asked done');
  });
  it('renders the raw completed table request as its done sentence', () => {
    expect(runDetail({ ...base, scope: 'instructions', phase: 'done', report: {
      filed: [], created: [], updated: [], setAside: [], questions: [], requests: ['Show hours in the offer table.'],
    } })).toBe('"Show hours in the offer table." done.');
  });
  it('the report counts each change once: what it names is not counted again', () => {
    const empty = { filed: [], created: [], updated: [], setAside: [], questions: [] };
    const d = runDetail({ ...base, phase: 'done', report: { ...empty, requests: ['Put my visa papers together'], rulesWorded: 1, yourChanges: 5 } });
    expect(d).toBe('"Put my visa papers together" done, 1 rule worded and 5 other changes of yours read.');
  });
  it('the report says a thing already saved, by the name it is saved as', () => {
    const empty = { filed: [], created: [], updated: [], setAside: [], questions: [] };
    expect(runDetail({ ...base, phase: 'done', report: { ...empty, alreadySaved: [{ name: 'Offer copy.pdf', as: 'Offer letter.pdf' }] } })).toBe('1 thing already saved as Offer letter.');
    const two = [{ name: 'a.pdf', as: 'A.pdf' }, { name: 'b.pdf', as: 'B.pdf' }];
    expect(runDetail({ ...base, phase: 'done', report: { ...empty, alreadySaved: two } })).toBe('2 things already saved.');
  });
  it('a pile of words already saved says its lines were already in its note', () => {
    const empty = { filed: [], created: [], updated: [], setAside: [], questions: [] };
    const one = [{ name: 'Flat 3 news', as: 'Flat 3, 12 Larkspur Lane.md', notes: 1 }];
    expect(runDetail({ ...base, phase: 'done', report: { ...empty, alreadySaved: one } })).toBe('Your lines were already in Flat 3, 12 Larkspur Lane.');
    const several = [{ name: 'Flat 3 news', as: 'Flat 3, 12 Larkspur Lane.md', notes: 2 }];
    expect(runDetail({ ...base, phase: 'done', report: { ...empty, alreadySaved: several } })).toBe('Your lines were already in your notes.');
  });
  it('a run that only found things already saved never says 0 things filed', () => {
    const empty = { filed: [], created: [], updated: [], setAside: [], questions: [] };
    const done = { ...base, phase: 'done' as const, report: { ...empty, alreadySaved: [{ name: 'Offer copy.pdf', as: 'Offer letter.pdf' }] } };
    expect(runTitle(done)).toBe('Done. 1 thing already saved');
    expect(runShort(done)).toBe('1 thing already saved');
    expect(runTitle({ ...done, report: empty })).toBe('Done. 0 things filed');
  });
});


describe('the notes a finished run links', () => {
  it('lists each note once, a new one under new notes only, in report order', () => {
    const rows = runLinkRows({
      created: [{ path: 'Resources/Ideas/Heating.md', what: 'Written from a note you added.' }, { path: 'Projects/Flat hunt/Flat hunt.md', what: 'A note.' }],
      updated: [{ path: 'Projects/Flat hunt/Flat hunt.md', what: 'A line.' }, { path: 'Projects/Job hunt/Job hunt.md', what: 'Another line.' }, { path: 'Projects/Job hunt/Job hunt.md', what: 'Again.' }],
    });
    expect(rows.made.map((r) => r.path)).toEqual(['Resources/Ideas/Heating.md', 'Projects/Flat hunt/Flat hunt.md']);
    expect(rows.updated).toEqual([{ path: 'Projects/Job hunt/Job hunt.md', what: 'Another line.' }]);
  });
  it('lists nothing for a run that made and updated nothing', () => {
    expect(runLinkRows({ created: [], updated: [] })).toEqual({ made: [], updated: [] });
  });
});

describe('how many notes a run brought up to date', () => {
  // P4-45 m4: one distinct-path count, shared by Home, Replay, the run links and the corpus scorer.
  it('one distinct-path count', async () => {
    const at = '@/data/spine/report';
    const mod = (await import(/* @vite-ignore */ at)) as { distinctPaths?: (rows: readonly { path: string }[]) => string[] };
    expect(typeof mod.distinctPaths).toBe('function');
    const updated = [{ path: 'Projects/Flat hunt/Flat hunt.md', what: 'One.' }, { path: 'Projects/Flat hunt/Flat hunt.md', what: 'Two.' }, { path: 'Areas/Health/Health.md', what: 'Three.' }];
    expect(mod.distinctPaths?.(updated)).toEqual(['Projects/Flat hunt/Flat hunt.md', 'Areas/Health/Health.md']);
    expect(runLinkRows({ created: [], updated }).updated.map((r) => r.path)).toEqual(mod.distinctPaths?.(updated));
  });
});
