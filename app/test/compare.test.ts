import { describe, expect, it } from 'vitest';

import {
  applyFilters,
  cellText,
  bookingsTimeline,
  receiptsByMonth,
  compareColumns,
  compareKinds,
  defaultSort,
  factsLine,
  hiddenWithoutDate,
  filterChips,
  quickFilter,
  quickFilterText,
  setFrontmatterValue,
  sortChipText,
  sortNotes,
  sortOptions,
  statusDateLine,
  tableColumns,
} from '../src/compare.js';
import type { CompareNote } from '../src/compare.js';
import { kindById } from '../src/kinds.js';

function note(
  name: string,
  kind: string,
  fields: Record<string, unknown>,
): CompareNote {
  return {
    id: `id-${name}`,
    name: `${name}.md`,
    modifiedTime: '2026-09-28T08:00:00Z',
    kind,
    fields,
    bowerOrigins: {},
  };
}

const listings = [
  note('Kentish Town, 2 bed', 'rental-listing', {
    rent: 2400,
    rooms: '2 bed, garden',
    available: '2026-11-15',
    fit: 81,
    status: 'to view',
    viewing: '2026-11-14',
  }),
  note('Arlington Road, 2 bed', 'rental-listing', {
    rent: 2150,
    available: '2026-11-01',
    fit: 72,
    status: 'to view',
  }),
  note('Camden Mews, 1 bed', 'rental-listing', {
    rent: 1850,
    available: 'Now',
    fit: 64,
    status: 'new',
  }),
  note('Holloway Road, 2 bed', 'rental-listing', {
    rent: 1990,
    available: '2026-12-01',
    fit: 58,
    status: 'new',
  }),
];
const rental = kindById('rental-listing');
if (rental === undefined) throw new Error('kind missing');

describe('compareKinds', () => {
  it('offers Compare for two rental listings, not for one', () => {
    expect(compareKinds(listings.slice(0, 2)).map((k) => k.id)).toEqual([
      'rental-listing',
    ]);
    expect(compareKinds(listings.slice(0, 1))).toEqual([]);
  });

  it('never offers contracts', () => {
    const many = (kind: string): CompareNote[] => [
      note('A', kind, {}),
      note('B', kind, {}),
      note('C', kind, {}),
    ];
    expect(compareKinds(many('contract'))).toEqual([]);
  });

  it('offers receipts by month and bookings as a timeline from two notes', () => {
    const two = (kind: string): CompareNote[] => [
      note('A', kind, {}),
      note('B', kind, {}),
    ];
    expect(compareKinds(two('receipt')).map((k) => k.compare)).toEqual([
      'by-month',
    ]);
    expect(compareKinds(two('booking')).map((k) => k.compare)).toEqual([
      'timeline',
    ]);
    expect(compareKinds(two('receipt').slice(0, 1))).toEqual([]);
    expect(compareKinds(two('booking').slice(0, 1))).toEqual([]);
  });
});

describe('columns and sort', () => {
  it('follow the kind: listing, the compare fields, then status', () => {
    expect(compareColumns(rental).map((c) => c.label)).toEqual([
      'Listing',
      'Rent a month',
      'Rooms',
      'Available',
      'Against the area',
      'Bike to the office',
      'Fit',
      'Status',
    ]);
  });

  it('sorts by fit, best first, by default', () => {
    expect(defaultSort(rental)).toEqual({ column: 'fit', direction: 'desc' });
    expect(
      sortNotes(rental, listings, defaultSort(rental)).map((n) => n.fields.fit),
    ).toEqual([81, 72, 64, 58]);
  });

  it('sorts by rent, either way', () => {
    const rents = (direction: 'asc' | 'desc'): unknown[] =>
      sortNotes(rental, listings, { column: 'rent', direction }).map(
        (n) => n.fields.rent,
      );
    expect(rents('asc')).toEqual([1850, 1990, 2150, 2400]);
    expect(rents('desc')).toEqual([2400, 2150, 1990, 1850]);
  });

  it('puts notes with nothing in the column last', () => {
    const sorted = sortNotes(rental, listings, {
      column: 'rooms',
      direction: 'asc',
    });
    expect(sorted[0]?.name).toBe('Kentish Town, 2 bed.md');
  });
});

describe('filter chips', () => {
  it('offers Under and Free before chips that split the listings', () => {
    expect(filterChips(rental, listings).map((c) => c.label)).toEqual([
      'Under £2,300',
      'Free before 1 Dec',
    ]);
  });

  it('hides what fails', () => {
    const chips = filterChips(rental, listings);
    const under = chips[0];
    if (under === undefined) throw new Error('no chip');
    const { shown, hidden } = applyFilters(listings, [under]);
    expect(shown).toHaveLength(3);
    expect(hidden.map((n) => n.name)).toEqual(['Kentish Town, 2 bed.md']);
  });

  it('offers none when nothing would be hidden', () => {
    expect(filterChips(rental, listings.slice(0, 1))).toEqual([]);
  });
});

