/**
 * Compare (issue #612, spec §6.6 R-COMP-1 to R-COMP-6, boards
 * `Phone-Folder-Compare` and `Desktop-Compare`): notes of the same kind
 * lined up from their frontmatter, without AI. Everything here is pure: the
 * kinds a folder can compare, the columns and their order, the sort, the
 * filter chips and the sentences the two boards draw. The view is
 * `components/compare.tsx`.
 */

import { formatFieldValue, kindById, KINDS, statusLabel } from './kinds.js';
import type { Kind, KindField } from './kinds.js';
import type { NoteOrigin } from './note-meta.js';
import { findKeyLine, splitFrontmatter } from './markdown/frontmatter.js';
import { BOOKKEEPING_KEYS, humaniseKey } from './components/details.js';

/** One note of a folder as Compare reads it. */
export interface CompareNote {
  id: string;
  /** The file name, `Kentish Town, 2 bed.md`. */
  name: string;
  /** Drive's `modifiedTime`, `null` when unknown. */
  modifiedTime: string | null;
  /** The frontmatter `kind` id. */
  kind: string;
  /** Every frontmatter field, raw. */
  fields: Record<string, unknown>;
  bowerOrigins: Readonly<Record<string, NoteOrigin>>;
}

/** The note's title: its file name without the `.md`. */
export function noteTitle(note: Pick<CompareNote, 'name'>): string {
  return note.name.replace(/\.md$/i, '');
}

/** The part of a title before its first comma: "Kentish Town, 2 bed" is
 * "Kentish Town". */
export function shortTitle(note: Pick<CompareNote, 'name'>): string {
  const title = noteTitle(note);
  const comma = title.indexOf(',');
  return comma === -1 ? title : title.slice(0, comma);
}

/** The notes whose kind is `kind`. */
export function notesOfKind(
  notes: readonly CompareNote[],
  kind: Kind,
): CompareNote[] {
  return notes.filter((note) => note.kind === kind.id);
}

/**
 * The kinds a folder can compare (R-COMP-1): kinds with two or more notes
 * whose `compare` is `table`, `by-month` (receipts, #615) or `timeline`
 * (bookings, #615). Contracts never compare. Most notes first, then the
 * kinds' own order.
 */
export function compareKinds(notes: readonly CompareNote[]): Kind[] {
  return KINDS.filter(
    (kind) =>
      (kind.compare === 'table' ||
        kind.compare === 'by-month' ||
        kind.compare === 'timeline') &&
      notesOfKind(notes, kind).length >= 2,
  ).sort(
    (a, b) =>
      notesOfKind(notes, b).length - notesOfKind(notes, a).length ||
      KINDS.indexOf(a) - KINDS.indexOf(b),
  );
}

// --- Columns ---------------------------------------------------------------

/** The id of the first column, the note's own name. */
export const TITLE_COLUMN = 'title';
/** The id of the last column, the note's status. */
export const STATUS_COLUMN = 'status';

export interface CompareColumn {
  /** `title`, a field key or `status`. */
  id: string;
  label: string;
  /** Present for a field column. */
  field?: KindField;
}

const TITLE_LABELS: Readonly<Record<string, string>> = {
  'rental-listing': 'Listing',
  'job-offer': 'Offer',
  bill: 'Bill',
  payslip: 'Payslip',
  recipe: 'Recipe',
};

/** How many extra numeric columns Compare adds after the kind's own
 * (R-CMP-6, T12). The score column is not one of them. */
export const MAX_EXTRA_COLUMNS = 3;

/** The heading of the score column (R-CMP-2). */
export const SCORE_LABEL = 'Your score';

/** The `group` of the score column's field: how the cell knows to read
 * "79/100". */
const SCORE_GROUP = 'score';

function numberField(key: string, label: string, group = ''): KindField {
  return { key, label, type: 'number', group };
}

/** Whether a number sits under `key` in at least half of `notes`. */
function presentInHalf(notes: readonly CompareNote[], key: string): boolean {
  if (notes.length === 0) return false;
  const count = notes.filter(
    (note) => numberOf(note.fields[key]) !== null,
  ).length;
  return count * 2 >= notes.length;
}

