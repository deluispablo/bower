/**
 * B11 (TL-P4-38 addendum 3, TL-P4-48 Q2): the one evaluator of declared views. Pure and zero-token: it never runs
 * model code. Each evaluator first checks the declaration as a stored read against its one row (R21).
 */
import { amountText, dateOk, labelOf, propertyDeclaration, propertyValue, type Money, type PropertyValue } from '../../src/data/contracts/note-format';
import { VIEW_LIMITS, viewFault, type AggregateView, type Expression, type FormulaView, type Predicate } from '../../src/data/contracts/view-format';
import { BowerError, type TypeRow, type TypeTable } from '../../src/data/contracts/types';

export const EVALUATOR_VERSION = 1;

type Note = { id: string; properties: Record<string, string> };
type Reason = 'invalid' | 'currency' | 'not-finite' | 'division-by-zero' | 'missing';
type Group = Array<string | number | null>;
type Row = { group: Group; currency?: string; values: Record<string, unknown> };
/** One total order (R27a): wrong data first, absent data last, so a result never depends on operand order. */
const REASONS: readonly Reason[] = ['invalid', 'currency', 'not-finite', 'division-by-zero', 'missing'];
const firstReason = (reasons: Reason[]): Reason => REASONS.find((reason) => reasons.includes(reason)) ?? 'missing';
const BOUND = 1e15;
const isMoney = (v: unknown): v is Money => !!v && typeof v === 'object' && !Array.isArray(v);
/** A value's one identity, for distinct values and groups: the text of its canonical decoded value (propertyValue). */
const identity = (value: unknown): string => JSON.stringify(value);

function checked(view: unknown, row: TypeRow, kind: 'aggregate' | 'formula'): void {
  const fault = viewFault(view, { v: 1, rows: [row] }, 'read')
    ?? ((view as { kind: unknown }).kind === kind ? null : `That view is not a ${kind}.`);
  if (fault) throw new BowerError('unknown', fault);
}

/**
 * 4 decimals, half away from zero, on the number's shortest decimal text, rounded as digits (no float shift, which
 * loses the half past 2^52); a value already within 4 decimals is kept exactly; never -0.
 */
