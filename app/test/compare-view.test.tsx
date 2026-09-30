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
const vault = vi.hoisted(() => ({ saveEditedNote: vi.fn() }));
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
  useVault: () => ({ saveEditedNote: vault.saveEditedNote }),
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
    },
    { fit: 'you' },
  ),
];

let root: HTMLElement;

function setDesktop(desktop: boolean): void {
  stubMatchMedia((query) => desktop && query.includes('900px'));
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
    const pill = cards[0]?.querySelector('.compare-fit');
    expect(pill?.textContent).toBe('81/100');
    expect(pill?.getAttribute('aria-label')).toBe('Your score 81 of 100');
    expect(cards[0]?.textContent).toContain('£2,400');
    expect(cards[0]?.textContent).toContain('Viewing Sat');
    expect(root.querySelector('.compare-explainer')?.textContent).toContain(
      'You saved three rental listings here.',
    );
  });

  it('opens with the first filter on: the faded card and the line under the cards', async () => {
    await mount();
    expect(chip('Under £2,300')?.getAttribute('aria-pressed')).toBe('true');
    const faded = root.querySelectorAll('.compare-card-faded');
    expect(faded).toHaveLength(1);
    expect(faded[0]?.textContent).toContain('Kentish Town');
    expect(root.querySelector('.compare-foot')?.textContent).toBe(
      'Kentish Town is over £2,300, shown faded. Bower read these details from each rental listing.',
    );
  });

  it('turns the filter off when its chip is pressed', async () => {
    await mount();
    click(chip('Under £2,300'));
    expect(root.querySelectorAll('.compare-card-faded')).toHaveLength(0);
    expect(root.querySelector('.compare-foot')?.textContent).toBe(
      'Bower read these details from each rental listing.',
    );
  });

  it('offers one filter chip and no "Default order" chip', async () => {
    await mount();
    expect(
      [...root.querySelectorAll('.compare-chip')].map((el) => el.textContent),
    ).toEqual(['Under £2,300']);
  });

  const sortButton = (): HTMLElement | null =>
    root.querySelector('.compare-sort-btn');
  const titles = (): (string | null | undefined)[] =>
    [...root.querySelectorAll('.compare-card')].map(
      (c) => c.querySelector('.compare-card-title')?.textContent,
    );
  const radio = (label: string): HTMLElement | undefined =>
    [
      ...document.body.querySelectorAll<HTMLElement>(
        '.compare-sort [role=radio]',
      ),
    ].find((el) => el.textContent?.startsWith(label));

  it('names the sort on the button and opens the Sort sheet on Overlay', async () => {
    await mount();
    expect(sortButton()?.textContent).toBe('Sort: Fit, high first');
    click(sortButton());
    const dialog = document.body.querySelector('.overlay [role=dialog]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.querySelector('h2')?.textContent).toBe('Sort listings by');
    expect(dialog?.querySelector('[aria-label="Order"]')?.textContent).toBe(
      'High firstLow first',
    );
    expect(dialog?.querySelector('.compare-sort-done')?.textContent).toBe(
      'Show 3 listings',
    );
  });

  it('sorts the cards from the sheet and remembers it for the folder', async () => {
    await mount();
    click(sortButton());
    click(radio('Rent a month'));
    expect(titles()).toEqual([
      'Camden Mews, 1 bed',
      'Arlington Road, 2 bed',
      'Kentish Town, 2 bed',
    ]);
    click(radio('High first'));
    expect(titles()[0]).toBe('Kentish Town, 2 bed');
    expect(sortButton()?.textContent).toBe('Sort: Rent a month, high first');
    await vi.waitFor(() => {
      expect(cache.saveViewSettings).toHaveBeenCalled();
    });
    const last = cache.saveViewSettings.mock.calls.at(-1) as [
      string,
      { compareSort: { column: string; direction: string } },
    ];
    expect(last[0]).toBe('1-Projects/Flat hunt');
    expect(last[1].compareSort).toEqual({ column: 'rent', direction: 'desc' });
  });

  it('starts from the sort remembered for the folder', async () => {
    cache.loadViewSettings.mockResolvedValue({
      sort: 'name',
      kindFilter: null,
      originFilter: null,
      layout: 'list',
      compareSort: { column: 'rent', direction: 'asc' },
    });
    await mount();
    expect(sortButton()?.textContent).toBe('Sort: Rent a month, low first');
    expect(titles()[0]).toBe('Camden Mews, 1 bed');
  });

  it('shows a rule score on the card and offers it first in the sheet', async () => {
    render(
      h(CompareView, {
        notes: notes.map((n, i) => ({
          ...n,
          fields: { ...n.fields, score: [50, 90, 70][i], fit: undefined },
        })),
        folderPath: '1-Projects/Flat hunt',
      }),
      root,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(sortButton()?.textContent).toBe('Sort: Your score, high first');
    expect(titles()[0]).toBe('Arlington Road, 2 bed');
    click(sortButton());
    const first = document.body.querySelector('.compare-sort [role=radio]');
    expect(first?.textContent).toBe('Your scoreadded by your rule');
  });

  it('shows the highlight under the rooms', async () => {
    await mount();
    const facts = root.querySelector('.compare-card-facts');
    expect(facts?.textContent).toContain('2 bedgarden');
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

  it('reads the Fit cell as a score out of 100 (#859)', async () => {
    await mount();
    const cells = [...root.querySelectorAll('tbody tr:first-child td')].map(
      (td) => td.textContent ?? '',
    );
    expect(cells.some((text) => /^\d+\/100$/.test(text))).toBe(true);
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

describe('Compare columns, Made for it, Apply and Copy as table (#795)', () => {
  const offers: CompareNote[] = [
    {
      id: 'id-Northwind',
      name: 'Northwind.md',
      modifiedTime: '2026-09-28T08:00:00Z',
      kind: 'job-offer',
      fields: {
        salary: 72000,
        score: 79,
        status: 'new',
        apply_link: 'https://jobs.example.com/apply',
        interview_panel: 'Alex',
      },
      bowerOrigins: {},
      madeFor: ['CV · Northwind', 'Letter · Northwind'],
    },
    {
      id: 'id-Fabrikam',
      name: 'Fabrikam.md',
      modifiedTime: '2026-09-28T08:00:00Z',
      kind: 'job-offer',
      fields: { salary: 65000, score: 91, status: 'applied' },
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
    [...root.querySelectorAll('th[scope="col"] .compare-th-sort')].map((el) =>
      (el.textContent ?? '').replace(/[▴▾]/g, '').trim(),
    );

  it('shows the Made for it badge and an Apply link from the note', async () => {
    await mountOffers();
    expect(headers().slice(-2)).toEqual(['Made for it', 'Apply']);
    const link = root.querySelector<HTMLAnchorElement>(
      'a[aria-label="Apply to Northwind"]',
    );
    expect(link?.href).toBe('https://jobs.example.com/apply');
    expect(root.textContent).toContain('CV · Letter');
  });

  it('picks columns in a dialog and remembers the choice for the folder', async () => {
    await mountOffers();
    expect(headers()).not.toContain('Interview panel');
    click(chip('Columns'));
    const option = [
      ...document.querySelectorAll<HTMLElement>('[role="checkbox"]'),
    ].find((el) => el.textContent?.startsWith('Interview panel'));
    click(option);
    expect(headers()).toContain('Interview panel');
    await vi.waitFor(() => {
      expect(cache.saveViewSettings).toHaveBeenCalled();
    });
    const [path, saved] = cache.saveViewSettings.mock.calls[0] as [
      string,
      { compareVisible: string[] },
    ];
    expect(path).toBe('1-Projects/Jobs');
    expect(saved.compareVisible).toContain('interview_panel');
  });

  it('starts from the columns remembered for the folder', async () => {
    cache.loadViewSettings.mockResolvedValue({
      sort: 'name',
      kindFilter: null,
      originFilter: null,
      layout: 'list',
      compareVisible: ['score'],
    });
    await mountOffers();
    expect(headers()).toEqual(['Offer', 'Your score']);
  });

  it('copies the visible columns, in the sort order, as a Markdown table', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    cache.loadViewSettings.mockResolvedValue({
      sort: 'name',
      kindFilter: null,
      originFilter: null,
      layout: 'list',
      compareVisible: ['score', 'apply_link'],
    });
    await mountOffers();
    click(chip('Copy as table'));
    expect(writeText).toHaveBeenCalledWith(
      [
        '| Offer | Your score | Apply |',
        '| --- | --- | --- |',
        '| Fabrikam | 91/100 | — |',
        '| Northwind | 79/100 | [Apply](https://jobs.example.com/apply) |',
      ].join('\n'),
    );
  });
});
