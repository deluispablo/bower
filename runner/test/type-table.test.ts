import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isHidden } from '../../src/data/vault/layout';

// Optional exports turn an unimplemented contract into an assertion, never a load error.
// Keep the import variable: Vite must not resolve a not-yet-created module at collection.
const contractUrl = new URL('../../src/data/contracts/note-format.ts', import.meta.url);
async function contract<T>(name: string): Promise<T> {
  const path = contractUrl.href;
  const module: Record<string, unknown> = existsSync(contractUrl) ? await import(/* @vite-ignore */ path) : {};
  const value = module[name];
  expect(value, `type-table must export ${name}`).toBeTypeOf('function');
  return value as T;
}

interface Row {
  id: string;
  match: string[];
  template: string;
  properties: Record<string, { type: string; values?: string[] }>;
  table: string[];
  group_by?: { property: string; bucket?: string };
}
interface Table { v: 1; rows: Row[] }
const offer = (): Row => ({
  id: 'offer', match: ['job offer'], template: 'source',
  properties: {
    role: { type: 'text' }, skills: { type: 'list' }, hours: { type: 'number' },
    salary: { type: 'money' }, posted: { type: 'date' },
    stage: { type: 'enum', values: ['new', 'applied'] },
  },
  table: ['role', 'salary', 'posted', 'stage'], group_by: { property: 'stage' },
});
const table = (): Table => ({ v: 1, rows: [offer()] });
const values = () => ({ role: 'Developer', skills: ['TypeScript'], hours: 32,
  salary: { amount: 48000, currency: 'EUR' }, posted: '2026-10-10', stage: 'new' });
const control = (): void => {
  expect(isHidden('.bower/type-table.json')).toBe(true);
  expect(isHidden('Resources/Type table.md')).toBe(false);
};
type TableOk = (value: unknown, stored?: boolean) => boolean;
type ValuesOk = (row: Row, value: unknown) => boolean;
type Read = (text: string | null) => { table: Table; writeAllowed: boolean };

