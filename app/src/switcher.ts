/**
 * Pure helpers for the quick switcher (`components/switcher.tsx`, #142):
 * ranking the vault index's own name/path matches against Drive's
 * full-text results (`rankNotes`, #308), ordering and highlighting the
 * ranked notes and commands into one list (`mergeResults`), and building
 * the command list itself. No Preact, no DOM: everything here takes plain
 * data and returns plain data, so it is unit-tested directly
 * (`switcher.test.ts`).
 *
 * Debounce, the 2-character minimum and recent searches stay in the
 * component (moved over from `search.tsx` unchanged); the Drive full-text
 * search and its vault/app-file filtering stay in `search.ts`
 * (`filterToIndex`) — this module only ranks, merges and highlights
 * whatever the component already narrowed down.
 */

import type { DriveFile } from './drive.js';
import { displayPath } from './navigation.js';

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
 * `indexNotes` (every note already in the vault index, filtered to the
 * vault and to the `showAppFiles` preference, same as the tree) ranked and
 * merged with `textNotes` (Drive's full-text search, already narrowed to
 * the vault by `search.ts#filterToIndex`) into one note list, synchronously
 * — no Drive call needed for the ranking itself (#308):
 *
 * 1. A name-prefix match: `query` is a case-insensitive prefix of the
 *    file's name.
 * 2. A path match: not a name-prefix match, but `query` occurs somewhere in
 *    the file's path — which also covers a fragment matched mid-name,
 *    since a file's path always ends with its name.
 * 3. A full-text match: found only by Drive's full-text search, not
 *    locally in the index at all.
 *
 * A note in both `indexNotes` and `textNotes` appears once, ranked by 1 or
 * 2 above and keeping `textNotes`' snippet. Blank `query` returns nothing
 * (the switcher shows recent searches instead).
 */
export function rankNotes(
  indexNotes: DriveFile[],
  textNotes: SwitcherNote[],
  query: string,
): SwitcherNote[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return [];

  const snippetById = new Map(
    textNotes.map(({ file, snippet }) => [file.id, snippet]),
  );
  const localMatches = indexNotes.filter((file) =>
    file.path.toLowerCase().includes(trimmed),
  );
  const namePrefix = localMatches.filter((file) =>
    file.name.toLowerCase().startsWith(trimmed),
  );
  const pathOnly = localMatches.filter(
    (file) => !file.name.toLowerCase().startsWith(trimmed),
  );
  const localIds = new Set(localMatches.map((file) => file.id));
  const textOnly = textNotes.filter(({ file }) => !localIds.has(file.id));

  const toEntry = (file: DriveFile): SwitcherNote => ({
    file,
    snippet: snippetById.get(file.id) ?? null,
  });
  return [...namePrefix.map(toEntry), ...pathOnly.map(toEntry), ...textOnly];
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
  /** The inbox count (`run-store.ts#pendingCount`), as on Home's Inbox card. */
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
    { id: 'tell', label: 'Tell Bower something', href: '/bower' },
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
  return cut > 0 ? displayPath(file.path.slice(0, cut), '/') : '';
}

/**
 * Where the highlight goes when the result list changes (SE-Query): to the
 * first row when the search itself changed (`reset`: a new query, chip or
 * scope); otherwise it stays on the row it was on (`current`, a row key),
 * so Drive's full-text answer arriving later never moves it. A row that is
 * gone sends it back to the first row. Pure.
 */
export function keptHighlight(
  current: string | null,
  keys: readonly string[],
  reset: boolean,
): number {
  if (reset || current === null) return 0;
  const at = keys.indexOf(current);
  return at === -1 ? 0 : at;
}

/**
 * The best match by name (the "Close enough counts" line): the highest
 * score among the name matches the index found on this device, folders
 * before notes before files on a tie. It never reads Drive's full-text
 * hits, so it is the same whenever Drive answers. Pure.
 */
export function bestNameMatch<T extends { score: number }>(groups: {
  folders: readonly T[];
  notes: readonly T[];
  files: readonly T[];
}): T | null {
  let best: T | null = null;
  for (const hit of [...groups.folders, ...groups.notes, ...groups.files]) {
    if (best === null || hit.score > best.score) best = hit;
  }
  return best;
}
