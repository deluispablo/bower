// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PileSheet,
  addedFromElsewhere,
  inboxNameSet,
  isContextNoteName,
  kindOfName,
  pileDay,
  pileTime,
  pileTitle,
  rowState,
  splitPiles,
  thingsText,
  uploadingCount,
  type PileRow,
} from '../src/components/pile-sheet.js';
import { OverlayHost } from '../src/components/overlay.js';
import type { Pile } from '../src/pile-store.js';

function pile(
  id: string,
  closed: boolean,
  items: Pile['items'],
  createdAt = '2026-09-30T10:42:00',
): Pile {
  return { id, noteFileId: null, createdAt, text: '', items, closed };
}

describe('pile times and counts', () => {
  const now = new Date('2026-09-30T15:00:00');

  it('says "today" and the time for a pile started today (PILE-10)', () => {
    expect(pileDay('2026-09-30T10:42:00', now)).toBe('today');
    expect(pileTime('2026-09-30T10:42:00')).toBe('10:42');
    expect(pileTitle('2026-09-30T10:42:00', now)).toBe(
      'Pile from today, 10:42',
    );
  });

  it('says the day for an older pile', () => {
    expect(pileTitle('2026-09-12T08:05:00', now)).toBe(
      'Pile from 12 Sep, 08:05',
    );
  });

  it('says "thing" for one', () => {
    expect(thingsText(1)).toBe('1 thing');
    expect(thingsText(5)).toBe('5 things');
  });

  it('names a batch note and a pile note as context notes, not things', () => {
    expect(isContextNoteName('Bower - 2026-09-30 1042 Context.md')).toBe(true);
    expect(isContextNoteName('Bower - 2026-09-30 1042-07 Context 3f.md')).toBe(
      true,
    );
    expect(isContextNoteName('Bower - 2026-09-30 1042 Flat tour.md')).toBe(
      false,
    );
    expect(isContextNoteName('Lease.pdf')).toBe(false);
  });

  it('counts the inbox names at its top level only', () => {
    expect(
      inboxNameSet([
        { name: 'a.pdf', path: '0-Inbox/a.pdf' },
        { name: 'b.pdf', path: '0-Inbox/Quarantine/b.pdf' },
        { name: 'c.pdf', path: '1-Projects/c.pdf' },
      ]),
    ).toEqual(new Set(['a.pdf']));
  });
});

describe('splitPiles', () => {
  it('splits the open pile from the closed ones still in the inbox', () => {
    const open = pile('o', false, [{ name: 'new.pdf', state: 'done' }]);
    const waiting = pile('w', true, [{ name: 'a.pdf', state: 'done' }]);
    const moved = pile('m', true, [{ name: 'gone.pdf', state: 'done' }]);
    const result = splitPiles([waiting, moved, open], new Set(['a.pdf']));
    expect(result.open?.id).toBe('o');
    expect(result.waiting.map((p) => p.id)).toEqual(['w']);
  });

  it('keeps a closed pile with a file still uploading', () => {
    const closed = pile('w', true, [{ name: 'a.pdf', state: 'uploading' }]);
    expect(splitPiles([closed], new Set()).waiting).toHaveLength(1);
    expect(uploadingCount(closed)).toBe(1);
  });
});

describe('addedFromElsewhere', () => {
  it('lists the files no pile names', () => {
    const files = [{ name: 'a.pdf' }, { name: 'b.pdf' }, { name: 'c.pdf' }];
    expect(
      addedFromElsewhere(files, new Set(['a.pdf', 'c.pdf'])).map((f) => f.name),
    ).toEqual(['b.pdf']);
  });
});

describe('rowState', () => {
  const base = { online: true, offlineError: false, percent: 0 };

  it('reads the pile item, then the connection', () => {
    expect(rowState({ ...base, state: 'done' })).toBe('done');
    expect(rowState({ ...base, state: 'failed' })).toBe('failed');
    expect(rowState({ ...base, state: 'waiting' })).toBe('queued');
    expect(rowState({ ...base, state: 'uploading', percent: 64 })).toBe(
      'uploading',
    );
    expect(rowState({ ...base, state: 'uploading', online: false })).toBe(
      'offline',
    );
    expect(rowState({ ...base, state: 'waiting', offlineError: true })).toBe(
      'offline',
    );
  });

  it('knows a kind from a name alone', () => {
    expect(kindOfName('Lease.pdf')).toBe('pdf');
  });
});

describe('PileSheet', () => {
  let root: HTMLElement;
  const rows: PileRow[] = [
    {
      name: 'Offer A.pdf',
      label: 'Offer A.pdf',
      kind: 'pdf',
      state: 'done',
      percent: 100,
    },
  ];
  const waiting: Pile = {
    id: 'p1',
    noteFileId: 'NOTE',
    createdAt: '2026-09-30T10:42:00',
    text: 'Five job offers.',
    items: [{ name: 'Offer A.pdf', state: 'done' }],
    closed: true,
  };
  const handlers = {
    onText: vi.fn(),
    onAddFiles: vi.fn(),
    onRemoveItem: vi.fn(),
    onRetry: vi.fn(),
    onRemovePile: vi.fn(() => Promise.resolve(true)),
    onClose: vi.fn(),
  };

  function show(running = false): void {
    void act(() => {
      render(
        h('div', {}, [
          h(OverlayHost, {}),
          h(PileSheet, {
            pile: waiting,
            rows,
            running,
            now: new Date('2026-09-30T15:00:00'),
            ...handlers,
          }),
        ]),
        root,
      );
    });
  }

  function button(text: string): HTMLButtonElement {
    const found = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === text,
    );
    if (found === undefined) throw new Error(`Button "${text}" missing`);
    return found;
  }

  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
  });

  afterEach(() => {
    void act(() => {
      render(null, root);
    });
    root.remove();
    vi.clearAllMocks();
  });

  it('opens with the pile title, its count, its note and its files', () => {
    show();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Pile from today, 10:42');
    expect(text).toContain('1 thing · waiting for the next tidy-up');
    expect(
      document.body.querySelector<HTMLTextAreaElement>('textarea')?.value,
    ).toBe('Five job offers.');
    expect(text).toContain('Offer A.pdf');
    expect(text).toContain('Add more to this pile');
  });

  it('asks once before removing, and Keep leaves the pile alone', () => {
    show();
    void act(() => button('Remove this pile from the inbox').click());
    expect(document.body.textContent).toContain(
      'Remove this pile? Its 1 file goes to the Bin in Drive.',
    );
    void act(() => button('Keep').click());
    expect(handlers.onRemovePile).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      'Remove this pile from the inbox',
    );
  });

  it('Remove sends the pile to the Bin and closes the sheet', async () => {
    show();
    void act(() => button('Remove this pile from the inbox').click());
    await act(async () => {
      button('Remove').click();
      await Promise.resolve();
    });
    expect(handlers.onRemovePile).toHaveBeenCalledOnce();
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it('says so and stays open when some files could not be removed', async () => {
    handlers.onRemovePile.mockImplementationOnce(() => Promise.resolve(false));
    show();
    void act(() => button('Remove this pile from the inbox').click());
    await act(async () => {
      button('Remove').click();
      await Promise.resolve();
    });
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      'Could not remove everything. Try again.',
    );
  });

  it('cannot remove the pile while a tidy-up is running (R-PILE-10)', () => {
    show(true);
    expect(button('Remove this pile from the inbox').disabled).toBe(true);
  });
});
