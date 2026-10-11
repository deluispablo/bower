/** Shared reads keep the app, Worker and runner on one declaration parser. */
import { typeRowOk, TECHNICAL_PROPERTIES } from '../../src/data/contracts/note-format';
import { BowerError, type TypeRow, type TypeTable } from '../../src/data/contracts/types';
export { readTypeTable } from '../../src/data/contracts/note-format';

export function insertTypeRow(table: TypeTable, row: TypeRow): TypeTable {
  if (!table || table.v !== 1 || !Array.isArray(table.rows) || !table.rows.every((old) => typeRowOk(old, true))
    || new Set(table.rows.map((old) => old.id)).size !== table.rows.length
    || !typeRowOk(row) || table.rows.some((old) => old.id === row.id)) throw new BowerError('conflict', 'Bower could not add that type.');
  const index = table.rows.findIndex((old) => ['other-project-material', 'other-area-material'].includes(old.id));
  const rows = structuredClone(table.rows);
  rows.splice(index < 0 ? rows.length : index, 0, structuredClone(row));
  return { ...structuredClone(table), rows };
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
