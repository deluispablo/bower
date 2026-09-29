/**
 * Piles (spec §6.15, D17, R-PILE-1): the files and links added together on
 * Add, plus what the person says about them. Each pile is a context note in
 * `0-Inbox/` from its first attached file, so it survives closing the app
 * and waits, with its own note, for the tidy-up. Several piles can wait at
 * once; the runner (`agent/run.sh`, R-RUNNER-6) and the rulebook read the
 * note by its frontmatter (`kind: context`, `pile: <id>`) and its
 * `## Applies to` list.
 *
 * The store keeps the piles of this session in memory (a later visit reads
 * them back from the inbox listing, R-PILE-3) and is the one writer of their
 * notes. Writes to one pile's note are serialised and coalesced: a change
 * made while a write is in flight waits for it, then one write carries every
 * change made meanwhile. Each rewrite reads the note's `modifiedTime` first
 * and compares it with the one the app last wrote, the same freshness guard
 * Edit a note uses (`saveNoteText`), so a change made elsewhere is not
 * silently overwritten.
 *
 * Same plain pub/sub pattern as `add-queue-store.ts`.
 */

import { useEffect, useState } from 'preact/hooks';

import { contextNote, contextNoteName } from './add.js';
import {
  createTextFile,
  deleteFile,
  getText,
  INSTRUCTION_APP_PROPERTIES,
  listFolder,
  updateFileText,
  type DriveFile,
} from './drive.js';
import { instructionBody } from './tell.js';
import { ruleSentences } from './bower-tab.js';
import { showToast } from './toast-store.js';

export type PileItemState = 'waiting' | 'uploading' | 'done' | 'failed';

export interface PileItem {
  /** The name the file has (or will have) in the inbox; unique there. */
  name: string;
  /** Drive's id once the file is in the inbox. */
  fileId?: string;
  state: PileItemState;
}

export interface Pile {
  id: string;
  /** The context note's Drive id; `null` until the first attach wrote it,
   * and again once a pile left with no items deleted it. */
  noteFileId: string | null;
  /** When the pile started (ISO-8601). */
  createdAt: string;
  /** "What is this pile?", as typed. */
  text: string;
  items: PileItem[];
  /** Closed piles wait for the tidy-up; files no longer join them by
   * default. */
  closed: boolean;
}

/** What the store keeps about a pile's note besides the pile itself. */
interface NoteMeta {
  inboxFolderId: string;
  /** The note's file name in the inbox. */
  name: string | null;
  /** `modifiedTime` of the note as the app last wrote it. */
  modifiedTime: string | null;
  /** The text as last written, to tell a local edit from a stale one. */
  writtenText: string | null;
  /** The write in flight or queued, settled once the note is current. */
  chain: Promise<void>;
  /** A write is queued behind the one in flight. */
  queued: boolean;
  /** The last write failed; cleared by the next that succeeds. */
  failed: boolean;
}

let piles: Pile[] = [];
const meta = new Map<string, NoteMeta>();
const listeners = new Set<(piles: Pile[]) => void>();

function publish(next: Pile[]): void {
  piles = next;
  for (const listener of listeners) listener(piles);
}

function patchPile(id: string, patch: Partial<Pile>): Pile | undefined {
  let found: Pile | undefined;
  publish(
    piles.map((pile) => {
      if (pile.id !== id) return pile;
      found = { ...pile, ...patch };
      return found;
    }),
  );
  return found;
}

function findPile(id: string): Pile | undefined {
  return piles.find((pile) => pile.id === id);
}

/** Every pile of this session, oldest first. */
export function getPiles(): Pile[] {
  return piles;
}

