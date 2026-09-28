import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import { kindById } from '../src/kinds.js';
import type { RunItem } from '../src/api.js';
import type { DriveFile } from '../src/drive.js';
import {
  destinationOf,
  destinationsLabel,
  isContextNote,
  progressFor,
  readingLine,
  readLabels,
  runCounts,
  runRows,
  visiblePendingCount,
  waitingPaths,
} from '../src/run-progress.js';
import type { RunRow } from '../src/run-progress.js';

describe('progressFor', () => {
  it('present: both counts known', () => {
    expect(progressFor({ processed: 2, total: 3 })).toEqual({
      filed: 2,
      total: 3,
      ratio: 2 / 3,
    });
  });

  it('absent: either count missing is indeterminate', () => {
    expect(progressFor({})).toBeNull();
    expect(progressFor({ processed: 2 })).toBeNull();
    expect(progressFor({ total: 3 })).toBeNull();
  });

  it('a non-positive total is indeterminate', () => {
    expect(progressFor({ processed: 0, total: 0 })).toBeNull();
    expect(progressFor({ processed: 0, total: -1 })).toBeNull();
  });

  it('over 100%: ratio clamps to 1', () => {
    expect(progressFor({ processed: 5, total: 3 })).toEqual({
      filed: 5,
      total: 3,
      ratio: 1,
    });
  });
});

function file(path: string, mimeType = 'text/markdown'): DriveFile {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return { id: path, name, mimeType, parents: [], path };
}

const LEASE = '0-Inbox/Lease agreement 2026.pdf';
const PHOTO = '0-Inbox/IMG_4471.jpg';
const NOTES = 'Clippings/Notes from the viewing.md';

/** The listing as a run begins: three things waiting, and things that are not. */
const BEFORE: DriveFile[] = [
  file('0-Inbox', FOLDER_MIME),
  file('0-Inbox/_Inbox.md'),
  file(LEASE, 'application/pdf'),
  file(PHOTO, 'image/jpeg'),
  file(NOTES),
  file('0-Inbox/Processed/Old request.md'),
  file('1-Projects/Flat hunt/Flat hunt.md'),
];

describe('waitingPaths', () => {
  it('lists what the Inbox card counts, sorted', () => {
    expect(waitingPaths(BEFORE)).toEqual([PHOTO, LEASE, NOTES]);
  });

  it('is empty for an empty listing', () => {
    expect(waitingPaths([])).toEqual([]);
  });
});

describe('visiblePendingCount (#506)', () => {
  it('agrees with waitingPaths when there is no context note', () => {
    expect(visiblePendingCount(BEFORE)).toBe(3);
  });

  it('leaves the context note out, unlike waitingPaths on its own', () => {
    const withContext: DriveFile[] = [
      ...BEFORE,
      file('0-Inbox/Bower - 2026-09-27 0815 Context.md'),
    ];
    // The raw inbox listing has four things now; what a person should be
    // told is being tidied — the same total the working sheet's own
    // count agrees on — is still three.
    expect(waitingPaths(withContext)).toHaveLength(4);
    expect(visiblePendingCount(withContext)).toBe(3);
  });
});

describe('runCounts', () => {
  it('filed against everything the run started with', () => {
    expect(runCounts([LEASE, PHOTO], waitingPaths(BEFORE))).toEqual({
      processed: 2,
      total: 3,
    });
  });

  it('counts a filed item the listing did not have', () => {
    expect(runCounts(['0-Inbox/Late.pdf'], [LEASE])).toEqual({
      processed: 1,
      total: 2,
    });
  });

  it('reports nothing while the run does not report what it filed', () => {
    expect(runCounts(undefined, waitingPaths(BEFORE))).toEqual({});
    expect(progressFor(runCounts(undefined, [LEASE]))).toBeNull();
  });

  it('the "What is this?" context note counts toward neither (#446)', () => {
    const context = '0-Inbox/Bower - 2026-09-27 0815 Context.md';
    expect(runCounts([LEASE, context], [LEASE, context])).toEqual({
      processed: 1,
      total: 1,
    });
  });
});