/**
 * The columns Compare adds to the kind's own (R-CMP-2, R-CMP-3, R-CMP-6):
 * "Your score" first when the notes carry a numeric `score` (or a `fit` the
 * kind has no column for), then up to three more numeric frontmatter keys
 * present in at least half the notes, in the order they first appear,
 * labelled by `humaniseKey`. Bookkeeping keys and the kind's own fields are
 * never extra columns.
 */
export function extraColumns(
  kind: Kind,
  notes: readonly CompareNote[],
): CompareColumn[] {
  const columns: CompareColumn[] = [];
  const own = new Set(kind.fields.map((field) => field.key));
  const scoreKey = ['score', 'fit'].find(
    (key) =>
      (key === 'score' || !kind.compareFields.includes(key)) &&
      presentInHalf(notes, key),
  );
  if (scoreKey !== undefined) {
    columns.push({
      id: scoreKey,
      label: SCORE_LABEL,
      field: numberField(scoreKey, SCORE_LABEL, SCORE_GROUP),
    });
  }
  const seen: string[] = [];
  for (const note of notes) {
    for (const key of Object.keys(note.fields)) {
      if (!seen.includes(key)) seen.push(key);
    }
  }
  let extras = 0;
  for (const key of seen) {
    if (extras >= MAX_EXTRA_COLUMNS) break;
    if (key === 'score' || key === 'fit') continue;
    if (own.has(key) || BOOKKEEPING_KEYS.has(key) || key.endsWith('_note')) {
      continue;
    }
    if (!presentInHalf(notes, key)) continue;
    columns.push({
      id: key,
      label: humaniseKey(key),
      field: numberField(key, humaniseKey(key)),
    });
    extras += 1;
  }
  return columns;
}

/** The score column among `extras`, when there is one. */
function scoreColumn(
  extras: readonly CompareColumn[],
): CompareColumn | undefined {
  return extras.find((column) => column.field?.group === SCORE_GROUP);
}

/** The kind's columns in their default order: the title, "Your score" when
 * there is one, the compare fields, the other extra columns, then Status
 * when the kind has statuses. */
export function defaultColumnIds(
  kind: Kind,
  extras: readonly CompareColumn[] = [],
): string[] {
  const score = scoreColumn(extras);
  return [
    TITLE_COLUMN,
    ...(score === undefined ? [] : [score.id]),
    ...kind.compareFields,
    ...extras.filter((column) => column !== score).map((column) => column.id),
    ...(kind.statuses.length > 0 ? [STATUS_COLUMN] : []),
  ];
}

/** `stored` applied to the kind's default order: the ids it still knows, in
 * its order, then any column it does not mention. The title stays first. */
export function orderedColumnIds(
  kind: Kind,
  stored: readonly string[] | undefined,
  extras: readonly CompareColumn[] = [],
): string[] {
  const defaults = defaultColumnIds(kind, extras);
  if (stored === undefined) return defaults;
  const movable = defaults.filter((id) => id !== TITLE_COLUMN);
  const kept = stored.filter((id) => movable.includes(id));
  const rest = movable.filter((id) => !kept.includes(id));
  return [TITLE_COLUMN, ...new Set(kept), ...rest];
}

/** Column headings that differ from the field's label (R-FOLD-6: the job
 * offer's "Office" reads "Where" here, as the boards draw it). */
const COLUMN_LABELS: Readonly<Record<string, string>> = {
  'job-offer:office': 'Where',
};

/** The columns of `kind` in `order` (or the default order), with the
 * `extras` of `extraColumns`. */
export function compareColumns(
  kind: Kind,
  order?: readonly string[],
  extras: readonly CompareColumn[] = [],
): CompareColumn[] {
  const columns: CompareColumn[] = [];
  for (const id of orderedColumnIds(kind, order, extras)) {
    if (id === TITLE_COLUMN) {
      columns.push({ id, label: TITLE_LABELS[kind.id] ?? 'Note' });
    } else if (id === STATUS_COLUMN) {
      columns.push({ id, label: 'Status' });
    } else {
      const extra = extras.find((column) => column.id === id);
      if (extra !== undefined) {
        columns.push(extra);
        continue;
      }
      const field = kind.fields.find((candidate) => candidate.key === id);
      if (field === undefined) continue;
      columns.push({
        id,
        label:
          field.compareLabel ??
          COLUMN_LABELS[`${kind.id}:${field.key}`] ??
          field.label,
        field,
      });
    }
  }
  return columns;
}

