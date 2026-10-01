// @vitest-environment jsdom

/**
 * T950-1 (#922): a folder never shows a guessed state while who wrote what
 * is still being read. `folderReads` names every note the screen states
 * something about; `useFolderKnown` says when they and the catalogue are
 * read, at once when this tab already read them.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { folderReads } from '../src/folder-view.js';
import type { NoteMeta } from '../src/note-meta.js';

const known = new Map<string, NoteMeta>();
const pending: (() => void)[] = [];

vi.mock('../src/note-meta.js', () => ({
  peekNoteMeta: (file: { id: string }) => known.get(file.id),
  loadNoteMeta: (file: { id: string }) =>
    new Promise<NoteMeta>((resolve) => {
      pending.push(() => {
        const meta = { bowerOrigins: {}, fields: {} } as unknown as NoteMeta;
        known.set(file.id, meta);
        resolve(meta);
      });
    }),
}));

const { useFolderKnown } = await import('../src/components/folder-summary.js');

function file(path: string, mimeType = 'text/markdown'): DriveFile {
  return {
    id: `id-${path}`,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType,
    parents: ['FOLDER_ID'],
    path,
    modifiedTime: '2026-09-30T06:54:00Z',
  };
}

let root: HTMLDivElement | undefined;

afterEach(() => {
  if (root !== undefined) {
    render(null, root);
    root.remove();
    root = undefined;
  }
  known.clear();
  pending.length = 0;
});

function Probe({ reads }: { reads: DriveFile[] }): h.JSX.Element {
  const ready = useFolderKnown(reads, undefined, () => Promise.resolve(''));
  return <p>{ready ? 'known' : 'reading'}</p>;
}

async function mount(reads: DriveFile[]): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = host;
  await act(() => {
    render(<Probe reads={reads} />, host);
  });
  return host;
}

describe('folderReads', () => {
  it('names the notes, the subfolder pages and, for a folder of folders, the card notes', () => {
    const note = file('1-Projects/Flat hunt/Inspection notes.md');
    const pdf = file('1-Projects/Flat hunt/Lease.pdf', 'application/pdf');
    const page = file('1-Projects/Flat hunt/Moonee Ponds/Moonee Ponds.md');
    const inside = file('1-Projects/Flat hunt/Moonee Ponds/Listing.md');
    const byPath = new Map(
      [note, pdf, page, inside].map((each) => [each.path, each]),
    );
    const folders = [{ path: '1-Projects/Flat hunt/Moonee Ponds' }];
    const contents = {
      path: '1-Projects/Flat hunt',
      notes: [note],
      subfolders: [{ path: '1-Projects/Flat hunt/Moonee Ponds' }],
    };
    expect(
      folderReads(contents, folders, byPath, false).map((f) => f.path),
    ).toEqual([note.path, page.path]);
    const all = folderReads(contents, folders, byPath, true).map((f) => f.path);
    expect(all).toContain(inside.path);
    expect(all).not.toContain(pdf.path);
  });
});

describe('useFolderKnown', () => {
  it('reads first, then says known', async () => {
    const host = await mount([
      file('1-Projects/A.md'),
      file('1-Projects/B.md'),
    ]);
    expect(host.textContent).toBe('reading');
    await act(async () => {
      for (const done of pending.splice(0)) done();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.textContent).toBe('known');
  });

  it('is known at once when this tab already read every note', async () => {
    const note = file('1-Projects/A.md');
    known.set(note.id, { bowerOrigins: {}, fields: {} } as unknown as NoteMeta);
    const host = await mount([note]);
    expect(host.textContent).toBe('known');
    expect(pending).toHaveLength(0);
  });
});
