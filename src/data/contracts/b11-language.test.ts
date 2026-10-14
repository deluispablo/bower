/** B11a: the closed view language (TL-P4-48 Q1-Q2): one grammar, its limits, strict writes and lenient reads; one typed decode. */
import { describe, expect, it } from 'vitest';
import * as noteFormat from './note-format';
import { propertyValuesOk, scalarList } from './note-format';
import type { TypeRow, TypeTable } from './types';

type Api = Record<string, unknown>;
/** The new module, loaded by path so the reds typecheck on main, where it does not exist yet. */
async function viewFormat(): Promise<Api> {
  try {
    return await import(/* @vite-ignore */ new URL('./view-format.ts', import.meta.url).pathname) as Api;
  } catch (error) {
    // Missing on main: each test's export assertion names what is missing.
    expect(String(error)).toMatch(/view-format/);
    return {};
  }
}
function call<T>(api: Api, file: string, name: string, ...args: unknown[]): T {
  expect(api[name], `${file} exports ${name}`).toBeTypeOf('function');
  return (api[name] as (...values: unknown[]) => T)(...args);
}
/** The one validator: a declaration, the whole type table it is checked against, and the mode (write by default). */
const fault = async (definition: unknown, table: TypeTable, mode?: 'write' | 'read') =>
  call<string | null>(await viewFormat(), 'view-format.ts', 'viewFault', definition, table, ...(mode ? [mode] : []));
const decode = (row: TypeRow, key: string, raw: string | undefined) =>
  call<{ value: unknown } | 'missing' | 'invalid'>(noteFormat as unknown as Api, 'note-format.ts', 'propertyValue', row, key, raw);
const amount = (value: unknown) => call<string>(noteFormat as unknown as Api, 'note-format.ts', 'amountText', value);

const row = (id: string, properties: TypeRow['properties'], extra: Record<string, unknown> = {}): TypeRow =>
  ({ id, match: [id.replace('-', ' ')], template: 'source', properties, table: Object.keys(properties).slice(0, 4), ...extra });
const OFFER = row('offer', { skills: { type: 'list' }, deadline: { type: 'date' }, salary: { type: 'money' },
  level: { type: 'enum', values: ['junior', 'senior'] }, rank: { type: 'number' }, company: { type: 'text' } });
const RECEIPT = row('receipt', { amount: { type: 'money' }, fee: { type: 'money' }, spent_on: { type: 'date' },
  category: { type: 'enum', values: ['garden', 'kitchen'] } });
const FLAT = row('flat', { rent: { type: 'money' }, deposit: { type: 'money' }, area: { type: 'number' }, deadline: { type: 'date' },
  start: { type: 'date' }, location: { type: 'text' } });
const TABLE: TypeTable = { v: 1, rows: [OFFER, RECEIPT, FLAT] };

const SKILLS = { v: 1, id: 'active-offer-skills', kind: 'aggregate', title: 'Skills most active offers ask for',
  set: { type: 'offer', folderId: 'folder-job-hunt', recursive: true, where: { op: 'eq', property: 'status', value: 'active' } },
  groupBy: [], measures: [{ id: 'skills', label: 'Offers', op: 'top', property: 'skills', limit: 3 }] };
const MONEY = { v: 1, id: 'monthly-garden-spend', kind: 'aggregate', title: 'Garden spending by month',
  set: { type: 'receipt', folderId: 'folder-money', recursive: true },
  groupBy: [{ property: 'spent_on', bucket: 'month' }, { property: 'category' }],
  measures: [{ id: 'total', label: 'Total', op: 'sum', property: 'amount' }] };
const PRICE = { property: 'price_per_area', type: 'money', expr: { op: '/', left: { property: 'rent' }, right: { property: 'area' } } };
const DAYS = { property: 'days_left', type: 'number', expr: { op: 'daysUntil', value: { property: 'deadline' } } };
const FLATS = { v: 1, id: 'flat-metrics', kind: 'formula', type: 'flat', outputs: [PRICE, DAYS] };
/** The flat row once flat-metrics is installed: its outputs declared with their types, the view kept in the row. */
const INSTALLED: TypeTable = { v: 1, rows: [OFFER, RECEIPT,
  { ...FLAT, properties: { ...FLAT.properties, price_per_area: { type: 'money' }, days_left: { type: 'number' } }, views: [FLATS] } as TypeRow] };

