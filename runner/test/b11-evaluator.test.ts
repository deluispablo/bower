/** B11a: the one evaluator in the runner (TL-P4-38 addendum 3; TL-P4-48 Q2): pure, typed, zero tokens, never model code. */
import { describe, expect, it } from 'vitest';
import type { TypeRow } from '../../src/data/contracts/types';

type Api = Record<string, unknown>;
type Note = { id: string; properties: Record<string, string> };
/** No version field: the version is EVALUATOR_VERSION, recorded beside each result in provenance (B). `overflow` only when a sum overflowed. */
type Result = { selected: number; excluded: number; unknown: number; unavailable: Record<string, { missing: number; invalid: number }>; overflow?: string[];
  rows: Array<{ group: Array<string | number | null>; currency?: string; values: Record<string, unknown> }> };
type Computed = Record<string, { value: unknown } | { unavailable: string }>;
/** The engine, loaded by path so the reds typecheck on main, where it does not exist yet. */
async function views(): Promise<Api> {
  try {
    return await import(/* @vite-ignore */ new URL('../src/views.ts', import.meta.url).pathname) as Api;
  } catch (error) {
    // Missing on main: each test's export assertion names what is missing.
    expect(String(error)).toMatch(/views/);
    return {};
  }
}
async function call<T>(name: string, ...args: unknown[]): Promise<T> {
  const api = await views();
  expect(api[name], `runner/src/views.ts exports ${name}`).toBeTypeOf('function');
  return (api[name] as (...values: unknown[]) => T)(...args);
}
/** The engine's inputs: a declaration, the one row it reads (validated as a stored read against that row), and the notes or properties. */
const aggregate = (view: unknown, row: TypeRow, notes: Note[]) => call<Result>('evaluateAggregate', view, row, notes);
const formula = (view: unknown, row: TypeRow, properties: Record<string, string>, asOf = '2026-10-07') =>
  call<Computed>('evaluateFormula', view, row, properties, asOf);

const row = (id: string, properties: TypeRow['properties']): TypeRow => ({ id, match: [id], template: 'source', properties, table: [] });
const OFFER = row('offer', { skills: { type: 'list' }, deadline: { type: 'date' }, salary: { type: 'money' },
  level: { type: 'enum', values: ['junior', 'senior'] }, rank: { type: 'number' }, company: { type: 'text' } });
const RECEIPT = row('receipt', { amount: { type: 'money' }, spent_on: { type: 'date' }, category: { type: 'enum', values: ['garden', 'kitchen'] } });
const FLAT = row('flat', { rent: { type: 'money' }, deposit: { type: 'money' }, area: { type: 'number' }, deadline: { type: 'date' },
  start: { type: 'date' }, rank: { type: 'number' } });

const money = (amount: number, currency = 'EUR') => JSON.stringify({ amount, currency });
const note = (id: string, properties: Record<string, string>): Note => ({ id, properties });
const view = (measures: unknown[], groupBy: unknown[] = [], where?: unknown, type = 'offer') => ({ v: 1, id: 'v', kind: 'aggregate', title: 'A view',
  set: { type, folderId: 'folder', recursive: true, ...(where ? { where } : {}) }, groupBy, measures });
const SKILLS = view([{ id: 'skills', label: 'Offers', op: 'top', property: 'skills', limit: 3 }], [], { op: 'eq', property: 'status', value: 'active' });
const OFFERS = [note('ferrowick', { status: 'active', skills: '[TypeScript, SQL, SQL]' }), note('mallowick', { status: 'active', skills: '[TypeScript, SQL, dbt]' }),
  note('lindenwick', { status: 'active' }), note('past', { status: 'closed', skills: '[Rust]' })];
const MONTHLY = view([{ id: 'total', label: 'Total', op: 'sum', property: 'amount' }], [{ property: 'spent_on', bucket: 'month' }, { property: 'category' }], undefined, 'receipt');
const RECEIPTS = [note('mulch', { amount: money(30), spent_on: '2026-10-02', category: 'garden' }),
  note('seeds', { amount: money(12.5), spent_on: '2026-10-02', category: 'garden' }),
  note('tool', { amount: money(15, 'USD'), spent_on: '2026-10-02', category: 'garden' }),
  note('missing', { spent_on: '2026-10-02', category: 'garden' }),
  note('unknown', { amount: money(8, 'XYZ'), spent_on: '2026-10-02', category: 'garden' })];
