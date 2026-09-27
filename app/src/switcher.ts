/**
 * Pure helpers for the quick switcher (`components/switcher.tsx`, #142):
 * ordering and highlighting notes and commands into one list, and building
 * the command list itself. No Preact, no DOM: everything here takes plain
 * data and returns plain data, so it is unit-tested directly
 * (`switcher.test.ts`).
 *
 * Debounce, the 2-character minimum and recent searches stay in the
 * component (moved over from `search.tsx` unchanged); the Drive full-text
 * search and its vault/app-file filtering stay in `search.ts`
 * (`filterToIndex`) — this module only merges and highlights whatever the
 * component already narrowed down.
 */

import type { DriveFile } from './drive.js';

export interface HighlightSpan {
  /** Inclusive start offset into the matched text. */
  start: number;
  /** Exclusive end offset into the matched text. */
  end: number;
}

/** A note result, already narrowed to the vault and to real notes. */
export interface SwitcherNote {
  file: DriveFile;
  /** A cached-text snippet around the match, or `null` (see `search.ts#snippet`). */
  snippet: string | null;
}

/** One command the switcher can run, in the order the issue lists them. */
export interface Command {
  id: 'tidy-up' | 'add' | 'tell' | 'theme';
  label: string;
  /** A route to navigate to; absent for a command that just runs an action. */
  href?: string;
}

export interface NoteEntry {
  kind: 'note';
  file: DriveFile;
  snippet: string | null;
  /** Where `query` matches `file.name`; `null` when it doesn't match there. */
  highlight: HighlightSpan | null;
}

export interface CommandEntry {
  kind: 'command';
  command: Command;
}

export type SwitcherEntry = NoteEntry | CommandEntry;

/**
 * The first case-insensitive occurrence of `query` in `text`, as a
 * `[start, end)` offset pair, or `null` when `query` is blank or does not
 * occur in `text`.
 */
function matchSpan(text: string, query: string): HighlightSpan | null {
  if (query === '') return null;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1) return null;
  return { start: at, end: at + query.length };
}

/**
 * `notes` (already filtered to the vault, real notes only) and `commands`
 * (always the same four, regardless of `query`), in that order, as one
 * highlighted list: the ordered list the switcher shows and moves the
 * keyboard highlight through. `query` is matched against each note's name;
 * commands carry no highlight.
 */
export function mergeResults(
  notes: SwitcherNote[],
  commands: Command[],
  query: string,
): SwitcherEntry[] {
  const trimmed = query.trim();
  const noteEntries: SwitcherEntry[] = notes.map(({ file, snippet }) => ({
    kind: 'note',
    file,
    snippet,
    highlight: matchSpan(file.name, trimmed),
  }));
  const commandEntries: SwitcherEntry[] = commands.map((command) => ({
    kind: 'command',
    command,
  }));
  return [...noteEntries, ...commandEntries];
}

export interface SwitcherState {
  /** The Tidy up pill's own count (`run-store.ts#pendingCount`). */
  pending: number;
  /** The effective theme (`theme.ts#effectiveTheme`), not the `'system'` preference. */
  theme: 'light' | 'dark';
}

/**
 * The four commands, in the order the issue lists them: Tidy up the inbox
 * (with the pending count), Add a file or photo, Tell Bower something,
 * Switch to light/dark theme. Tidy up and the theme switch just run an
 * action (no `href`); Add and Tell Bower are plain navigation.
 */
export function commandsFor(state: SwitcherState): Command[] {
  return [
    {
      id: 'tidy-up',
      label:
        state.pending > 0
          ? `Tidy up the inbox (${state.pending})`
          : 'Tidy up the inbox',
    },
    { id: 'add', label: 'Add a file or photo', href: '/add' },
    { id: 'tell', label: 'Tell Bower something', href: '/tell' },
    {
      id: 'theme',
      label:
        state.theme === 'dark'
          ? 'Switch to light theme'
          : 'Switch to dark theme',
    },
  ];
}

/** The folder a file lives in: its path with the file's own name removed. */
export function folderPath(file: DriveFile): string {
  const cut = file.path.length - file.name.length - 1;
  return cut > 0 ? file.path.slice(0, cut) : '';
}
