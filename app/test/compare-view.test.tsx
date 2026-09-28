// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompareNote } from '../src/compare.js';

const drive = vi.hoisted(() => ({
  getText: vi.fn<(id: string) => Promise<string>>(),
  saveNoteText: vi.fn(),
}));
const cache = vi.hoisted(() => ({
  loadViewSettings: vi.fn(),
  saveViewSettings: vi.fn(),
}));

vi.mock('../src/drive.js', () => drive);
vi.mock('../src/cache.js', () => cache);
vi.mock('../src/note-meta.js', () => ({ loadNoteMeta: vi.fn() }));

const { CompareView } = await import('../src/components/compare.js');

function note(
  name: string,
  fields: Record<string, unknown>,
  bowerOrigins: CompareNote['bowerOrigins'] = {},
): CompareNote {
  return {
    id: `id-${name}`,
    name: `${name}.md`,
    modifiedTime: '2026-09-28T08:00:00Z',
    kind: 'rental-listing',
    fields,
    bowerOrigins,
  };
}

const notes = [
  note('Kentish Town, 2 bed', {
    rent: 2400,
    rooms: '2 bed, garden',
    available: '2026-11-15',
    fit: 81,
    status: 'to view',
    viewing: '2026-11-14',
  }),
  note('Arlington Road, 2 bed', {
    rent: 2150,
    rooms: '2 bed, 2nd floor',
    available: '2026-11-01',
    fit: 72,
    status: 'to view',
  }),
  note(
    'Camden Mews, 1 bed',
    { rent: 1850, rooms: '1 bed, ground', available: 'Now', fit: 64 },
    { fit: 'you' },
  ),
];

let root: HTMLElement;