describe('setFrontmatterValue', () => {
  it('replaces the status line and leaves the rest alone', () => {
    const text = '---\nkind: rental-listing\nstatus: new\nfit: 5\n---\nBody\n';
    expect(setFrontmatterValue(text, 'status', 'viewed')).toBe(
      '---\nkind: rental-listing\nstatus: viewed\nfit: 5\n---\nBody\n',
    );
  });

  it('adds the key when missing and keeps CRLF', () => {
    expect(
      setFrontmatterValue('---\r\nkind: bill\r\n---\r\nHi', 'status', 'active'),
    ).toBe('---\r\nkind: bill\r\nstatus: active\r\n---\r\nHi');
  });
});

describe('receiptsByMonth', () => {
  const now = new Date('2026-09-28T10:00:00Z');
  const receipts = [
    note('Corner Shop', 'receipt', {
      shop: 'Corner Shop',
      date: '2026-09-03',
      total: 12.5,
    }),
    note('Hardware Store', 'receipt', {
      shop: 'Hardware Store',
      date: '2026-08-20',
      total: '£40',
    }),
    note('Bakery', 'receipt', {
      shop: 'Bakery',
      date: '2026-09-21',
      total: 7.5,
    }),
    note('Old Till', 'receipt', {
      shop: 'Old Till',
      date: '2025-12-30',
      total: 99,
    }),
    note('No date', 'receipt', { shop: 'Mystery', total: 5 }),
  ];

  it('groups by month, newest first, with each month total', () => {
    const { months } = receiptsByMonth(receipts, now);
    expect(months.map((m) => [m.label, m.totalText])).toEqual([
      ['September 2026', '£20'],
      ['August 2026', '£40'],
      ['December 2025', '£99'],
      ['No date', '£5'],
    ]);
    expect(months[0]?.receipts.map((r) => [r.shop, r.date, r.total])).toEqual([
      ['Bakery', '21 Sep', '£7.50'],
      ['Corner Shop', '3 Sep', '£12.50'],
    ]);
  });

  it('totals the year so far, leaving out other years', () => {
    expect(receiptsByMonth(receipts, now).year).toEqual({
      year: 2026,
      total: 60,
      totalText: '£60',
    });
    expect(
      receiptsByMonth(receipts, new Date('2027-02-01T00:00:00Z')).year,
    ).toBe(null);
  });
});

describe('bookingsTimeline', () => {
  const now = new Date('2026-09-28T10:00:00Z');
  const bookings = [
    note('Hotel', 'booking', {
      what: 'Hotel',
      when: '2026-11-14T15:00',
      where: 'Lisbon',
      reference: 'H123',
    }),
    note('Train', 'booking', {
      what: 'Train',
      when: '2026-09-01T08:30',
      where: 'King Cross',
      reference: 'T9',
    }),
    note('Dentist', 'booking', { what: 'Dentist', when: '2026-09-28' }),
    note('Flight', 'booking', { what: 'Flight', when: '2026-09-28T18:45' }),
    note('Open', 'booking', { what: 'Open', when: 'someday' }),
  ];

  it('sorts by date and time and marks the past ones', () => {
    const timeline = bookingsTimeline(bookings, now);
    expect(timeline.map((e) => [e.what, e.past])).toEqual([
      ['Train', true],
      ['Dentist', false],
      ['Flight', false],
      ['Hotel', false],
      ['Open', false],
    ]);
    expect(timeline[0]).toMatchObject({
      date: '1 Sep',
      time: '08:30',
      where: 'King Cross',
      reference: 'T9',
    });
    expect(
      bookingsTimeline(bookings, new Date('2026-09-28T20:00:00Z'))[2]?.past,
    ).toBe(true);
  });
});

describe('Compare wording (R-FOLD-6)', () => {
  const kind = kindById('job-offer');
  if (kind === undefined) throw new Error('no job-offer kind');

  it('heads the office column "Where"', () => {
    const labels = compareColumns(kind).map((column) => column.label);
    expect(labels).toContain('Where');
    expect(labels).not.toContain('Office');
  });

  it('says "No date yet" for a date the note does not have', () => {
    const column = compareColumns(kind).find((c) => c.id === 'reply_by');
    if (column === undefined) throw new Error('no reply_by column');
    expect(cellText(kind, note('Offer', 'job-offer', {}), column)).toBe(
      'No date yet',
    );
    expect(
      cellText(
        kind,
        note('Offer', 'job-offer', { reply_by: '2026-10-14' }),
        column,
      ),
    ).not.toBe('No date yet');
  });
});

// --- The boards' Compare (#916) ---------------------------------------------

const jobKind = kindById('job-offer');
if (jobKind === undefined) throw new Error('kind missing');

const flats = [
  note('10-43 Buckley St', 'rental-listing', {
    rent: '460 AUD/week',
    rooms: '1 bed',
    available: '2026-10-07',
    against_area: '−15% vs area median',
    fit: 73,
    status: 'to view',
    viewing: '2026-10-01',
  }),
  note('6-20 Mantell St', 'rental-listing', {
    rent: '350 AUD/week',
    rooms: '1 bed',
    against_area: '−35% vs area median',
    fit: 72,
    status: 'to view',
  }),
  note('21-51 Buckley St', 'rental-listing', {
    rent: '395 AUD/week',
    rooms: '1 bed',
    available: '2026-09-25',
    against_area: '−27% vs area median',
    fit: 66,
    status: 'new',
  }),
];