describe('isContextNote', () => {
  it('matches Add\'s "What is this?" note by its fixed title', () => {
    expect(isContextNote('0-Inbox/Bower - 2026-09-27 0815 Context.md')).toBe(
      true,
    );
  });

  it('is false for a real request or a plain file, even titled similarly', () => {
    expect(
      isContextNote('0-Inbox/Bower - 2026-09-27 0815 Compare the two flats.md'),
    ).toBe(false);
    expect(isContextNote('0-Inbox/Context.md')).toBe(false);
  });
});

const BLANK: Omit<
  RunRow,
  'path' | 'title' | 'tone' | 'status' | 'destination'
> = {
  para: null,
  folderPath: null,
  read: null,
  readLabels: [],
  was: null,
  keptNote: null,
};

describe('runRows', () => {
  const waiting = waitingPaths(BEFORE);

  it('while running: the filed items, then the one being read', () => {
    const rows = runRows({
      processed: [LEASE, PHOTO],
      waiting,
      files: BEFORE,
      active: true,
    });
    expect(rows).toEqual([
      {
        path: LEASE,
        title: 'Lease agreement 2026',
        tone: 'pdf',
        status: 'filed',
        destination: null,
        ...BLANK,
      },
      {
        path: PHOTO,
        title: 'IMG_4471',
        tone: 'image',
        status: 'filed',
        destination: null,
        ...BLANK,
      },
      {
        path: NOTES,
        title: 'Notes from the viewing',
        tone: 'note',
        status: 'reading',
        destination: null,
        ...BLANK,
      },
    ]);
  });

  it('once the listing shows where things went, rows name the folder', () => {
    const after = [
      file('1-Projects/Flat hunt/Lease agreement 2026.pdf', 'application/pdf'),
      file('1-Projects/Flat hunt/IMG_4471.jpg', 'image/jpeg'),
      file('0-Inbox/Processed/Notes from the viewing.md'),
    ];
    const rows = runRows({
      processed: [LEASE, PHOTO, NOTES],
      waiting,
      files: after,
      active: false,
    });
    expect(rows.map((row) => [row.title, row.destination])).toEqual([
      ['Lease agreement 2026', 'Flat hunt'],
      ['IMG_4471', 'Flat hunt'],
      ['Notes from the viewing', null],
    ]);
    expect(destinationsLabel(rows)).toBe('Flat hunt');
  });

  it('a request shows its words, not its date and time', () => {
    const request = '0-Inbox/Bower - 2026-09-27 0815 Compare the two flats.md';
    const rows = runRows({
      processed: [request],
      waiting: [request],
      files: [],
      active: false,
    });
    expect(rows[0]?.title).toBe('Compare the two flats');
    expect(rows[0]?.tone).toBe('note');
  });

  it('a filed link shows its host, not its generated file name (#557)', () => {
    const link = '0-Inbox/Link - example.org 2026-09-28 1414.md';
    const rows = runRows({
      processed: [link],
      waiting: [link],
      files: [],
      active: false,
    });
    expect(rows[0]?.title).toBe('example.org');
  });

  it('no row for the "What is this?" context note, filed or being read (#446)', () => {
    const context = '0-Inbox/Bower - 2026-09-27 0815 Context.md';
    const withContext = runRows({
      processed: [context, LEASE],
      waiting: [context, ...waiting],
      files: BEFORE,
      active: true,
    });
    expect(withContext.map((row) => row.path)).not.toContain(context);

    const onlyContextLeft = runRows({
      processed: [],
      waiting: [context],
      files: BEFORE,
      active: true,
    });
    expect(onlyContextLeft).toEqual([]);
  });

  it('no rows while the run does not report what it filed', () => {
    expect(
      runRows({ processed: undefined, waiting, files: BEFORE, active: true }),
    ).toEqual([]);
  });

  it('no reading row once everything is filed, or once the run stopped', () => {
    expect(
      runRows({ processed: waiting, waiting, files: BEFORE, active: true }).map(
        (row) => row.status,
      ),
    ).toEqual(['filed', 'filed', 'filed']);
    expect(
      runRows({ processed: [], waiting, files: BEFORE, active: false }),
    ).toEqual([]);
  });
});

describe('destinationOf', () => {
  it('the folder of the same name outside the inbox', () => {
    expect(
      destinationOf(LEASE, [
        file(LEASE),
        file('2-Areas/Finance/Lease agreement 2026.pdf'),
      ]),
    ).toBe('Finance');
  });

  it('null when only the inbox, a Processed folder or the top has it', () => {
    expect(destinationOf(LEASE, [file(LEASE)])).toBeNull();
    expect(
      destinationOf(LEASE, [
        file('0-Inbox/Processed/Lease agreement 2026.pdf'),
      ]),
    ).toBeNull();
    expect(destinationOf(LEASE, [file('Lease agreement 2026.pdf')])).toBeNull();
  });
});