function setDesktop(desktop: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: desktop && query.includes('900px'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

async function mount(): Promise<void> {
  await act(() => {
    render(h(CompareView, { notes, folderPath: '1-Projects/Flat hunt' }), root);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function click(el: Element | null | undefined): void {
  if (el === null || el === undefined) throw new Error('missing element');
  void act(() => {
    (el as HTMLElement).click();
  });
}

function chip(label: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('.compare-chip')].find(
    (el) => el.textContent === label,
  );
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  cache.loadViewSettings.mockResolvedValue(undefined);
  cache.saveViewSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  render(null, root);
  root.remove();
  vi.clearAllMocks();
});

describe('Compare on a phone', () => {
  beforeEach(() => {
    setDesktop(false);
  });

  it('shows cards, best fit first, with three facts and the status', async () => {
    await mount();
    const cards = [...root.querySelectorAll('.compare-card')];
    expect(
      cards.map((c) => c.querySelector('.compare-card-title')?.textContent),
    ).toEqual([
      'Kentish Town, 2 bed',
      'Arlington Road, 2 bed',
      'Camden Mews, 1 bed',
    ]);
    expect(cards[0]?.querySelector('.compare-fit')?.textContent).toBe('Fit 81');
    expect(cards[0]?.textContent).toContain('£2,400');
    expect(cards[0]?.textContent).toContain('Viewing Sat');
    expect(root.querySelector('.compare-explainer')?.textContent).toContain(
      'You saved three rental listings here.',
    );
  });

  it('fades the cards a filter chip excludes and says which', async () => {
    await mount();
    click(chip('Under £2,300'));
    const faded = root.querySelectorAll('.compare-card-faded');
    expect(faded).toHaveLength(1);
    expect(faded[0]?.textContent).toContain('Kentish Town');
    expect(root.querySelector('.compare-foot')?.textContent).toBe(
      'Kentish Town is over £2,300, shown faded. Bower read these details from each rental listing.',
    );
  });
});

describe('Compare on a desktop', () => {
  beforeEach(() => {
    setDesktop(true);
  });

  const headers = (): string[] =>
    [...root.querySelectorAll('th[scope="col"]')].map((th) =>
      (th.querySelector('.compare-th-sort')?.textContent ?? '')
        .replace(/[▴▾]/g, '')
        .trim(),
    );
  const firstColumn = (): string[] =>
    [...root.querySelectorAll('tbody th')].map((th) => th.textContent ?? '');

  it('shows a table with the kind columns, fit sorted, and aria-sort', async () => {
    await mount();
    expect(headers()).toEqual([
      'Listing',
      'Rent a month',
      'Rooms',
      'Available',
      'Against the area',
      'Bike to the office',
      'Fit',
      'Status',
    ]);
    expect(firstColumn()[0]).toBe('Kentish Town, 2 bed');
    expect(
      root.querySelector('th[aria-sort="descending"]')?.textContent,
    ).toContain('Fit');
  });

  it('sorts by rent when the header is clicked', async () => {
    await mount();
    click(
      [...root.querySelectorAll<HTMLElement>('.compare-th-sort')].find((el) =>
        el.textContent?.startsWith('Rent'),
      ),
    );
    expect(firstColumn()).toEqual([
      'Camden Mews, 1 bed',
      'Arlington Road, 2 bed',
      'Kentish Town, 2 bed',
    ]);
  });

  it('hides filtered rows and counts them', async () => {
    await mount();
    click(chip('Under £2,300'));
    expect(firstColumn()).toHaveLength(2);
    expect(root.querySelector('.compare-hidden')?.textContent).toBe(
      '1 hidden by the filter',
    );
  });

  it('moves a column from its header menu and remembers the order', async () => {
    await mount();
    click(root.querySelector('button[aria-label="Move Fit"]'));
    click(
      [...root.querySelectorAll<HTMLElement>('.compare-menu button')].find(
        (el) => el.textContent === 'Move left',
      ),
    );
    expect(headers().slice(5, 8)).toEqual([
      'Fit',
      'Bike to the office',
      'Status',
    ]);
    await vi.waitFor(() => {
      expect(cache.saveViewSettings).toHaveBeenCalledTimes(1);
    });
    const [path, saved] = cache.saveViewSettings.mock.calls[0] as [
      string,
      { compareColumns: string[] },
    ];
    expect(path).toBe('1-Projects/Flat hunt');
    expect(saved.compareColumns.slice(0, 2)).toEqual(['title', 'rent']);
  });

  it('starts from the order remembered for the folder', async () => {
    cache.loadViewSettings.mockResolvedValue({
      sort: 'name',
      kindFilter: null,
      originFilter: null,
      layout: 'list',
      compareColumns: ['fit', 'rent'],
    });
    await mount();
    expect(headers().slice(0, 3)).toEqual(['Listing', 'Fit', 'Rent a month']);
  });

  it('writes a changed status into the note', async () => {
    drive.getText.mockResolvedValue(
      '---\nkind: rental-listing\nstatus: to view\n---\nBody\n',
    );
    drive.saveNoteText.mockResolvedValue({
      text: '',
      file: { id: 'id', name: 'n.md', modifiedTime: '2026-09-28T09:00:00Z' },
    });
    await mount();
    const select = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Status of Arlington Road, 2 bed"]',
    );
    if (select === null) throw new Error('no status select');
    await act(async () => {
      select.value = 'viewed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(drive.saveNoteText).toHaveBeenCalledTimes(1);
    const args = drive.saveNoteText.mock.calls[0] as [
      { id: string },
      string,
      { baseModifiedTime: string },
    ];
    expect(args[0].id).toBe('id-Arlington Road, 2 bed');
    expect(args[1]).toBe(
      '---\nkind: rental-listing\nstatus: viewed\n---\nBody\n',
    );
    expect(args[2].baseModifiedTime).toBe('2026-09-28T08:00:00Z');
  });

  it('puts the status back and says so when the save fails', async () => {
    drive.getText.mockResolvedValue('---\nstatus: to view\n---\n');
    drive.saveNoteText.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await mount();
    const select = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Status of Arlington Road, 2 bed"]',
    );
    if (select === null) throw new Error('no status select');
    await act(async () => {
      select.value = 'viewed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(select.value).toBe('to view');
  });
});
