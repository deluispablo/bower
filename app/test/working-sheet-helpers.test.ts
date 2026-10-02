import { describe, expect, it } from 'vitest';

import { outcomeFromRun } from '../src/run-outcome.js';
import type { OutcomeItem, RunOutcome } from '../src/run-outcome.js';
import { WORKING_STAGE_HEIGHT } from '../src/components/bower-working.js';
import {
  ACTION_TAG,
  clockTime,
  needsFirst,
  partialFolder,
  rowFor,
  sheetLabel,
  sheetRows,
  sheetStateOf,
  sheetSteps,
  sheetTimeLine,
  sheetTitle,
} from '../src/components/working-sheet.js';
import { buildRun } from './fixtures/run-outcome-builders.js';

/** A local time, so the tests do not depend on the machine's zone. */
function at(hours: number, minutes: number): string {
  return new Date(2026, 8, 29, hours, minutes).toISOString();
}

function item(action: OutcomeItem['action'], path: string): OutcomeItem {
  const title = path.slice(path.lastIndexOf('/') + 1);
  return { action, title, path };
}

describe('sheetStateOf (R-SHEET-2)', () => {
  const done = outcomeFromRun(buildRun('done'));
  const partial = outcomeFromRun(buildRun('partial'));
  const failed = outcomeFromRun(buildRun('failed'));

  it('running while starting, queued or running', () => {
    for (const phase of ['starting', 'queued', 'running'] as const) {
      expect(sheetStateOf(phase, null)).toBe('running');
    }
  });

  it('reads a finished run through its outcome', () => {
    expect(sheetStateOf('done', done)).toBe('done');
    expect(sheetStateOf('failed', partial)).toBe('partial');
    expect(sheetStateOf('failed', failed)).toBe('failed');
  });

  it('a stale run that never said why is "did not finish"', () => {
    expect(sheetStateOf('stale', null)).toBe('failed');
  });

  it('none for idle, quota for the limit of the day', () => {
    expect(sheetStateOf('idle', null)).toBeNull();
    expect(sheetStateOf('quota', null)).toBe('quota');
  });

  it('names each state as on the boards', () => {
    expect(sheetLabel('running')).toBe('Tidying up');
    expect(sheetLabel('done')).toBe('Tidy-up done');
    expect(sheetLabel('partial')).toBe('Tidy-up partly done');
    expect(sheetTitle('running', 5)).toBe('Tidying up 5 things');
    expect(sheetTitle('running', 1)).toBe('Tidying up 1 thing');
    expect(sheetTitle('running')).toBe('Tidying up');
    expect(sheetTitle('done')).toBe('Done');
    expect(sheetTitle('partial')).toBe('Partly done');
    expect(sheetTitle('failed')).toBe('Did not finish');
  });
});

describe('the time line', () => {
  const outcome = {
    startedAt: at(13, 52),
    finishedAt: at(13, 57),
  } as RunOutcome;
  const start = Date.parse(at(13, 52));

  it('formats a clock time and a length', () => {
    expect(clockTime(at(9, 5))).toBe('09:05');
    expect(clockTime('not a date')).toBe('');
    expect(clockTime(undefined)).toBe('');
  });

  it('running: started and so far, from the one run clock (#1001)', () => {
    expect(sheetTimeLine('running', outcome, start + 2 * 60_000)).toBe(
      'Started 13:52 · 2 min so far',
    );
    expect(sheetTimeLine('running', outcome, start + 10_000)).toBe(
      'Started 13:52 · less than a minute so far',
    );
  });

  it('running in the demo says it is a playback', () => {
    expect(sheetTimeLine('running', outcome, start, true)).toBe('Playing back');
  });

  it('done: from, to and how long', () => {
    expect(sheetTimeLine('done', outcome, start)).toBe(
      '13:52 to 13:57 · 5 min',
    );
  });

  it('done in under a minute: "1 min", as Just filed says it (#950)', () => {
    const quick = {
      ...outcome,
      finishedAt: new Date(start + 20_000).toISOString(),
    };
    expect(sheetTimeLine('done', quick, start)).toMatch(/ · 1 min$/);
  });

  it('partial and failed: stopped after', () => {
    expect(sheetTimeLine('partial', outcome, start)).toBe(
      '13:52 to 13:57 · stopped after 5 min',
    );
    expect(sheetTimeLine('failed', outcome, start)).toBe(
      '13:52 to 13:57 · stopped after 5 min',
    );
  });
});