function round(x: number): number {
  const text = String(Math.abs(x));
  if (text.includes('e')) return Math.abs(x) < 1 ? 0 : x; // below 1e-6 rounds to 0; 1e21 and up has no decimals
  const [whole = '', fraction = ''] = text.split('.');
  if (fraction.length <= 4) return x + 0;
  const digits = BigInt(whole + fraction.slice(0, 4)) + (fraction[4] !== undefined && fraction[4] >= '5' ? 1n : 0n);
  return Math.sign(x) * Number(`${digits}e-4`) + 0;
}
/** Compare by Unicode code point, never by locale or UTF-16 unit. */
function byCodePoint(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) ?? 0), y = Array.from(b, (c) => c.codePointAt(0) ?? 0);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
  return x.length - y.length;
}
/** Days since 1970-01-01 of a `YYYY-MM-DD` UTC calendar day (any four-digit year). */
function dayNumber(date: string): number {
  const [year = NaN, month = NaN, day = NaN] = date.split('-').map(Number);
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  return Math.round(at.getTime() / 86_400_000);
}
function bucket(date: string, by: string | undefined): string {
  const [year = '', month = ''] = date.split('-');
  if (by === 'year') return year;
  if (by === 'month') return `${year}-${month}`;
  if (by === 'quarter') return `${year}-Q${Math.ceil(Number(month) / 3)}`;
  if (by !== 'week') return date;
  // ISO 8601: a week belongs to the year of its Thursday; 1970-01-01 was a Thursday.
  const day = dayNumber(date);
  const thursday = day - (((day + 3) % 7) + 7) % 7 + 3;
  const isoYear = new Date(thursday * 86_400_000).getUTCFullYear();
  const week = Math.floor((thursday - dayNumber(`${String(isoYear).padStart(4, '0')}-01-01`)) / 7) + 1;
  return `${String(isoYear).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;
}

/** A three-valued condition: true, false, or the reason it cannot be told. `exists` is never unknown. */
export function truth(p: Predicate, row: TypeRow, properties: Record<string, string>): boolean | Reason {
  if (p.op === 'exists') return (properties[p.property]?.trim() ?? '') !== '';
  if (p.op === 'not') {
    const inner = truth(p.of, row, properties);
    return typeof inner === 'boolean' ? !inner : inner;
  }
  if (p.op === 'in') return truth({ op: 'any', of: p.values.map((value) => ({ op: 'eq', property: p.property, value })) }, row, properties);
  if (p.op === 'all' || p.op === 'any') {
    const parts = p.of.map((part) => truth(part, row, properties));
    const decisive = p.op === 'any';
    if (parts.includes(decisive)) return decisive;
    const unknown = parts.filter((part): part is Reason => typeof part === 'string');
    return unknown.length ? firstReason(unknown) : !decisive;
  }
  const decoded = propertyValue(row, p.property, properties[p.property]);
  if (typeof decoded === 'string') return decoded;
  if (p.op === 'contains') return (decoded.value as string[]).includes(p.value as string);
  let [a, b] = [decoded.value, p.value];
  if (isMoney(a) && isMoney(b)) {
    if (a.currency !== b.currency) return 'currency';
    [a, b] = [a.amount, b.amount];
  }
  const order = typeof a === 'number' ? a - (b as number) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  return { eq: order === 0, ne: order !== 0, lt: order < 0, lte: order <= 0, gt: order > 0, gte: order >= 0 }[p.op];
}

/** Whether a note's path is in a set's folder (`''` the folder's top), its subfolders only when `recursive`. */
export const inSetFolder = (path: string, folder: string, recursive: boolean): boolean => (folder === '' ? recursive || !path.includes('/')
  : path.startsWith(`${folder}/`) && (recursive || !path.slice(folder.length + 1).includes('/')));

/** A candidate of a set (a note in its folder, never a map): its front-matter values, or null when it could not be read. */
export type SetNote = { id: string; path: string; properties: Record<string, string> | null };

/**
 * The one set membership (B11 figures, B12 R1, R5-R8): the candidates of the set's type whose `where` is true. A condition
 * that cannot be told selects nothing (`unknown` counts them); a candidate that could not be read may be a member
 * (`unread` counts them). Members in the set's order: a real `created` date newest first, none last, then path by code
 * point, then id (TL-P4-52 Q2).
 */
export function setMembers(set: { type: string; where?: Predicate }, row: TypeRow, notes: readonly SetNote[]): { members: string[]; unknown: number; unread: number } {
  let unknown = 0;
  let unread = 0;
  const chosen: Array<{ id: string; path: string; created: string }> = [];
  for (const note of notes) {
    if (note.properties === null) { unread++; continue; }
    if (note.properties.type !== set.type) continue;
    const t = set.where ? truth(set.where, row, note.properties) : true;
    if (typeof t === 'string') unknown++;
    else if (t) chosen.push({ id: note.id, path: note.path, created: dateOk(note.properties.created ?? '') ? note.properties.created ?? '' : '' });
  }
  chosen.sort((a, b) => byCodePoint(b.created, a.created) || byCodePoint(a.path, b.path) || byCodePoint(a.id, b.id));
  return { members: chosen.map((c) => c.id), unknown, unread };
}

export function evaluateAggregate(view: unknown, row: TypeRow, notes: Note[]) {
  checked(view, row, 'aggregate');
  const v = view as AggregateView;
  let selected = 0, excluded = 0, unknown = 0;
  const chosen: Note[] = [];
  for (const note of notes) {
    const t = v.set.where ? truth(v.set.where, row, note.properties) : true;
    if (t === true) {
      selected++;
      chosen.push(note);
    } else if (t === false) excluded++;
    else unknown++;
  }
  const unavailable: Record<string, { missing: number; invalid: number }> = {};
  for (const measure of v.measures) if (measure.property !== undefined) unavailable[measure.id] = { missing: 0, invalid: 0 };
  const overflow = new Set<string>();
  /** A measure's readable value on a note; a missing or unreadable one is counted for that measure. */
  const read = (measure: AggregateView['measures'][number], note: Note): PropertyValue | undefined => {
    const decoded = propertyValue(row, measure.property ?? '', note.properties[measure.property ?? '']);
    if (typeof decoded === 'object') return decoded.value;
    const counts = unavailable[measure.id];
    if (counts) counts[decoded]++;
    return undefined;
  };
  const result = (rows: Row[]) => ({ selected, excluded, unknown, rows, unavailable, ...(overflow.size ? { overflow: [...overflow].sort() } : {}) });

  const [top] = v.measures;
  if (top?.op === 'top') {
    // A value counts once per note.
    const tally = new Map<string, number>();
    for (const note of chosen) {
      const value = read(top, note);
      if (value !== undefined) for (const item of new Set(Array.isArray(value) ? value : [value as string])) tally.set(item, (tally.get(item) ?? 0) + 1);
    }
    return result([...tally].sort(([a, x], [b, y]) => y - x || byCodePoint(a, b)).slice(0, top.limit)
      .map(([value, count]) => ({ group: [value], values: { [top.id]: count } })));
  }

  // Money partitions rows only as a measure property (R23); a note without readable money is in no row.
  const money = v.measures.find((m) => m.property !== undefined && propertyDeclaration(row, m.property)?.type === 'money')?.property;
  const rows = new Map<string, { group: Group; currency?: string; notes: Note[] }>();
  for (const note of chosen) {
    let currency: string | undefined;
    if (money !== undefined) {
      const decoded = propertyValue(row, money, note.properties[money]);
      if (typeof decoded === 'string') {
        for (const measure of v.measures) if (measure.property === money) read(measure, note);
        continue;
      }
      currency = (decoded.value as Money).currency;
    }
    const group = v.groupBy.map((g): string | number | null => {
      const decoded = propertyValue(row, g.property, note.properties[g.property]);
      if (typeof decoded === 'string') return null;
      return typeof decoded.value === 'string' && propertyDeclaration(row, g.property)?.type === 'date' ? bucket(decoded.value, g.bucket) : decoded.value as string | number;
    });
    const key = identity([group, currency ?? null]);
    const entry = rows.get(key) ?? { group, ...(currency === undefined ? {} : { currency }), notes: [] };
    entry.notes.push(note);
    rows.set(key, entry);
  }
  // An ungrouped view without money always has its one row; otherwise a row exists only for what is present (R27).
  if (money === undefined && !v.groupBy.length && !rows.size) rows.set('', { group: [], notes: [] });
  const compare = (a: Group, b: Group): number => {
    for (let i = 0; i < a.length; i++) {
      const x = a[i] ?? null, y = b[i] ?? null;
      if (x === y) continue;
      if (x === null || y === null) return x === null ? 1 : -1;
      return typeof x === 'number' && typeof y === 'number' ? x - y : byCodePoint(String(x), String(y));
    }
    return 0;
  };
  const measureOf = (measure: AggregateView['measures'][number], members: Note[]): unknown => {
    if (measure.op === 'count') return members.length;
    const values = members.map((note) => read(measure, note)).filter((value) => value !== undefined);
    if (measure.op === 'countValues') return new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).map(identity)).size;
    if (!values.length) return null;
    if (typeof values[0] === 'string') {
      const days = (values as string[]).sort();
      const [earliest = '', latest = ''] = [days[0], days[days.length - 1]];
      return measure.op === 'earliest' ? earliest : measure.op === 'latest' ? latest : { min: earliest, max: latest };
    }
    // Sorted first, so the order of the notes never changes a float sum.
    const amounts = values.map((value) => isMoney(value) ? value.amount : value as number).sort((a, b) => a - b);
    const currency = isMoney(values[0]) ? values[0].currency : undefined;
    const out = (n: number) => currency === undefined ? round(n) : { amount: round(n), currency };
    const sum = amounts.reduce((total, n) => total + n, 0);
    const middle = amounts.length / 2;
    const at = (i: number) => amounts[i] ?? 0;
    switch (measure.op) {
      case 'sum':
        if (Math.abs(sum) <= BOUND) return out(sum);
        overflow.add(measure.id);
        return null;
      case 'average': return out(sum / amounts.length);
      case 'median': return out(Number.isInteger(middle) ? (at(middle - 1) + at(middle)) / 2 : at(Math.floor(middle)));
      case 'min': return out(at(0));
      case 'max': return out(at(amounts.length - 1));
      default: return { min: out(at(0)), max: out(at(amounts.length - 1)) };
    }
  };
  return result([...rows.values()]
    .sort((a, b) => compare(a.group, b.group) || byCodePoint(a.currency ?? '', b.currency ?? ''))
    .map(({ notes: members, ...row }) => ({ ...row, values: Object.fromEntries(v.measures.map((m) => [m.id, measureOf(m, members)])) })));
}

/**
 * A Bower map's stored `bower_views` line, read leniently (R21, R33): its aggregates in order. A line that is not a
 * JSON list computes none; inside it each non-object, refused view, formula, duplicate id or entry past the tenth is
 * skipped alone. Every skip is logged.
 */
export function storedViews(line: string, table: TypeTable): AggregateView[] {
  const skip = (why: string): void => console.error(new BowerError('unknown', 'Bower skipped a figure it could not read.', undefined, { cause: why }));
  let list: unknown;
  try {
    list = JSON.parse(line);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    skip(error.message);
    return [];
  }
  if (!Array.isArray(list)) {
    skip('The figures declaration is not a list.');
    return [];
  }
  const views: AggregateView[] = [];
  list.forEach((entry: unknown, i) => {
    const fault = i >= VIEW_LIMITS.perHome ? 'A map holds at most ten figures.' : viewFault(entry, table, 'read')
      ?? ((entry as AggregateView).kind !== 'aggregate' ? 'A map holds aggregates only.'
        : views.some((v) => v.id === (entry as AggregateView).id) ? 'Two figures have one id.' : null);
    if (fault) skip(fault);
    else views.push(entry as AggregateView);
  });
  return views;
}

/** One figure cell (R30): a stored value never breaks the table, makes a link or forms ownership-marker text. */
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '\\': '\\\\', '|': '\\|', '[': '\\[' };
const cellText = (text: string): string => text.replace(/[&<\\|[]|\r\n|\r|\n/g, (c) => ESCAPES[c] ?? ' ');
function cell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object' && 'min' in value && 'max' in value) return `${cell(value.min)} to ${cell(value.max)}`;
  if (typeof value === 'number' || isMoney(value)) return amountText(value);
  return cellText(String(value));
}
const notes = (n: number): string => `${n} ${n === 1 ? 'note' : 'notes'}`;

/**
 * B11 AC11: a map's Figures block for one aggregate. The 200 bound counts the members before `where` and wins over
 * an unreadable member; never a partial total.
 */
export function viewBlock(view: unknown, row: TypeRow, members: Note[] | 'unreadable'): string {
  checked(view, row, 'aggregate');
  const v = view as AggregateView;
  const head = `### ${v.title}\n\n`;
  if (members !== 'unreadable' && members.length > VIEW_LIMITS.notes) return `${head}Not computed: more than ${VIEW_LIMITS.notes} notes.\n`;
  if (members === 'unreadable') return `${head}Not computed: a note could not be read.\n`;
  const result = evaluateAggregate(v, row, members);
  const lines = v.measures.flatMap((m) => {
    const counts = result.unavailable[m.id];
    const name = labelOf(m.property ?? '').toLowerCase();
    const parts = [...counts?.missing ? [`${notes(counts.missing)} with no ${name}`] : [], ...counts?.invalid ? [`${notes(counts.invalid)} with an unreadable ${name}`] : []];
    return parts.length ? [`Not counted in ${m.label}: ${parts.join(', ')}.`] : [];
  });
  for (const id of result.overflow ?? []) lines.push(`Not computed in ${v.measures.find((m) => m.id === id)?.label ?? id}: too large to show.`);
  if (result.unknown) lines.push(`Left out: ${notes(result.unknown)} whose details could not be checked.`);
  const money = result.rows.some((r) => r.currency !== undefined);
  const labels = [...v.measures[0]?.op === 'top' ? [labelOf(v.measures[0].property ?? '')] : v.groupBy.map((g) => labelOf(g.property)),
    ...money ? ['Currency'] : [], ...v.measures.map((m) => m.label)];
  const line = (cells: string[]): string => `| ${cells.join(' | ')} |\n`;
  const table = result.rows.length ? line(labels) + line(labels.map(() => '---'))
    + result.rows.map((r) => line([...r.group.map(cell), ...money ? [cell(r.currency)] : [], ...v.measures.map((m) => cell(r.values[m.id]))])).join('')
    : 'Nothing to show yet.\n';
  return head + table + (lines.length ? `\n${lines.map((l) => `${l}\n`).join('')}` : '');
}

