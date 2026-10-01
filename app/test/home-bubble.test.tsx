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
          : file.id === 'answer'
            ? { type: 'answer', fields: {}, bowerOrigins: {}, not_stated: [] }
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
      {
        id: 'answer',
        name: '2026-09-27 Which flat first.md',
        mimeType: 'text/markdown',
        path: 'Answers/2026-09-27 Which flat first.md',
        parents: [],
        modifiedTime: '2026-09-27T08:00:00Z',
      },
    ];
    root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(
        h(RecentRows, {
          notes,
          titles: new Map(),
          now: Date.parse('2026-09-27T10:00:00Z'),
        }),
        root,
      );
    });
    // Let the note's frontmatter resolve.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    const [flat, plain, answer] = Array.from(root.querySelectorAll('li'));
    // #920: Bower's answer says so, never "Note · Answers".
    expect(answer?.querySelector('.list-row-meta')?.textContent).toBe(
      'Bower answer · Answers',
    );
    // R-HM-4: the kind and the parent after its root dot; no facts, no
    // MD/FILE badge, no full path.
    expect(flat?.querySelector('.list-row-meta')?.textContent).toBe(
      'Bower note · Flat hunt',
    );
    expect(
      flat?.querySelector('.list-row-dot')?.getAttribute('data-root'),
    ).toBe('projects');
    expect(flat?.textContent).not.toContain('£2,150');
    expect(flat?.textContent).not.toContain('Projects / Flat hunt');
    expect(root.querySelector('.kind-badge')).toBeNull();
    expect(plain?.querySelector('.list-row-meta')?.textContent).toBe('Note');
    // Today's change reads the time, never "today".
    expect(flat?.querySelector('time')?.textContent).toMatch(/^\d\d:\d\d$/);
  });
});
