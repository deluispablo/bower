import { describe, expect, it } from 'vitest';

import {
  cellText,
  compareColumns,
  defaultSort,
  extraColumns,
  firstDirection,
  offerWord,
  sortButtonText,
  sortNotes,
} from '../src/compare.js';
import type { CompareColumn, CompareNote } from '../src/compare.js';
import { kindById } from '../src/kinds.js';

function note(name: string, fields: Record<string, unknown>): CompareNote {
  return {
    id: `id-${name}`,
    name: `${name}.md`,
    modifiedTime: '2026-09-28T08:00:00Z',
    kind: 'job-offer',
    fields,
    bowerOrigins: {},
  };
}

const kind = kindById('job-offer');
if (kind === undefined) throw new Error('no job-offer kind');

const offers = [
  note('Northwind', {
    salary: 72000,
    score: 79,
    commute_minutes: 30,
    holiday_days: 25,
    bonus_pct: 5,
    team_size: 8,
  }),
  note('Fabrikam', {
    salary: 65000,
    score: 91,
    commute_minutes: 45,
    holiday_days: 28,
    bonus_pct: 10,
    team_size: 12,
  }),
  note('Contoso', { salary: 70000, score: 55 }),
];

describe('Compare score and extra columns (R-CMP-2, 3, 6)', () => {
  it('puts "Your score" first, then at most three extra numeric columns', () => {
    const extras = extraColumns(kind, offers);
    expect(extras.map((c) => c.label)).toEqual([
      'Your score',
      'Commute minutes',
      'Holiday days',
      'Bonus pct',
    ]);
    const ids = compareColumns(kind, undefined, extras).map((c) => c.id);
    expect(ids[1]).toBe('score');
    expect(ids).not.toContain('team_size');
    expect(ids[ids.length - 1]).toBe('status');
  });

  it('leaves out keys present in fewer than half the notes', () => {
    const few = [
      note('A', { score: 60, perks: 3 }),
      note('B', { score: 70 }),
      note('C', { score: 80 }),
      note('D', { score: 90 }),
    ];
    expect(extraColumns(kind, few).map((c) => c.id)).toEqual(['score']);
  });

  it('adds no score column when no note has one', () => {
    expect(extraColumns(kind, [note('A', { salary: 1 })])).toEqual([]);
  });

  it('reads the score as 79/100 and sorts it, best first by default', () => {
    const extras = extraColumns(kind, offers);
    const column = extras[0];
    if (column === undefined) throw new Error('no score column');
    expect(cellText(kind, offers[0] as CompareNote, column)).toBe('79/100');
    const sort = defaultSort(kind, extras);
    expect(sort).toEqual({ column: 'score', direction: 'desc' });
    expect(sortNotes(kind, offers, sort, extras).map((n) => n.name)).toEqual([
      'Fabrikam.md',
      'Northwind.md',
      'Contoso.md',
    ]);
    const byCommute = sortNotes(
      kind,
      offers,
      { column: 'commute_minutes', direction: 'asc' },
      extras,
    );
    expect(byCommute[0]?.name).toBe('Northwind.md');
    expect(firstDirection('score', extras)).toBe('desc');
    expect(firstDirection('salary', extras)).toBe('asc');
  });

  it('shows a fit the kind has no column for as "Your score"', () => {
    const fits = [note('A', { fit: 60 })];
    expect(extraColumns(kind, fits).map((c) => [c.id, c.label])).toEqual([
      ['fit', 'Your score'],
    ]);
    const rental = kindById('rental-listing');
    if (rental === undefined) throw new Error('no rental kind');
    const listings = [{ ...note('B', { fit: 80 }), kind: 'rental-listing' }];
    expect(extraColumns(rental, listings)).toEqual([]);
  });
});

describe('Compare Sort sheet wording (R-CMP-1)', () => {
  const columns = compareColumns(kind, undefined, extraColumns(kind, offers));
  const byId = (id: string): CompareColumn => {
    const column = columns.find((c) => c.id === id);
    if (column === undefined) throw new Error(`no ${id} column`);
    return column;
  };

  it('names the current sort by field and direction', () => {
    expect(sortButtonText(byId('score'), 'desc')).toBe(
      'Sort: Your score, high first',
    );
    expect(sortButtonText(byId('office'), 'asc')).toBe('Sort: Where, A to Z');
    expect(sortButtonText(byId('reply_by'), 'asc')).toBe(
      'Sort: Reply by, soonest first',
    );
  });

  it('says how many offers the button shows', () => {
    expect(offerWord(kind, 4)).toBe('offers');
    expect(offerWord(kind, 1)).toBe('offer');
  });
});
