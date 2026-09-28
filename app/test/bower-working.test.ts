import { describe, expect, it } from 'vitest';

import type { Run } from '../src/api.js';
import { sinceLabel } from '../src/bower-tab.js';
import {
  workingBird,
  workingClasses,
  workingLabel,
} from '../src/components/bower-working.js';
import {
  doneNotes,
  SHEET_LINGER_MS,
  nothingLost,
  sheetVisible,
  startedAgo,
  workingStateFor,
} from '../src/components/working-sheet.js';
import { tidyUpAgo } from '../src/home.js';

describe('workingBird', () => {
  it('tidies while queued or running, shows off when done, is confused when failed or over quota', () => {
    expect(workingBird('queued')).toBe('tidying');
    expect(workingBird('running')).toBe('tidying');
    expect(workingBird('done')).toBe('showoff');
    expect(workingBird('failed')).toBe('confused');
    expect(workingBird('quota')).toBe('confused');
  });
});

describe('workingLabel', () => {
  it('keeps the texts under the animation', () => {
    expect(workingLabel('queued')).toBe('Tidying up…');
    expect(workingLabel('running')).toBe('Tidying up…');
    expect(workingLabel('done')).toBe('Done');
    expect(workingLabel('failed')).toBe('Something went wrong');
    expect(workingLabel('quota')).toBe('Limit reached');
  });
});

describe('workingClasses', () => {
  it('names the state', () => {
    expect(workingClasses('running', false)).toBe('bw bw--running');
    expect(workingClasses('failed', false)).toBe('bw bw--failed');
  });

  it('reduced motion: the still class, which shows the pulsing dot', () => {
    expect(workingClasses('running', true)).toBe('bw bw--running bw--still');
    expect(workingClasses('queued', true)).toBe('bw bw--queued bw--still');
  });
});

describe('sheetVisible', () => {
  it('shows while starting, queued, running or done, however long', () => {
    // #505: `starting` shows at once, before the run store even has a run.
    expect(sheetVisible('starting', 0, false)).toBe(true);
    expect(sheetVisible('queued', 0, false)).toBe(true);
    expect(sheetVisible('running', 10 * 60_000, false)).toBe(true);
    // The run store ends `done` itself (8 s, or on dismiss).
    expect(sheetVisible('done', SHEET_LINGER_MS, false)).toBe(true);
  });

  it('stays after a failure or a stale run until dismissed (#316)', () => {
    for (const phase of ['failed', 'stale'] as const) {
      expect(sheetVisible(phase, 10 * 60_000, false)).toBe(true);
      expect(sheetVisible(phase, 0, true)).toBe(false);
    }
  });

  it('lingers 3 s over quota', () => {
    expect(sheetVisible('quota', 0, false)).toBe(true);
    expect(sheetVisible('quota', SHEET_LINGER_MS - 1, false)).toBe(true);
    expect(sheetVisible('quota', SHEET_LINGER_MS, false)).toBe(false);
  });

  it('says nothing was lost with the count (#316)', () => {
    expect(nothingLost(3)).toBe(
      'Nothing was lost: your 3 things are still in the inbox, untouched.',
    );
    expect(nothingLost(1)).toBe(
      'Nothing was lost: your 1 thing is still in the inbox, untouched.',
    );
  });

  it('never shows once dismissed', () => {
    expect(sheetVisible('running', 0, true)).toBe(false);
    expect(sheetVisible('done', 0, true)).toBe(false);
  });

  it('never shows for idle', () => {
    expect(sheetVisible('idle', 0, false)).toBe(false);
  });
});

describe('workingStateFor', () => {
  it('maps run phases to animation states', () => {
    // #505: `starting` has no run yet, so it borrows `queued`'s bird.
    expect(workingStateFor('starting')).toBe('queued');
    expect(workingStateFor('queued')).toBe('queued');
    expect(workingStateFor('running')).toBe('running');
    expect(workingStateFor('done')).toBe('done');
    expect(workingStateFor('failed')).toBe('failed');
    expect(workingStateFor('stale')).toBe('failed');
    expect(workingStateFor('quota')).toBe('quota');
    expect(workingStateFor('idle')).toBeNull();
  });
});

describe('doneNotes', () => {
  const base: Run = { state: 'done', requestedAt: '2026-09-27T12:00:00.000Z' };

  it('is empty when there is nothing to say', () => {
    expect(doneNotes(base)).toEqual([]);
    expect(doneNotes(null)).toEqual([]);
    expect(doneNotes({ ...base, quarantined: [], refused: [] })).toEqual([]);
  });

  it('shows the quarantined line, then the refused line, both present', () => {
    expect(
      doneNotes({
        ...base,
        quarantined: ['0-Inbox/Quarantine/a.md', '0-Inbox/Quarantine/b.md'],
        refused: ['CLAUDE.md'],
      }),
    ).toEqual([
      'Bower set aside 2 files that contained instructions. Look at them in Drive and move them back if they are fine.',
      '1 change was refused; nothing was lost.',
    ]);
  });

  it('shows only the quarantined line when refused is absent', () => {
    expect(doneNotes({ ...base, quarantined: ['a.md'] })).toEqual([
      'Bower set aside 1 file that contained instructions. Look at them in Drive and move them back if they are fine.',
    ]);
  });

  it('shows only the refused line when quarantined is absent', () => {
    expect(doneNotes({ ...base, refused: ['a.md', 'b.md'] })).toEqual([
      '2 changes were refused; nothing was lost.',
    ]);
  });
});

describe('startedAgo', () => {
  const requestedAt = '2026-09-27T12:00:00.000Z';
  const nowMs = Date.parse(requestedAt);

  it('says "just now" under a minute', () => {
    expect(startedAgo(requestedAt, nowMs)).toBe('Started just now');
    expect(startedAgo(requestedAt, nowMs + 59_000)).toBe('Started just now');
  });

  it('counts whole minutes since', () => {
    expect(startedAgo(requestedAt, nowMs + 60_000)).toBe('Started 1 min ago');
    expect(startedAgo(requestedAt, nowMs + 5 * 60_000)).toBe(
      'Started 5 min ago',
    );
  });

  // #513: the Inbox card ("started n min ago"), the Last tidy-up card
  // ("n min ago") and the sheet ("Started n min ago") all read off the
  // same `sinceLabel` (`bower-tab.ts`) now, sharing the run store's one
  // clock -- so for the same instant, none of them can land on a
  // different minute than the others.
  it('agrees with sinceLabel and tidyUpAgo for the same instant', () => {
    const at = nowMs + 3 * 60_000 + 59_000; // 3 min 59 s later
    const label = sinceLabel(requestedAt, at);
    expect(label).toBe('3 min ago');
    expect(startedAgo(requestedAt, at)).toBe(`Started ${label}`);
    expect(tidyUpAgo(requestedAt, at)).toBe(label);
  });
});
