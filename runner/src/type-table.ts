/** Versioned declaration reads only; execution keeps its existing manifest writer. */
import { typeRowOk, typeTableOk, TECHNICAL_PROPERTIES } from '../../src/data/contracts/note-format';
import { BowerError, type TypeRow, type TypeTable } from '../../src/data/contracts/types';

/** TL-P4-38's eight ordered seed classifications; later planning supplies the grounded destinations. */
function seedTable(): TypeTable {
  return { v: 1, rows: ([
    ['article', ['article', 'web clip']], ['offer', ['job offer']], ['cv', ['CV']],
    ['cover-letter', ['cover letter']], ['certificate', ['certificate']], ['identity-document', ['identity document']],
    ['other-project-material', ['other project material']], ['other-area-material', ['other area material']],
  ] satisfies [string, string[]][]).map(([id, match]) => ({ id, match, template: 'source', properties: {}, table: [] })) };
}
/** Bounded tolerant reader: bad rows are skipped; an unreadable envelope grants no write that run. */
export function readTypeTable(text: string | null): { table: TypeTable; writeAllowed: boolean } {
  if (text === null) return { table: seedTable(), writeAllowed: true };
  let value: unknown;
  try { value = JSON.parse(text); }
  catch {
    // expected: an unreadable declaration uses the seed without authorizing a replacement.
    return { table: seedTable(), writeAllowed: false };
  }
  if (!value || typeof value !== 'object' || !('v' in value) || value.v !== 1
    || !('rows' in value) || !Array.isArray(value.rows)) return { table: seedTable(), writeAllowed: false };
  const seen = new Set<string>();
  const rows = value.rows.filter((row): row is TypeRow => {
    if (!typeRowOk(row) || seen.has(row.id)) return false;
    seen.add(row.id); return true;
  });
  return { table: { v: 1, rows }, writeAllowed: true };
}
export function insertTypeRow(table: TypeTable, row: TypeRow): TypeTable {
  if (!typeTableOk(table) || !typeRowOk(row) || table.rows.some((old) => old.id === row.id)) throw new BowerError('conflict', 'Bower could not add that type.');
  const index = table.rows.findIndex((old) => ['other-project-material', 'other-area-material'].includes(old.id));
  const rows = structuredClone(table.rows);
  rows.splice(index < 0 ? rows.length : index, 0, structuredClone(row));
  return { v: 1, rows };
}
/** Documents supply facts, never authority to choose columns. */
export function requestTableColumn(row: TypeRow, key: string, origin: unknown): { row: TypeRow; replaced: string | null } | null {
  if (!typeRowOk(row) || !Object.hasOwn(row.properties, key) || (TECHNICAL_PROPERTIES as readonly string[]).includes(key)
    || !origin || typeof origin !== 'object' || !('kind' in origin) || origin.kind !== 'words'
    || !('recordId' in origin) || typeof origin.recordId !== 'string' || !origin.recordId.trim()) return null;
  const next = structuredClone(row);
  if (next.table.includes(key)) return { row: next, replaced: null };
  const replaced = next.table.length === 4 ? next.table.pop() ?? null : null;
  next.table.push(key);
  return { row: next, replaced };
}
