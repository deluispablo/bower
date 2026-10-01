// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubMatchMedia } from './helpers/match-media.js';

import type { CompareNote } from '../src/compare.js';
import { historyDate } from '../src/history.js';

const drive = vi.hoisted(() => ({
  getText: vi.fn<(id: string) => Promise<string>>(),
  saveNoteText: vi.fn(),
}));
const noteMeta = vi.hoisted(() => ({ recordNoteMeta: vi.fn() }));
const vault = vi.hoisted(() => ({
  saveEditedNote: vi.fn(),
  getNoteText: vi.fn<(id: string) => Promise<string>>(),
  index: { byPath: new Map<string, { id: string }>() },
}));
const cache = vi.hoisted(() => ({
  loadViewSettings: vi.fn(),
  saveViewSettings: vi.fn(),
}));

vi.mock('../src/drive.js', () => drive);
vi.mock('../src/cache.js', () => cache);
vi.mock('../src/note-meta.js', () => ({
  loadNoteMeta: vi.fn(),
  recordNoteMeta: noteMeta.recordNoteMeta,
}));
// The vault store's own save path (which refreshes the index) is faked over
// the mocked Drive write, so the test sees what Compare hands to it.
vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({
    saveEditedNote: vault.saveEditedNote,
    getNoteText: vault.getNoteText,
    index: vault.index,
  }),
}));

vault.saveEditedNote.mockImplementation(
  async (
    id: string,
    text: string,
    options: { baseModifiedTime: string | null },
  ): Promise<{ text: string; modifiedTime: string | null }> => {
    const saved = (await drive.saveNoteText({ id }, text, options)) as {
      file: { modifiedTime?: string };
    };
    return { text, modifiedTime: saved.file.modifiedTime ?? null };
  },
);

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
    rooms: '2 bed',
    highlight: 'garden',
    available: '2026-11-15',
    fit: 81,
    status: 'to view',
    viewing: '2026-11-14',
  }),
  note('Arlington Road, 2 bed', {
    rent: 2150,
    rooms: '2 bed',
    highlight: '2nd floor',
    available: '2026-11-01',
    fit: 72,
    status: 'to view',
  }),
  note(
    'Camden Mews, 1 bed',
    {
      rent: 1850,
      rooms: '1 bed',
      highlight: 'ground',
      available: 'Now',
      fit: 64,
      status: 'declined',
    },
    { fit: 'you' },
  ),
];

const FOLDER = '1-Projects/Flat hunt';
const HUB = `---\ntags: [project, hub]\nstatuses: [new, to view, viewed, not for me]\n---\n# Flat hunt\n`;

let root: HTMLElement;

function setDesktop(desktop: boolean): void {
  stubMatchMedia((query) => desktop && query.includes('900px'));
}