/** `order` with the column `id` moved one place left or right; the title
 * never moves and nothing moves past it. */
export function moveColumn(
  order: readonly string[],
  id: string,
  direction: 'left' | 'right',
): string[] {
  const next = [...order];
  const from = next.indexOf(id);
  const to = direction === 'left' ? from - 1 : from + 1;
  if (from < 1 || to < 1 || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved ?? id);
  return next;
}

/** `order` with the column `id` dropped where `target` is. */
export function dropColumn(
  order: readonly string[],
  id: string,
  target: string,
): string[] {
  if (id === target || id === TITLE_COLUMN || target === TITLE_COLUMN) {
    return [...order];
  }
  const next = order.filter((column) => column !== id);
  const at = next.indexOf(target);
  if (at === -1) return [...order];
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  next.splice(from < to ? at + 1 : at, 0, id);
  return next;
}

// --- Values, sorting ---------------------------------------------------------

/** What a date cell says when the note has no readable date. */
export const NO_DATE = 'No date';

/** The cell's text: the title, the status the way Details says it, or the
 * field formatted as the boards draw it. */

export function cellText(
  kind: Kind,
  note: CompareNote,
  column: CompareColumn,
): string {
  if (column.id === TITLE_COLUMN) return noteTitle(note);
  if (column.id === STATUS_COLUMN) return statusLabel(kind, note.fields);
  if (column.field === undefined) return '';
  if (column.field.group === SCORE_GROUP) {
    const score = numberOf(note.fields[column.id]);
    return score === null ? '' : `${Math.round(score)}/100`;
  }
  const text = formatFieldValue(column.field, note.fields[column.id]);
  return text === '' && column.field.type === 'date' ? NO_DATE : text;
}

/** A number out of "£2,150", "22 min", "−10 %" or 81, `null` when the value
 * does not start with one. */
export function numberOf(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const match = /^\s*([+\-−]?)\s*[£€$]?\s*(\d[\d,]*(?:\.\d+)?)/.exec(raw);
  if (match === null) return null;
  const value = Number((match[2] ?? '').replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return match[1] === '-' || match[1] === '−' ? -value : value;
}

/** A `YYYY-MM-DD` or `YYYY-MM` date (or a `Date`) as a UTC timestamp,
 * `null` for anything else ("Now"). */
export function dateOf(raw: unknown): number | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.getTime();
  }
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(raw.trim());
  if (match === null) return null;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    match[3] === undefined ? 1 : Number(match[3]),
  );
}

export interface CompareSort {
  column: string;
  direction: 'asc' | 'desc';
}

/** Your score, best first; else fit, best first; a kind with neither sorts
 * by its first field. */
export function defaultSort(
  kind: Kind,
  extras: readonly CompareColumn[] = [],
): CompareSort {
  const score = scoreColumn(extras);
  if (score !== undefined) return { column: score.id, direction: 'desc' };
  if (kind.compareFields.includes('fit')) {
    return { column: 'fit', direction: 'desc' };
  }
  return {
    column: kind.compareFields[0] ?? TITLE_COLUMN,
    direction: 'asc',
  };
}

/** The direction a column sorts in when first picked: scores and fit best
 * first, everything else A to Z, smallest or soonest first. */
export function firstDirection(
  column: string,
  extras: readonly CompareColumn[] = [],
): 'asc' | 'desc' {
  return column === 'fit' || column === scoreColumn(extras)?.id
    ? 'desc'
    : 'asc';
}

type SortValue = number | string | null;

function sortValue(
  kind: Kind,
  note: CompareNote,
  column: string,
  extras: readonly CompareColumn[],
): SortValue {
  if (extras.some((candidate) => candidate.id === column)) {
    return numberOf(note.fields[column]);
  }
  if (column === TITLE_COLUMN) return noteTitle(note).toLowerCase();
  if (column === STATUS_COLUMN) {
    const index = kind.statuses.indexOf(statusValue(note));
    return index === -1 ? null : index;
  }
  const field = kind.fields.find((candidate) => candidate.key === column);
  const raw = note.fields[column];
  if (field === undefined || raw === undefined || raw === '') return null;
  if (field.type === 'date') return dateOf(raw);
  if (field.type === 'money' || field.type === 'number') return numberOf(raw);
  // Text that starts with a number ("22 min") sorts as that number.
  return numberOf(raw) ?? formatFieldValue(field, raw).toLowerCase();
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, 'en', { numeric: true });
  }
  // A number before text in a mixed column.
  return typeof a === 'number' ? -1 : 1;
}

