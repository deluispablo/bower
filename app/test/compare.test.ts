import { describe, expect, it } from 'vitest';

import {
  applyFilters,
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

  it('never offers contracts, receipts or bookings', () => {
    const many = (kind: string): CompareNote[] => [
      note('A', kind, {}),
      note('B', kind, {}),
      note('C', kind, {}),
    ];
    expect(compareKinds(many('contract'))).toEqual([]);
    expect(compareKinds(many('receipt'))).toEqual([]);
    expect(compareKinds(many('booking'))).toEqual([]);
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