describe('type-row contracts through the declaration parser', () => {
  it('b5-table-first-create-and-lenient-read: strict new tables and bounded stored rewrites', async () => {
    const valid = await contract<TableOk>('typeTableOk');
    const stored = { ...table(), future: -1.5, rows: [{ ...offer(), extra: { ratio: 0.25 },
      properties: { ...offer().properties, hours: { type: 'number', label: 'Hours' } },
      group_by: { property: 'stage', label: 'Stage' } }] };
    expect(valid(stored)).toBe(false);
    expect(valid(stored, true)).toBe(true);
    expect(valid(table())).toBe(true);
    for (const rows of [[...stored.rows, ...stored.rows], [{ ...stored.rows[0], table: ['missing'] }],
      [{ ...stored.rows[0], properties: { hours: { type: 'not-a-type' } } }]]) {
      expect(valid({ ...stored, rows }, true)).toBe(false);
    }
  });
  it('B5a contracts: b5-row-schema-and-order', async () => {
    control();
    const read = await contract<Read>('readTypeTable');
    const valid = await contract<TableOk>('typeTableOk');
    const insert = await contract<(table: Table, row: Row) => Table>('insertTypeRow');
    expect(valid(table())).toBe(true);
    const seed = read(null).table;
    expect(seed.rows.map((row) => row.id)).toEqual([
      'article', 'offer', 'cv', 'cover-letter', 'certificate', 'identity-document',
      'other-project-material', 'other-area-material',
    ]);
    expect(valid(seed)).toBe(true);
    const accepted = { ...offer(), id: 'lease', match: ['lease'] };
    const ordered = insert(seed, accepted);
    expect(ordered.rows.map((row) => row.id)).toEqual([
      ...seed.rows.slice(0, 6).map((row) => row.id), 'lease', 'other-project-material', 'other-area-material',
    ]);
    expect(read(JSON.stringify(ordered)).table.rows.find((row) => ['other-area-material', 'lease', 'other-project-material'].includes(row.id))?.id).toBe('lease');
    expect(read(JSON.stringify(seed)).table.rows.find((row) => ['other-project-material', 'cv'].includes(row.id))?.id).toBe('cv');
    expect(read(JSON.stringify(seed)).table.rows.find((row) => row.id === 'absent') ?? null).toBeNull();
    expect(seed.rows).toHaveLength(8); // Insertion never mutates the seed.
    expect(valid({ ...table(), v: 2 })).toBe(false);
    expect(valid({ ...table(), extra: true })).toBe(false);
    expect(valid({ v: 1, rows: [offer(), offer()] })).toBe(false);
    expect(valid({ v: 1, rows: [{ ...offer(), id: 'Not a slug' }] })).toBe(false);
  });

  it('B5a contracts: strict writes and lenient invalid-row reads', async () => {
    control();
    const valid = await contract<TableOk>('typeTableOk');
    const read = await contract<Read>('readTypeTable');
    expect(valid(table())).toBe(true);
    expect(read(JSON.stringify(table()))).toEqual({ table: table(), writeAllowed: true });
    const mixed = { v: 1, rows: [offer(), { ...offer(), id: 'Invalid slug' }, { ...offer(), id: 'lease' }] };
    expect(valid(mixed)).toBe(false);
    expect(read(JSON.stringify(mixed))).toEqual({
      table: { v: 1, rows: [offer(), { ...offer(), id: 'lease' }] }, writeAllowed: true,
    });
  });

  it('B5a contracts: unreadable type table uses eight seeds and forbids a write that run', async () => {
    control();
    const read = await contract<Read>('readTypeTable');
    expect(read(JSON.stringify(table()))).toEqual({ table: table(), writeAllowed: true });
    const seed = read(null).table;
    expect(seed.rows).toHaveLength(8);
    for (const text of ['{unreadable', JSON.stringify({ v: 99, rows: [] })]) {
      expect(read(text)).toEqual({ table: seed, writeAllowed: false });
    }
  });

  it('B5a contracts: b5-four-typed-columns', async () => {
    control();
    const valid = await contract<TableOk>('typeTableOk');
    const propertyValuesOk = await contract<ValuesOk>('propertyValuesOk');
    expect(valid(table())).toBe(true);
    expect(propertyValuesOk(offer(), values())).toBe(true);
    expect(propertyValuesOk(offer(), {})).toBe(true); // Unknown facts stay absent.
    expect(valid({ v: 1, rows: [{ ...offer(), table: ['role', 'salary', 'posted', 'stage', 'hours'] }] })).toBe(false);
    for (const key of ['type', 'status', 'summary', 'tags', 'created', 'updated', 'source', 'related']) {
      const row = offer(); row.properties[key] = { type: 'text' }; row.table = [key];
      expect(valid({ v: 1, rows: [row] }), key).toBe(false);
    }
    expect(valid({ v: 1, rows: [{ ...offer(), table: ['absent'] }] })).toBe(false);
    expect(valid({ v: 1, rows: [{ ...offer(), table: ['role', 'role'] }] })).toBe(false);
    expect(propertyValuesOk(offer(), { ...values(), invented: 'fact' })).toBe(false);
  });

  const bounds: { label: string; key: string; good: unknown; bad: unknown }[] = [
    { label: 'text 200/201', key: 'role', good: 'x'.repeat(200), bad: 'x'.repeat(201) },
    { label: 'list 10/11', key: 'skills', good: Array.from({ length: 10 }, () => 'TypeScript'), bad: Array.from({ length: 11 }, () => 'TypeScript') },
    { label: 'finite number', key: 'hours', good: 32.5, bad: Infinity },
    { label: 'NaN number', key: 'hours', good: 0, bad: NaN },
    { label: 'ISO money currency', key: 'salary', good: { amount: 48000, currency: 'USD' }, bad: { amount: 48000, currency: 'ZZZ' } },
    { label: 'money missing currency', key: 'salary', good: { amount: 48000, currency: 'EUR' }, bad: { amount: 48000 } },
    { label: 'finite money amount', key: 'salary', good: { amount: 0, currency: 'EUR' }, bad: { amount: Infinity, currency: 'EUR' } },
    { label: 'ISO real date', key: 'posted', good: '2024-02-29', bad: '2026-02-29' },
    { label: 'ISO date spelling', key: 'posted', good: '2026-10-10', bad: '10/10/2026' },
    { label: 'enum membership', key: 'stage', good: 'applied', bad: 'invented' },
  ];
  it.each(bounds)('B5a contracts: typed value bound $label', async ({ key, good, bad }) => {
    control();
    const valid = await contract<ValuesOk>('propertyValuesOk');
    expect(valid(offer(), { ...values(), [key]: good })).toBe(true);
    expect(valid(offer(), { ...values(), [key]: bad })).toBe(false);
  });

  it('B5a contracts: enum declares at most twenty values and group_by is enum or date-year', async () => {
    control();
    const valid = await contract<TableOk>('typeTableOk');
    const row = offer();
    row.properties.stage = { type: 'enum', values: Array.from({ length: 20 }, (_, index) => `stage-${index}`) };
    expect(valid({ v: 1, rows: [row] })).toBe(true);
    row.properties.stage.values?.push('stage-20');
    expect(valid({ v: 1, rows: [row] })).toBe(false);
    expect(valid({ v: 1, rows: [{ ...offer(), group_by: { property: 'posted', bucket: 'year' } }] })).toBe(true);
    for (const group_by of [{ property: 'role' }, { property: 'posted', bucket: 'month' }, { property: 'missing' }]) {
      expect(valid({ v: 1, rows: [{ ...offer(), group_by }] })).toBe(false);
    }
  });

  it('B5a contracts: b5-explicit-column-replaces-fourth', async () => {
    control();
    const replace = await contract<(row: Row, key: string, origin: unknown) => { row: Row; replaced: string | null } | null>('requestTableColumn');
    const row = offer();
    expect(replace(row, 'salary', { kind: 'words', recordId: 'request-alex' })).toEqual({ row, replaced: null });
    expect(replace(row, 'hours', { kind: 'words', recordId: 'request-alex' })).toEqual({
      row: { ...row, table: ['role', 'salary', 'posted', 'hours'] }, replaced: 'stage',
    });
    expect(row.table).toEqual(['role', 'salary', 'posted', 'stage']);
    expect(replace(row, 'hours', { kind: 'document', fileId: 'source-alex' })).toBeNull();
    expect(replace(row, 'type', { kind: 'words', recordId: 'request-alex' })).toBeNull();
    expect(replace(row, 'absent', { kind: 'words', recordId: 'request-alex' })).toBeNull();
    expect(replace({ ...row, table: ['role'] }, 'hours', { kind: 'words', recordId: 'request-alex' })).toEqual({
      row: { ...row, table: ['role', 'hours'] }, replaced: null,
    });
  });
});