/**
 * `notes` ordered by `sort`. A note with nothing in the column goes last
 * whichever way it sorts; ties fall back to the kind's first field, then the
 * title.
 */
export function sortNotes(
  kind: Kind,
  notes: readonly CompareNote[],
  sort: CompareSort,
  extras: readonly CompareColumn[] = [],
): CompareNote[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const first = kind.compareFields[0] ?? TITLE_COLUMN;
  return [...notes].sort((a, b) => {
    for (const column of [sort.column, first, TITLE_COLUMN]) {
      const left = sortValue(kind, a, column, extras);
      const right = sortValue(kind, b, column, extras);
      if (left === null && right === null) continue;
      if (left === null) return 1;
      if (right === null) return -1;
      const order = compareValues(left, right);
      if (order !== 0) return column === sort.column ? sign * order : order;
    }
    return 0;
  });
}

// --- The phone's Sort sheet (R-CMP-1) ---------------------------------------

/** How a column's values read when ordered: numbers and statuses high or
 * low first, text A to Z, dates soonest first. */
export type SortStyle = 'number' | 'text' | 'date';

export function sortStyle(column: CompareColumn): SortStyle {
  if (column.id === TITLE_COLUMN) return 'text';
  if (column.id === STATUS_COLUMN) return 'number';
  const type = column.field?.type;
  if (type === 'date') return 'date';
  if (type === 'money' || type === 'number') return 'number';
  return 'text';
}

/** The two direction labels of a style, by the direction they sort in. */
export function directionLabels(style: SortStyle): {
  asc: string;
  desc: string;
} {
  if (style === 'text') return { asc: 'A to Z', desc: 'Z to A' };
  if (style === 'date') return { asc: 'Soonest first', desc: 'Latest first' };
  return { asc: 'Low first', desc: 'High first' };
}

/** The Sort button's text: "Sort: Your score, high first". */
export function sortButtonText(
  column: CompareColumn,
  direction: 'asc' | 'desc',
): string {
  const text = directionLabels(sortStyle(column))[direction];
  const lower = /^[AZ] to/.test(text)
    ? text
    : text.charAt(0).toLowerCase() + text.slice(1);
  return `Sort: ${column.label}, ${lower}`;
}

/** The last word of a kind's plural or singular, for "Show 4 offers". */
export function offerWord(kind: Kind, count: number): string {
  const words = (count === 1 ? kind.name : kind.plural).split(' ');
  return words[words.length - 1] ?? '';
}

// --- Filter chips ----------------------------------------------------------

export interface FilterChip {
  id: string;
  /** "Under £2,300", "Free before 1 Dec". */
  label: string;
  /** The field the chip reads. */
  field: string;
  op: 'under' | 'before';
  /** A number, or a UTC timestamp for `before`. */
  limit: number;
  /** How the limit reads in "X is over £2,300" / "X is free from 1 Dec". */
  limitText: string;
}

/** The step a limit is rounded to: 100 for 2,150, 1,000 for 55,000. */
function stepOf(value: number): number {
  return 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(value) || 1)) - 1);
}

