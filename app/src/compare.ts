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
 * whose `compare` is `table`. Receipts and bookings have their own views
 * (#615) and contracts never compare. Most notes first, then the kinds'
 * own order.
 */
export function compareKinds(notes: readonly CompareNote[]): Kind[] {
  return KINDS.filter(
    (kind) => kind.compare === 'table' && notesOfKind(notes, kind).length >= 2,
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

/** The kind's columns in their default order: the title, the compare
 * fields, then Status when the kind has statuses. */
export function defaultColumnIds(kind: Kind): string[] {
  return [
    TITLE_COLUMN,
    ...kind.compareFields,
    ...(kind.statuses.length > 0 ? [STATUS_COLUMN] : []),
  ];
}

/** `stored` applied to the kind's default order: the ids it still knows, in
 * its order, then any column it does not mention. The title stays first. */
export function orderedColumnIds(
  kind: Kind,
  stored: readonly string[] | undefined,
): string[] {
  const defaults = defaultColumnIds(kind);
  if (stored === undefined) return defaults;
  const movable = defaults.filter((id) => id !== TITLE_COLUMN);
  const kept = stored.filter((id) => movable.includes(id));
  const rest = movable.filter((id) => !kept.includes(id));
  return [TITLE_COLUMN, ...new Set(kept), ...rest];
}

/** The columns of `kind` in `order` (or the default order). */
export function compareColumns(
  kind: Kind,
  order?: readonly string[],
): CompareColumn[] {
  const columns: CompareColumn[] = [];
  for (const id of orderedColumnIds(kind, order)) {
    if (id === TITLE_COLUMN) {
      columns.push({ id, label: TITLE_LABELS[kind.id] ?? 'Note' });
    } else if (id === STATUS_COLUMN) {
      columns.push({ id, label: 'Status' });
    } else {
      const field = kind.fields.find((candidate) => candidate.key === id);
      if (field === undefined) continue;
      columns.push({
        id,
        label: field.compareLabel ?? field.label,
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

/** The cell's text: the title, the status the way Details says it, or the
 * field formatted as the boards draw it. */
export function cellText(
  kind: Kind,
  note: CompareNote,
  column: CompareColumn,
): string {
  if (column.id === TITLE_COLUMN) return noteTitle(note);
  if (column.id === STATUS_COLUMN) return statusLabel(kind, note.fields);
  return column.field === undefined
    ? ''
    : formatFieldValue(column.field, note.fields[column.id]);
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

/** Fit, best first; a kind with no fit column sorts by its first field. */
export function defaultSort(kind: Kind): CompareSort {
  if (kind.compareFields.includes('fit')) {
    return { column: 'fit', direction: 'desc' };
  }
  return {
    column: kind.compareFields[0] ?? TITLE_COLUMN,
    direction: 'asc',
  };
}

type SortValue = number | string | null;

function sortValue(kind: Kind, note: CompareNote, column: string): SortValue {
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
): CompareNote[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const first = kind.compareFields[0] ?? TITLE_COLUMN;
  return [...notes].sort((a, b) => {
    for (const column of [sort.column, first, TITLE_COLUMN]) {
      const left = sortValue(kind, a, column);
      const right = sortValue(kind, b, column);
      if (left === null && right === null) continue;
      if (left === null) return 1;
      if (right === null) return -1;
      const order = compareValues(left, right);
      if (order !== 0) return column === sort.column ? sign * order : order;
    }
    return 0;
  });
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

/** The Bower box link the tip opens, prefilled with the question. */
export function askHref(count: number, kind: Kind): string {
  return `/bower?text=${encodeURIComponent(
    `About these ${countWord(count)}: ${askQuestion(kind)}`,
  )}`;
}

/** The desktop tip text. */
export function askTip(count: number, kind: Kind): string {
  return `Ask Bower about these ${countWord(count)}: “${askQuestion(kind)}”`;
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