type Computed = { value: number | Money | string } | Reason;
/** Exact intermediates, each finite and within 10^15; only the taken branch of an `if` is computed. */
function compute(e: Expression, row: TypeRow, properties: Record<string, string>, asOf: string): Computed {
  // Dispatch on `op` first, as the grammar does, so an ignored extension key never changes a result (AC8a).
  if (!('op' in e)) {
    if ('property' in e) {
      const decoded = propertyValue(row, e.property, properties[e.property]);
      return typeof decoded === 'string' ? decoded : { value: decoded.value as number | Money | string };
    }
    return { value: e.number };
  }
  const bounded = (n: number, currency?: string): Computed =>
    !Number.isFinite(n) || Math.abs(n) > BOUND ? 'not-finite' : { value: currency === undefined ? n : { amount: n, currency } };
  if (e.op === 'if') {
    const t = truth(e.when, row, properties);
    return typeof t === 'string' ? t : compute(t ? e.then : e.else, row, properties, asOf);
  }
  if (e.op === 'daysUntil') {
    const date = compute(e.value, row, properties, asOf);
    return typeof date === 'string' ? date : bounded(dayNumber(date.value as string) - dayNumber(asOf));
  }
  const left = compute(e.left, row, properties, asOf), right = compute(e.right, row, properties, asOf);
  if (typeof left === 'string' || typeof right === 'string') return firstReason([left, right].filter((side): side is Reason => typeof side === 'string'));
  if (e.op === 'dateDiff') return bounded(dayNumber(left.value as string) - dayNumber(right.value as string));
  const a = left.value, b = right.value;
  if (isMoney(a) && isMoney(b) && a.currency !== b.currency) return 'currency';
  const x = isMoney(a) ? a.amount : a as number, y = isMoney(b) ? b.amount : b as number;
  if (e.op === '/' && y === 0) return 'division-by-zero';
  const currency = e.op === '/' && isMoney(a) && isMoney(b) ? undefined : isMoney(a) ? a.currency : isMoney(b) ? b.currency : undefined;
  return bounded(e.op === '+' ? x + y : e.op === '-' ? x - y : e.op === '*' ? x * y : x / y, currency);
}

