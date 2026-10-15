/**
 * B11 views (TL-P4-48 Q1-Q2): the one closed declaration grammar, checked against the type table. A write is strict
 * (no key the grammar does not name); a read of a stored declaration ignores unknown keys at any level but refuses
 * every semantic fault (R21). A formula is checked as an installation candidate (R18).
 */
import { BOWER_KEYS, propertyDeclaration, TECHNICAL_PROPERTIES, valueOk } from './note-format';
import type { TypeRow, TypeTable } from './types';

export const VIEW_LIMITS = { bytes: 4096, nodes: 32, depth: 8, groups: 4, measures: 8, outputs: 8, perHome: 10, top: 20, values: 10, notes: 200 } as const;

export type Predicate =
  | { op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains'; property: string; value: unknown }
  | { op: 'in'; property: string; values: unknown[] }
  | { op: 'exists'; property: string }
  | { op: 'all'; of: Predicate[] }
  | { op: 'any'; of: Predicate[] }
  | { op: 'not'; of: Predicate };
export type Expression =
  | { property: string }
  | { number: number }
  | { op: '+' | '-' | '*' | '/' | 'dateDiff'; left: Expression; right: Expression }
  | { op: 'daysUntil'; value: Expression }
  | { op: 'if'; when: Predicate; then: Expression; else: Expression };
export interface AggregateView {
  v: 1; id: string; kind: 'aggregate'; title: string;
  set: { type: string; folderId: string; recursive: boolean; where?: Predicate };
  groupBy: Array<{ property: string; bucket?: 'week' | 'month' | 'quarter' | 'year' }>;
  measures: Array<{ id: string; label: string; op: string; property?: string; limit?: number }>;
}
export interface FormulaView {
  v: 1; id: string; kind: 'formula'; type: string;
  outputs: Array<{ property: string; type: 'number' | 'money' | 'date'; expr: Expression }>;
}

type Json = Record<string, unknown>;
class Refused extends Error {}
const need: (condition: unknown, sentence: string) => asserts condition = (condition, sentence) => {
  if (!condition) throw new Refused(sentence);
};
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const slug = (v: unknown): v is string => typeof v === 'string' && v.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
/** Plain text for a Markdown heading or table cell. */
const plain = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= max && !/[|<\r\n]|\[\[/.test(v);
const NUMERIC = ['number', 'money'];
const MEASURES: Record<string, readonly string[]> = {
  count: [], countValues: ['text', 'list', 'enum', 'number', 'money', 'date'], top: ['list', 'enum', 'text'],
  sum: NUMERIC, average: NUMERIC, median: NUMERIC, min: NUMERIC, max: NUMERIC, range: [...NUMERIC, 'date'], earliest: ['date'], latest: ['date'],
};
const ARITHMETIC: Record<string, Record<string, string>> = {
  '+': { 'number number': 'number', 'money money': 'money' },
  '-': { 'number number': 'number', 'money money': 'money' },
  '*': { 'number number': 'number', 'money number': 'money', 'number money': 'money' },
  '/': { 'number number': 'number', 'money number': 'money', 'money money': 'number' },
};
// Built on first use: note-format imports this module back (typeRowOk, propertyValuesOk), so its constants may not be ready yet.
let reserved: Set<string> | undefined;
const isReserved = (key: string): boolean => (reserved ??= new Set<string>(['name', 'modified', 'kind', 'folder', ...TECHNICAL_PROPERTIES, ...BOWER_KEYS])).has(key);

/**
 * The formulas installed in a row (`views`), read leniently: each computed property and the formula id that computes it.
 * The first formula wins (R48, R53): a later one with an id already seen, or listing a property already claimed, claims
 * nothing; a formula the grammar refuses still claims its id and every output it lists; an entry with no id claims nothing.
 */
export function computedBy(row: TypeRow): Map<string, { id: string; type: unknown }> {
  const views: unknown = (row as TypeRow & { views?: unknown }).views;
  const computed = new Map<string, { id: string; type: unknown }>();
  const ids = new Set<string>();
  for (const view of Array.isArray(views) ? views : []) {
    if (!isObject(view) || view.kind !== 'formula' || typeof view.id !== 'string' || ids.has(view.id)) continue;
    ids.add(view.id);
    const outputs = (Array.isArray(view.outputs) ? view.outputs : []).filter((o): o is Json & { property: string } => isObject(o) && typeof o.property === 'string');
    if (outputs.some((o) => computed.has(o.property))) continue;
    for (const output of outputs) computed.set(output.property, { id: view.id, type: output.type });
  }
  return computed;
}

/**
 * `null` when the declaration is valid against the table, else one short sentence. With no table (a suggestion, R66)
 * only its shape is checked, at every depth: keys, required fields, limits; its types wait for the install (R64).
 */
export function viewFault(definition: unknown, table: TypeTable | null, mode: 'write' | 'read' = 'write'): string | null {
  try {
    check(definition, table, mode);
    return null;
  } catch (e) {
    if (e instanceof Refused) return e.message;
    throw e;
  }
}

function check(d: unknown, table: TypeTable | null, mode: 'write' | 'read'): void {
  need(isObject(d), 'A view must be one object.');
  need(new TextEncoder().encode(JSON.stringify(d)).length <= VIEW_LIMITS.bytes, 'The view is too long.');
  const closed = (v: unknown, keys: readonly string[]): Json => {
    need(isObject(v), 'A part of the view is not an object.');
    need(mode === 'read' || Object.keys(v).every((key) => keys.includes(key)), 'The view has a key it does not know.');
    return v;
  };
  // One count and one depth for the whole tree: a condition inside an "if" continues from its expression.
  let nodes = 0;
  const node = (v: unknown, keys: readonly string[], depth: number): Json => {
    const part = closed(v, keys);
    need(++nodes <= VIEW_LIMITS.nodes, `A view has at most ${VIEW_LIMITS.nodes} parts.`);
    need(depth <= VIEW_LIMITS.depth, `A view nests at most ${VIEW_LIMITS.depth} levels.`);
    return part;
  };
  need(d.kind === 'aggregate' || d.kind === 'formula', 'The view has an unknown kind.');
  closed(d, ['v', 'id', 'kind', ...(d.kind === 'aggregate' ? ['title', 'set', 'groupBy', 'measures'] : ['type', 'outputs'])]);
  need(d.v === 1, 'The view uses an unsupported version.');
  need(slug(d.id), 'The view needs a short id of lowercase words.');
  // Without a table a row is null and a property's declaration unknown: every type check below then passes.
  const rowOf = (type: unknown): TypeRow | null => {
    if (!table) {
      need(typeof type === 'string' && type !== '', 'The view needs its type.');
      return null;
    }
    const row = table.rows.find((candidate) => candidate.id === type);
    need(row, 'The view is for a type that does not exist.');
    return row;
  };
  const declared = (row: TypeRow | null, key: unknown, computed?: Map<string, unknown>) => {
    if (!row) {
      need(typeof key === 'string' && key !== '', 'The view needs a property name.');
      return null;
    }
    const declaration = typeof key === 'string' ? propertyDeclaration(row, key) : undefined;
    need(declaration, 'The view uses a property the type does not declare.');
    need(!computed?.has(key as string), 'A formula never reads a computed property.');
    return declaration;
  };

  const predicate = (value: unknown, row: TypeRow | null, depth: number, computed?: Map<string, unknown>): void => {
    const op = isObject(value) ? value.op : undefined;
    if (op === 'all' || op === 'any' || op === 'not') {
      const p = node(value, ['op', 'of'], depth);
      if (op === 'not') need(p.of !== undefined, 'A "not" needs its condition.');
      else need(Array.isArray(p.of) && p.of.length > 0, 'A group of conditions needs at least one.');
      for (const part of op === 'not' ? [p.of] : p.of as unknown[]) predicate(part, row, depth + 1, computed);
      return;
    }
    if (op === 'exists') {
      declared(row, node(value, ['op', 'property'], depth).property, computed);
      return;
    }
    if (op === 'in') {
      const p = node(value, ['op', 'property', 'values'], depth);
      const declaration = declared(row, p.property, computed);
      need(declaration?.type !== 'list', 'Use "contains" for a list.');
      need(Array.isArray(p.values) && p.values.length > 0 && p.values.length <= VIEW_LIMITS.values, `An "in" holds 1 to ${VIEW_LIMITS.values} values.`);
      need(!declaration || p.values.every((item) => valueOk(declaration, item)), 'A condition compares with a value of another type.');
      return;
    }
    need(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains'].includes(op as string), 'The view uses an unknown condition.');
    const p = node(value, ['op', 'property', 'value'], depth);
    const declaration = declared(row, p.property, computed);
    if (!declaration) need(p.value !== undefined, 'A condition needs its value.');
    else if (op === 'contains') need(declaration.type === 'list' && valueOk({ type: 'text' }, p.value), '"contains" is for a list and one text value.');
    else {
      need(declaration.type !== 'list', 'Use "contains" for a list.');
      need(op === 'eq' || op === 'ne' || ['number', 'money', 'date'].includes(declaration.type), 'Only numbers, money and dates can be ordered.');
      need(valueOk(declaration, p.value), 'A condition compares with a value of another type.');
    }
  };

  if (d.kind === 'aggregate') {
    need(plain(d.title, 80), 'The view needs a plain title of at most 80 characters.');
    const set = closed(d.set, ['type', 'folderId', 'recursive', 'where']);
    const row = rowOf(set.type);
    need(typeof set.folderId === 'string' && set.folderId.trim() !== '', 'The view needs a folder.');
    need(typeof set.recursive === 'boolean', 'The view must say whether it counts subfolders.');
    need(Array.isArray(d.groupBy) && d.groupBy.length <= VIEW_LIMITS.groups, `A view groups by at most ${VIEW_LIMITS.groups} properties.`);
    for (const value of d.groupBy) {
      const group = node(value, ['property', 'bucket'], 0);
      const type = declared(row, group.property)?.type;
      need(type !== 'list' && type !== 'money', 'A view cannot group by a list or by money.');
      need(group.bucket === undefined || ((!row || type === 'date') && ['week', 'month', 'quarter', 'year'].includes(group.bucket as string)),
        'Only a date groups by week, month, quarter or year.');
    }
    need(Array.isArray(d.measures) && d.measures.length > 0 && d.measures.length <= VIEW_LIMITS.measures, `A view has 1 to ${VIEW_LIMITS.measures} measures.`);
    const ids = new Set<unknown>();
    const money = new Set<unknown>();
    for (const value of d.measures) {
      const measure = node(value, ['id', 'label', 'op', 'property', 'limit'], 0);
      need(slug(measure.id) && !ids.has(measure.id), 'Each measure needs its own short id.');
      ids.add(measure.id);
      need(plain(measure.label, 40), 'Each measure needs a plain label of at most 40 characters.');
      const types = MEASURES[measure.op as string];
      need(typeof measure.op === 'string' && Object.hasOwn(MEASURES, measure.op) && types, 'The view uses an unknown measure.');
      if (measure.op === 'count') need(measure.property === undefined, 'A count takes no property.');
      else {
        const type = declared(row, measure.property)?.type;
        need(type === undefined || types.includes(type), 'That measure does not fit the property\'s type.');
        if (type === 'money') money.add(measure.property);
      }
      if (measure.op === 'top') {
        need(Number.isInteger(measure.limit) && (measure.limit as number) >= 1 && (measure.limit as number) <= VIEW_LIMITS.top, `A top list shows 1 to ${VIEW_LIMITS.top} values.`);
        need(d.measures.length === 1 && d.groupBy.length === 0, 'A top list stands alone, without groups or other measures.');
      } else need(measure.limit === undefined, 'Only a top list has a limit.');
    }
    need(money.size <= 1, 'A view measures at most one kind of money.');
    if (set.where !== undefined) predicate(set.where, row, 1);
    return;
  }

  const row = rowOf(d.type);
  const computed = row ? computedBy(row) : new Map<string, { id: string; type: unknown }>();
  // Each expression's type, or undefined without a table, where no type is checked (ruling: shape only).
  const expression = (value: unknown, depth: number): string | undefined => {
    const e = isObject(value) ? value : {};
    if (!('op' in e) && 'property' in e) {
      const type = declared(row, node(value, ['property'], depth).property, computed)?.type;
      need(type === undefined || ['number', 'money', 'date'].includes(type), 'A formula reads only numbers, money and dates.');
      return type;
    }
    if (!('op' in e) && 'number' in e) {
      const { number } = node(value, ['number'], depth);
      need(typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= 1e15, 'A formula number is at most 10^15.');
      return row ? 'number' : undefined;
    }
    if (e.op === 'daysUntil') {
      const type = expression(node(value, ['op', 'value'], depth).value, depth + 1);
      need(!row || type === 'date', '"daysUntil" needs a date.');
      return row ? 'number' : undefined;
    }
    if (e.op === 'if') {
      const p = node(value, ['op', 'when', 'then', 'else'], depth);
      predicate(p.when, row, depth + 1, computed);
      const type = expression(p.then, depth + 1);
      need(expression(p.else, depth + 1) === type, 'Both sides of an "if" need the same type.');
      return type;
    }
    need(e.op === 'dateDiff' || Object.hasOwn(ARITHMETIC, e.op as string), 'The formula uses an unknown operation.');
    const p = node(value, ['op', 'left', 'right'], depth);
    const types = `${expression(p.left, depth + 1)} ${expression(p.right, depth + 1)}`;
    if (!row) return undefined;
    const type = e.op === 'dateDiff' ? (types === 'date date' ? 'number' : undefined) : ARITHMETIC[e.op as string]?.[types];
    need(type, 'The formula mixes types that do not go together.');
    return type;
  };
  need(Array.isArray(d.outputs) && d.outputs.length > 0 && d.outputs.length <= VIEW_LIMITS.outputs, `A formula computes 1 to ${VIEW_LIMITS.outputs} properties.`);
  const outputs = new Map<unknown, unknown>();
  for (const value of d.outputs) {
    const output = node(value, ['property', 'type', 'expr'], 0);
    const key = output.property;
    need(typeof key === 'string' && /^[a-z][a-z0-9_]*$/.test(key) && !isReserved(key) && !key.startsWith('bower_') && !outputs.has(key),
      'Each computed property needs its own free name.');
    outputs.set(key, output.type);
    need(['number', 'money', 'date'].includes(output.type as string), 'A computed property is a number, money or a date.');
    const by = computed.get(key);
    need(by === undefined || by.id === d.id, 'Another view already computes that property.');
    need(by !== undefined || !row || !Object.hasOwn(row.properties, key), 'A formula cannot replace a declared property.');
    const type = expression(output.expr, 1);
    need(!row || type === output.type, 'A computed property must have its formula\'s type.');
  }
  // A stored output whose type is missing or corrupt takes the candidate's type: the install repairs it (R60).
  const installed = [...computed].filter(([, by]) => by.id === d.id);
  if (installed.length) need(installed.length === outputs.size && installed.every(([key, by]) => outputs.has(key)
    && (!['number', 'money', 'date'].includes(by.type as string) || outputs.get(key) === by.type)), 'A reinstalled formula keeps its computed properties.');
}