async function mount(): Promise<void> {
  await act(() => {
    render(h(CompareView, { notes, folderPath: FOLDER }), root);
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
  vault.index = {
    byPath: new Map([[`${FOLDER}/Flat hunt.md`, { id: 'id-hub' }]]),
  };
  vault.getNoteText.mockResolvedValue(HUB);
});

afterEach(() => {
  render(null, root);
  root.remove();
  vi.clearAllMocks();
});

describe('Compare on a phone (PF-Compare-375, PF-Sort-375)', () => {
  beforeEach(() => {
    setDesktop(false);
  });

  const titles = (): string[] =>
    [...root.querySelectorAll('.compare-card-title')].map(
      (el) => el.textContent ?? '',
    );

  it('shows one card per flat, best fit first, with its facts and status', async () => {
    await mount();
    expect(titles()).toEqual([
      'Kentish Town, 2 bed',
      'Arlington Road, 2 bed',
      'Camden Mews, 1 bed',
    ]);
    const first = root.querySelector('.compare-card');
    expect(first?.querySelector('.compare-score')?.textContent).toBe('81/100');
    expect(first?.querySelector('.compare-card-facts')?.textContent).toBe(
      '£2,400 · 2 bed · from 15 Nov',
    );
    expect(first?.querySelector('.status-select-date')?.textContent).toBe(
      'Viewing Sat 14 Nov',
    );
    expect(root.textContent).not.toContain('Copy as table');
    expect(root.textContent).not.toContain('Best so far');
  });

  it('offers the statuses from the hub note, capitalised, plus an older value', async () => {
    await mount();
    const select = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Status of Kentish Town, 2 bed"]',
    );
    expect(Array.from(select?.options ?? [], (o) => o.text)).toEqual([
      'New',
      'To view',
      'Viewed',
      'Not for me',
    ]);
    const camden = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Status of Camden Mews, 1 bed"]',
    );
    expect(Array.from(camden?.options ?? [], (o) => o.text)).toContain(
      'Declined',
    );
  });

  it("uses the kind's statuses when the folder has no hub note", async () => {
    vault.index = { byPath: new Map() };
    await mount();
    const select = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Status of Kentish Town, 2 bed"]',
    );
    expect(Array.from(select?.options ?? [], (o) => o.value)).toEqual([
      'new',
      'to view',
      'viewed',
      'applied',
      'rejected',
    ]);
  });

  it('starts with the quick filter off and hides the undated flats when on', async () => {
    await mount();
    const filter = chip('Free before 15 Nov');
    expect(filter?.getAttribute('aria-pressed')).toBe('false');
    click(filter);
    expect(titles()).toEqual(['Kentish Town, 2 bed', 'Arlington Road, 2 bed']);
    expect(
      root.querySelector('.compare-chip[aria-pressed="true"]')?.textContent,
    ).toBe('Free before 15 Nov · 1 hidden without a date');
  });

  it('names the sort on its chip and sorts from the Sort by sheet', async () => {
    await mount();
    const button = root.querySelector('.compare-sort-btn');
    expect(button?.textContent).toBe('Fit, high first');
    click(button);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('h2')?.textContent).toBe('Sort by');
    expect(
      [
        ...(dialog?.querySelectorAll('.compare-sheet-list [role="radio"]') ??
          []),
      ].map((el) => el.textContent),
    ).toEqual([
      'Fit',
      'Rent a month',
      'Available',
      'Against the area',
      'Status',
      'Name',
    ]);
    const rent = [
      ...(dialog?.querySelectorAll('.compare-sheet-list [role="radio"]') ?? []),
    ].find((el) => el.textContent === 'Rent a month');
    click(rent);
    const low = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (el) => el.textContent === 'Low first',
    );
    click(low);
    // A draft until Show (T-23): the cards keep their order meanwhile.
    expect(titles()[0]).not.toBe('Camden Mews, 1 bed');
    const show = [...(dialog?.querySelectorAll('button') ?? [])].find((el) =>
      el.textContent?.startsWith('Show '),
    );
    expect(show?.textContent).toBe('Show 3 flats');
    click(show);
    expect(titles()[0]).toBe('Camden Mews, 1 bed');
    expect(root.querySelector('.compare-sort-btn')?.textContent).toBe(
      'Rent a month, low first',
    );
    await vi.waitFor(() => {
      expect(cache.saveViewSettings).toHaveBeenCalled();
    });
    const saved = cache.saveViewSettings.mock.calls.at(-1) as [
      string,
      { compareSort: unknown },
    ];
    expect(saved[0]).toBe(FOLDER);
    expect(saved[1].compareSort).toEqual({ column: 'rent', direction: 'asc' });
  });

  it('starts from the sort remembered for the folder', async () => {
    cache.loadViewSettings.mockResolvedValue({
      sort: 'name',
      kindFilter: null,
      originFilter: null,
      layout: 'list',
      compareSort: { column: 'rent', direction: 'desc' },
    });
    await mount();
    expect(titles()[0]).toBe('Kentish Town, 2 bed');
    expect(root.querySelector('.compare-sort-btn')?.textContent).toBe(
      'Rent a month, high first',
    );
  });
});

