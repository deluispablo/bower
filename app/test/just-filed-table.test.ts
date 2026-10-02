/**
 * Just filed as a table (#755, spec §6.6 R-JUST-1 to R-JUST-5): rows and
 * groups from a run, the earlier-run lines, `?run=` and the Activity
 * fallback. Pure and hermetic.
 */

import { describe, expect, it } from 'vitest';

import type { Run } from '../src/api.js';
import { parseLog } from '../src/activity.js';
import {
  fallbackLines,
  groupRows,
  isProcessedPath,
  originLine,
  pickRun,
  runKey,
  NOTHING_LOST,
  runLine,
  showsNewChip,
  tableRows,
  youAdded,
} from '../src/just-filed.js';
import { buildRun } from './fixtures/run-outcome-builders.js';

const NOW = new Date('2026-09-29T14:00:00').getTime();

const run: Run = {
  state: 'done',
  requestedAt: '2026-09-29T13:50:00.000Z',
  startedAt: '2026-09-29T13:52:00.000Z',
  finishedAt: '2026-09-29T13:57:00.000Z',
  runId: 'run-a',
  items: [
    {
      path: '0-Inbox/scan_0412.pdf',
      kind: 'file',
      to: '2-Areas/Home/Boiler manual.pdf',
      renamedFrom: 'scan_0412.pdf',
    },
    // The raw link file, parked in Processed: never listed.
    {
      path: 'Clippings/rentals link',
      kind: 'file',
      to: '0-Inbox/Processed/rentals link.md',
    },
    // An instruction note moved into Processed: bookkeeping.
    {
      path: '0-Inbox/Tidy this.md',
      kind: 'request',
      to: '0-Inbox/Processed/Tidy this.md',
    },
    {
      path: '0-Inbox/IMG_1.heic',
      kind: 'file',
      to: '1-Projects/Flat hunt/IMG_1.heic',
    },
  ],
  setAside: [{ path: '0-Inbox/IMG_1.heic', reason: 'kept-not-read' }],
  created: ['3-Resources/Links/Three flats near the river.md'],
  updated: [{ path: '2-Areas/Home/Home.md', what: 'Added the boiler date' }],
  left: [],
};

describe('tableRows', () => {
  const rows = tableRows(run, null);

  it('never lists a move into Processed, and never a raw Moved line (R-JUST-1)', () => {
    expect(isProcessedPath('0-Inbox/Processed/a.md')).toBe(true);
    expect(isProcessedPath('0-Inbox/Processed.md')).toBe(false);
    expect(rows.some((row) => row.folder.includes('Processed'))).toBe(false);
    expect(rows.some((row) => row.title.startsWith('Moved'))).toBe(false);
  });

  it('lists a saved link as the note, where it is now (R-JUST-4)', () => {
    const note = rows.find((row) => row.action === 'new');
    expect(note?.title).toBe('Three flats near the river');
    expect(note?.folder).toBe('Resources › Links');
    expect(rows.some((row) => row.name === 'rentals link.md')).toBe(false);
  });

  it('carries renamed, the change note and the reason it needs you', () => {
    expect(rows.find((row) => row.action === 'filed')).toMatchObject({
      oldName: 'scan_0412.pdf',
      changed: 'renamed',
    });
    expect(rows.find((row) => row.action === 'updated')?.changed).toBe(
      'Added the boiler date',
    );
    // A set-aside file with a destination is filed, never "Needs you" (#997).
    expect(
      rows.find((row) => row.action === 'filed' && row.name === 'IMG_1.heic'),
    ).toMatchObject({
      changed: 'Bower keeps it, not reads it.',
      folder: 'Projects › Flat hunt',
    });
    expect(rows.some((row) => row.action === 'needs')).toBe(false);
  });

  it('groups for the phone: Needs you, New notes, Updated, Filed', () => {
    expect(groupRows(rows).map((group) => group.heading)).toEqual([
      'New notes · 1',
      'Updated · 1',
      'Filed · 2',
    ]);
  });

  it('lists a Bower answer as Answered; the view titles it (#920)', () => {
    const answered = tableRows(
      {
        ...run,
        items: [],
        setAside: [],
        created: ['Answers/2026-09-29 Which flat first.md'],
        updated: [],
        left: [],
      },
      null,
    );
    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({
      action: 'answered',
      title: '2026-09-29 Which flat first',
    });
    expect(groupRows(answered).map((group) => group.heading)).toEqual([
      'Answered · 1',
    ]);
  });

  it('shows the New chip only on an unseen new note, never beside Filed', () => {
    const filed = rows.find((row) => row.action === 'filed');
    const note = rows.find((row) => row.action === 'new');
    if (filed === undefined || note === undefined) throw new Error('rows');
    const unseen = new Set(
      [filed.id, note.id].filter((id): id is string => id !== undefined),
    );
    expect(showsNewChip(filed, unseen)).toBe(false);
    expect(showsNewChip(note, unseen)).toBe(note.id !== undefined);
    expect(showsNewChip(note, new Set())).toBe(false);
  });

  it('reads the origin of a row and the You added cell', () => {
    const filed = rows.find((row) => row.action === 'filed');
    const note = rows.find((row) => row.action === 'new');
    if (filed === undefined || note === undefined) throw new Error('rows');
    expect(originLine(filed, undefined)).toBe('from scan_0412.pdf');
    expect(originLine(note, 'rentals.example/…/flats')).toBe(
      'from your clip (rentals.example)',
    );
    expect(youAdded(note, undefined)).toBe('—');
    expect(youAdded(filed, undefined)).toBe('scan_0412.pdf');
  });
});