function flat(index: number): CompareNote {
  const found = flats[index];
  if (found === undefined) throw new Error('no flat');
  return found;
}

describe('the flats table (PF-Compare, PF-Columns)', () => {
  const columns = tableColumns(rental, flats);

  it('has six default columns, and Rooms and Bike to the office in Columns', () => {
    expect(
      columns.filter((c) => c.optional !== true).map((c) => c.label),
    ).toEqual([
      'Flat',
      'Rent',
      'Available',
      'Against the area',
      'Fit',
      'Status',
    ]);
    expect(
      columns.filter((c) => c.optional === true).map((c) => c.label),
    ).toEqual(['Rooms', 'Bike to the office']);
  });

  it('says "Rent a week" in Sort by, with Fit first and Name last', () => {
    const shown = columns.filter((c) => c.optional !== true);
    expect(
      sortOptions(shown).map((c) =>
        c.id === 'title' ? 'Name' : (c.option ?? c.label),
      ),
    ).toEqual([
      'Fit',
      'Rent a week',
      'Available',
      'Against the area',
      'Status',
      'Name',
    ]);
    const fit = columns.find((c) => c.id === 'fit');
    if (fit === undefined) throw new Error('no fit');
    expect(sortChipText(fit, 'desc')).toBe('Fit, high first');
  });

  it('sorts by a header: rent low first, statuses in the folder order', () => {
    const fields = columns.filter((c) => c.field !== undefined);
    const byRent = sortNotes(
      rental,
      flats,
      { column: 'rent', direction: 'asc' },
      fields,
    );
    expect(byRent.map((n) => n.name)).toEqual([
      '6-20 Mantell St.md',
      '21-51 Buckley St.md',
      '10-43 Buckley St.md',
    ]);
    const byStatus = sortNotes(
      rental,
      flats,
      { column: 'status', direction: 'asc' },
      fields,
      ['new', 'to view', 'viewed'],
    );
    expect(byStatus[0]?.name).toBe('21-51 Buckley St.md');
  });

  it('reads the same words on the card as in the table (K-30)', () => {
    expect(factsLine(rental, flat(0))).toBe(
      '460 AUD/week · 1 bed · from 7 Oct',
    );
    expect(factsLine(rental, flat(1))).toBe(
      '350 AUD/week · 1 bed · No date yet',
    );
    expect(statusDateLine(rental, flat(0))).toBe('Viewing Thu 1 Oct');
    expect(statusDateLine(rental, flat(1))).toBe('');
  });
});

describe('the quick filter (R-COMPARE-3)', () => {
  it('is "Free before <the latest day>" and hides the flats without a date', () => {
    const chip = quickFilter(rental, flats);
    if (chip === undefined) throw new Error('no quick filter');
    expect(chip.label).toBe('Free before 7 Oct');
    const { shown, hidden } = applyFilters(flats, [chip]);
    expect(shown).toHaveLength(2);
    expect(hiddenWithoutDate(hidden, chip)).toBe(1);
    expect(quickFilterText(chip, 1)).toBe(
      'Free before 7 Oct · 1 hidden without a date',
    );
    expect(quickFilterText(chip, 0)).toBe('Free before 7 Oct');
  });

  it('is offered for no job offers (FL-3)', () => {
    expect(
      quickFilter(jobKind, [
        note('A', 'job-offer', { starts: '2026-10-01' }),
        note('B', 'job-offer', {}),
      ]),
    ).toBeUndefined();
  });
});

describe('the job offers table (LI-Compare)', () => {
  const offer = note('Senior Consultant', 'job-offer', {
    office: 'Melbourne, VIC',
    hours: 'Hybrid',
    fit: 79,
  });
  const columns = tableColumns(jobKind, [offer, offer]);

  it('has six default columns, and Starts and Reply by in Columns', () => {
    expect(
      columns.filter((c) => c.optional !== true).map((c) => c.label),
    ).toEqual(['Offer', 'Salary', 'Where', 'Holiday', 'Fit', 'Status']);
    expect(
      columns.filter((c) => c.optional === true).map((c) => c.label),
    ).toEqual(['Starts', 'Reply by']);
  });

  it('says "Not stated", "—" and where with how it is worked', () => {
    const text = (id: string): string => {
      const column = columns.find((c) => c.id === id);
      if (column === undefined) throw new Error(`no ${id}`);
      return cellText(jobKind, offer, column);
    };
    expect(text('salary')).toBe('Not stated');
    expect(text('holiday')).toBe('—');
    expect(text('office')).toBe('Melbourne, VIC (Hybrid)');
    expect(factsLine(jobKind, offer)).toBe(
      'Melbourne, VIC · Hybrid · Salary: Not stated',
    );
  });
});