describe('Compare on a desktop (PF-Compare-1280, PF-Sort-1280)', () => {
  beforeEach(() => {
    setDesktop(true);
  });

  const headers = (): string[] =>
    [...root.querySelectorAll('th[scope="col"]')].map(
      (th) => th.textContent ?? '',
    );
  const firstColumn = (): string[] =>
    [...root.querySelectorAll('tbody th')].map((th) => th.textContent ?? '');

  it('shows the six default columns, sorted by fit with a teal header', async () => {
    await mount();
    expect(headers()).toEqual([
      'Flat',
      'Rent',
      'Available',
      'Against the area',
      'Fit',
      'Status',
    ]);
    const fit = [...root.querySelectorAll('th[scope="col"]')].find(
      (th) => th.textContent === 'Fit',
    );
    expect(fit?.getAttribute('aria-sort')).toBe('descending');
    expect(fit?.classList.contains('compare-th-on')).toBe(true);
    expect(firstColumn()[0]).toBe('Kentish Town, 2 bed');
    expect(root.textContent).not.toContain('Copy as table');
  });

  it('sorts by rent when its header is clicked, then flips', async () => {
    await mount();
    const rent = (): HTMLElement | null =>
      [...root.querySelectorAll<HTMLElement>('th[scope="col"]')].find(
        (th) => th.textContent === 'Rent',
      ) ?? null;
    click(rent()?.querySelector('button'));
    expect(rent()?.getAttribute('aria-sort')).toBe('ascending');
    expect(firstColumn()[0]).toBe('Camden Mews, 1 bed');
    click(rent()?.querySelector('button'));
    expect(rent()?.getAttribute('aria-sort')).toBe('descending');
    expect(firstColumn()[0]).toBe('Kentish Town, 2 bed');
  });

  it('picks columns in the Columns popover and remembers them', async () => {
    await mount();
    click(chip('Columns'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(
      dialog?.querySelector('[aria-label="Close Columns"]'),
    ).not.toBeNull();
    const labels = [...(dialog?.querySelectorAll('label') ?? [])];
    expect(labels.map((el) => el.textContent)).toEqual([
      'Rent a month',
      'Rooms',
      'Available',
      'Against the area',
      'Bike to the office',
      'Fit',
      'Status',
    ]);
    click(labels[1]?.querySelector('input'));
    expect(headers()).toContain('Rooms');
    await vi.waitFor(() => {
      expect(cache.saveViewSettings).toHaveBeenCalled();
    });
    const saved = cache.saveViewSettings.mock.calls.at(-1) as [
      string,
      { compareVisible: string[] },
    ];
    expect(saved[1].compareVisible).toContain('rooms');
  });

  it('starts from the columns remembered for the folder', async () => {
    cache.loadViewSettings.mockResolvedValue({
      sort: 'name',
      kindFilter: null,
      originFilter: null,
      layout: 'list',
      compareVisible: ['fit'],
    });
    await mount();
    expect(headers()).toEqual(['Flat', 'Fit']);
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
      '---\nkind: rental-listing\nstatus: viewed\n---\nBody\n\n## History\n\n- ' +
        `${historyDate(new Date())} · Status to view → viewed, by you
`,
    );
    expect(args[2].baseModifiedTime).toBe('2026-09-28T08:00:00Z');
    // Saved through the vault store (index refresh) and written through to
    // the note-meta cache at the new modifiedTime, so coming back to the
    // folder shows the new status.
    expect(vault.saveEditedNote).toHaveBeenCalledTimes(1);
    expect(noteMeta.recordNoteMeta).toHaveBeenCalledWith(
      'id-Arlington Road, 2 bed',
      '2026-09-28T09:00:00Z',
      '---\nkind: rental-listing\nstatus: viewed\n---\nBody\n\n## History\n\n- ' +
        `${historyDate(new Date())} · Status to view → viewed, by you
`,
    );
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

describe('Compare for receipts and bookings', () => {
  function mountKind(items: CompareNote[]): Promise<void> {
    return act(() => {
      render(h(CompareView, { notes: items, folderPath: 'Receipts' }), root);
    });
  }
  const of = (
    kind: string,
    name: string,
    fields: Record<string, unknown>,
  ): CompareNote => ({ ...note(name, fields), kind });

  beforeEach(() => {
    setDesktop(false);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds receipts up by month with the year so far', async () => {
    await mountKind([
      of('receipt', 'A', { shop: 'Bakery', date: '2026-09-21', total: 7.5 }),
      of('receipt', 'B', {
        shop: 'Corner Shop',
        date: '2026-08-03',
        total: 12,
      }),
      of('receipt', 'C', { shop: 'Hardware', date: '2026-08-20', total: 40 }),
    ]);
    expect(root.querySelector('.compare-explainer')?.textContent).toBe(
      'You saved three receipts here. Bower read the total, the shop and the date from each one, so they add up by month.',
    );
    const heads = [...root.querySelectorAll('.compare-month-head')].map(
      (el) => el.textContent,
    );
    expect(heads).toEqual(['September 2026£7.50', 'August 2026£52']);
    expect(root.querySelectorAll('.compare-receipt')).toHaveLength(3);
    expect(root.querySelector('.compare-year')?.textContent).toBe(
      '2026 so far£59.50',
    );
  });

  it('lists bookings on a timeline and fades the past ones', async () => {
    await mountKind([
      of('booking', 'Hotel', {
        what: 'Hotel',
        when: '2026-11-14T15:00',
        where: 'Lisbon',
        reference: 'H123',
      }),
      of('booking', 'Train', { what: 'Train', when: '2026-09-01T08:30' }),
    ]);
    const steps = [...root.querySelectorAll('.compare-step')];
    expect(
      steps.map((s) => s.querySelector('.compare-step-what')?.textContent),
    ).toEqual(['Train', 'Hotel']);
    expect(steps[0]?.classList.contains('compare-step-past')).toBe(true);
    expect(steps[1]?.classList.contains('compare-step-past')).toBe(false);
    expect(steps[1]?.textContent).toContain('14 Nov, 15:00');
    expect(steps[1]?.textContent).toContain('Lisbon');
    expect(steps[1]?.textContent).toContain('Ref H123');
  });
});

describe('Compare job offers: Made for it and Apply in Columns (#795)', () => {
  const offers: CompareNote[] = [
    {
      id: 'id-Northwind',
      name: 'Northwind.md',
      modifiedTime: '2026-09-28T08:00:00Z',
      kind: 'job-offer',
      fields: {
        salary: 72000,
        fit: 79,
        status: 'new',
        apply_link: 'https://jobs.example.com/apply',
      },
      bowerOrigins: {},
      madeFor: ['CV · Northwind', 'Letter · Northwind'],
    },
    {
      id: 'id-Fabrikam',
      name: 'Fabrikam.md',
      modifiedTime: '2026-09-28T08:00:00Z',
      kind: 'job-offer',
      fields: { salary: 65000, fit: 91, status: 'applied' },
      bowerOrigins: {},
    },
  ];

  beforeEach(() => {
    setDesktop(true);
  });

  async function mountOffers(): Promise<void> {
    await act(() => {
      render(
        h(CompareView, { notes: offers, folderPath: '1-Projects/Jobs' }),
        root,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  const headers = (): string[] =>
    [...root.querySelectorAll('th[scope="col"]')].map(
      (th) => th.textContent ?? '',
    );

  it('shows exactly the six default columns, no quick filter', async () => {
    await mountOffers();
    expect(headers()).toEqual([
      'Offer',
      'Salary',
      'Where',
      'Holiday',
      'Fit',
      'Status',
    ]);
    expect(root.querySelectorAll('.compare-chip[aria-pressed]')).toHaveLength(
      0,
    );
  });

  it('offers Made for it and Apply in Columns, off by default', async () => {
    cache.loadViewSettings.mockResolvedValue({
      sort: 'name',
      kindFilter: null,
      originFilter: null,
      layout: 'list',
      compareVisible: ['fit', 'made_for', 'apply_link'],
    });
    await mountOffers();
    expect(headers()).toEqual(['Offer', 'Fit', 'Made for it', 'Apply']);
    const link = root.querySelector<HTMLAnchorElement>(
      'a[aria-label="Apply to Northwind"]',
    );
    expect(link?.href).toBe('https://jobs.example.com/apply');
    expect(root.textContent).toContain('CV · Letter');
  });
});