function moneyText(value: number): string {
  return '£' + value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function dayText(timestamp: number): string {
  return formatFieldValue(
    { key: '', label: '', type: 'date', group: '' },
    new Date(timestamp),
  );
}

/**
 * The filter chips for `notes` of `kind` (R-COMP-3): "Under £X" for each
 * money field and "<label> before <day>" for each date field, from numeric
 * and date fields among the columns. A chip is offered only when it would
 * hide some notes and keep others.
 */
export function filterChips(
  kind: Kind,
  notes: readonly CompareNote[],
): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const key of kind.compareFields) {
    const field = kind.fields.find((candidate) => candidate.key === key);
    if (field === undefined) continue;
    if (field.type === 'money') {
      const values = notes
        .map((note) => numberOf(note.fields[key]))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b);
      const second = values[values.length - 2];
      if (second === undefined) continue;
      const step = stepOf(second);
      const limit = Math.ceil((second * 1.05) / step) * step;
      const chip: FilterChip = {
        id: `${key}-under`,
        label: `Under ${moneyText(limit)}`,
        field: key,
        op: 'under',
        limit,
        limitText: moneyText(limit),
      };
      if (splitByChip(notes, chip).hidden.length > 0) chips.push(chip);
    } else if (field.type === 'date') {
      const days = notes
        .map((note) => dateOf(note.fields[key]))
        .filter((value): value is number => value !== null);
      if (days.length < 2) continue;
      const limit = Math.max(...days);
      const dayLabel = dayText(limit);
      const chip: FilterChip = {
        id: `${key}-before`,
        label:
          key === 'available'
            ? `Free before ${dayLabel}`
            : `${field.label} before ${dayLabel}`,
        field: key,
        op: 'before',
        limit,
        limitText: dayLabel,
      };
      if (splitByChip(notes, chip).hidden.length > 0) chips.push(chip);
    }
  }
  return chips;
}

/** Whether `note` passes `chip`. A missing or unreadable value passes: a
 * note is never hidden for what Bower did not read. */
export function passesChip(note: CompareNote, chip: FilterChip): boolean {
  const raw = note.fields[chip.field];
  if (chip.op === 'under') {
    const value = numberOf(raw);
    return value === null || value <= chip.limit;
  }
  const value = dateOf(raw);
  return value === null || value < chip.limit;
}

function splitByChip(
  notes: readonly CompareNote[],
  chip: FilterChip,
): { shown: CompareNote[]; hidden: CompareNote[] } {
  return applyFilters(notes, [chip]);
}

/** The notes that pass every chip in `active`, and the ones that do not. */
export function applyFilters(
  notes: readonly CompareNote[],
  active: readonly FilterChip[],
): { shown: CompareNote[]; hidden: CompareNote[] } {
  const shown: CompareNote[] = [];
  const hidden: CompareNote[] = [];
  for (const note of notes) {
    (active.every((chip) => passesChip(note, chip)) ? shown : hidden).push(
      note,
    );
  }
  return { shown, hidden };
}

// --- Sentences -------------------------------------------------------------

const NUMBER_WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/** "four" for 4, digits above ten. */
export function countWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** The phone's explainer (board `Phone-Folder-Compare`). */
export function phoneExplainer(kind: Kind, count: number): string {
  const facts = kind.compareFields
    .slice(0, 4)
    .map((key) => kind.fields.find((field) => field.key === key))
    .filter((field): field is KindField => field !== undefined)
    .map((field) => field.label.toLowerCase())
    .join(', ');
  return (
    `You saved ${countWord(count)} ${kind.plural} here. Bower read the same ` +
    `things from each one (${facts}), so they line up side by side. This ` +
    'tab appears when a folder holds two or more of the same kind.'
  );
}

/** The desktop's explainer (board `Desktop-Compare`). */
export function desktopExplainer(kind: Kind, count: number): string {
  return (
    `You saved ${countWord(count)} ${kind.plural} in this folder. Bower read ` +
    'the same details from each one, so they line up as a table: sort by ' +
    `any column, filter, and open a row to see the ${kind.name}.`
  );
}

/** The line under the phone cards when a filter fades some: "Kentish Town is
 * over £2,300, shown faded." Empty when nothing is faded. */
export function fadedLine(
  hidden: readonly CompareNote[],
  active: readonly FilterChip[],
): string {
  const reasons: string[] = [];
  for (const chip of active) {
    const names = hidden
      .filter((note) => !passesChip(note, chip))
      .map((note) => shortTitle(note));
    if (names.length === 0) continue;
    const verb = names.length === 1 ? 'is' : 'are';
    const what =
      chip.op === 'under'
        ? `over ${chip.limitText}`
        : `free from ${chip.limitText}`;
    reasons.push(`${joinNames(names)} ${verb} ${what}`);
  }
  return reasons.length === 0 ? '' : `${reasons.join('; ')}, shown faded.`;
}

/** The phone's footer. */
export function footerLine(kind: Kind): string {
  return `Bower read these details from each ${kind.name}.`;
}

