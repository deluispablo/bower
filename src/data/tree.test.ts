import { describe, expect, it } from 'vitest';
import {
  buildTree,
  countFiles,
  findNode,
  moveEntry,
  renameEntry,
  sortNodes,
  visibleRows,
  type Entries,
  type Entry,
} from './tree';
import { BowerError } from './types';

function make(paths: string[]): Entries {
  const m: Entries = new Map();
  paths.forEach((p, i) => {
    const folder = p.endsWith('/');
    const path = folder ? p.slice(0, -1) : p;
    const parts = path.split('/');
    for (let k = 1; k < parts.length; k++) {
      const f = parts.slice(0, k).join('/');
      if (!m.has(f)) m.set(f, { path: f, type: 'folder', modified: 0, created: 0 });
    }
    const e: Entry = { path, type: folder ? 'folder' : 'file', modified: i, created: i };
    m.set(path, e);
  });
  return m;
}

describe('the folder tree', () => {
  const base = ['Inbox/', 'Projects/Flat hunt/A.md', 'Projects/Flat hunt/Lease.pdf', 'Areas/Home/', 'Archive/'];

  it('keeps the main folders in their own order', () => {
    const t = buildTree(make(base));
    expect(t.map((n) => n.name)).toEqual(['Inbox', 'Projects', 'Areas', 'Archive']);
  });

  it('moves a file and its new path is returned', () => {
    const m = make(base);
    expect(moveEntry(m, 'Projects/Flat hunt/Lease.pdf', 'Areas/Home', 1)).toBe('Areas/Home/Lease.pdf');
    expect(m.has('Projects/Flat hunt/Lease.pdf')).toBe(false);
  });

  it('moves a folder with everything in it', () => {
    const m = make(base);
    moveEntry(m, 'Projects/Flat hunt', 'Archive', 1);
    expect(m.has('Archive/Flat hunt/A.md')).toBe(true);
    expect(m.has('Archive/Flat hunt/Lease.pdf')).toBe(true);
  });

  it('never puts a folder inside itself', () => {
    const m = make([...base, 'Projects/Flat hunt/Photos/']);
    expect(() => moveEntry(m, 'Projects/Flat hunt', 'Projects/Flat hunt/Photos', 1)).toThrow(BowerError);
  });

  it('gives a moved file a free name when the folder has one already', () => {
    const m = make([...base, 'Areas/Home/Lease.pdf']);
    expect(moveEntry(m, 'Projects/Flat hunt/Lease.pdf', 'Areas/Home', 1)).toBe('Areas/Home/Lease (2).pdf');
  });

  it('keeps the extension on rename and refuses a taken name', () => {
    const m = make(base);
    expect(renameEntry(m, 'Projects/Flat hunt/Lease.pdf', 'Lease 2026', 1)).toBe('Projects/Flat hunt/Lease 2026.pdf');
    const n = make([...base, 'Projects/Flat hunt/B.md']);
    expect(() => renameEntry(n, 'Projects/Flat hunt/B.md', 'A', 1)).toThrow(/already/);
  });

  it('keeps a note a note when its new name has a dot', () => {
    const m = make(base);
    expect(renameEntry(m, 'Projects/Flat hunt/A.md', 'Plan v1.2', 1)).toBe('Projects/Flat hunt/Plan v1.2.md');
  });

  it('sorts folders first, then files in the chosen order', () => {
    const m = make(['Projects/b.md', 'Projects/a.md', 'Projects/Z/']);
    const p = findNode(buildTree(m), 'Projects');
    expect(sortNodes(p?.children ?? [], 'name-za').map((n) => n.name)).toEqual(['Z', 'b.md', 'a.md']);
    expect(sortNodes(p?.children ?? [], 'modified-new').map((n) => n.name)).toEqual(['Z', 'a.md', 'b.md']);
  });

  it('shows only the rows of open folders and counts files', () => {
    const t = buildTree(make(base));
    const rows = visibleRows(t, new Set(['Projects']), 'name-az');
    expect(rows.map((r) => `${r.level}:${r.node.name}`)).toEqual(['0:Inbox', '0:Projects', '1:Flat hunt', '0:Areas', '0:Archive']);
    expect(countFiles(t[1] as NonNullable<(typeof t)[1]>)).toBe(2);
  });
});

describe('names', () => {
  it('refuses names starting with a dot and clashes that differ only in case', () => {
    const m = make(['X/A.md', 'X/B.md']);
    expect(() => renameEntry(m, 'X/A.md', '..', 1)).toThrow(/dot/);
    expect(() => renameEntry(m, 'X/A.md', 'b', 1)).toThrow(/already/);
    expect(renameEntry(m, 'X/A.md', 'a', 1)).toBe('X/a.md');
  });
});
