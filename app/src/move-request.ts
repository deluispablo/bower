/**
 * "Move to…" (#608, spec §6.9 R-MOVE-1 to R-MOVE-4, D1): the app never
 * moves or renames anything itself. A move is a request to Bower, written
 * as one instruction note in the inbox with the exact words below, then
 * either started at once (an instructions-only run) or left for the next
 * tidy-up. This is the pure half: the words, the folders the picker offers,
 * its "Find a folder" filter, and the two-step send. No DOM, so it is unit
 * tested on its own (`test/move-request.test.ts`).
 */

import type { RunScope } from './api.js';
import { INSTRUCTION_APP_PROPERTIES } from './drive.js';
import {
  displayName,
  displayPath,
  folderOf,
  paraKindOf,
} from './navigation.js';
import type { TreeNode } from './navigation.js';
import { instructionFileName, instructionNote } from './tell.js';

/**
 * The request's words, exactly: `Move “<name>” (<path>) to <folder path>.`
 * `path` and `destination` are vault paths, as Bower reads them.
 */
export function moveRequestText(
  name: string,
  path: string,
  destination: string,
): string {
  return `Move “${name}” (${path}) to ${destination}.`;
}

/**
 * A move request as the Requests row shows it: the same words with the
 * numeric prefixes left off every folder in the two paths. The note keeps
 * the real paths; only the display changes. Other text is returned as is.
 */
export function requestRowText(text: string): string {
  const match = /^Move “(.+)” \((.+)\) to (.+)\.$/.exec(text);
  if (match === null) return text;
  const [, name = '', path = '', destination = ''] = match;
  return moveRequestText(
    name,
    displayPath(path, ' › '),
    displayPath(destination, ' › '),
  );
}

/** What the picker is moving: a note, a file or a folder. */
export interface MoveSubject {
  /** The vault path of the note, file or folder. */
  path: string;
  isFolder: boolean;
}

/** The folder the subject sits in now: the picker disables it. */
export function currentFolderOf(subject: MoveSubject): string {
  return folderOf(subject.path);
}

/**
 * The folders the picker offers, as a tree of folders only. Inbox (and
 * everything in it) is never a destination (board `Phone-Move-Picker`, lead
 * ruling); a folder being moved is not offered inside itself. The current
 * folder stays in the tree (the picker shows it disabled).
 */
export function pickerFolders(
  root: TreeNode,
  subject: MoveSubject,
): TreeNode[] {
  function keep(node: TreeNode): TreeNode | null {
    if (subject.isFolder && node.path === subject.path) return null;
    return {
      ...node,
      folders: node.folders.flatMap((child) => keep(child) ?? []),
    };
  }
  return root.folders
    .filter((top) => paraKindOf(top.name) !== 'inbox')
    .flatMap((top) => keep(top) ?? []);
}

/**
 * The "Find a folder" filter: every folder at any depth whose name has
 * `query` in it (case-insensitive, numeric prefix ignored), in tree order.
 * A blank query gives none: the picker then shows the tree.
 */
export function findFolders(
  nodes: readonly TreeNode[],
  query: string,
): TreeNode[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const out: TreeNode[] = [];
  function walk(list: readonly TreeNode[]): void {
    for (const node of list) {
      if (displayName(node.name).toLowerCase().includes(needle)) {
        out.push(node);
      }
      walk(node.folders);
    }
  }
  walk(nodes);
  return out;
}

/** How a send ended: `run-failed` means the note is written, the run is not. */
export type MoveOutcome = 'sent' | 'run-failed';

/** What `sendMoveRequest` needs from Drive and the Worker, so tests stub it. */
export interface MoveDeps {
  createTextFile: (
    parentId: string,
    name: string,
    content: string,
    options: { appProperties: Readonly<Record<string, string>> },
  ) => Promise<unknown>;
  /** Starts a run (`POST /process`); called with `instructions`. */
  startRun: (scope: RunScope) => Promise<boolean>;
}

/**
 * Writes the request note into the inbox and, for `now`, starts an
 * instructions-only run; `later` only writes it (it goes with the next
 * tidy-up). Throws when the note could not be written, and then no run is
 * Resolves to `run-failed` when the note is written but the run did not
 * start (it then goes with the next tidy-up), else `sent`.
 * started.
 */
export async function sendMoveRequest(
  deps: MoveDeps,
  input: {
    inboxFolderId: string;
    text: string;
    when: 'now' | 'later';
    now: Date;
  },
): Promise<MoveOutcome> {
  const name = instructionFileName(input.text, '', input.now);
  const content = instructionNote(input.text, input.now, 'request');
  await deps.createTextFile(input.inboxFolderId, name, content, {
    appProperties: INSTRUCTION_APP_PROPERTIES,
  });
  if (input.when === 'now' && !(await deps.startRun('instructions'))) {
    return 'run-failed';
  }
  return 'sent';
}