const ranks = (...values: number[]) => values.map((v, i) => note(`r${i}`, { rank: String(v) }));
const one = (op: string, property: string, extra: Record<string, unknown> = {}) => view([{ id: 'm', label: 'M', op, property, ...extra }]);
const valueOf = async (op: string, property: string, notes: Note[], extra?: Record<string, unknown>) =>
  (await aggregate(one(op, property, extra), OFFER, notes)).rows[0]?.values.m;
const FLATS = { v: 1, id: 'flat-metrics', kind: 'formula', type: 'flat', outputs: [
  { property: 'price_per_area', type: 'money', expr: { op: '/', left: { property: 'rent' }, right: { property: 'area' } } },
  { property: 'days_left', type: 'number', expr: { op: 'daysUntil', value: { property: 'deadline' } } }] };
const single = (type: string, expr: unknown) => ({ v: 1, id: 'one', kind: 'formula', type: 'flat', outputs: [{ property: 'k', type, expr }] });
const p = (property: string) => ({ property });

describe('B11a the evaluator', () => {
  it('AC7 b11-evaluator-skills: a list top counts each value once per note, with missing values counted', async () => {
    expect((await views()).EVALUATOR_VERSION, 'one evaluator version, for provenance').toBe(1);
    expect(await aggregate(SKILLS, OFFER, OFFERS)).toEqual({ selected: 3, excluded: 1, unknown: 0,
      rows: [{ group: ['SQL'], values: { skills: 2 } }, { group: ['TypeScript'], values: { skills: 2 } }, { group: ['dbt'], values: { skills: 1 } }],
      unavailable: { skills: { missing: 1, invalid: 0 } } });
  });

  it('AC7 b11-evaluator-currency: money is partitioned by currency; missing and unreadable amounts are counted apart; never one total', async () => {
    const result = await aggregate(MONTHLY, RECEIPT, RECEIPTS);
    expect(result).toEqual({ selected: 5, excluded: 0, unknown: 0,
      rows: [{ group: ['2026-10', 'garden'], currency: 'EUR', values: { total: { amount: 42.5, currency: 'EUR' } } },
        { group: ['2026-10', 'garden'], currency: 'USD', values: { total: { amount: 15, currency: 'USD' } } }],
      unavailable: { total: { missing: 1, invalid: 1 } } });
    expect(JSON.stringify(result)).not.toContain('57.5');
    const counted = await aggregate(view([{ id: 'n', label: 'Receipts', op: 'count' }, { id: 'total', label: 'Total', op: 'sum', property: 'amount' }], [], undefined, 'receipt'), RECEIPT, RECEIPTS);
    expect(counted.rows, 'in a money view every measure is per currency, over the notes with a readable amount').toEqual([
      { group: [], currency: 'EUR', values: { n: 2, total: { amount: 42.5, currency: 'EUR' } } },
      { group: [], currency: 'USD', values: { n: 1, total: { amount: 15, currency: 'USD' } } }]);
  });

  it('AC7 b11-evaluator-ops: every aggregate on numbers and dates, odd and even, and an empty set', async () => {
    const four = ranks(3, 1, 2, 5);
    expect(await valueOf('count', 'rank', four).catch(() => 'refused'), 'a count takes no property').toBe('refused');
    expect((await aggregate(view([{ id: 'm', label: 'M', op: 'count' }]), OFFER, four)).rows[0]?.values.m).toBe(4);
    expect(await valueOf('countValues', 'rank', four)).toBe(4);
    expect(await valueOf('countValues', 'skills', [note('a', { skills: '[a, a, b]' }), note('b', { skills: '[c]' })]), 'a list counts its distinct values').toBe(3);
    expect(await valueOf('countValues', 'skills', [note('a', { skills: '[a, b]' }), note('b', { skills: '[b, c]' })]), 'distinct across the notes, not per note').toBe(3);
    expect(await valueOf('countValues', 'rank', ranks(3, 1, 3)), 'distinct numbers').toBe(2);
    expect(await valueOf('sum', 'rank', four)).toBe(11);
    expect(await valueOf('average', 'rank', four)).toBe(2.75);
    expect(await valueOf('median', 'rank', four), 'an even count averages the middle two').toBe(2.5);
    expect(await valueOf('median', 'rank', ranks(3, 1, 2))).toBe(2);
    expect(await valueOf('min', 'rank', four)).toBe(1);
    expect(await valueOf('max', 'rank', four)).toBe(5);
    expect(await valueOf('range', 'rank', four)).toEqual({ min: 1, max: 5 });
    expect(await valueOf('average', 'rank', ranks(1, 2, 2)), 'every value is rounded once, at the end, to 4 decimals').toBe(1.6667);
    expect(await valueOf('sum', 'salary', [note('a', { salary: money(0.1) }), note('b', { salary: money(0.2) }), note('c', { salary: money(0.3) })]))
      .toEqual({ amount: 0.6, currency: 'EUR' });
    const dates = ['2026-10-14', '2026-10-01', '2026-11-02'].map((d, i) => note(`d${i}`, { deadline: d }));
    expect(await valueOf('earliest', 'deadline', dates)).toBe('2026-10-01');
    expect(await valueOf('latest', 'deadline', dates)).toBe('2026-11-02');
    expect(await valueOf('range', 'deadline', dates)).toEqual({ min: '2026-10-01', max: '2026-11-02' });
    expect(await valueOf('average', 'salary', [note('a', { salary: money(1) }), note('b', { salary: money(2) })])).toEqual({ amount: 1.5, currency: 'EUR' });
    const empty = await aggregate(view([{ id: 'n', label: 'N', op: 'count' }, { id: 's', label: 'S', op: 'sum', property: 'rank' }]), OFFER, []);
    expect(empty, 'no notes: a count of 0 and no sum, never a misleading 0').toEqual({ selected: 0, excluded: 0, unknown: 0,
      rows: [{ group: [], values: { n: 0, s: null } }], unavailable: { s: { missing: 0, invalid: 0 } } });
    expect((await aggregate(view([{ id: 'n', label: 'N', op: 'count' }], [{ property: 'level' }]), OFFER, [])).rows, 'grouped and empty: no rows').toEqual([]);
  });

  it('AC7 b11-evaluator-overflow: a sum over 10^15 is no value and is named, never a wrong or infinite total', async () => {
    const at = await aggregate(one('sum', 'rank'), OFFER, ranks(5e14, 5e14));
    expect(at.rows[0]?.values.m, 'exactly 10^15').toBe(1e15);
    expect(at.overflow).toBeUndefined();
    const over = await aggregate(view([{ id: 'n', label: 'N', op: 'count' }, { id: 'm', label: 'M', op: 'sum', property: 'rank' }]), OFFER, ranks(6e14, 6e14));
    expect(over.rows).toEqual([{ group: [], values: { n: 2, m: null } }]);
    expect(over.overflow, 'the overflowed measure, not an unavailable note count').toEqual(['m']);
    expect(over.unavailable).toEqual({ m: { missing: 0, invalid: 0 } });
    const salaries = [note('a', { salary: money(6e14) }), note('b', { salary: money(6e14) }), note('c', { salary: money(1, 'USD') })];
    expect((await aggregate(one('sum', 'salary'), OFFER, salaries)), 'per currency').toMatchObject({
      rows: [{ currency: 'EUR', values: { m: null } }, { currency: 'USD', values: { m: { amount: 1, currency: 'USD' } } }], overflow: ['m'] });
  });

  it('AC7 b11-evaluator-top-boundaries: ties go by code point and the cut is exact', async () => {
    const tally = [note('1', { skills: '[a, b, c]' }), note('2', { skills: '[a, c, b]' }), note('3', { skills: '[a, d]' })];
    const top = async (limit: number) => (await aggregate(view([{ id: 't', label: 'Notes', op: 'top', property: 'skills', limit }]), OFFER, tally)).rows
      .map((r) => [r.group[0], r.values.t]);
    expect(await top(2)).toEqual([['a', 3], ['b', 2]]);
    expect(await top(3)).toEqual([['a', 3], ['b', 2], ['c', 2]]);
    expect(await top(4)).toEqual([['a', 3], ['b', 2], ['c', 2], ['d', 1]]);
    expect(await top(20)).toEqual(await top(4));
    const levels = [note('1', { level: 'senior' }), note('2', { level: 'junior' }), note('3', { level: 'senior' }), note('4', { level: 'mid' })];
    expect(await aggregate(view([{ id: 't', label: 'Notes', op: 'top', property: 'level', limit: 5 }]), OFFER, levels)).toMatchObject({
      rows: [{ group: ['senior'], values: { t: 2 } }, { group: ['junior'], values: { t: 1 } }], unavailable: { t: { missing: 0, invalid: 1 } } });
  });

  it('AC7 b11-evaluator-buckets: ISO weeks across the year, months, quarters, years; a missing group is its own row', async () => {
    const days = ['2025-12-29', '2026-01-01', '2026-12-28', '2026-12-31', '2027-01-01', '2027-01-03', '2027-01-04'];
    const notes = days.map((d, i) => note(`d${i}`, { deadline: d }));
    const by = async (bucket: string) => (await aggregate(view([{ id: 'n', label: 'N', op: 'count' }], [{ property: 'deadline', bucket }]), OFFER, notes)).rows
      .map((r) => [r.group[0], r.values.n]);
    expect(await by('week')).toEqual([['2026-W01', 2], ['2026-W53', 4], ['2027-W01', 1]]);
    expect(await by('month')).toEqual([['2025-12', 1], ['2026-01', 1], ['2026-12', 2], ['2027-01', 3]]);
    expect(await by('quarter')).toEqual([['2025-Q4', 1], ['2026-Q1', 1], ['2026-Q4', 2], ['2027-Q1', 3]]);
    expect(await by('year')).toEqual([['2025', 1], ['2026', 3], ['2027', 3]]);
    const levels = [note('1', { level: 'senior' }), note('2', {}), note('3', { level: 'mid' })];
    expect((await aggregate(view([{ id: 'n', label: 'N', op: 'count' }], [{ property: 'level' }]), OFFER, levels)).rows,
      'missing and unreadable group values share one row, last').toEqual([{ group: ['senior'], values: { n: 1 } }, { group: [null], values: { n: 2 } }]);
  });

  it('AC7 b11-evaluator-where: a missing or unreadable operand is unknown, never selected by accident', async () => {
    const notes = [note('a', { level: 'senior', skills: '[SQL]', salary: money(150) }), note('b', { level: 'junior', salary: money(150, 'USD') }),
      note('c', {}), note('d', { level: 'mid' })];
    const counts = async (where: unknown) => {
      const r = await aggregate(view([{ id: 'n', label: 'N', op: 'count' }], [], where), OFFER, notes);
      return [r.selected, r.excluded, r.unknown];
    };
    const eq = { op: 'eq', property: 'level', value: 'senior' };
    expect(await counts(eq)).toEqual([1, 1, 2]);
    expect(await counts({ op: 'ne', property: 'level', value: 'senior' })).toEqual([1, 1, 2]);
    expect(await counts({ op: 'not', of: eq })).toEqual([1, 1, 2]);
    expect(await counts({ op: 'exists', property: 'level' }), 'exists: present, readable or not').toEqual([3, 1, 0]);
    expect(await counts({ op: 'any', of: [eq, { op: 'eq', property: 'level', value: 'junior' }] })).toEqual([2, 0, 2]);
    expect(await counts({ op: 'all', of: [{ op: 'exists', property: 'level' }, eq] })).toEqual([1, 2, 1]);
    expect(await counts({ op: 'contains', property: 'skills', value: 'SQL' })).toEqual([1, 0, 3]);
    expect(await counts({ op: 'in', property: 'level', values: ['senior', 'junior'] })).toEqual([2, 0, 2]);
    expect(await counts({ op: 'gt', property: 'salary', value: { amount: 100, currency: 'EUR' } }), 'another currency is unknown').toEqual([1, 0, 3]);
    const filtered = await aggregate(view([{ id: 'n', label: 'N', op: 'count' }], [], { op: 'gt', property: 'salary', value: { amount: 100, currency: 'EUR' } }), OFFER, notes);
    expect(filtered.rows, 'a money condition makes no currency rows').toEqual([{ group: [], values: { n: 1 } }]);
  });

  it('AC7 b11-evaluator-blanks: exists means a value is written, readable or not; a blank is no value', async () => {
    const count = async (where: unknown, notes: Note[]) => {
      const r = await aggregate(view([{ id: 'n', label: 'N', op: 'count' }], [], where), OFFER, notes);
      return [r.selected, r.excluded, r.unknown];
    };
    const notes = [note('absent', {}), note('empty', { skills: '', rank: '' }), note('spaces', { skills: '   ', rank: '   ' }),
      note('none', { skills: '[]', rank: 'abc' }), note('blank-item', { skills: '[""]', rank: '7' }), note('one', { skills: '[SQL]', rank: '3' })];
    expect(await count({ op: 'exists', property: 'skills' }, notes), 'absent, empty and spaces do not exist; [], [""] and [SQL] do').toEqual([3, 3, 0]);
    expect(await count({ op: 'exists', property: 'rank' }, notes), 'abc exists though unreadable').toEqual([3, 3, 0]);
    expect(await count({ op: 'not', of: { op: 'exists', property: 'rank' } }, notes), 'exists is never unknown').toEqual([3, 3, 0]);
    expect(await count({ op: 'contains', property: 'skills', value: 'SQL' }, notes), 'an empty list contains nothing; blanks and [""] are unknown')
      .toEqual([1, 1, 4]);
    expect(await count({ op: 'gt', property: 'rank', value: 5 }, notes), 'blank and unreadable numbers are unknown').toEqual([1, 1, 4]);
  });

  it('AC7 b11-evaluator-empty-results: no notes, empty lists and unreadable money give zeros, nulls or no rows, never a made-up value', async () => {
    const all = [{ id: 'n', label: 'N', op: 'count' }, { id: 'c', label: 'C', op: 'countValues', property: 'skills' },
      { id: 's', label: 'S', op: 'sum', property: 'rank' }, { id: 'a', label: 'A', op: 'average', property: 'rank' },
      { id: 'r', label: 'R', op: 'range', property: 'rank' }, { id: 'e', label: 'E', op: 'earliest', property: 'deadline' }];
    const zeros = { c: { missing: 0, invalid: 0 }, s: { missing: 0, invalid: 0 }, a: { missing: 0, invalid: 0 }, r: { missing: 0, invalid: 0 }, e: { missing: 0, invalid: 0 } };
    expect(await aggregate(view(all), OFFER, []), 'ungrouped without money: one row; counts 0, values null').toEqual({ selected: 0, excluded: 0, unknown: 0,
      rows: [{ group: [], values: { n: 0, c: 0, s: null, a: null, r: null, e: null } }], unavailable: zeros });
    const lists = [note('a', { skills: '[]' }), note('b', { skills: '[]' }), note('c', {})];
    expect(await aggregate(view([{ id: 'c', label: 'C', op: 'countValues', property: 'skills' }]), OFFER, lists), 'empty lists are present and add nothing')
      .toMatchObject({ rows: [{ group: [], values: { c: 0 } }], unavailable: { c: { missing: 1, invalid: 0 } } });
    expect(await aggregate(view([{ id: 't', label: 'T', op: 'top', property: 'skills', limit: 3 }]), OFFER, lists), 'a top of nothing has no rows')
      .toMatchObject({ rows: [], unavailable: { t: { missing: 1, invalid: 0 } } });
    const unreadable = [note('missing', { spent_on: '2026-10-02', category: 'garden' }), note('xyz', { amount: money(8, 'XYZ'), spent_on: '2026-10-02', category: 'garden' })];
    expect(await aggregate(view([{ id: 'n', label: 'N', op: 'count' }, { id: 'total', label: 'Total', op: 'sum', property: 'amount' }], [], undefined, 'receipt'), RECEIPT, unreadable),
      'a money view with no readable amount has no currency, so no row').toEqual({ selected: 2, excluded: 0, unknown: 0, rows: [], unavailable: { total: { missing: 1, invalid: 1 } } });
    expect((await aggregate(MONTHLY, RECEIPT, unreadable)).rows, 'grouped money too').toEqual([]);
    expect((await aggregate(view([{ id: 'n', label: 'N', op: 'count' }], [{ property: 'level' }]), OFFER, [note('x', {})])).rows, 'a group of only missing values is one null row')
      .toEqual([{ group: [null], values: { n: 1 } }]);
  });

  it('AC7 b11-evaluator-deterministic: the order of the notes never changes a result', async () => {
    const forward = await aggregate(MONTHLY, RECEIPT, RECEIPTS);
    expect(await aggregate(MONTHLY, RECEIPT, [...RECEIPTS].reverse())).toEqual(forward);
    expect(await aggregate(SKILLS, OFFER, [...OFFERS].reverse())).toEqual(await aggregate(SKILLS, OFFER, OFFERS));
  });

  it('AC8 b11-evaluator-formulas: the flats, a zero and a missing area, money rounding, dates and the typed if', async () => {
    const amber = { rent: money(1000), area: '50', deadline: '2026-10-14', price_per_area: money(123) };
    expect(await formula(FLATS, FLAT, amber), 'a stored computed value is never read').toEqual({
      price_per_area: { value: { amount: 20, currency: 'EUR' } }, days_left: { value: 7 } });
    expect(await formula(FLATS, FLAT, { rent: money(900), area: '0', deadline: '2026-10-14' })).toEqual({
      price_per_area: { unavailable: 'division-by-zero' }, days_left: { value: 7 } });
    expect(await formula(FLATS, FLAT, { rent: money(800), deadline: '2026-10-14' })).toEqual({
      price_per_area: { unavailable: 'missing' }, days_left: { value: 7 } });
    expect((await formula(FLATS, FLAT, { rent: money(800), area: 'fifty', deadline: '2026-10-07' }))).toEqual({
      price_per_area: { unavailable: 'invalid' }, days_left: { value: 0 } });
    expect(await formula(FLATS, FLAT, { rent: money(800), area: '40', deadline: '2026-10-01' }), 'overdue is negative').toMatchObject({ days_left: { value: -6 } });
    expect(await formula(single('money', { op: '/', left: p('rent'), right: { number: 3 } }), FLAT, { rent: money(1000) }), 'money keeps 4 decimals')
      .toEqual({ k: { value: { amount: 333.3333, currency: 'EUR' } } });
    expect(await formula(single('number', { op: '/', left: p('rent'), right: p('deposit') }), FLAT, { rent: money(1000), deposit: money(2000) }))
      .toEqual({ k: { value: 0.5 } });
    expect(await formula(single('number', { op: '/', left: p('rent'), right: p('deposit') }), FLAT, { rent: money(1000), deposit: money(2000, 'USD') }))
      .toEqual({ k: { unavailable: 'currency' } });
    expect(await formula(single('money', { op: '+', left: p('rent'), right: p('deposit') }), FLAT, { rent: money(1000), deposit: money(2000, 'USD') }))
      .toEqual({ k: { unavailable: 'currency' } });
    expect(await formula(single('money', { op: '*', left: { number: 2 }, right: p('rent') }), FLAT, { rent: money(12.5) }))
      .toEqual({ k: { value: { amount: 25, currency: 'EUR' } } });
    expect(await formula(single('number', { op: 'dateDiff', left: p('deadline'), right: p('start') }), FLAT, { deadline: '2027-01-04', start: '2026-12-28' }))
      .toEqual({ k: { value: 7 } });
    expect(await formula(single('number', { op: '*', left: p('area'), right: p('rank') }), FLAT, { area: '1000000000000000', rank: '1000000000000000' }))
      .toEqual({ k: { unavailable: 'not-finite' } });
    const pick = single('money', { op: 'if', when: { op: 'lt', property: 'area', value: 30 }, then: p('rent'), else: p('deposit') });
    expect(await formula(pick, FLAT, { area: '25', rent: money(500), deposit: money(900) })).toEqual({ k: { value: { amount: 500, currency: 'EUR' } } });
    expect(await formula(pick, FLAT, { area: '45', rent: money(500), deposit: money(900) })).toEqual({ k: { value: { amount: 900, currency: 'EUR' } } });
    expect(await formula(pick, FLAT, { rent: money(500), deposit: money(900) }), 'an unknown condition').toEqual({ k: { unavailable: 'missing' } });
    expect(await formula(pick, FLAT, { area: 'big', rent: money(500), deposit: money(900) })).toEqual({ k: { unavailable: 'invalid' } });
    const guarded = single('money', { op: 'if', when: { op: 'gt', property: 'area', value: 0 }, then: { op: '/', left: p('rent'), right: p('area') }, else: p('rent') });
    expect(await formula(guarded, FLAT, { area: '0', rent: money(500) }), 'the branch not taken is never computed').toEqual({ k: { value: { amount: 500, currency: 'EUR' } } });
    expect(await formula(pick, FLAT, { area: '25', rent: money(500) }), 'a missing value in the branch not taken').toEqual({ k: { value: { amount: 500, currency: 'EUR' } } });
    expect(await formula(pick, FLAT, { area: '45', rent: money(500) }), 'a missing value in the branch taken').toEqual({ k: { unavailable: 'missing' } });
    const thirds = single('money', { op: '*', left: { op: '/', left: p('rent'), right: { number: 3 } }, right: { number: 3 } });
    expect(await formula(thirds, FLAT, { rent: money(1000) }), 'rounded once, at the end').toEqual({ k: { value: { amount: 1000, currency: 'EUR' } } });
    expect(await formula(single('number', { op: '/', left: p('area'), right: { number: 3 } }), FLAT, { area: '1' }), 'numbers too').toEqual({ k: { value: 0.3333 } });
    const later = single('date', { op: 'if', when: { op: 'gt', property: 'deadline', value: '2026-10-10' }, then: p('deadline'), else: p('start') });
    expect(await formula(later, FLAT, { deadline: '2026-10-14', start: '2026-10-01' })).toEqual({ k: { value: '2026-10-14' } });
  });

  it('AC8 b11-evaluator-reasons: when both sides cannot be computed, one reason wins whatever the order: invalid, currency, not-finite, division-by-zero, missing', async () => {
    const k = async (type: string, expr: unknown, properties: Record<string, string>) => (await formula(single(type, expr), FLAT, properties)).k;
    const sum = { op: '+', left: p('rent'), right: p('deposit') };
    const both = async (type: string, a: unknown, b: unknown, op: string, properties: Record<string, string>) =>
      [await k(type, { op, left: a, right: b }, properties), await k(type, { op, left: b, right: a }, properties)];
    // invalid over missing
    expect(await both('number', p('area'), p('rank'), '+', { rank: 'x' })).toEqual([{ unavailable: 'invalid' }, { unavailable: 'invalid' }]);
    // currency over missing, invalid over currency
    expect(await both('money', sum, p('area'), '*', { rent: money(1), deposit: money(2, 'USD') })).toEqual([{ unavailable: 'currency' }, { unavailable: 'currency' }]);
    expect(await both('money', sum, p('area'), '*', { rent: money(1), deposit: money(2, 'USD'), area: 'big' })).toEqual([{ unavailable: 'invalid' }, { unavailable: 'invalid' }]);
    // not-finite and division-by-zero over missing; not-finite over division-by-zero; currency over not-finite
    const huge = { op: '*', left: p('area'), right: p('rank') };
    const zero = { op: '/', left: p('rank'), right: { op: '-', left: p('area'), right: p('area') } };
    const days = { op: 'daysUntil', value: p('deadline') };
    expect(await both('number', huge, days, '+', { area: '1000000000000000', rank: '1000000000000000' })).toEqual([{ unavailable: 'not-finite' }, { unavailable: 'not-finite' }]);
    expect(await both('number', zero, days, '+', { area: '4', rank: '1' })).toEqual([{ unavailable: 'division-by-zero' }, { unavailable: 'division-by-zero' }]);
    expect(await both('number', huge, { op: '/', left: p('area'), right: { op: '-', left: p('rank'), right: p('rank') } }, '+',
      { area: '1000000000000000', rank: '1000000000000000' })).toEqual([{ unavailable: 'not-finite' }, { unavailable: 'not-finite' }]);
    expect(await both('number', { op: '/', left: sum, right: p('rent') }, huge, '+', { rent: money(1), deposit: money(2, 'USD'), area: '1000000000000000', rank: '1000000000000000' }))
      .toEqual([{ unavailable: 'currency' }, { unavailable: 'currency' }]);
  });

  it('AC8 b11-evaluator-condition-reasons: an unknown condition names its reason the same way; a known one takes its branch', async () => {
    const pick = (when: unknown) => single('money', { op: 'if', when, then: p('rent'), else: p('deposit') });
    const k = async (when: unknown, properties: Record<string, string>) => (await formula(pick(when), FLAT, properties)).k;
    const cheap = { op: 'lt', property: 'rent', value: { amount: 900, currency: 'EUR' } };
    const small = { op: 'lt', property: 'area', value: 30 };
    const ranked = { op: 'gt', property: 'rank', value: 1 };
    const base = { rent: money(500), deposit: money(900) };
    expect(await k(cheap, { ...base, rent: money(500, 'USD') }), 'money compared with another currency').toEqual({ unavailable: 'currency' });
    for (const op of ['all', 'any']) {
      expect(await k({ op, of: [small, ranked] }, { ...base, rank: 'x' }), `${op}: missing then invalid`).toEqual({ unavailable: 'invalid' });
      expect(await k({ op, of: [ranked, small] }, { ...base, rank: 'x' }), `${op}: invalid then missing`).toEqual({ unavailable: 'invalid' });
      expect(await k({ op, of: [small, cheap] }, { ...base, rent: money(500, 'USD'), deposit: money(900, 'USD') }), `${op}: missing then currency`).toEqual({ unavailable: 'currency' });
      expect(await k({ op, of: [cheap, small] }, { ...base, rent: money(500, 'USD'), deposit: money(900, 'USD') }), `${op}: currency then missing`).toEqual({ unavailable: 'currency' });
    }
    expect(await k({ op: 'all', of: [small, ranked] }, { ...base, rank: '0' }), 'all with a false part is false, whatever else is unknown')
      .toEqual({ value: { amount: 900, currency: 'EUR' } });
    expect(await k({ op: 'any', of: [small, ranked] }, { ...base, rank: '5' }), 'any with a true part is true').toEqual({ value: { amount: 500, currency: 'EUR' } });
    expect(await k({ op: 'not', of: ranked }, { ...base, rank: 'x' })).toEqual({ unavailable: 'invalid' });
    expect(await k({ op: 'exists', property: 'area' }, base), 'exists is never unknown').toEqual({ value: { amount: 900, currency: 'EUR' } });
  });

  it('AC8 b11-evaluator-never-runs-a-refused-view: a declaration the grammar refuses is never evaluated', async () => {
    const api = await views();
    expect(api.evaluateFormula, 'runner/src/views.ts exports evaluateFormula').toBeTypeOf('function');
    expect(api.evaluateAggregate, 'runner/src/views.ts exports evaluateAggregate').toBeTypeOf('function');
    const weeks = single('number', { op: '/', left: p('days_left'), right: { number: 7 } });
    await expect(formula(weeks, FLAT, { days_left: '14' })).rejects.toThrow();
    await expect(aggregate({ ...SKILLS, measures: [{ id: 'x', label: 'X', op: 'eval', property: 'skills' }] }, OFFER, OFFERS)).rejects.toThrow();
    await expect(aggregate(SKILLS, RECEIPT, OFFERS), 'a view for another row').rejects.toThrow();
    await expect(aggregate({ ...SKILLS, note: 'x', set: { ...SKILLS.set, where: { op: 'eq', property: 'colour', value: 'red' } } }, OFFER, OFFERS),
      'a stored extension key never excuses a semantic fault').rejects.toThrow();
  });

  it('AC8 b11-evaluator-reads-leniently: a stored declaration with keys a later version added is evaluated like its strict form', async () => {
    const stored = { ...SKILLS, note: 'kept by a later version', measures: [{ id: 'skills', label: 'Offers', op: 'top', property: 'skills', limit: 3, hint: 'x' }] };
    expect(await aggregate(stored, OFFER, OFFERS)).toEqual(await aggregate(SKILLS, OFFER, OFFERS));
    const amber = { rent: money(1000), area: '50', deadline: '2026-10-14' };
    const flats = { ...FLATS, note: 'x', outputs: FLATS.outputs.map((o) => ({ ...o, hint: 'x' })) };
    expect(await formula(flats, FLAT, amber)).toEqual(await formula(FLATS, FLAT, amber));
    const installed = { ...FLAT, properties: { ...FLAT.properties, price_per_area: { type: 'money' }, days_left: { type: 'number' } }, views: [FLATS] } as TypeRow;
    expect(await formula(FLATS, installed, amber), 'the installed row, its outputs declared').toEqual(await formula(FLATS, FLAT, amber));
  });
});