const eq = (property: string, value: unknown) => ({ op: 'eq', property, value });
const aggregate = (extra: Record<string, unknown>) => ({ ...SKILLS, ...extra });
const where = (predicate: unknown) => ({ ...SKILLS, set: { ...SKILLS.set, where: predicate } });
const measures = (...list: unknown[]) => ({ ...MONEY, groupBy: [], measures: list });
const formula = (...outputs: unknown[]) => ({ ...FLATS, outputs });
const out = (property: string, type: string, expr: unknown) => ({ property, type, expr });
const p = (property: string) => ({ property });

describe('B11a the closed view language', () => {
  it('AC1 b11-grammar-accepts: the three canonical declarations are valid writes and valid reads', async () => {
    for (const definition of [SKILLS, MONEY, FLATS]) {
      expect(await fault(definition, TABLE), JSON.stringify(definition).slice(0, 60)).toBeNull();
      expect(await fault(definition, TABLE, 'read')).toBeNull();
    }
    const api = await viewFormat();
    expect(api.VIEW_LIMITS, 'the limits have one home').toEqual({ bytes: 4096, nodes: 32, depth: 8, groups: 4, measures: 8, outputs: 8,
      perHome: 10, top: 20, values: 10, notes: 200 });
    expect(await fault(FLATS, INSTALLED), 'reinstalling an installed formula with the same outputs').toBeNull();
    expect(await fault(formula(PRICE, out('area_left', 'number', { op: '-', left: p('area'), right: { number: 30 } })), TABLE)).toBeNull();
    expect(await fault(FLATS, INSTALLED, 'read'), 'the installed formula read back from its own row').toBeNull();
    // Money decides the currency rows only as a measure; a money condition only selects notes.
    expect(await fault(where({ op: 'gt', property: 'salary', value: { amount: 100, currency: 'EUR' } }), TABLE), 'a money condition').toBeNull();
    expect(await fault({ ...MONEY, set: { ...MONEY.set, where: { op: 'gt', property: 'fee', value: { amount: 1, currency: 'EUR' } } } }, TABLE),
      'a condition on another money property than the measured one').toBeNull();
  });

  it.each<[string, unknown]>([
    ['an unknown key on the declaration', aggregate({ code: 'return 1' })],
    ['an unknown key on the set', { ...SKILLS, set: { ...SKILLS.set, sql: 'select' } }],
    ['an unknown key on a measure', { ...SKILLS, measures: [{ ...SKILLS.measures[0], script: 'x' }] }],
    ['an unknown key on a group', { ...MONEY, groupBy: [{ property: 'category', fn: 'x' }] }],
    ['an unknown key on a predicate', where({ ...eq('status', 'active'), regex: '.*' })],
    ['an unknown key on an expression', formula(out('days_left', 'number', { op: 'daysUntil', value: p('deadline'), js: 'x' }))],
    ['an unknown key on an output', formula({ ...DAYS, label: 'Days left' })],
    ['version 2', aggregate({ v: 2 })],
    ['another kind', aggregate({ kind: 'table' })],
    ['an id that is not a slug', aggregate({ id: 'Active offers' })],
    ['an id over 64 characters', aggregate({ id: 'a'.repeat(65) })],
    ['no title', { ...SKILLS, title: undefined }],
    ['a blank title', aggregate({ title: '  ' })],
    ['a title over 80 characters', aggregate({ title: 'S'.repeat(81) })],
    ['a title with a table bar', aggregate({ title: 'Skills | offers' })],
    ['a title with a link', aggregate({ title: 'Skills in [[Job hunt]]' })],
    ['a title with a line break', aggregate({ title: 'Skills\nby offer' })],
    ['a type that is no row', { ...SKILLS, set: { ...SKILLS.set, type: 'nope' } }],
    ['a blank folder id', { ...SKILLS, set: { ...SKILLS.set, folderId: '' } }],
    ['recursive that is not a boolean', { ...SKILLS, set: { ...SKILLS.set, recursive: 'yes' } }],
    ['a predicate on an undeclared property', where(eq('colour', 'red'))],
    ['eq on a list', where(eq('skills', 'SQL'))],
    ['lt on text', where({ op: 'lt', property: 'company', value: 'M' })],
    ['contains on a scalar', where({ op: 'contains', property: 'company', value: 'M' })],
    ['in with 11 values', where({ op: 'in', property: 'company', values: Array.from({ length: 11 }, (_, i) => `C${i}`) })],
    ['a number compared with text', where(eq('rank', 'three'))],
    ['an enum value outside its values', where(eq('level', 'mid'))],
    ['an impossible date', where({ op: 'gt', property: 'deadline', value: '2026-02-30' })],
    ['money without a currency', where({ op: 'gt', property: 'salary', value: { amount: 100 } })],
    ['a status that is not text', where(eq('status', 3))],
    ['an empty all', where({ op: 'all', of: [] })],
    ['an empty any', where({ op: 'any', of: [] })],
    ['in with no values', where({ op: 'in', property: 'company', values: [] })],
    ['a not without its condition', where({ op: 'not' })],
    ['a group on money', { ...MONEY, groupBy: [{ property: 'amount' }], measures: [{ id: 'n', label: 'Receipts', op: 'count' }] }],
    ['a group on a list', { ...MONEY, set: { ...SKILLS.set, where: undefined }, groupBy: [{ property: 'skills' }], measures: [{ id: 'n', label: 'Offers', op: 'count' }] }],
    ['a bucket on a number', { ...SKILLS, set: { ...SKILLS.set, where: undefined }, groupBy: [{ property: 'rank', bucket: 'month' }], measures: [{ id: 'n', label: 'Offers', op: 'count' }] }],
    ['a bucket of a day', { ...MONEY, groupBy: [{ property: 'spent_on', bucket: 'day' }] }],
    ['5 group keys', { ...MONEY, groupBy: [{ property: 'category' }, { property: 'spent_on', bucket: 'year' }, { property: 'spent_on', bucket: 'quarter' },
      { property: 'spent_on', bucket: 'month' }, { property: 'spent_on', bucket: 'week' }] }],
    ['no measure', measures()],
    ['9 measures', measures(...Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, label: `Count ${i}`, op: 'count' })))],
    ['two measures with one id', measures({ id: 'n', label: 'Receipts', op: 'count' }, { id: 'n', label: 'Total', op: 'sum', property: 'amount' })],
    ['a measure without a label', measures({ id: 'n', op: 'count' })],
    ['a label over 40 characters', measures({ id: 'n', label: 'R'.repeat(41), op: 'count' })],
    ['a count with a property', measures({ id: 'n', label: 'Receipts', op: 'count', property: 'amount' })],
    ['a sum of an enum', measures({ id: 's', label: 'Total', op: 'sum', property: 'category' })],
    ['an average of a date', measures({ id: 's', label: 'Average', op: 'average', property: 'spent_on' })],
    ['the earliest of money', measures({ id: 's', label: 'First', op: 'earliest', property: 'amount' })],
    ['an unknown operation', measures({ id: 's', label: 'Total', op: 'eval', property: 'amount' })],
    ['two money properties in one view', measures({ id: 'a', label: 'Total', op: 'sum', property: 'amount' }, { id: 'f', label: 'Fees', op: 'sum', property: 'fee' })],
    ['a top of a number', { ...SKILLS, measures: [{ id: 'r', label: 'Offers', op: 'top', property: 'rank', limit: 3 }] }],
    ['a top with a group', { ...SKILLS, groupBy: [{ property: 'level' }] }],
    ['a top with a second measure', { ...SKILLS, measures: [...SKILLS.measures, { id: 'n', label: 'Offers', op: 'count' }] }],
    ['a top of 0', { ...SKILLS, measures: [{ ...SKILLS.measures[0], limit: 0 }] }],
    ['a top of 21', { ...SKILLS, measures: [{ ...SKILLS.measures[0], limit: 21 }] }],
    ['a formula for no row', { ...FLATS, type: 'nope' }],
    ['no output', formula()],
    ['9 outputs', formula(...Array.from({ length: 9 }, (_, i) => out(`k${i}`, 'number', p('area'))))],
    ['two outputs with one property', formula(DAYS, DAYS)],
    ['an output over a raw declared property', formula(out('rent', 'money', p('rent')))],
    ['an output over a technical property', formula(out('type', 'number', p('area')))],
    ['an output over Bower\'s own key', formula(out('bower_views', 'number', p('area')))],
    ['an output that is text', formula(out('where', 'text', p('location')))],
    ['an output typed unlike its expression', formula(out('price_per_area', 'number', PRICE.expr))],
    ['money plus a number', formula(out('total', 'money', { op: '+', left: p('rent'), right: p('area') }))],
    ['money times money', formula(out('total', 'money', { op: '*', left: p('rent'), right: p('deposit') }))],
    ['a number divided by money', formula(out('ratio', 'number', { op: '/', left: p('area'), right: p('rent') }))],
    ['days until a number', formula(out('days', 'number', { op: 'daysUntil', value: p('area') }))],
    ['a date difference with a number', formula(out('days', 'number', { op: 'dateDiff', left: p('deadline'), right: p('area') }))],
    ['an if whose branches differ in type', formula(out('pick', 'money', { op: 'if', when: { op: 'lt', property: 'area', value: 30 },
      then: p('rent'), else: p('area') }))],
    ['an if on an undeclared property', formula(out('pick', 'money', { op: 'if', when: eq('colour', 'red'), then: p('rent'), else: p('deposit') }))],
    ['a number that is not finite', formula(out('big', 'number', { op: '*', left: p('area'), right: { number: JSON.parse('1e400') as number } }))],
    ['a number over 10^15', formula(out('big', 'number', { op: '*', left: p('area'), right: { number: 2e15 } }))],
  ])('AC2 b11-grammar-refuses: %s is refused on write', async (_name, definition) => {
    expect(await fault(definition, TABLE), 'a reason is given').toEqual(expect.any(String));
    expect(String(await fault(definition, TABLE)).trim().length).toBeGreaterThan(0);
  });

  it('AC2 b11-computed-never-feeds-computed: a formula reads raw properties only, never a computed one', async () => {
    const weeks = { v: 1, id: 'flat-weeks', kind: 'formula', type: 'flat',
      outputs: [out('weeks_left', 'number', { op: '/', left: p('days_left'), right: { number: 7 } })] };
    expect(await fault(weeks, INSTALLED), 'an installed output is computed, even with no cycle').toEqual(expect.any(String));
    expect(await fault(weeks, INSTALLED, 'read')).toEqual(expect.any(String));
    const takeover = { v: 1, id: 'other-metrics', kind: 'formula', type: 'flat', outputs: [out('days_left', 'number', p('area'))] };
    expect(await fault(takeover, INSTALLED), 'another view cannot write an installed output').toEqual(expect.any(String));
    const own = formula(out('x', 'number', { op: '+', left: p('x'), right: { number: 1 } }));
    expect(await fault(own, TABLE), 'an output cannot read itself').toEqual(expect.any(String));
  });

  it('AC2 b11-candidate-vs-installed: a formula is checked as a candidate against the table; a reinstall keeps its outputs', async () => {
    // Installing: an output must be a key the row does not declare, or one this same formula already computes.
    expect(await fault(FLATS, TABLE), 'a first install declares nothing yet').toBeNull();
    expect(await fault(FLATS, INSTALLED), 'the same id with the same outputs').toBeNull();
    expect(await fault(formula(out('price_per_area', 'money', { op: '/', left: p('deposit'), right: p('area') }), DAYS), INSTALLED),
      'the same outputs with another expression').toBeNull();
    expect(await fault(formula(PRICE), INSTALLED), 'a reinstall that drops an output').toEqual(expect.any(String));
    expect(await fault(formula(PRICE, DAYS, out('area_left', 'number', p('area'))), INSTALLED), 'a reinstall that adds an output').toEqual(expect.any(String));
    expect(await fault(formula(PRICE, out('days_left', 'date', p('deadline'))), INSTALLED), 'a reinstall that retypes an output').toEqual(expect.any(String));
    expect(await fault({ ...FLATS, id: 'flat-metrics-2' }, INSTALLED), 'another id over installed outputs').toEqual(expect.any(String));
  });

  it('AC3 b11-limits-at-max: each limit at its maximum is valid and one over is refused', async () => {
    const leaves = (n: number) => Array.from({ length: n }, () => eq('category', 'garden'));
    const eight = [{ id: 'n', label: 'Receipts', op: 'count' }, { id: 'c', label: 'Categories', op: 'countValues', property: 'category' },
      ...['sum', 'average', 'median', 'min', 'max', 'range'].map((op) => ({ id: op, label: op, op, property: 'amount' }))];
    const four = [{ property: 'category' }, { property: 'spent_on', bucket: 'year' }, { property: 'spent_on', bucket: 'quarter' }, { property: 'spent_on', bucket: 'month' }];
    // 8 measures + 4 groups + any + 19 leaves = 32 nodes; one more leaf is 33.
    const nodes = (n: number) => ({ ...MONEY, set: { ...MONEY.set, where: { op: 'any', of: leaves(n) } }, groupBy: four, measures: eight });
    expect(await fault(nodes(19), TABLE), '32 nodes, 4 groups and 8 measures').toBeNull();
    expect(await fault(nodes(20), TABLE), '33 nodes').toEqual(expect.any(String));
    const nested = (n: number): unknown => (n === 1 ? eq('level', 'senior') : { op: 'not', of: nested(n - 1) });
    expect(await fault(where(nested(8)), TABLE), 'depth 8').toBeNull();
    expect(await fault(where(nested(9)), TABLE), 'depth 9').toEqual(expect.any(String));
    expect(await fault({ ...SKILLS, measures: [{ ...SKILLS.measures[0], limit: 20 }] }, TABLE), 'a top of 20').toBeNull();
    expect(await fault(where({ op: 'in', property: 'company', values: Array.from({ length: 10 }, (_, i) => `C${i}`) }), TABLE), '10 values').toBeNull();
    expect(await fault(formula(...Array.from({ length: 8 }, (_, i) => out(`k${i}`, 'number', p('area')))), TABLE), '8 outputs').toBeNull();
    const deep = (n: number): unknown => (n === 1 ? p('area') : { op: '+', left: deep(n - 1), right: { number: 1 } });
    expect(await fault(formula(out('k', 'number', deep(8))), TABLE), 'an expression 8 deep').toBeNull();
    expect(await fault(formula(out('k', 'number', deep(9))), TABLE), 'an expression 9 deep').toEqual(expect.any(String));
  });

  it('AC3 b11-bytes-at-max: a declaration of exactly 4,096 UTF-8 bytes is valid and 4,097 is refused', async () => {
    // Two `in` lists of text values fill the declaration; the last value is sized to the byte.
    const sized = (bytes: number) => {
      const build = (last: string) => where({ op: 'all', of: [
        { op: 'in', property: 'company', values: Array.from({ length: 10 }, (_, i) => `${'é'.repeat(90)}${i}`) },
        { op: 'in', property: 'company', values: [...Array.from({ length: 9 }, (_, i) => `${'x'.repeat(190)}${i}`), last] }] });
      const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
      const base = size(build(''));
      expect(bytes - base, 'the filler fits one text value').toBeLessThanOrEqual(200);
      const definition = build('y'.repeat(bytes - base));
      expect(size(definition)).toBe(bytes);
      return definition;
    };
    expect(await fault(sized(4096), TABLE)).toBeNull();
    expect(await fault(sized(4097), TABLE)).toEqual(expect.any(String));
  });

  it('AC4 b11-lenient-read: a stored declaration with unknown keys is read, a semantic fault is refused either way', async () => {
    const stored = { ...SKILLS, note: 'kept by a later version', measures: [{ ...SKILLS.measures[0], hint: 'x' }] };
    expect(await fault(stored, TABLE, 'read')).toBeNull();
    expect(await fault(stored, TABLE, 'write')).toEqual(expect.any(String));
    const broken = where(eq('colour', 'red'));
    expect(await fault(broken, TABLE, 'read')).toEqual(expect.any(String));
    expect(await fault('not a view', TABLE, 'read')).toEqual(expect.any(String));
  });

  it('AC5 b11-typed-decode: one decode of a stored property for the Table and the engine', () => {
    expect(decode(OFFER, 'skills', '[TypeScript, SQL, SQL]')).toEqual({ value: ['TypeScript', 'SQL', 'SQL'] });
    expect(decode(OFFER, 'skills', '["TypeScript","SQL"]')).toEqual({ value: ['TypeScript', 'SQL'] });
    expect(decode(OFFER, 'skills', `[${Array.from({ length: 11 }, (_, i) => `s${i}`).join(', ')}]`)).toBe('invalid');
    expect(decode(OFFER, 'skills', undefined)).toBe('missing');
    expect(decode(OFFER, 'skills', '')).toBe('missing');
    expect(decode(OFFER, 'rank', '42')).toEqual({ value: 42 });
    expect(decode(OFFER, 'rank', '  ')).toBe('missing');
    expect(decode(OFFER, 'rank', 'abc')).toBe('invalid');
    expect(decode(OFFER, 'rank', '1e16')).toBe('invalid');
    expect(decode(RECEIPT, 'amount', '{"amount":30,"currency":"EUR"}')).toEqual({ value: { amount: 30, currency: 'EUR' } });
    expect(decode(RECEIPT, 'amount', '{"amount":8,"currency":"XYZ"}')).toBe('invalid');
    expect(decode(RECEIPT, 'amount', '30 EUR')).toBe('invalid');
    expect(decode(RECEIPT, 'amount', '{"amount":1.23456,"currency":"EUR"}')).toBe('invalid');
    expect(decode(RECEIPT, 'spent_on', '2026-10-02')).toEqual({ value: '2026-10-02' });
    expect(decode(RECEIPT, 'spent_on', '2026-02-30')).toBe('invalid');
    expect(decode(RECEIPT, 'category', 'garden')).toEqual({ value: 'garden' });
    expect(decode(RECEIPT, 'category', 'pets')).toBe('invalid');
    expect(decode(OFFER, 'company', 'Ferrowick')).toEqual({ value: 'Ferrowick' });
    expect(decode(OFFER, 'company', 'F'.repeat(201))).toBe('invalid');
    expect(decode(OFFER, 'status', 'active'), 'status reads as text').toEqual({ value: 'active' });
    expect(decode(OFFER, 'colour', 'red'), 'an undeclared key').toBe('invalid');
  });

  it('AC5 b11-number-spellings: a number is a JSON number, as the Table reads it today; nothing Number() alone would take', () => {
    for (const [raw, value] of [['42', 42], ['-3', -3], ['2.5', 2.5], ['1e3', 1000], ['1E3', 1000], ['-1.5e-2', -0.015], [' 42 ', 42],
      ['1000000000000000', 1e15], ['-1000000000000000', -1e15]] as const) expect(decode(OFFER, 'rank', raw), raw).toEqual({ value });
    for (const raw of ['+42', '01', '0x10', '.5', '5.', '1_000', '1,000', 'Infinity', 'NaN', '"42"', 'true', 'null', '42 EUR', '[42]',
      '1000000000000001', '-1000000000000001', '1e16']) expect(decode(OFFER, 'rank', raw), raw).toBe('invalid');
  });

  it('AC5 b11-money-spellings: money is one JSON object of an amount (at most 10^15, 4 decimals) and a known currency code', () => {
    const eur = (amount: number) => ({ value: { amount, currency: 'EUR' } });
    for (const [raw, value] of [['{"amount":30,"currency":"EUR"}', eur(30)], ['{ "amount": 30, "currency": "EUR" }', eur(30)],
      ['{"currency":"EUR","amount":30}', eur(30)], ['{"amount":-5.25,"currency":"EUR"}', eur(-5.25)], ['{"amount":0,"currency":"EUR"}', eur(0)],
      ['{"amount":1.2345,"currency":"EUR"}', eur(1.2345)], ['{"amount":1000000000000000,"currency":"EUR"}', eur(1e15)]] as const)
      expect(decode(RECEIPT, 'amount', raw), raw).toEqual(value);
    for (const raw of ['{"amount":"30","currency":"EUR"}', '{"amount":30}', '{"currency":"EUR"}', '{"amount":30,"currency":"eur"}',
      '{"amount":30,"currency":"XYZ"}', '{"amount":30,"currency":"EUR","note":"x"}', '{amount: 30, currency: EUR}', '30 EUR', '30',
      '{"amount":1.23456,"currency":"EUR"}', '{"amount":1000000000000001,"currency":"EUR"}', '[{"amount":30,"currency":"EUR"}]'])
      expect(decode(RECEIPT, 'amount', raw), raw).toBe('invalid');
    // One bound for written and read money: a reply cannot write an amount the engine would refuse to read.
    expect(propertyValuesOk(RECEIPT, { amount: { amount: 1e15, currency: 'EUR' } })).toBe(true);
    expect(propertyValuesOk(RECEIPT, { amount: { amount: 1000000000000001, currency: 'EUR' } }), 'over 10^15').toBe(false);
    expect(propertyValuesOk(RECEIPT, { amount: { amount: -1000000000000001, currency: 'EUR' } })).toBe(false);
  });

  it('AC5 b11-date-enum-text-spellings: dates are real calendar days; enums match exactly; text and list items stop at 200 characters', () => {
    for (const raw of ['2026-10-02', '2024-02-29', ' 2026-10-02 ']) expect(decode(RECEIPT, 'spent_on', raw), 'a value is read trimmed').toEqual({ value: raw.trim() });
    for (const raw of ['2026-10-2', '2023-02-29', '2026-13-01', '2026-10-02T00:00:00Z', '02/10/2026', '20261002', 'today'])
      expect(decode(RECEIPT, 'spent_on', raw), raw).toBe('invalid');
    expect(decode(RECEIPT, 'category', 'Garden'), 'an enum is case-sensitive').toBe('invalid');
    expect(decode(RECEIPT, 'category', ' garden ')).toEqual({ value: 'garden' });
    expect(decode(OFFER, 'company', 'F'.repeat(200))).toEqual({ value: 'F'.repeat(200) });
    expect(decode(OFFER, 'skills', `[${'s'.repeat(200)}]`)).toEqual({ value: ['s'.repeat(200)] });
    expect(decode(OFFER, 'skills', `[${'s'.repeat(201)}]`)).toBe('invalid');
    expect(decode(OFFER, 'skills', `[${Array.from({ length: 10 }, (_, i) => `s${i}`).join(', ')}]`)).toEqual({ value: Array.from({ length: 10 }, (_, i) => `s${i}`) });
  });

  it('AC5 b11-list-edges: stored list forms read through the legacy scan; an empty item or an unclosed quote is unreadable', () => {
    expect(decode(OFFER, 'skills', '[]'), 'an empty list is present and empty').toEqual({ value: [] });
    expect(decode(OFFER, 'skills', '[""]'), 'an empty item is no value').toBe('invalid');
    expect(decode(OFFER, 'skills', "['']")).toBe('invalid');
    expect(decode(OFFER, 'skills', '["a, b", c]'), 'a quoted comma stays inside its item').toEqual({ value: ['a, b', 'c'] });
    expect(decode(OFFER, 'skills', "['a, b', 'it''s']")).toEqual({ value: ['a, b', "it's"] });
    expect(decode(OFFER, 'skills', '[a, , b]'), 'a stray comma is dropped, as the legacy reader does').toEqual({ value: ['a', 'b'] });
    expect(decode(OFFER, 'skills', '["a, b]'), 'an unclosed quote').toBe('invalid');
    expect(decode(OFFER, 'skills', "[a, 'b]")).toBe('invalid');
  });

  it('AC5 b11-legacy-list-parser-unchanged: the shared scan keeps its output for every other reader', () => {
    expect(scalarList('[]')).toEqual([]);
    expect(scalarList('[""]')).toEqual(['']);
    expect(scalarList('["a, b", c]')).toEqual(['a, b', 'c']);
    expect(scalarList('[a, , b]')).toEqual(['a', 'b']);
    expect(scalarList('["a, b]')).toEqual(['"a, b']);
    expect(scalarList("[a, 'b]")).toEqual(['a', "'b"]);
  });

  it('AC6 b11-amount-text: one formatting of numbers and money for the Table and the figures', () => {
    expect(amount({ amount: 42.5, currency: 'EUR' })).toBe('€42.50');
    expect(amount({ amount: 15, currency: 'USD' })).toBe('$15');
    expect(amount({ amount: 20, currency: 'EUR' })).toBe('€20');
    expect(amount(0.333333)).toBe('0.3333');
    expect(amount(1234.5)).toBe('1,234.5');
    expect(amount(7)).toBe('7');
  });
});
