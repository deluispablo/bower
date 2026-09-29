// @vitest-environment jsdom

/**
 * The bubble's Tidy up / Try again links (#420): the button's click event
 * must never reach `onTidyUp`/`onFailure`. Before the fix, `onClick` was
 * wired straight to the handler, so the PointerEvent landed in `tidyUp`'s
 * optional `count` parameter and the confirmation sheet read
 * "[object PointerEvent] things are waiting".
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import type { NoteMeta } from '../src/note-meta.js';
import type { VaultIndex } from '../src/vault-index.js';
import { BubbleText, RecentRows } from '../src/routes/home.js';

const FLAT_META: NoteMeta = {
  kind: 'rental-listing',
  fields: { rent: 2150, rooms: '2 bed', bike: '14 min' },
  bowerOrigins: {},
  not_stated: [],
  original: '[[Arlington Road, 2 bed.pdf]]',
};

vi.mock('../src/note-meta.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/note-meta.js')>();
  return {
    ...actual,
    loadNoteMeta: (file: { id: string }): Promise<NoteMeta> =>
      Promise.resolve(
        file.id === 'flat'
          ? FLAT_META
          : { fields: {}, bowerOrigins: {}, not_stated: [] },
      ),
  };
});

let root: HTMLDivElement;

afterEach(() => {
  render(null, root);
  root.remove();
});

async function mount(
  onTidyUp: () => void,
  onFailure: () => void,
): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(
      h(BubbleText, {
        parts: [
          '3 things in your inbox. ',
          { link: 'tidy-up', text: 'Tidy up' },
          ' when you have added everything.',
        ],
        onTidyUp,
        onFailure,
      }),
      root,
    );
  });
}

describe('BubbleText', () => {
  it('calls onTidyUp with no arguments when the link is clicked', async () => {
    const onTidyUp = vi.fn();
    const onFailure = vi.fn();
    await mount(onTidyUp, onFailure);

    const link = root.querySelector('.home-bubble-link') as HTMLButtonElement;
    expect(link.textContent).toBe('Tidy up');
    await act(() => {
      link.click();
    });

    expect(onTidyUp).toHaveBeenCalledTimes(1);
    expect(onTidyUp.mock.calls[0]).toEqual([]);
  });

  it('links See where they went to Just filed (#617)', async () => {
    root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(
        h(BubbleText, {
          parts: [
            'All tidy. 5 filed. ',
            { link: 'just-filed', text: 'See where they went' },
            '.',
          ],
          onTidyUp: vi.fn(),
          onFailure: vi.fn(),
        }),
        root,
      );
    });
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/just-filed');
  });
});

describe('RecentRows (#617)', () => {
  it('shows the badge, New, the Bower tag and the key facts of a note Bower made', async () => {
    const notes: DriveFile[] = [
      {
        id: 'flat',
        name: 'Arlington Road, 2 bed.md',
        mimeType: 'text/markdown',
        path: '1-Projects/Flat hunt/Arlington Road, 2 bed.md',
        parents: [],
        modifiedTime: '2026-09-27T09:42:00Z',
      },
      {
        id: 'plain',
        name: 'Shopping.md',
        mimeType: 'text/markdown',
        path: 'Shopping.md',
        parents: [],
        modifiedTime: '2026-09-27T09:00:00Z',
      },
    ];
    root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(
        h(RecentRows, {
          notes,
          titles: new Map(),
          isNew: (id: string) => id === 'flat',
          now: Date.parse('2026-09-27T10:00:00Z'),
        }),
        root,
      );
    });
    // Let the note's frontmatter resolve.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    const [flat, plain] = Array.from(root.querySelectorAll('li'));
    expect(flat?.querySelector('.kind-badge')?.textContent).toBe('PDF');
    expect(flat?.querySelector('.new-tag')?.textContent).toBe('New');
    expect(flat?.querySelector('.bower-tag')).not.toBeNull();
    expect(flat?.querySelector('.home-note-facts')?.textContent).toContain(
      '£2,150',
    );
    expect(plain?.querySelector('.new-tag')).toBeNull();
    expect(plain?.querySelector('.bower-tag')).toBeNull();
    expect(plain?.querySelector('.home-note-facts')).toBeNull();
    // #683: no numeric folder prefix on the location line.
    expect(flat?.querySelector('.home-note-meta')?.textContent).toBe(
      'Projects / Flat hunt',
    );
  });

  it('marks a note New when its original file is New (#685)', async () => {
    const note: DriveFile = {
      id: 'flat',
      name: 'Arlington Road, 2 bed.md',
      mimeType: 'text/markdown',
      path: '1-Projects/Flat hunt/Arlington Road, 2 bed.md',
      parents: [],
      modifiedTime: '2026-09-27T09:42:00Z',
    };
    const pdf: DriveFile = {
      id: 'pdf-id',
      name: 'Arlington Road, 2 bed.pdf',
      mimeType: 'application/pdf',
      path: '1-Projects/Flat hunt/Arlington Road, 2 bed.pdf',
      parents: [],
    };
    const index = {
      byPath: new Map([[pdf.path, pdf]]),
      files: [pdf],
    } as unknown as VaultIndex;
    root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(
        h(RecentRows, {
          notes: [note],
          titles: new Map(),
          isNew: (id: string) => id === 'pdf-id',
          now: Date.parse('2026-09-27T10:00:00Z'),
          index,
        }),
        root,
      );
    });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    expect(root.querySelector('.new-tag')?.textContent).toBe('New');
  });
});