describe('earlier tidy-ups (R-JUST-3)', () => {
  it('reads a partly done run with inline counts, in warn', () => {
    const line = runLine(buildRun('partial'), NOW);
    expect(line).toMatchObject({ label: 'Partly done', tone: 'warn' });
    expect(line.counts).toContain('new');
    expect(line.counts).toContain('still in your inbox');
  });

  it('reads a failed run in danger, saying once that nothing was lost (S-JF-6)', () => {
    const line = runLine(buildRun('failed'), NOW);
    expect(line).toMatchObject({ label: 'Did not finish', tone: 'danger' });
    expect(line.counts).toBe(NOTHING_LOST);
  });

  it('leads a Do-it-now run with its request, never "0 things"', () => {
    const line = runLine(
      {
        ...run,
        items: [{ path: '0-Inbox/Ask.md', kind: 'request' }],
        created: ['a/b.md'],
        updated: [],
        setAside: [],
      },
      NOW,
    );
    expect(line.label).toBe('Done');
    expect(line.counts).toBe('1 request');
  });
});

describe('?run= (R-JUST-5)', () => {
  const older: Run = { ...run, runId: 'run-b', requestedAt: '2026-09-28' };
  const failed = buildRun('failed', { runId: 'run-f' });

  it('opens the run the key names, failed ones too', () => {
    expect(runKey(older)).toBe('run-b');
    expect(pickRun('run-b', run, [run, older])).toBe(older);
    expect(pickRun('run-f', run, [run, failed])).toBe(failed);
  });

  it('falls back to the latest on an unknown or empty key, no error', () => {
    expect(pickRun('nope', run, [run, older])).toBe(run);
    expect(pickRun('', run, [run, older])).toBe(run);
    expect(pickRun(undefined, null, [older])).toBe(older);
  });
});

describe('the Activity fallback shows no raw Moved lines (R-JUST-1)', () => {
  it('drops Moved and Correction moves', () => {
    const old: Run = {
      state: 'done',
      requestedAt: '2026-09-28T17:40:00.000Z',
      finishedAt: '2026-09-28T17:45:00.000Z',
      processed: ['0-Inbox/a.pdf'],
    };
    const log = [
      '- 2026-09-28 17:44 · Moved: 3-Resources/Recipes/soup.md → 2-Areas/Home/soup.md',
      '- 2026-09-28 17:44 · Moved by you: 1-Projects/A/p.pdf → 4-Archives/A/p.pdf',
      '- 2026-09-28 17:44 · Correction: 1-Projects/A -> 2-Areas/B (2026-09-28)',
    ].join('\n');
    expect(parseLog(log)).toEqual([]);
    expect(JSON.stringify(fallbackLines(old, log, NOW))).not.toMatch(/Moved/);
  });
});
