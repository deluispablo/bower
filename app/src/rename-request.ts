/**
 * "Rename…" (#765, spec §6.13 R-MORE-1, R-MORE-2, R-MORE-4, D14, D32): the
 * app never renames anything itself. A rename is a request to Bower, one
 * instruction note in the inbox in plain words plus the path, like a move.
 * This is the pure half: the words, the name check, and what a waiting
 * Rename or Move looks like from the thing it is about. No DOM, so it is
 * unit tested on its own (`test/rename-request.test.ts`).
 */

import type { RequestRow } from './bower-tab.js';
import { requestTargetPath } from './bower-tab.js';
import { displayPath, folderOf } from './navigation.js';
import type { VaultIndex } from './vault-index.js';

/** The words of the request: `Rename {path} to {new name}`. `path` is the
 * vault path, `newName` the whole new file name (its extension included).
 * There are no `op:` fields: the agent works on local paths. */
export function renameRequestText(path: string, newName: string): string {
  return `Rename ${path} to ${newName}`;
}

/** A file name split into what the person edits and what stays locked. */
export interface NameParts {
  base: string;
  /** With its dot (`.pdf`), or `''` for a name with none. */
  extension: string;
}

/**
 * A note's `.md` is never shown; any other file keeps its last extension
 * locked after the field. A leading dot is not an extension.
 */
export function splitFileName(name: string, isNote: boolean): NameParts {
  if (isNote) {
    return name.toLowerCase().endsWith('.md')
      ? { base: name.slice(0, -3), extension: '.md' }
      : { base: name, extension: '' };
  }
  const dot = name.lastIndexOf('.');
  return dot > 0
    ? { base: name.slice(0, dot), extension: name.slice(dot) }
    : { base: name, extension: '' };
}

/**
 * What Rename's box starts with (§3.6): the waiting request's new name when
 * one is queued, else the current name; either without its locked extension.
 */
export function renamePrefill(
  name: string,
  isNote: boolean,
  pendingName?: string,
): string {
  return splitFileName(pendingName ?? name, isNote).base;
}

const FORBIDDEN = /[/\\:*?"<>|]/;

export const RENAME_MESSAGES = {
  empty: 'Give it a name.',
  same: 'That is already its name.',
  taken: 'Something in this folder already has that name.',
  characters: 'Names can\'t contain / \\ : * ? " < > |',
  tooLong: 'Keep it under 120 characters.',
} as const;

/** The line under Rename's box (board NO-Rename). */
export const RENAME_HINT =
  'The arrow renames it. The link to it keeps working.';

/** The longest name Rename takes, in characters (without the extension). */
export const RENAME_MAX_LENGTH = 120;

export interface RenameCheck {
  /** The file's current full name. */
  currentName: string;
  /** What the person typed (without the locked extension). */
  input: string;
  extension: string;
  /** The full names of everything in the same folder. */
  siblingNames: readonly string[];
}

/** The first message that applies to the typed name, else `null`. */
export function validateRename(check: RenameCheck): string | null {
  const typed = check.input.trim();
  if (typed === '') return RENAME_MESSAGES.empty;
  if (FORBIDDEN.test(typed)) return RENAME_MESSAGES.characters;
  if (typed.length > RENAME_MAX_LENGTH) return RENAME_MESSAGES.tooLong;
  const full = (typed + check.extension).toLowerCase();
  if (full === check.currentName.toLowerCase()) return RENAME_MESSAGES.same;
  if (check.siblingNames.some((name) => name.toLowerCase() === full)) {
    return RENAME_MESSAGES.taken;
  }
  return null;
}

/** The full names of everything that sits in the same folder as `path`
 * (notes, files and folders), what the "taken" check looks at. */
export function siblingNames(index: VaultIndex, path: string): string[] {
  const folder = folderOf(path);
  return [...index.notes, ...index.files, ...index.folders]
    .filter((entry) => folderOf(entry.path) === folder)
    .map((entry) => entry.name);
}

/** A Rename or Move request that has not been done yet, seen from the note
 * or file it is about. */
export interface PendingRequest {
  kind: 'rename' | 'move';
  /** The line under the title, without a full stop. */
  line: string;
  /** What it asks for: a Rename's new full name (extension included), a
   * Move's destination folder path. Reopening it prefills this (§3.6). */
  value: string;
  /** The Drive note behind it (Undo sends it to the Bin); `null` while the
   * listing does not have it yet. */
  fileId: string | null;
}

const RENAME_TEXT = /^Rename (.+?) to ([^/]+)$/;
const MOVE_TEXT = /^Move “.+” \(.+\) to (.+)\.$/;

/** "Renaming to {name}" (a note's `.md` left off) or "Moving to {folder}",
 * `null` for any other sentence. */
function pendingOf(row: RequestRow): [string, PendingRequest] | null {
  const rename = RENAME_TEXT.exec(row.text);
  if (rename !== null) {
    const [, path = '', name = ''] = rename;
    return [
      path,
      {
        kind: 'rename',
        line: `Renaming to ${splitFileName(name, true).base} at the next tidy-up`,
        value: name,
        fileId: row.fileId,
      },
    ];
  }
  const target = requestTargetPath(row.text);
  const destination = MOVE_TEXT.exec(row.text)?.[1];
  if (target === null || destination === undefined) return null;
  return [
    target,
    {
      kind: 'move',
      line: `Moving to ${displayPath(destination, ' › ')} at the next tidy-up`,
      value: destination,
      fileId: row.fileId,
    },
  ];
}

/**
 * The waiting Rename and Move requests by the path they are about (R-MORE-4,
 * D32): what a note or file page's line and a folder row's clock badge
 * read. Only requests still in the inbox count (waiting, or not finished);
 * the newest one wins for a path.
 */
export function pendingByPath(
  rows: readonly RequestRow[],
): Map<string, PendingRequest> {
  const out = new Map<string, PendingRequest>();
  const waiting = rows
    .filter((row) => row.state === 'waiting' || row.state === 'failed')
    .sort((a, b) => a.since.localeCompare(b.since));
  for (const row of waiting) {
    const found = pendingOf(row);
    if (found !== null) out.set(found[0], found[1]);
  }
  return out;
}
