// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FolderCard, folderCardMeta } from '../src/components/folder-card.js';
import type { FolderCardItem } from '../src/components/folder-card.js';

let host: HTMLElement;
const NOW = '2026-09-30T12:00:00';

const ITEMS: FolderCardItem[] = [
  {
    id: '1',
    title: 'Passport copy',
    name: 'Passport copy.pdf',
    mimeType: 'application/pdf',
  },
  {
    id: '2',
    title: 'Visa notes',
    name: 'Visa notes.md',
    mimeType: 'text/markdown',
  },
  { id: '3', title: 'Photo', name: 'Photo.jpg', mimeType: 'image/jpeg' },
  { id: '4', title: 'Fourth', name: 'Fourth.md', mimeType: 'text/markdown' },
];

const FOLDER = {
  path: '2-Areas/Visa & Immigration',
  name: 'Visa & Immigration',
  href: '/folder/2-Areas/Visa%20%26%20Immigration',
  things: 2,
  updated: '2026-09-30T09:00:00',
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  void act(() => {
    render(null, host);
  });
  host.remove();
});

describe('FolderCard (#908, R-FCARD-1, R-FCARD-2)', () => {
  it('shows the outline 40, name, count and updated, the new Badge and three items', () => {
    void act(() => {
      render(
        h(FolderCard, { folder: FOLDER, items: ITEMS, newCount: 1, now: NOW }),
        host,
      );
    });
    const card = host.querySelector('a.folder-card');
    expect(card?.getAttribute('href')).toBe(FOLDER.href);
    const icon = card?.querySelector(':scope > .file-icon');
    expect(icon?.getAttribute('data-mark')).toBe('outline');
    expect(icon?.getAttribute('data-root')).toBe('areas');
    expect(icon?.getAttribute('data-size')).toBe('40');
    expect(card?.querySelector('.folder-card-name')?.textContent).toBe(
      'Visa & Immigration',
    );
    const meta = card?.querySelector('.folder-card-meta');
    expect(meta?.textContent).toBe('2 things · updated today1 new');
    expect(meta?.querySelector('.badge-new')?.textContent).toBe('1 new');
    const items = [...(card?.querySelectorAll('.folder-card-item') ?? [])].map(
      (item) => item.textContent,
    );
    expect(items).toEqual([
      'Passport copy · PDF',
      'Visa notes · Note',
      'Photo · Photo',
    ]);
  });

  it('writes the meta line, and "Nothing here yet" when empty', () => {
    expect(folderCardMeta(1, undefined, NOW)).toBe('1 thing');
    expect(folderCardMeta(6, '2026-09-29T09:00:00', NOW)).toBe(
      '6 things · updated yesterday',
    );
    void act(() => {
      render(
        h(FolderCard, {
          folder: { ...FOLDER, things: 0 },
          items: [],
          now: NOW,
        }),
        host,
      );
    });
    expect(host.querySelector('.folder-card-meta')?.textContent).toBe(
      'Nothing here yet',
    );
    expect(host.querySelector('.badge')).toBeNull();
  });

  it('selects on click and opens on double click or Enter (desktop)', () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    void act(() => {
      render(
        h(FolderCard, {
          folder: FOLDER,
          items: [],
          now: NOW,
          selected: true,
          onSelect,
          onOpen,
        }),
        host,
      );
    });
    const card = host.querySelector<HTMLElement>('a.folder-card');
    expect(card?.classList.contains('is-selected')).toBe(true);
    void act(() => card?.click());
    expect(onSelect).toHaveBeenCalled();
    void act(() => {
      card?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      card?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