describe('destinationsLabel', () => {
  it('each folder once, at most three, null when none is known', () => {
    const row = (destination: string | null): RunRow => ({
      path: String(destination),
      title: 't',
      tone: 'file',
      status: 'filed',
      destination,
      ...BLANK,
    });
    expect(destinationsLabel([])).toBeNull();
    expect(destinationsLabel([row(null)])).toBeNull();
    expect(
      destinationsLabel(
        ['Flat hunt', 'Finance', 'Flat hunt', 'Answers', 'Garden'].map(row),
      ),
    ).toBe('Flat hunt · Finance · Answers');
  });
});

describe('runRows: where it went, what Bower read (board Flow-04-Working)', () => {
  const to = (name: string): string => `1-Projects/Flat hunt/${name}`;
  const items: RunItem[] = [
    {
      path: '0-Inbox/Arlington Road flat.pdf',
      kind: 'file',
      to: to('Arlington Road, 2 bed.pdf'),
      renamedFrom: 'Arlington Road flat.pdf',
    },
    { path: '0-Inbox/Notes.md', kind: 'file', to: to('Notes.md') },
    {
      path: '0-Inbox/IMG_4471.jpg',
      kind: 'file',
      to: to('Arlington Road, window sign.jpg'),
      renamedFrom: 'IMG_4471.jpg',
    },
  ];
  const processed = items.map((item) => item.path);
  const rows = runRows({
    processed,
    waiting: [...processed, '0-Inbox/Kentish Town photos.pdf'],
    files: [],
    active: true,
    items,
    companionLabels: new Map([
      [to('Arlington Road, 2 bed.pdf'), readLabels(kindById('rental-listing'))],
    ]),
  });

  it('a row shows the new title, the mark and the folder path', () => {
    expect(rows[0]).toMatchObject({
      title: 'Arlington Road, 2 bed',
      para: 'projects',
      folderPath: 'Projects › Flat hunt',
      destination: 'Flat hunt',
    });
  });

  it('"read: ..." carries the first three key-fact labels, lower-case', () => {
    expect(rows[0]).toMatchObject({ read: 'facts' });
    expect(rows[0]?.readLabels).toEqual(readLabels(kindById('rental-listing')));
    expect(rows[0]?.readLabels).toHaveLength(3);
    const joined = rows[0]?.readLabels.join(',') ?? '';
    expect(joined).toBe(joined.toLowerCase());
  });

  it('a note is plain "read"; a photo with no note says nothing of reading', () => {
    expect(rows[1]).toMatchObject({ read: 'plain', was: null });
    expect(rows[2]).toMatchObject({ read: null });
  });

  it('a renamed item says what it was called', () => {
    expect(rows[0]?.was).toBe('Arlington Road flat.pdf');
    expect(rows[2]?.was).toBe('IMG_4471.jpg');
  });

  it('the item in progress says Reading…, a link Reading the page…', () => {
    expect(rows[3]).toMatchObject({ status: 'reading', read: null });
    expect(readingLine('0-Inbox/Kentish Town photos.pdf')).toBe('Reading…');
  });

  it('kept-not-read and over-limit items say so on their row', () => {
    const set = runRows({
      processed: ['0-Inbox/Walk-through.mp4'],
      waiting: [],
      files: [],
      active: false,
      items: [
        {
          path: '0-Inbox/Walk-through.mp4',
          kind: 'file',
          to: '1-Projects/Flat hunt/Walk-through.mp4',
        },
      ],
      setAside: [
        { path: '0-Inbox/Walk-through.mp4', reason: 'kept-not-read' },
        { path: '0-Inbox/Big scan.pdf', reason: 'too-large' },
        { path: '0-Inbox/Odd.docx', reason: 'quarantined' },
      ],
    });
    expect(set.map((row) => [row.title, row.keptNote, row.read])).toEqual([
      ['Walk-through', "Kept, not read: Bower can't watch videos", null],
      ['Big scan', 'Kept, not read: over 50 MB', null],
    ]);
  });
});