/**
 * A type row's stored formulas, read leniently (R21, R47, R48, R53): each valid formula in order. A non-object, a
 * refused formula, an aggregate, an id seen before or a property an earlier formula claims is skipped alone and logged.
 */
export function storedFormulas(row: TypeRow): FormulaView[] {
  const views: unknown = (row as TypeRow & { views?: unknown }).views;
  const ids = new Set<unknown>();
  return (Array.isArray(views) ? views : []).flatMap((entry: unknown) => {
    const id = entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined;
    const fault = ids.has(id) ? 'Two formulas have one id.' : viewFault(entry, { v: 1, rows: [row] }, 'read')
      ?? ((entry as FormulaView).kind !== 'formula' ? 'A type holds formulas only.' : null);
    if (typeof id === 'string') ids.add(id);
    if (!fault) return [entry as FormulaView];
    console.error(new BowerError('unknown', 'Bower skipped a computed property it could not read.', undefined, { cause: fault }));
    return [];
  });
}

/** One formula over a type's notes (B11 AC29): each note's outputs by id; `'over'` past 200 notes, so none is written. */
export function evaluateFormulas(view: unknown, row: TypeRow, notes: Note[], asOf: string): Record<string, ReturnType<typeof evaluateFormula>> | 'over' {
  if (notes.length > VIEW_LIMITS.notes) return 'over';
  return Object.fromEntries(notes.map((note) => [note.id, evaluateFormula(view, row, note.properties, asOf)]));
}

export function evaluateFormula(view: unknown, row: TypeRow, properties: Record<string, string>, asOf: string) {
  checked(view, row, 'formula');
  return Object.fromEntries((view as FormulaView).outputs.map((output) => {
    const result = compute(output.expr, row, properties, asOf);
    if (typeof result === 'string') return [output.property, { unavailable: result }];
    const value = result.value;
    return [output.property, { value: typeof value === 'number' ? round(value) : isMoney(value) ? { ...value, amount: round(value.amount) } : value }];
  }));
}