const ASK_QUESTIONS: Readonly<Record<string, string>> = {
  'rental-listing': 'Which two should we view first, and why?',
  'job-offer': 'Which one should I answer first, and why?',
  bill: 'Which one should I look at first, and why?',
};

/** The Ask Bower tip's question for a kind. */
export function askQuestion(kind: Kind): string {
  return ASK_QUESTIONS[kind.id] ?? 'Which one should I look at first, and why?';
}

/** What the suggestion is about: "these five". */
export function askSubject(count: number): string {
  return `these ${countWord(count)}`;
}

// --- Editing the status ------------------------------------------------------

/** `text` with the frontmatter key `key` set to `value`, every other line
 * untouched; the key is added at the end of the block when it is missing. A
 * note with no frontmatter block gets one. */
export function setFrontmatterValue(
  text: string,
  key: string,
  value: string,
): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const bom = text.charCodeAt(0) === 0xfeff ? String.fromCharCode(0xfeff) : '';
  const { lines, body } = splitFrontmatter(text);
  const line = `${key}: ${value}`;
  if (lines === null) return `${bom}---${eol}${line}${eol}---${eol}${text}`;
  const at = findKeyLine(lines, key);
  const next = [...lines];
  if (at === -1) next.push(line);
  else next[at] = line;
  const tail = eol === '\n' ? body : body.replace(/\n/g, eol);
  return `${bom}---${eol}${next.join(eol)}${eol}---${eol}${tail}`;
}

/** The option label for a status value: "To view". */
export function statusOptionLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** The kind of a note's frontmatter `kind`, when it is one Compare knows. */
export function kindOfNote(note: CompareNote): Kind | undefined {
  return kindById(note.kind);
}

/** The note's status, lower case; '' when it has none. */
export function statusValue(note: Pick<CompareNote, 'fields'>): string {
  const status = note.fields.status;
  return typeof status === 'string' ? status.trim().toLowerCase() : '';
}

// --- Receipts by month, bookings as a timeline (issue #615) -----------------

const MONEY_FIELD: KindField = { key: '', label: '', type: 'money', group: '' };

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A sum as "£1,234.50"; whole amounts have no pence. */
export function moneyOf(amount: number): string {
  return formatFieldValue(MONEY_FIELD, Math.round(amount * 100) / 100);
}

/** One receipt under its month. */
export interface ReceiptRow {
  note: CompareNote;
  shop: string;
  /** "12 Sep", '' when the date was not read. */
  date: string;
  /** "£42.50", '' when the total was not read. */
  total: string;
}

export interface MonthGroup {
  /** `2026-09`, or `undated`. */
  key: string;
  /** "September 2026", or "No date". */
  label: string;
  total: number;
  totalText: string;
  receipts: ReceiptRow[];
}

export interface ReceiptsByMonth {
  /** Newest month first; receipts with no readable date come last. */
  months: MonthGroup[];
  /** The receipts of the current year, up to now. `null` when there are none. */
  year: { year: number; total: number; totalText: string } | null;
}

function kindField(kindId: string, key: string): KindField | undefined {
  return kindById(kindId)?.fields.find((candidate) => candidate.key === key);
}

/**
 * Receipts grouped by the month of their date, newest month first and the
 * newest receipt first within it, each month with its total. `now` is the
 * moment "the year so far" is counted to.
 */
