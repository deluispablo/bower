import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { pinnedRows } from '../src/components/explorer.js';
import { openPathsFor } from '../src/components/tree.js';

function note(path: string): DriveFile {
  return {
    id: path,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType: 'text/markdown',
    path,
  } as DriveFile;
}

describe('openPathsFor (#920 DA-8)', () => {
  it('opens an open folder itself, not only its ancestors', () => {
    expect(openPathsFor('1-Projects/Flat hunt', undefined)).toEqual([
      '1-Projects',
      '1-Projects/Flat hunt',
    ]);
  });

  it('opens a note or file’s folders only', () => {
    expect(openPathsFor('1-Projects/Flat hunt/Lease.md', 'id-1')).toEqual([
      '1-Projects',
      '1-Projects/Flat hunt',
    ]);
  });

  it('opens nothing without a target', () => {
    expect(openPathsFor(undefined, undefined)).toEqual([]);
  });
});

describe('pinnedRows (#920 DA-9)', () => {
  it('lists a pinned hub note as its folder', () => {
    const hub = note('1-Projects/Flat hunt/Flat hunt.md');
    expect(
      pinnedRows([{ kind: 'note', file: hub, pinnedAt: '2026-09-29' }]),
    ).toEqual([
      {
        kind: 'folder',
        path: '1-Projects/Flat hunt',
        file: hub,
        pinnedAt: '2026-09-29',
      },
    ]);
  });

  it('keeps any other note a note, and a folder pinned twice once', () => {
    const plain = note('1-Projects/Flat hunt/Lease.md');
    const hub = note('1-Projects/Flat hunt/Flat hunt.md');
    const rows = pinnedRows([
      {
        kind: 'folder',
        path: '1-Projects/Flat hunt',
        file: hub,
        pinnedAt: 'b',
      },
      { kind: 'note', file: hub, pinnedAt: 'a' },
      { kind: 'note', file: plain, pinnedAt: 'c' },
    ]);
    expect(rows.map((row) => row.kind)).toEqual(['folder', 'note']);
  });
});