describe('b5-table-first-create-and-lenient-read', () => {
  it.each(['empty', 'all invalid'])('uses seeds when stored rows are %s', async (state) => {
    const read = await contract<Read>('readTypeTable');
    expect(read(JSON.stringify(table()))).toEqual({ table: table(), writeAllowed: true });
    const stored = { v: 1, rows: state === 'empty' ? [] : [{ id: 'bad' }] };
    expect(read(JSON.stringify(stored))).toEqual(read(null));
  });
  it('retains unknown stored envelope row and property keys when inserting a new accepted row', async () => {
    const read = await contract<Read>('readTypeTable');
    const insert = await contract<(table: Table, row: Row) => Table>('insertTypeRow');
    const valid = await contract<TableOk>('typeTableOk');
    const stored = { v: 1, future_envelope: { keep: 'Alex' }, rows: [{ ...offer(), future_row: 'kept',
      properties: { ...offer().properties, role: { type: 'text', future_property: 'kept' } } }] };
    expect(valid(table()), 'control strict writes accept a current declaration').toBe(true);
    expect(valid(stored), 'new writes stay closed').toBe(false);
    const readBack = read(JSON.stringify(stored));
    expect(readBack.writeAllowed).toBe(true);
    expect.soft(readBack.table).toMatchObject(stored);
    let rewritten: Table | undefined;
    expect(() => { rewritten = insert(readBack.table, { ...offer(), id: 'lease' }); }).not.toThrow();
    expect.soft(rewritten).toMatchObject({ future_envelope: { keep: 'Alex' }, rows: [stored.rows[0], { ...offer(), id: 'lease' }] });
  });
});


it('b5-explicit-column-replaces-fourth: control trusted words use the existing replacement helper', async () => {
  const replace = await contract<(row: Row, key: string, origin: unknown) => { row: Row; replaced: string | null } | null>('requestTableColumn');
  const original = offer();
  expect(replace(original, 'hours', { kind: 'words', recordId: 'alex-column-request' }))
    .toEqual({ row: { ...original, table: ['role', 'salary', 'posted', 'hours'] }, replaced: 'stage' });
  expect(replace(original, 'hours', { kind: 'document', fileId: 'SOURCE_ID' })).toBeNull();
  expect(original.table).toEqual(['role', 'salary', 'posted', 'stage']);
});
