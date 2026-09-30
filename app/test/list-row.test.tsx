// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GridTile } from '../src/components/folder-grid.js';
import { ListRow } from '../src/components/list-row.js';
import type { ListRowItem } from '../src/components/list-row.js';
import { metaLine } from '../src/meta-line.js';

vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({ index: null, getNoteText: () => Promise.resolve('') }),
}));

let host: HTMLElement;

const PDF: ListRowItem = {
  id: 'a',
  title: 'Passport copy',
  name: 'Passport copy.pdf',
  mimeType: 'application/pdf',
  path: '2-Areas/Visa/Passport copy.pdf',
  href: '/file/a',
};
const NOTE: ListRowItem = {
  id: 'b',
  title: 'CV Australia',
  name: 'CV Australia.md',
  mimeType: 'text/markdown',
  bowerWritten: true,
  path: '1-Projects/Jobs/CV Australia.md',
  href: '/note/b',
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

function key(target: Element | null, name: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  void act(() => {
    target?.dispatchEvent(event);
  });
  return event;
}

describe('ListRow (#908, R-ROW-1 to R-ROW-4)', () => {
  it('has one anatomy: 32 px box with FileIcon 20, title, meta, trailing date', () => {
    void act(() => {
      render(
        h(ListRow, {
          item: PDF,
          meta: metaLine(PDF, { view: 'row', now: '2026-09-30T10:00:00' }),
          trailing: h('time', null, '29 Sep'),
        }),
        host,
      );
    });
    const row = host.querySelector('a.list-row');
    expect(row?.getAttribute('href')).toBe('/file/a');
    const icon = row?.querySelector('.file-icon');
    expect(icon?.classList.contains('file-icon-box')).toBe(true);
    expect(icon?.getAttribute('data-size')).toBe('20');
    expect(row?.querySelector('.list-row-title')?.textContent).toBe(
      'Passport copy',
    );
    expect(row?.querySelector('.list-row-meta')?.textContent).toBe('PDF');
    expect(row?.querySelector('.list-row-trailing')?.textContent).toBe(
      '29 Sep',
    );
    // Kinds are words; no kind badge (R-FILEICON-2).
    expect(row?.querySelector('.kind-badge')).toBeNull();
    // The row is named by its title and described by its meta.
    const name = row?.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(name)?.textContent).toBe('Passport copy');
  });

  it('shows a mixed list\'s "where" after a root dot', () => {
    void act(() => {
      render(
        h(ListRow, {
          item: PDF,
          meta: 'PDF',
          where: { name: 'Visa & Immigration', root: 'areas' },
        }),
        host,
      );
    });
    const meta = host.querySelector('.list-row-meta');
    expect(meta?.textContent).toBe('PDF · Visa & Immigration');
    expect(
      meta?.querySelector('.list-row-dot')?.getAttribute('data-root'),
    ).toBe('areas');
  });

  it('selects on click and focus, opens on double click and Enter; hover never selects', () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    void act(() => {
      render(
        h(ListRow, { item: NOTE, meta: 'Bower note', onSelect, onOpen }),
        host,
      );
    });
    const row = host.querySelector<HTMLAnchorElement>('a.list-row');
    void act(() => {
      row?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      row?.dispatchEvent(new PointerEvent('pointerenter'));
    });
    expect(onSelect).not.toHaveBeenCalled();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    void act(() => {
      row?.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    void act(() => {
      row?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(key(row, 'Enter').defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('follows its link on a click without a selection (the phone)', () => {
    void act(() => {
      render(h(ListRow, { item: NOTE, meta: 'Bower note' }), host);
    });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    host.querySelector('a.list-row')?.addEventListener('click', (event) => {
      // jsdom does not navigate; only check the row left the link alone.
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
    });
    void act(() => {
      host.querySelector('a.list-row')?.dispatchEvent(click);
    });
  });

  it('moves the focus, and so the selection, with the arrow keys', () => {
    const selected: string[] = [];
    void act(() => {
      render(
        h(
          'ul',
          null,
          [PDF, NOTE].map((item) =>
            h(
              'li',
              { key: item.id },
              h(ListRow, {
                item,
                meta: '',
                onSelect: () => selected.push(item.id),
              }),
            ),
          ),
        ),
        host,
      );
    });
    const rows = host.querySelectorAll<HTMLElement>('.list-row');
    rows[0]?.focus();
    expect(key(rows[0] ?? null, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(rows[1]);
    key(rows[1] ?? null, 'ArrowUp');
    expect(document.activeElement).toBe(rows[0]);
    expect(selected).toEqual(['a', 'b', 'a']);
  });

  it('keeps the focus ring for the keyboard only (G-4)', () => {
    void act(() => {
      render(h(ListRow, { item: NOTE, onSelect: () => undefined }), host);
    });
    const row = host.querySelector<HTMLElement>('.list-row');
    void act(() => {
      row?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(row?.dataset.pointer).toBe('true');
    key(row, 'ArrowDown');
    expect(row?.dataset.pointer).toBeUndefined();
  });

  it('marks the selected row (K-19)', () => {
    void act(() => {
      render(h(ListRow, { item: NOTE, selected: true }), host);
    });
    const row = host.querySelector('.list-row');
    expect(row?.classList.contains('is-selected')).toBe(true);
    expect(row?.getAttribute('aria-current')).toBe('true');
  });
});

describe('GridTile (#908, R-TILE-1, R-TILE-2)', () => {
  it('shows the kind line, the title and the date, and nothing else', () => {
    void act(() => {
      render(h(GridTile, { item: NOTE, date: '29 Sep' }), host);
    });
    const tile = host.querySelector('a.grid-tile');
    expect(tile?.querySelector('.grid-tile-kind-word')?.textContent).toBe(
      'Bower note',
    );
    expect(
      tile
        ?.querySelector('.grid-tile-kind .file-icon')
        ?.getAttribute('data-size'),
    ).toBe('16');
    expect(tile?.querySelector('.grid-tile-title')?.textContent).toBe(
      'CV Australia',
    );
    expect(tile?.querySelector('.grid-tile-date')?.textContent).toBe('29 Sep');
    expect(tile?.querySelector('.kind-badge, .thumb, .note-lines')).toBeNull();
  });

  it('selects on click and opens on Enter', () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    void act(() => {
      render(
        h(GridTile, { item: NOTE, date: '', onSelect, onOpen, selected: true }),
        host,
      );
    });
    const tile = host.querySelector<HTMLElement>('a.grid-tile');
    expect(tile?.classList.contains('is-selected')).toBe(true);
    void act(() => {
      tile?.click();
    });
    expect(onSelect).toHaveBeenCalled();
    key(tile, 'Enter');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