describe('sheetSteps (R-SHEET-5)', () => {
  it('falls back to one indeterminate step without a phase', () => {
    const outcome = outcomeFromRun(buildRun('running', { phase: undefined }));
    expect(sheetSteps('running', outcome)).toEqual([
      { key: 'working', name: 'Working on it', status: 'active' },
    ]);
    expect(sheetSteps('running', null)).toHaveLength(1);
  });

  it('reads four steps off the phase, with the count on writing', () => {
    const outcome = outcomeFromRun(
      buildRun('running', { phase: 'writing', total: 5 }),
    );
    const steps = sheetSteps('running', outcome, 2);
    expect(steps.map((step) => step.name)).toEqual([
      'Got your inbox',
      'Read 5 things',
      'Writing notes',
      'Filing and saving to Drive',
    ]);
    expect(steps.map((step) => step.status)).toEqual([
      'done',
      'done',
      'active',
      'todo',
    ]);
    expect(steps[2]?.detail).toBe('2 of 5');
  });

  it('a partly done run stops on the last step', () => {
    const steps = sheetSteps('partial', outcomeFromRun(buildRun('partial')));
    expect(steps.map((step) => step.status)).toEqual([
      'done',
      'done',
      'done',
      'stopped',
    ]);
    expect(steps[3]).toMatchObject({
      name: 'Filing and saving to Drive',
      detail: 'stopped',
    });
  });

  it('done and failed runs list no steps', () => {
    expect(sheetSteps('done', outcomeFromRun(buildRun('done')))).toEqual([]);
    expect(sheetSteps('failed', null)).toEqual([]);
  });
});

describe('rows (R-SHEET-3)', () => {
  const items = [
    item('filed', '1-Projects/Flat hunt/Lease.pdf'),
    item('new', '1-Projects/Flat hunt/Riverside/Summary.md'),
    item('needs', '0-Inbox/Floor plan.heic'),
    item('updated', '2-Areas/Home/Boiler.md'),
  ];

  it('puts what needs you first, then new, updated and filed', () => {
    expect(needsFirst(items).map((entry) => entry.action)).toEqual([
      'needs',
      'new',
      'updated',
      'filed',
    ]);
  });

  it('caps the rows and counts the rest', () => {
    const outcome = { items } as RunOutcome;
    const { rows, more } = sheetRows(outcome, 2);
    expect(rows.map((row) => row.action)).toEqual(['needs', 'new']);
    expect(more).toBe(2);
    expect(sheetRows(outcome, 8).more).toBe(0);
  });

  it('carries an action tag and a where-line with the PARA mark', () => {
    const row = rowFor(items[1] as OutcomeItem);
    expect(ACTION_TAG[row.action ?? 'filed']).toBe('New note');
    expect(row.para).toBe('projects');
    expect(row.where).toBe('Projects › Flat hunt › Riverside');
    expect(row.tone).toBe('note');
  });

  it('says why a thing needs you, or that it is still in the inbox', () => {
    const needs = items[2] as OutcomeItem;
    expect(rowFor(needs).note).toBe('Still in your inbox');
    const aside = new Map([[needs.path, 'Kept, not read: a photo format']]);
    expect(rowFor(needs, aside).note).toBe('Kept, not read: a photo format');
    expect(rowFor(needs).where).toBe('');
  });

  it('a renamed file says what it was; an update says what changed', () => {
    const renamed: OutcomeItem = {
      ...item('filed', '1-Projects/Flat hunt/Lease.pdf'),
      to: '1-Projects/Flat hunt/Lease.pdf',
      from: 'scan_0412.pdf',
    };
    expect(rowFor(renamed).note).toBe('was scan_0412.pdf');
    const updated: OutcomeItem = {
      ...item('updated', '2-Areas/Home/Boiler.md'),
      note: 'Added the next service date',
    };
    expect(rowFor(updated).note).toBe('Added the next service date');
  });

  it('a filed link reads by its host, not its generated file name (#557)', () => {
    const link: OutcomeItem = {
      action: 'filed',
      title: 'Link - example.org 2026-09-28 1414.md',
      path: 'Clippings/Link - example.org 2026-09-28 1414.md',
      to: '3-Resources/Links/Link - example.org 2026-09-28 1414.md',
    };
    const row = rowFor(link);
    expect(row.title).toBe('example.org');
    expect(row.where).toBe('Resources › Links');
  });

  it('finds the folder that holds the new notes', () => {
    expect(partialFolder({ items } as RunOutcome)).toBe(
      '1-Projects/Flat hunt/Riverside',
    );
    expect(partialFolder({ items: [] } as unknown as RunOutcome)).toBeNull();
  });
});

describe('the running note and the stage', () => {
  it('R-BIRD-8: the stage is 166 px high', () => {
    expect(WORKING_STAGE_HEIGHT).toBe(166);
  });
});
