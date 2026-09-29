// @vitest-environment jsdom

/**
 * Smoke tests for Home's Pinned section (issue #216, the PR's own
 * `app/test/home.test.tsx`): hidden while empty, tiles rendered from a
 * fixture with two pins, Edit shows unpin buttons. `PinnedSection`
 * (`components/pinned-section.tsx`) is exercised directly, with a plain
 * fixture and stub callbacks, rather than the whole `Home` route — `Home`
 * itself needs a session, a vault, a run and a tour provider just to
 * render, which would make this a lot more expensive for no more coverage
 * of the Pinned section itself (CLAUDE.md: "UI smoke only when cheap").
 *
 * Named after the component, not `home.test.tsx`: sharing a basename with
 * the existing `home.test.ts` (pure `home.ts` logic) confuses `tsc`'s
 * project-service file matching under ESLint's `typescript-eslint` — a
 * brand new file at that exact path fails to parse ("was not found by the
 * project service") the moment a same-named `.ts` sibling already exists.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PinnedSection } from '../src/components/pinned-section.js';
import type { DriveFile } from '../src/drive.js';
import type {
  PinnedFile,
  PinnedFolder,
  PinnedNote,
} from '../src/vault-store.js';

function noteFile(id: string, name: string, path: string): DriveFile {
  return {
    id,
    name,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path,
  };
}

function folderFile(id: string, path: string): DriveFile {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return {
    id,
    name: `_${name}.md`,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path: `${path}/_${name}.md`,
  };
}

const PINNED_NOTE: PinnedNote = {
  kind: 'note',
  file: noteFile('note-1', 'Shopping list.md', '2-Areas/Home/Shopping list.md'),
  pinnedAt: '2026-01-02T00:00:00.000Z',
};

const PINNED_FOLDER: PinnedFolder = {
  kind: 'folder',
  path: '1-Projects/Flat hunt',
  file: folderFile('folder-note-1', '1-Projects/Flat hunt'),
  pinnedAt: '2026-01-01T00:00:00.000Z',
};

let root: HTMLDivElement;

function mount(
  items: (PinnedNote | PinnedFolder | PinnedFile)[],
  overrides: {
    onUnpinNote?: (id: string) => Promise<void>;
    onUnpinFolder?: (path: string) => Promise<void>;
    onUnpinFile?: (id: string) => Promise<void>;
    runUnpin?: (unpin: () => Promise<void>) => Promise<boolean>;
  } = {},
): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(
      h(PinnedSection, {
        items,
        noteCounts: new Map([['1-Projects/Flat hunt', 12]]),
        onUnpinNote: overrides.onUnpinNote ?? vi.fn(() => Promise.resolve()),
        onUnpinFolder:
          overrides.onUnpinFolder ?? vi.fn(() => Promise.resolve()),
        onUnpinFile: overrides.onUnpinFile ?? vi.fn(() => Promise.resolve()),
        runUnpin:
          overrides.runUnpin ??
          (async (unpin) => {
            await unpin();
            return true;
          }),
      }),
      root,
    );
  });
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
});

describe('PinnedSection', () => {
  it('renders nothing when there is nothing pinned', () => {
    mount([]);
    expect(root.textContent).toBe('');
    expect(root.querySelector('.home-pinned')).toBeNull();
  });

  it('renders a tile per pinned item, newest first as given, with a folder or note count', () => {
    mount([PINNED_FOLDER, PINNED_NOTE]);
    const names = Array.from(
      root.querySelectorAll('.home-pinned-tile-name'),
    ).map((el) => el.textContent);
    expect(names).toEqual(['Flat hunt', 'Shopping list']);
    expect(root.textContent).toContain('12 notes');
  });

  it('shows a pinned file as a tile with its title that opens /file/:id', () => {
    const pdf: PinnedFile = {
      kind: 'file',
      file: {
        id: 'pdf-1',
        name: 'Lease agreement 2026.pdf',
        mimeType: 'application/pdf',
        parents: ['P'],
        path: '2-Areas/Home/Lease agreement 2026.pdf',
      },
      pinnedAt: '2026-01-02T00:00:00.000Z',
    };
    mount([pdf]);
    const tile = root.querySelector('a.home-pinned-tile');
    expect(tile?.getAttribute('href')).toBe('/file/pdf-1');
    expect(tile?.textContent).toContain('Lease agreement 2026');
    expect(tile?.querySelector('.kind-badge')).not.toBeNull();
  });

  it("has no Edit toggle's unpin buttons until Edit is pressed", () => {
    mount([PINNED_NOTE]);
    expect(root.querySelector('.home-pinned-unpin')).toBeNull();
    expect(root.querySelector('a.home-pinned-tile')).not.toBeNull();
  });

  it('Edit turns tiles into rows with an unpin button; Done turns them back', () => {
    mount([PINNED_NOTE, PINNED_FOLDER]);
    const edit = root.querySelector('.home-pinned-edit');
    if (edit === null) throw new Error('Edit button missing');
    void act(() => {
      edit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(root.querySelectorAll('.home-pinned-unpin')).toHaveLength(2);
    expect(root.querySelector('a.home-pinned-tile')).toBeNull();
    expect(edit.textContent).toBe('Done');

    void act(() => {
      edit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(root.querySelector('.home-pinned-unpin')).toBeNull();
  });

  it('unpinning a note in Edit mode calls onUnpinNote with its id', async () => {
    const onUnpinNote = vi.fn(() => Promise.resolve());
    mount([PINNED_NOTE], { onUnpinNote });
    const edit = root.querySelector('.home-pinned-edit');
    void act(() => {
      edit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const unpin = root.querySelector('.home-pinned-unpin');
    if (unpin === null) throw new Error('unpin button missing');
    await act(async () => {
      unpin.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onUnpinNote).toHaveBeenCalledWith('note-1');
  });

  it('shows "All pinned" and caps at 8 tiles past the limit', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...PINNED_NOTE,
      file: noteFile(`note-${i}`, `Note ${i}.md`, `Note ${i}.md`),
    }));
    mount(many);
    expect(root.querySelector('.home-pinned-all')).not.toBeNull();
    expect(root.querySelectorAll('.home-pinned-tile')).toHaveLength(8);
  });

  it('leaves "All pinned" out at exactly 8', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      ...PINNED_NOTE,
      file: noteFile(`note-${i}`, `Note ${i}.md`, `Note ${i}.md`),
    }));
    mount(eight);
    expect(root.querySelector('.home-pinned-all')).toBeNull();
  });
});
