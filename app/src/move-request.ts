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
import { runNow } from './run-now.js';
import { displayPath, folderOf, paraKindOf } from './navigation.js';
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
  // Rename request (`Rename {path} to {new name}`): the old name, not the path.
  const rename = /^Rename (.+?) to ([^/]+)$/.exec(text);
  if (rename !== null) {
    const [, path = '', name = ''] = rename;
    const old = path.split('/').pop() ?? path;
    return `Rename ${old} to ${name}`;
  }
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
 * The folders the picker offers, as a tree of folders only: the four roots
 * drawn on PF-Move (#909). Inbox (and everything in it), Answers, Clippings
 * and any other top folder are never a destination. A folder being moved
 * stays in the tree, without its subfolders, so the picker can show it
 * dimmed under its parent and never offer it or anything inside it
 * (PF-Move, #950 F-19). The current folder stays in the tree too.
 */
export function pickerFolders(
  root: TreeNode,
  subject: MoveSubject,
): TreeNode[] {
  function keep(node: TreeNode): TreeNode {
    if (subject.isFolder && node.path === subject.path) {
      return { ...node, folders: [] };
    }
    return {
      ...node,
      folders: node.folders.map((child) => keep(child)),
    };
  }
  return root.folders
    .filter((top) => {
      const kind = paraKindOf(top.name);
      return kind !== null && kind !== 'inbox';
    })
    .map((top) => keep(top));
}

/** How a send ended: `run-failed` means the note is written, the run is not. */
export type MoveOutcome = 'sent' | 'run-failed';

/** What the request writers need from Drive, so tests stub it. */
export interface RequestNoteDeps {
  createTextFile: (
    parentId: string,
    name: string,
    content: string,
    options: { appProperties: Readonly<Record<string, string>> },
  ) => Promise<{ id?: string }>;
}

/** What `sendMoveRequest` needs from Drive and the Worker, so tests stub it. */
export interface MoveDeps extends RequestNoteDeps {
  /** Starts a run (`POST /process`); called with `instructions`. */
  startRun: (scope: RunScope) => Promise<boolean>;
}

/**
 * Writes one request note into the inbox (R-ASK-2). It carries
 * `INSTRUCTION_APP_PROPERTIES`, so the runner does not quarantine it.
 * Throws when the note could not be written. Resolves to the new file's id
 * (`null` when Drive did not say), which Undo needs.
 */
export async function writeRequestNote(
  deps: RequestNoteDeps,
  input: { inboxFolderId: string; text: string; now: Date },
): Promise<string | null> {
  const name = instructionFileName(input.text, '', input.now);
  const content = instructionNote(input.text, input.now, 'request');
  const file = await deps.createTextFile(input.inboxFolderId, name, content, {
    appProperties: INSTRUCTION_APP_PROPERTIES,
  });
  return file.id ?? null;
}

/** How a replacing write ended: `kept` means the new note is written but
 * the waiting one it replaces could not be sent to the Bin. */
export interface ReplaceResult {
  id: string | null;
  kept: boolean;
}

/**
 * Writes a request that replaces a waiting one (§3.6): the new note first,
 * then the old one (`replaces`, its Drive id) goes to the Bin, so the
 * person never ends up with no request at all. `null` replaces nothing.
 * Throws when the new note could not be written; then the old one stays.
 */
export async function replaceRequestNote(
  deps: RequestNoteDeps & { deleteFile: (id: string) => Promise<void> },
  input: {
    inboxFolderId: string;
    text: string;
    now: Date;
    replaces: string | null;
  },
): Promise<ReplaceResult> {
  const id = await writeRequestNote(deps, input);
  if (input.replaces === null) return { id, kept: false };
  try {
    await deps.deleteFile(input.replaces);
    return { id, kept: false };
  } catch (err) {
    console.error(err);
    return { id, kept: true };
  }
}

/** The line when the waiting request could not be taken out. */
export const REPLACE_KEPT = 'Sent. The earlier request is still in your inbox.';

/**
 * Undo (R-ASK-2): sends the note just written to Drive's Bin
 * (`deleteFile` only trashes). Never throws: `failed` means the note is
 * still in the inbox, and the caller says so in one sentence.
 */
export async function undoRequestNote(
  deleteFile: (id: string) => Promise<void>,
  id: string,
): Promise<'undone' | 'failed'> {
  try {
    await deleteFile(id);
    return 'undone';
  } catch (err) {
    console.error(err);
    return 'failed';
  }
}

/**
 * Writes the request note into the inbox and, for `now`, starts an
 * instructions-only run through the shared helper (`runNow`, which awaits
 * the write first); `later` only writes it (it goes with the next
 * tidy-up). Throws when the note could not be written, and then no run is
 * started. Resolves to `run-failed` when the note is written but the run
 * did not start (it then goes with the next tidy-up), else `sent`.
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
  const written = writeRequestNote(deps, input);
  if (input.when === 'now') {
    const started = await runNow({
      settle: () => written,
      startRun: deps.startRun,
    });
    return started ? 'sent' : 'run-failed';
  }
  await written;
  return 'sent';
}
