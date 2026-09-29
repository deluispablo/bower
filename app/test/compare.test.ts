import { describe, expect, it } from 'vitest';

import {
  applyFilters,
  cellText,
  bookingsTimeline,
  receiptsByMonth,
  compareColumns,
  compareKinds,
  defaultSort,
  dropColumn,
  fadedLine,
  filterChips,
  moveColumn,
  orderedColumnIds,
  setFrontmatterValue,
  sortNotes,
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

  it('applies a stored column order, keeps the title first and adds new columns', () => {
    const order = orderedColumnIds(rental, ['fit', 'nope', 'rent']);
    expect(order.slice(0, 3)).toEqual(['title', 'fit', 'rent']);
    expect(order).toHaveLength(8);
    expect(moveColumn(order, 'fit', 'left')).toEqual(order);
    expect(moveColumn(order, 'rent', 'left').slice(0, 3)).toEqual([
      'title',
      'rent',
      'fit',
    ]);
    expect(dropColumn(order, 'status', 'fit').slice(0, 3)).toEqual([
      'title',
      'status',
      'fit',
    ]);
  });
});

describe('filter chips', () => {
  it('offers Under and Free before chips that split the listings', () => {
    expect(filterChips(rental, listings).map((c) => c.label)).toEqual([
      'Under £2,300',
      'Free before 1 Dec',
    ]);
  });

  it('hides what fails and names it', () => {
    const chips = filterChips(rental, listings);
    const under = chips[0];
    if (under === undefined) throw new Error('no chip');
    const { shown, hidden } = applyFilters(listings, [under]);
    expect(shown).toHaveLength(3);
    expect(hidden.map((n) => n.name)).toEqual(['Kentish Town, 2 bed.md']);
    expect(fadedLine(hidden, [under])).toBe(
      'Kentish Town is over £2,300, shown faded.',
    );
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

  it('says "No date" for a date the note does not have', () => {
    const column = compareColumns(kind).find((c) => c.id === 'reply_by');
    if (column === undefined) throw new Error('no reply_by column');
    expect(cellText(kind, note('Offer', 'job-offer', {}), column)).toBe(
      'No date',
    );
    expect(
      cellText(
        kind,
        note('Offer', 'job-offer', { reply_by: '2026-10-14' }),
        column,
      ),
    ).not.toBe('No date');
  });
});
