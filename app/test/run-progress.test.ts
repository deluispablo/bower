import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  destinationOf,
  destinationsLabel,
  progressFor,
  runCounts,
  runRows,
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
});

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
      },
      {
        path: PHOTO,
        title: 'IMG_4471',
        tone: 'image',
        status: 'filed',
        destination: null,
      },
      {
        path: NOTES,
        title: 'Notes from the viewing',
        tone: 'note',
        status: 'reading',
        destination: null,
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
