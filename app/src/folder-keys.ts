/**
 * The folder screen's keys on the desktop (issue #614, spec §6.12 R-DESK-4):
 * arrows move the selection, Space opens quick look, Enter opens, Backspace
 * goes up a folder, `/` or Ctrl K search. Pure: `FolderItems` reads the
 * event and the list's shape, this says what to do.
 */

/** The parts of a `KeyboardEvent` the keys need. */
export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface KeyContext {
  /** Index of the selected row, or -1 when nothing is selected. */
  selected: number;
  /** How many rows there are. */
  count: number;
  /** Tiles per line in the grid; 1 in the list. */
  columns: number;
  /** Whether the folder has a parent to go up to. */
  canGoUp: boolean;
  /** The event came from a text field, a select or the like. */
  typing: boolean;
  /** The event came from a link or button, which Enter and Space act on. */
  onControl: boolean;
}

export type KeyAction =
  | { type: 'select'; index: number }
  | { type: 'quick-look' }
  | { type: 'open' }
  | { type: 'up' }
  | { type: 'search' };

/** The text on the screen's bottom line. */
export const KEY_HINT =
  '↑ ↓ move · Space quick look · Enter open · ⌫ up a folder';

/** What a key does on the folder screen, or `null` when it does nothing
 * here (and so keeps its default). */
export function folderKeyAction(
  event: KeyInput,
  context: KeyContext,
): KeyAction | null {
  const { key } = event;
  if (context.typing) return null;
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    key.toLowerCase() === 'k'
  ) {
    return { type: 'search' };
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (key === '/') return { type: 'search' };
  if (key === 'Backspace') return context.canGoUp ? { type: 'up' } : null;
  if (context.count === 0) return null;
  const last = context.count - 1;
  const from = context.selected;
  const step = (delta: number): KeyAction => {
    if (from < 0) return { type: 'select', index: delta > 0 ? 0 : last };
    return { type: 'select', index: Math.min(last, Math.max(0, from + delta)) };
  };
  switch (key) {
    case 'ArrowDown':
      return step(context.columns);
    case 'ArrowUp':
      return step(-context.columns);
    case 'ArrowRight':
      return context.columns > 1 ? step(1) : null;
    case 'ArrowLeft':
      return context.columns > 1 ? step(-1) : null;
    case 'Home':
      return { type: 'select', index: 0 };
    case 'End':
      return { type: 'select', index: last };
    case ' ':
      return context.onControl || from < 0 ? null : { type: 'quick-look' };
    case 'Enter':
      return context.onControl || from < 0 ? null : { type: 'open' };
    default:
      return null;
  }
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Sep 27", or the time ("10:42") for today: a row's right-hand date on
 * the desktop. Empty when the file has no date. */
export function rowDate(iso: string | undefined, now: number): string {
  if (iso === undefined || iso === '') return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  if (at.toDateString() === new Date(now).toDateString()) {
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  }
  return `${MONTHS[at.getMonth()] ?? ''} ${at.getDate()}`;
}