/** The piles; re-renders the subscriber when they change. */
export function usePiles(): Pile[] {
  const [value, setValue] = useState(piles);
  useEffect(() => {
    listeners.add(setValue);
    setValue(piles);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** Calls `listener` on every change; returns the unsubscribe. */
export function subscribePiles(listener: (piles: Pile[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The pile files attached now join, if one is open. */
export function openPile(): Pile | undefined {
  return piles.find((pile) => !pile.closed);
}

/**
 * A pile note's Markdown: the context note (`contextNote`: `tags:
 * [instruction]`, `date`, `via: app`, `kind: context`), with `pile: <id>`
 * after `kind`, then the text, then `## Applies to` naming the files already
 * in the inbox. The runner and the rulebook read exactly these fields.
 */
export function pileNote(pile: Pile, fileNames: readonly string[]): string {
  return contextNote(pile.text, fileNames, new Date(pile.createdAt)).replace(
    'kind: context\n',
    `kind: context\npile: ${pile.id}\n`,
  );
}

/** The names a pile's note lists: its items already in the inbox. */
export function landedNames(pile: Pile): string[] {
  return pile.items
    .filter((item) => item.state === 'done')
    .map((item) => item.name);
}

/**
 * Starts a pile whose note goes to `inboxFolderId`. Nothing is written yet:
 * the note is created on the first attach (`attachToPile`).
 */
export function startPile(
  inboxFolderId: string,
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): Pile {
  const pile: Pile = {
    id,
    noteFileId: null,
    createdAt: now.toISOString(),
    text: '',
    items: [],
    closed: false,
  };
  meta.set(id, {
    inboxFolderId,
    name: null,
    modifiedTime: null,
    writtenText: null,
    chain: Promise.resolve(),
    queued: false,
    failed: false,
  });
  publish([...piles, pile]);
  return pile;
}

/**
 * Adds a file to a pile (or updates the one of that name): the first attach
 * creates the note, and a file that lands (`state: 'done'`) rewrites it.
 * Resolves once the note is current.
 */
export function attachToPile(pileId: string, item: PileItem): Promise<void> {
  const pile = findPile(pileId);
  if (pile === undefined) return Promise.resolve();
  const existing = pile.items.find((i) => i.name === item.name);
  if (
    existing !== undefined &&
    existing.state === item.state &&
    (item.fileId === undefined || existing.fileId === item.fileId)
  ) {
    return meta.get(pileId)?.chain ?? Promise.resolve();
  }
  const items =
    existing === undefined
      ? [...pile.items, item]
      : pile.items.map((i) => (i.name === item.name ? { ...i, ...item } : i));
  patchPile(pileId, { items });
  const needsWrite =
    pile.noteFileId === null ||
    (item.state === 'done') !== (existing?.state === 'done');
  return needsWrite ? requestWrite(pileId) : settled(pileId);
}

/** Takes a file out of a pile; a pile left with no items deletes its note. */
export function removeFromPile(pileId: string, name: string): Promise<void> {
  const pile = findPile(pileId);
  if (pile === undefined) return Promise.resolve();
  patchPile(pileId, { items: pile.items.filter((i) => i.name !== name) });
  return requestWrite(pileId);
}

/** Saves "What is this pile?" into the note (the UI debounces the calls). */
export function setPileText(pileId: string, text: string): Promise<void> {
  const pile = findPile(pileId);
  if (pile === undefined || pile.text === text) return settled(pileId);
  patchPile(pileId, { text });
  return pile.items.length === 0 ? settled(pileId) : requestWrite(pileId);
}

function settled(pileId: string): Promise<void> {
  return meta.get(pileId)?.chain ?? Promise.resolve();
}

/**
 * Queues a write of the pile's note behind the one in flight. Writes made
 * while one is queued collapse into it: it reads the pile when it starts.
 * Never rejects; a failure is logged and remembered (`failed`).
 */
function requestWrite(pileId: string): Promise<void> {
  const m = meta.get(pileId);
  if (m === undefined) return Promise.resolve();
  if (m.queued) return m.chain;
  m.queued = true;
  m.chain = m.chain.then(async () => {
    m.queued = false;
    try {
      await writeNow(pileId, m);
      m.failed = false;
    } catch (err) {
      console.error(err);
      m.failed = true;
    }
  });
  return m.chain;
}

async function writeNow(pileId: string, m: NoteMeta): Promise<void> {
  const pile = findPile(pileId);
  if (pile === undefined) return;
  if (pile.items.length === 0) {
    if (pile.noteFileId !== null) {
      await deleteFile(pile.noteFileId);
      patchPile(pileId, { noteFileId: null });
      m.name = null;
      m.modifiedTime = null;
      m.writtenText = null;
    }
    return;
  }
  if (pile.noteFileId === null) {
    await createNote(pile, m, landedNames(pile));
    return;
  }
  await rewriteNote(pile, m);
}

async function createNote(
  pile: Pile,
  m: NoteMeta,
  names: readonly string[],
): Promise<void> {
  const name = contextNoteName(new Date());
  const file = await createTextFile(
    m.inboxFolderId,
    name,
    pileNote(pile, names),
    { appProperties: INSTRUCTION_APP_PROPERTIES },
  );
  remember(pile.id, m, file, pile.text);
}

function remember(
  pileId: string,
  m: NoteMeta,
  file: DriveFile,
  text: string,
): void {
  m.name = file.name;
  m.modifiedTime = file.modifiedTime ?? null;
  m.writtenText = text;
  patchPile(pileId, { noteFileId: file.id });
}

async function rewriteNote(pile: Pile, m: NoteMeta): Promise<void> {
  const noteId = pile.noteFileId;
  if (noteId === null) return;
  const inbox = await listFolder(m.inboxFolderId);
  const entry = inbox.find((file) => file.id === noteId);
  if (entry === undefined) {
    await continueNote(pile, m, inbox);
    return;
  }
  if (m.modifiedTime !== null && entry.modifiedTime !== m.modifiedTime) {
    // Changed elsewhere since the app last wrote it (another tab or
    // device). Its words win unless the person has typed here since; the
    // file list is always this pile's own.
    const remote = pileText(await getText(noteId));
    const latest = findPile(pile.id) ?? pile;
    if (latest.text === m.writtenText && remote !== latest.text) {
      patchPile(pile.id, { text: remote });
    }
  }
  const current = findPile(pile.id) ?? pile;
  const file = await updateFileText(
    noteId,
    pileNote(current, landedNames(current)),
  );
  remember(pile.id, m, file, current.text);
}

/**
 * R-PILE-8: the note is no longer directly in the inbox (a tidy-up moved it
 * to `Processed/`, keeping its id, or it was trashed), so rewriting it would
 * land outside the inbox. A continuation note with the same `pile:` takes
 * over, listing only the landed files still in the inbox: the ones the old
 * note named went with it. The run holds a late file and its continuation
 * note together for the next tidy-up (R-RUNNER-6).
 */
async function continueNote(
  pile: Pile,
  m: NoteMeta,
  inbox: readonly DriveFile[],
): Promise<void> {
  const present = new Set(inbox.map((file) => file.name));
  const current = findPile(pile.id) ?? pile;
  const items = current.items.filter(
    (item) => item.state !== 'done' || present.has(item.name),
  );
  patchPile(pile.id, { items, noteFileId: null });
  m.name = null;
  m.modifiedTime = null;
  m.writtenText = null;
  if (items.length === 0) return;
  const next = findPile(pile.id) ?? current;
  await createNote(next, m, landedNames(next));
}

/** The words of a pile note: its body before `## Applies to`. */
export function pileText(note: string): string {
  return instructionBody(note)
    .replace(/(?:^|\n)## Applies to[\s\S]*$/, '')
    .trim();
}

/**
 * Closes a pile: files attached from now on start another one. Its "From
 * now on…" sentences (`ruleSentences`) go to `Rules.md` through `keepRule`
 * here, once (R-PILE-9), never on each save; a rule that cannot be kept is
 * logged and said once, and the note still carries the sentence. Then the
 * note is written one last time (the final `## Applies to`) and awaited.
 * Resolves whether the note is current in the inbox; never rejects.
 */
export async function closePile(
  pileId: string,
  keepRule?: (sentence: string) => Promise<unknown>,
): Promise<boolean> {
  const pile = findPile(pileId);
  if (pile === undefined) return true;
  if (!pile.closed) {
    patchPile(pileId, { closed: true });
    if (keepRule !== undefined) {
      let told = false;
      for (const sentence of ruleSentences(pile.text)) {
        try {
          await keepRule(sentence);
        } catch (err) {
          console.error(err);
          if (!told) showToast('Could not add your rule yet. Bower still reads it.');
          told = true;
        }
      }
    }
  }
  if ((findPile(pileId)?.items.length ?? 0) === 0 && pile.noteFileId === null) {
    return true;
  }
  await requestWrite(pileId);
  return !pileWriteFailed(pileId);
}

/**
 * R-PILE-7: closes every open pile and writes every pile's note once more,
 * awaited, so the tidy-up reads each final `## Applies to`. Resolves `false`
 * when any note could not be written; never rejects.
 */
export async function flushPiles(
  keepRule?: (sentence: string) => Promise<unknown>,
): Promise<boolean> {
  const results = await Promise.all(
    piles.map((pile) => closePile(pile.id, keepRule)),
  );
  return results.every(Boolean);
}

/** Settles once no pile note write is in flight or queued. */
export async function pilesSettled(): Promise<void> {
  await Promise.all([...meta.values()].map((m) => m.chain));
}

/** Whether the pile's last write failed. */
export function pileWriteFailed(pileId: string): boolean {
  return meta.get(pileId)?.failed === true;
}

/** Forgets every pile. Tests and sign-out only. */
export function resetPiles(): void {
  meta.clear();
  publish([]);
}
