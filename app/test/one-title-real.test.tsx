// @vitest-environment jsdom

/**
 * One title per file on every view after a real run (#922, R-API-7): the
 * hook every list, grid and tree uses writes into the one shared entry,
 * Search titles a hit from the same cached text, and a completed run
 * forgets them all together before they resolve again.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';

const MODIFIED = '2026-09-30T06:54:00Z';
const cached = new Map<string, { text: string; modifiedTime: string }>();

vi.mock('../src/cache.js', () => ({
  loadNote: (id: string) => Promise.resolve(cached.get(id)),
}));

const { useNoteTitles } = await import('../src/components/use-note-titles.js');
const { forgetTitles, sharedTitleOf } = await import('../src/note-titles.js');
const { buildSearchIndex, searchVault } = await import(
  '../src/search-index.js'
);

const note: DriveFile = {
  id: 'note-1',
  name: 'moonee-ponds-10-43.md',
  mimeType: 'text/markdown',
  parents: ['FOLDER_ID'],
  path: '1-Projects/Flat hunt/moonee-ponds-10-43.md',
  modifiedTime: MODIFIED,
};
const TEXT = '---\ntitle: 10-43 Buckley St\n---\nTwo bedrooms.\n';

let root: HTMLDivElement | undefined;

afterEach(() => {
  if (root !== undefined) {
    render(null, root);
    root.remove();
    root = undefined;
  }
  forgetTitles();
  cached.clear();
});

function Titles({ files }: { files: DriveFile[] }): h.JSX.Element {
  const titles = useNoteTitles(files);
  return <p>{files.map((file) => titles.get(file.id)).join('|')}</p>;
}

async function settle(): Promise<void> {
  for (let at = 0; at < 4; at += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('one title per file on real data', () => {
  it('lists, Search and the shared entry agree, and a run forgets them together', async () => {
    cached.set(note.id, { text: TEXT, modifiedTime: MODIFIED });
    const files = [note];
    root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(<Titles files={files} />, root as HTMLDivElement);
    });
    await settle();
    expect(root.textContent).toBe('10-43 Buckley St');
    expect(sharedTitleOf(note)).toBe('10-43 Buckley St');

    // Search titles its hit from the same cached text.
    const vault = buildVaultIndex([note]);
    const handle = buildSearchIndex(vault, new Map([[note.id, TEXT]]));
    const hits = searchVault(handle, vault, 'Buckley');
    expect(hits.notes[0]?.title).toBe('10-43 Buckley St');
    // …and says where it lives (R-API-15): its root and parent folder.
    expect(hits.notes[0]?.root).toBe('projects');
    expect(hits.notes[0]?.parent).toBe('Flat hunt');

    // The run rewrote the note: once forgotten, the view resolves again
    // from the cache, never keeping the old title.
    cached.set(note.id, {
      text: '---\ntitle: Buckley St, Moonee Ponds\n---\n',
      modifiedTime: MODIFIED,
    });
    await act(() => {
      forgetTitles();
    });
    await settle();
    expect(root.textContent).toBe('Buckley St, Moonee Ponds');
    expect(sharedTitleOf(note)).toBe('Buckley St, Moonee Ponds');
  });
});