export function receiptsByMonth(
  notes: readonly CompareNote[],
  now: Date = new Date(),
): ReceiptsByMonth {
  const dateField = kindField('receipt', 'date');
  const shopField = kindField('receipt', 'shop');
  const totalField = kindField('receipt', 'total');
  const groups = new Map<string, MonthGroup & { stamp: number }>();
  const stamps = new Map<string, number>();
  let yearTotal = 0;
  let yearCount = 0;
  const year = now.getUTCFullYear();
  for (const note of notes) {
    const stamp = dateOf(note.fields.date);
    const amount = numberOf(note.fields.total);
    const when = stamp === null ? null : new Date(stamp);
    const key =
      when === null
        ? 'undated'
        : `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        key,
        label:
          when === null
            ? 'No date'
            : `${MONTH_NAMES[when.getUTCMonth()] ?? ''} ${when.getUTCFullYear()}`,
        total: 0,
        totalText: '',
        receipts: [],
        stamp: stamp ?? -Infinity,
      };
      groups.set(key, group);
    }
    if (amount !== null) group.total += amount;
    stamps.set(note.id, stamp ?? -Infinity);
    group.receipts.push({
      note,
      shop:
        (shopField === undefined
          ? ''
          : formatFieldValue(shopField, note.fields.shop)) || noteTitle(note),
      date:
        dateField === undefined || stamp === null
          ? ''
          : formatFieldValue(dateField, note.fields.date),
      total:
        totalField === undefined
          ? ''
          : formatFieldValue(totalField, note.fields.total),
    });
    if (
      when !== null &&
      amount !== null &&
      when.getUTCFullYear() === year &&
      when.getTime() <= now.getTime()
    ) {
      yearTotal += amount;
      yearCount += 1;
    }
  }
  const months = [...groups.values()].sort((a, b) => b.stamp - a.stamp);
  for (const group of months) {
    group.totalText = moneyOf(group.total);
    group.receipts.sort(
      (a, b) =>
        (stamps.get(b.note.id) ?? 0) - (stamps.get(a.note.id) ?? 0) ||
        a.shop.localeCompare(b.shop, 'en'),
    );
  }
  return {
    months: months.map((group) => ({
      key: group.key,
      label: group.label,
      total: group.total,
      totalText: group.totalText,
      receipts: group.receipts,
    })),
    year:
      yearCount === 0
        ? null
        : { year, total: yearTotal, totalText: moneyOf(yearTotal) },
  };
}

/** One booking on the timeline. */
export interface TimelineEntry {
  note: CompareNote;
  what: string;
  /** "14 Nov", '' when the date was not read. */
  date: string;
  /** "18:30", '' when the booking has no time. */
  time: string;
  where: string;
  reference: string;
  /** Already over: faded on the timeline. */
  past: boolean;
}

/** The `HH:MM` of a `when` value, '' when it has none. */
function timeOf(raw: unknown): string {
  if (raw instanceof Date) {
    const hours = raw.getUTCHours();
    const minutes = raw.getUTCMinutes();
    return hours === 0 && minutes === 0
      ? ''
      : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  if (typeof raw !== 'string') return '';
  const match = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/.exec(raw.trim());
  return match === null ? '' : `${match[1] ?? ''}:${match[2] ?? ''}`;
}

/**
 * Bookings in the order they happen, earliest first, by date and time, each
 * marked past when it is already over at `now`. A booking with no readable
 * date goes last and is never past.
 */
export function bookingsTimeline(
  notes: readonly CompareNote[],
  now: Date = new Date(),
): TimelineEntry[] {
  const text = (key: string, note: CompareNote): string => {
    const found = kindField('booking', key);
    return found === undefined ? '' : formatFieldValue(found, note.fields[key]);
  };
  const dayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const rows = notes.map((note) => {
    const day = dateOf(note.fields.when);
    const time = timeOf(note.fields.when);
    const [hours = 0, minutes = 0] = time.split(':').map(Number);
    const stamp = day === null ? null : day + (hours * 60 + minutes) * 60000;
    let past = false;
    if (stamp !== null && day !== null) {
      past = time === '' ? day < dayStart : stamp < now.getTime();
    }
    const entry: TimelineEntry = {
      note,
      what: text('what', note) || noteTitle(note),
      date: day === null ? '' : text('when', note),
      time,
      where: text('where', note),
      reference: text('reference', note),
      past,
    };
    return { entry, stamp };
  });
  rows.sort((a, b) => {
    if (a.stamp === null && b.stamp === null) return 0;
    if (a.stamp === null) return 1;
    if (b.stamp === null) return -1;
    return a.stamp - b.stamp;
  });
  return rows.map((row) => row.entry);
}

/** The explainer above the months (issue #615). */
export function receiptsExplainer(count: number): string {
  return (
    `You saved ${countWord(count)} receipts here. Bower read the total, the ` +
    'shop and the date from each one, so they add up by month.'
  );
}

/** The explainer above the timeline (issue #615). */
export function timelineExplainer(count: number): string {
  return (
    `You saved ${countWord(count)} bookings here. Bower read the date, the ` +
    'place and the reference from each one, so they line up in the order ' +
    'they happen.'
  );
}
