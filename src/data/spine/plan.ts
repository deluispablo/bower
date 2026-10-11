/**
 * The spine's shared plan (TL-P3-21, ARCHITECTURE "Reusable deterministic core"): what a tidy-up takes of the
 * inbox, decided from what Drive holds, over a small read interface, with time and ids handed in. The fake runner
 * captures its piles here (`capturePiles`), and the Worker admits a run with `planAdmission`, both from the inbox as
 * `listedPiles` reads it. No browser globals,
 * no network of its own: the adapters in `read.ts` own the I/O.
 */
import type { BinnedItem, DriveFile } from '../drive/drive-api';
import type { OwnershipContext } from '../contracts/ownership-format';
import type { DeclarationResult } from '../contracts/pile-declaration';
import { isJournalRecord } from '../contracts/journal-record';
import { recordableId, recordableRecordId } from '../contracts/run-manifest';
import { PILE_NOTE } from '../piles';
import { SET_ASIDE_TEXT, accountLoose, declarationCopies, accountPile, contextRemoved, findDeclaration, journalValues, looseSetAside, recordedNote, writable, type Digest } from '../pile-readiness';
import { join, kindOf } from '../tree';
import { BowerError, type FileKind, type Pile, type PileItem, type SetAside } from '../types';
import { PROP } from '../vault/layout';
import { noteRefusal, parseNote } from '../vault/note-format';
import { VaultIndex } from '../vault/vault-index';
import type { Admission, AdmissionManifest, AdmissionScope, AdmittedFile, AdmittedPile } from './admission';
import { NotReadHere } from './budget';

export { NotReadHere };

/** What the plan reads: metadata, Bower's own control files, and stored digests. */
export interface SpineRead {
  /** Every file and folder under `rootId`, not in the Bin. */
  listAll(rootId: string): Promise<DriveFile[]>;
  readBytes(id: string): Promise<Uint8Array>;
  readText(id: string): Promise<string>;
  /** A file's stored size and SHA-256, as Drive keeps them; null when it keeps none. */
  digest(file: DriveFile): Promise<Digest | null>;
  /**
   * A hint that the plan is about to read these files, one after the other: a reader over a network starts them
   * together (bounded) so each is answered when asked for. Reads only; an answer is never needed from it.
   */
  warm?(reads: ReadonlyArray<{ id: string; as: 'text' | 'bytes' }>): void;
  /** Bin entries by item key below `rootId`: asked only for a declared member that is not in the listing. */
  binnedByItem(rootId: string, keys: readonly string[]): Promise<BinnedItem[]>;
  /**
   * One file by its id, the Bin included (`files.get`): asked only for the note of a pair that is gone from the
   * listing, when its answered row is made, for the name it keeps in the Bin (TL-P4-19 addendum 14).
   */
  binned(id: string): Promise<DriveFile>;
}

/** Why a declared pile waits for a later tidy-up, and what you can do about it. */
export const SET_ASIDE = {
  notArrived: 'Some of its things have not arrived yet.',
  notChecked: 'Bower could not check some of its things. Try again.',
  unreadable: 'Bower could not read the list of what is in this pile. Try again.',
  changed: 'Some of its things changed after they were added. Remove it and add them again.',
  declaration: 'Bower found two different lists of what is in this pile. Remove it and add it again.',
  empty: 'Nothing is left in it. Remove it from your inbox.',
  noteFormat: "This pile's note needs a newer Bower.",
  noteDamaged: "Bower can't read this pile's note.",
  notTidied: "Bower couldn't tidy this up yet. Try again.",
} as const;

/** The Inbox's refusals of a pile's note that hold it from a run, worded as the report says them. */
const HELD_BY_INBOX: Partial<Record<SetAside, string>> = { 'note-format': SET_ASIDE.noteFormat, 'note-damaged': SET_ASIDE.noteDamaged };

/**
 * What a run takes of a pile folder, fixed when it starts: every child it
 * accounts for, and a declared note to write again first. The folder goes to
 * the Bin only when nothing else is left in it.
 */
export type Capture = { blocked: string } | { blocked: null; captured: Set<string>; declared?: Declared; leftover?: Leftover; undecided?: Undecided };
/**
 * A pile admission could not afford to read whole (TL-P4-11): every file of it is admitted, with its declaration when
 * that was read, and the runner, which reads every file, decides it by these same rules before any write. Only the
 * Worker's admission meets it; a runner's reads are never left undone.
 */
export type Undecided = { declaration: { declarationId: string; sha256: string } | null };
/**
 * A ready declared pile's declaration, as the B path captures it. `memberKeys` are the members still in its
 * folder: those accounted for (disposed of, or arrived and left) count as filed (TL-P2-29 second amendment).
 */
export type Declared = { ref: { declarationId: string; sha256: string }; contextKey: string | null; memberKeys: ReadonlySet<string> };
/**
 * What is left in a declared pile's folder once every declared member is accounted for (TL-P2-29): an
 * ordinary observed pile, whose context is the note bound by this key when it is there, otherwise the first.
 */
export type Leftover = { contextKey: string | null };

/** A pile as the capture needs it: the Inbox's reading of it (the runner), or the listing's (the Worker). */
export interface PileShape {
  id: string;
  path?: string;
  /** The ids of its things. */
  itemIds: readonly string[];
  /** Why the Inbox holds it, when it does. */
  setAside?: SetAside;
  /** Whether it has words of its own (its note). */
  hasWords: boolean;
}

export interface CaptureOptions {
  /**
   * Whether the pile's one recorded note is read and checked, as the runner records it. The Worker reads it too, at
   * admission (TL-P3-25 point 2), transiently: what it keeps of a note is its id and version, never its text.
   */
  notes: boolean;
  context?: OwnershipContext;
}

/** A pile as the Inbox reads it, in the shape the capture takes; the same for the Worker's admission and the run. */
export const pileShape = (p: Pile): PileShape => ({
  id: p.id,
  ...(p.path ? { path: p.path } : {}),
  itemIds: p.items.map((i) => i.id),
  ...(p.setAside ? { setAside: p.setAside } : {}),
  hasWords: !!p.text.trim(),
});

/** A file's stored size and hash; null when they cannot be checked now (logged). */
async function digestOf(read: SpineRead, f: DriveFile): Promise<Digest | null> {
  try {
    return await read.digest(f);
  } catch (e) {
    // A digest admission left to the runner (TL-P4-11) leaves its whole pile to it.
    if (e instanceof NotReadHere) throw e;
    console.error(e);
    return null;
  }
}

/** Declared piles are taken only when every member arrived with the bytes declared for it, or was filed with them. */
export async function capturePiles(read: SpineRead, rootId: string, piles: readonly PileShape[], opts: CaptureOptions): Promise<Map<string, Capture>> {
  const listing = await read.listAll(rootId);
  const ix = VaultIndex.build(rootId, listing);
  const binned = (keys: readonly string[]) => read.binnedByItem(rootId, keys);
  let records: Promise<unknown[]> | null = null;
  const journal = (): Promise<unknown[]> => (records ??= journalValues(ix.journalFiles(true), (id) => read.readText(id)));
  const out = new Map<string, Capture>();
  // Each declaration copy is read once per run, whichever pile names it.
  const cache = new Map<string, DeclarationResult>();
  for (const pile of piles) {
    // The declaration this pile names, once read: kept for a pile left to the runner (TL-P4-11).
    let named: Undecided['declaration'] = null;
    const one = async (): Promise<void> => {
      const folder = pile.path ? ix.file(pile.path) : undefined;
      // What a run record cannot carry holds only its pile, with the reason the Inbox shows too (TL-P2-38).
      if (pile.setAside === 'not-tidied') {
        out.set(pile.id, { blocked: SET_ASIDE.notTidied });
        return;
      }
      if (folder && !folder.folder) {
        out.set(pile.id, await looseCapture(read, rootId, listing, ix.file('Inbox'), folder, cache, binned));
        return;
      }
      if (!pile.path || !folder?.folder) return;
      const children = listing.filter((f) => f.parents[0] === folder.id);
      const notes = children.filter((f) => !f.folder && f.name === PILE_NOTE).map((f) => f.id);
      const present = pile.itemIds.filter((id) => children.some((f) => f.id === id));
      // A note Bower will not parse holds its pile with the Inbox's own reason, checked first as the Inbox does.
      const refused = pile.setAside === 'note-format' || pile.setAside === 'note-damaged' ? HELD_BY_INBOX[pile.setAside] : undefined;
      if (refused) {
        out.set(pile.id, { blocked: refused });
        return;
      }
      const found = await findDeclaration(listing, rootId, folder, (id) => read.readBytes(id), cache);
      if (found.state === 'found') named = { declarationId: found.declaration.declarationId, sha256: found.sha256 };
      if (opts.notes) {
        // What a run record cannot carry waits, with the reason the Inbox shows too (TL-P2-21): the names, and the raw
        // text (front matter included) of the one note the run records. Another pile note is never read here.
        const contextKey = found.state === 'found' && found.declaration.context.kind === 'text' ? found.declaration.context.memberKey : null;
        const recorded = recordedNote(children, contextKey);
        let raw: string;
        try {
          raw = recorded ? await read.readText(recorded.id) : '';
        } catch (e) {
          // A note Drive cannot give back now holds only this pile, as in the Inbox (TL-P2-08 (a)); a sign-out stops
          // all, and a note admission left to the runner leaves the whole pile to it.
          if (!(e instanceof BowerError) || e.code === 'auth') throw e;
          console.error(e);
          out.set(pile.id, { blocked: SET_ASIDE.notChecked });
          return;
        }
        // A note with text no record can carry is a damaged note, as in the Inbox (TL-P2-36 (9)).
        if (!writable([raw])) {
          console.error(new BowerError('unknown', SET_ASIDE.noteDamaged), 'A pile note has text no run record can carry');
          out.set(pile.id, { blocked: SET_ASIDE.noteDamaged });
          return;
        }
        // The note a run records is refused by its format or its damage as in the Inbox; nothing else of the pile is read.
        if (recorded) {
          let refusal: ReturnType<typeof noteRefusal> = null;
          try {
            parseNote(join(pile.path, PILE_NOTE), raw, opts.context ? { fileId: recorded.id, context: opts.context } : undefined);
          } catch (e) {
            refusal = noteRefusal(e);
            if (!refusal) throw e;
            console.error(e);
          }
          if (refusal) {
            out.set(pile.id, { blocked: refusal === 'newer' ? SET_ASIDE.noteFormat : SET_ASIDE.noteDamaged });
            return;
          }
        }
      }
      if (!writable([folder.name, ...children.filter((f) => !f.folder).map((f) => f.name)])) {
        console.error(new BowerError('unknown', SET_ASIDE.notChecked), 'A pile has text no run record can carry; it waits as not checked');
        out.set(pile.id, { blocked: SET_ASIDE.notChecked });
        return;
      }
      // A pile the Inbox could not check (its note could not be read there) is held too, and only it (TL-P2-08 (a)).
      if (pile.setAside === 'not-checked') {
        out.set(pile.id, { blocked: SET_ASIDE.notChecked });
        return;
      }
      if (found.state === 'unmarked') {
        // Nothing in it but a blank note (or nothing at all): the run has nothing to take, so it is held as empty.
        if (!present.length && !pile.hasWords) {
          out.set(pile.id, { blocked: SET_ASIDE.empty });
          return;
        }
        out.set(pile.id, { blocked: null, captured: new Set([...pile.itemIds, ...notes]) });
        return;
      }
      // A list that cannot be read holds only its own pile (TL-P2-08 (a)); the reader's listing logged it once.
      if (found.state !== 'found') {
        out.set(pile.id, { blocked: found.state === 'conflict' ? SET_ASIDE.declaration : found.state === 'unreadable' ? SET_ASIDE.unreadable : SET_ASIDE.notChecked });
        return;
      }
      // The accounting the Inbox shares: disposed members are filed, the rest looked up (TL-P2-29 second amendment).
      const readiness = await accountPile(found.declaration, found.sha256, folder, listing, (id) => read.readBytes(id), (f) => digestOf(read, f), binned);
      if (readiness.blocked) {
        out.set(pile.id, { blocked: readiness.blocked === 'changed' ? SET_ASIDE.changed : readiness.blocked === 'not-arrived' ? SET_ASIDE.notArrived : SET_ASIDE.notChecked });
        return;
      }
      // The context only has to have arrived: any note is the person's words. Missing though never removed
      // through Bower or Drive, the pile waits, held (TL-P2-21): the runner never writes into the Inbox (TL-P2-32); Try
      // again in the app writes it again from its first words (TL-P2-08 b).
      const context = found.declaration.context;
      if (context.kind === 'text' && !children.some((f) => f.appProperties?.[PROP.item] === context.memberKey) && !contextRemoved(await journal(), pile.path, readiness.contextBinned)) {
        out.set(pile.id, { blocked: SET_ASIDE.notArrived });
        return;
      }
      // A blank note is context removed: with no member left, the pile is empty.
      if (!present.length && !pile.hasWords) {
        out.set(pile.id, { blocked: SET_ASIDE.empty });
        return;
      }
      // Ready, so every member not disposed of is either still in the folder or arrived and left (accounted for).
      const remaining = readiness.remaining;
      // Every declared member accounted for: what is left is an ordinary pile (TL-P2-29).
      if (found.declaration.members.length && !remaining.length) {
        out.set(pile.id, { blocked: null, captured: new Set([...present, ...notes]), leftover: { contextKey: context.kind === 'text' ? context.memberKey : null } });
        return;
      }
      const declared: Declared = {
        ref: { declarationId: found.declaration.declarationId, sha256: found.sha256 },
        contextKey: context.kind === 'text' ? context.memberKey : null,
        memberKeys: new Set(remaining),
      };
      out.set(pile.id, { blocked: null, captured: new Set([...present, ...notes]), declared });
    };
    try {
      await one();
    } catch (e) {
      if (!(e instanceof NotReadHere)) throw e;
      // Admission is out of subrequests (TL-P4-11): the whole pile goes to the runner, which reads it and decides.
      const folder = pile.path ? ix.file(pile.path) : undefined;
      if (!folder) continue;
      const files = folder.folder ? listing.filter((f) => !f.folder && f.parents[0] === folder.id).map((f) => f.id) : [folder.id];
      named ??= namedInListing(listing, rootId, folder);
      console.info('A pile is left to the runner to check: admission is out of subrequests');
      out.set(pile.id, { blocked: null, captured: new Set(files), undecided: { declaration: named } });
    }
  }
  return out;
}

/**
 * The declaration a pile names, from the listing alone: its copies' names carry its hash (`declarationName`), so a
 * pile left to the runner keeps the reference a read would have found. Null when it names none, or its copies differ.
 */
function namedInListing(listing: readonly DriveFile[], rootId: string, place: DriveFile): Undecided['declaration'] {
  const declarationId = place.appProperties?.[PROP.declaration];
  if (!declarationId) return null;
  const prefix = `declaration-${declarationId}-`;
  const hashes = new Set(declarationCopies(listing, rootId, declarationId).map((f) => f.name.slice(prefix.length, -'.json'.length)));
  const [sha256, ...more] = [...hashes];
  return sha256 && !more.length && /^[0-9a-f]{64}$/.test(sha256) ? { declarationId, sha256 } : null;
}

/**
 * A loose file (fixture 07), by the rule the Inbox shares (`accountLoose`): observed when it carries no declaration
 * or every copy is gone; declared, it is ready when its one member is in the inbox with the declared bytes.
 */
async function looseCapture(
  read: SpineRead,
  rootId: string,
  listing: readonly DriveFile[],
  inbox: DriveFile | undefined,
  file: DriveFile,
  cache: Map<string, DeclarationResult>,
  binned: ((keys: readonly string[]) => Promise<BinnedItem[]>) | undefined,
): Promise<Capture> {
  const lookup = await findDeclaration(listing, rootId, file, (id) => read.readBytes(id), cache);
  const loose = await accountLoose(lookup, inbox, listing, (id) => read.readBytes(id), (f) => digestOf(read, f), binned);
  const why = looseSetAside(loose);
  if (why) return { blocked: SET_ASIDE_TEXT[why] };
  if (!loose.found) return { blocked: null, captured: new Set([file.id]) };
  const { declaration, sha256: hash, accounting } = loose.found;
  // Filed already (a consumed disposition) and put back in the inbox: an ordinary loose file now.
  if (!accounting.remaining.length) return { blocked: null, captured: new Set([file.id]), leftover: { contextKey: null } };
  return { blocked: null, captured: new Set([file.id]), declared: { ref: { declarationId: declaration.declarationId, sha256: hash }, contextKey: null, memberKeys: new Set(accounting.remaining) } };
}

export interface AdmissionOptions {
  context?: OwnershipContext;
  scope: AdmissionScope;
  clock: () => number;
  newId: () => string;
  /**
   * An answer's run (TL-P4-08 addendum 8): only the pile of the inbox that holds this thing or pile is read and taken,
   * with your changes. Only with scope `all`.
   */
  subject?: string;
  /**
   * Answers that waited for a run to end (TL-P4-13 addendum): the one run their end starts reads and takes the piles
   * that hold any of these, with your changes. Only with scope `all`.
   */
  subjects?: readonly string[];
}

/** Whether `f`, a pile folder or loose thing of the inbox, is or holds `subject` (its pile id, its id, or a thing's id in it). */
function holds(ix: VaultIndex, f: DriveFile, subject: string): boolean {
  if (f.id === subject || f.appProperties?.[PROP.pile] === subject) return true;
  const path = f.folder ? ix.pathOf(f.id) : undefined;
  return path !== undefined && ix.filesIn(path).some((k) => k.id === subject);
}

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const admitted = (f: DriveFile): AdmittedFile => ({ fileId: f.id, name: f.name, parents: [...f.parents], modifiedTime: f.modifiedTime });

/**
 * Whether anything waits in the inbox, from its listing alone: a loose thing, or a pile folder with a thing or a note
 * that is not empty. Whether it is ready is the capture's to say.
 */
function inboxPiles(ix: VaultIndex, only: (f: DriveFile) => boolean = () => true): PileShape[] {
  const out: PileShape[] = [];
  for (const f of ix.filesIn('Inbox').filter(only)) {
    const path = ix.pathOf(f.id);
    if (!path) continue;
    const id = f.appProperties?.[PROP.pile] ?? f.id;
    if (!f.folder) {
      out.push({ id, path, itemIds: [f.id], hasWords: false });
      continue;
    }
    const kids = ix.filesIn(path).filter((k) => !k.folder);
    const note = kids.find((k) => k.name === PILE_NOTE);
    out.push({ id, path, itemIds: kids.filter((k) => k.name !== PILE_NOTE).map((k) => k.id), hasWords: !!note && note.size !== 0 });
  }
  return out;
}

/** Your changes a run reads: the journal files that hold a record Bower can read and record. */
async function journalOf(read: SpineRead, ix: VaultIndex): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  for (const f of ix.journalFiles()) {
    if (f.folder || !f.name.endsWith('.json')) continue;
    let rec: unknown;
    try {
      rec = JSON.parse(await read.readText(f.id));
    } catch (e) {
      // Not read at admission (out of subrequests, TL-P4-11): taken, and the runner reads it and leaves a line that
      // is not a record where it is, as it does any line (`scripted.ts`, `journalOf`).
      if (e instanceof NotReadHere) {
        out.push(f);
        continue;
      }
      if (!(e instanceof SyntaxError)) throw e;
      // A line that cannot be read stays where it is; the run says so, by file id: a parser's message quotes the text.
      console.error(`Journal file ${f.id} is not valid JSON`);
      continue;
    }
    if (isJournalRecord(rec) && recordableRecordId(rec.id)) out.push(f);
  }
  return out;
}

/**
 * What a run would be admitted to take now, or why there is nothing (the worker contract's 409 `nothing`): the
 * ready piles of the inbox, each with its things by id, name, parents and modifiedTime and its declaration, and
 * your changes. It reads metadata, Bower's own files (declarations, dispositions, the journal) and each pile's note,
 * by the very rules the run holds a pile by (`listedPiles`, `capturePiles` with notes), so what it admits the run
 * takes (TL-P3-25 point 2). A note is read transiently: the manifest keeps its id and modifiedTime, never its text,
 * and nothing logged holds it. The folder is listed once.
 */
export async function planAdmission(source: SpineRead, rootId: string, opts: AdmissionOptions): Promise<Admission> {
  const listing = await source.listAll(rootId);
  const read: SpineRead = {
    listAll: async (id) => (id === rootId ? listing : await source.listAll(id)),
    readBytes: (id) => source.readBytes(id),
    readText: (id) => source.readText(id),
    digest: (f) => source.digest(f),
    binnedByItem: (id, keys) => source.binnedByItem(id, keys),
    binned: (id) => source.binned(id),
  };
  const ix = VaultIndex.build(rootId, listing);
  const journal = (await journalOf(read, ix)).map(admitted).sort((a, b) => byCodePoint(a.fileId, b.fileId));
  const wanted = opts.scope === 'all' ? [...new Set([...(opts.subject !== undefined ? [opts.subject] : []), ...(opts.subjects ?? [])])] : [];
  // The manifest names a subject only when there is one; with several, its piles say what it takes.
  const subject = wanted.length === 1 ? wanted[0] : undefined;
  const manifest = (piles: AdmittedPile[]): Admission => {
    const value: AdmissionManifest = { v: 1, id: opts.newId(), rootId, scope: opts.scope, at: opts.clock(), piles, journal, ...(subject !== undefined ? { subject } : {}) };
    return { kind: 'manifest', manifest: value };
  };
  if (opts.scope === 'instructions') return journal.length ? manifest([]) : { kind: 'nothing', cause: 'new' };
  // An answer's run reads and takes only the piles that hold its subjects; the rest of the inbox is not read.
  const only = (f: DriveFile): boolean => !wanted.length || wanted.some((s) => holds(ix, f, s));
  if (!inboxPiles(ix, only).some((p) => p.itemIds.length || p.hasWords)) return wanted.length && journal.length ? manifest([]) : { kind: 'nothing', cause: 'waiting' };
  const unread = new Set<string>();
  // A pile whose note was not read has words when the note is not empty (its size is in the listing), as `inboxPiles` says.
  const piles = (await listedPiles(read, rootId, unread, only, opts.context)).map((p) => {
    const shape = pileShape(p);
    return unread.has(p.id) ? { ...shape, hasWords: ix.filesIn(p.path ?? '').some((k) => !k.folder && k.name === PILE_NOTE && k.size !== 0) } : shape;
  });
  const capture = await capturePiles(read, rootId, piles, { notes: true, context: opts.context });
  const taken: AdmittedPile[] = [];
  for (const pile of piles) {
    const cap = capture.get(pile.id);
    const place = pile.path ? ix.file(pile.path) : undefined;
    // A pile held for readiness, or one whose id no run record can carry, waits (TL-P2-21, TL-P2-38).
    if (!cap || cap.blocked !== null || !place || !recordableId(pile.id)) continue;
    const loose = !place.folder;
    const items = loose ? [place] : listing.filter((f) => f.parents[0] === place.id && cap.captured.has(f.id));
    taken.push({
      pileId: pile.id,
      anchor: loose ? null : admitted(place),
      declaration: cap.declared ? { ...cap.declared.ref } : cap.undecided?.declaration ? { ...cap.undecided.declaration } : null,
      items: items.map(admitted).sort((a, b) => byCodePoint(a.fileId, b.fileId)),
    });
  }
  taken.sort((a, b) => byCodePoint(a.pileId, b.pileId));
  if (!taken.length && !journal.length) return { kind: 'nothing', cause: 'ready' };
  return manifest(taken);
}

const FILE_KINDS: readonly string[] = ['note', 'pdf', 'image', 'link', 'doc', 'sheet', 'audio', 'other'] satisfies readonly FileKind[];

/** A thing in the inbox as the Inbox lists it (`DriveVault`): the name it was added under and its kind. */
function listedItem(f: DriveFile): PileItem {
  const p = f.appProperties ?? {};
  const kind = p[PROP.kind];
  return { id: f.id, name: p[PROP.asAdded] ?? f.name, kind: kind && FILE_KINDS.includes(kind) ? (kind as FileKind) : kindOf(f.name), origin: p[PROP.origin] ?? 'Added in Drive' };
}

/**
 * The inbox's piles from a listing, for a reader with no Inbox of its own (the runner): each folder with its things and
 * the words of its first note, and each loose thing. A note Bower will not parse, or cannot read now, holds its pile
 * with the Inbox's reason; a sign-out stops the run. What a run takes of each is decided by `capturePiles`, as in the fake.
 */
export async function listedPiles(read: SpineRead, rootId: string, unread?: Set<string>, only: (f: DriveFile) => boolean = () => true, context?: OwnershipContext): Promise<Pile[]> {
  const ix = VaultIndex.build(rootId, await read.listAll(rootId));
  const out: Pile[] = [];
  for (const f of ix.filesIn('Inbox').filter(only)) {
    const path = ix.pathOf(f.id);
    if (!path) continue;
    const id = f.appProperties?.[PROP.pile] ?? f.id;
    const createdAt = Date.parse(f.createdTime);
    if (!f.folder) {
      out.push({ id, path, text: '', createdAt, items: [listedItem(f)] });
      continue;
    }
    const kids = ix.filesIn(path).filter((k) => !k.folder);
    const note = kids.find((k) => k.name === PILE_NOTE);
    let text = '';
    let setAside: SetAside | null = null;
    if (note) {
      try {
        text = parseNote(join(path, PILE_NOTE), await read.readText(note.id), context ? { fileId: note.id, context } : undefined).body.trim();
      } catch (e) {
        if (e instanceof NotReadHere && unread) {
          unread.add(id);
        } else {
          if (!(e instanceof BowerError) || e.code === 'auth') throw e;
          console.error(e);
          const refusal = noteRefusal(e);
          setAside = refusal === 'newer' ? 'note-format' : refusal ? 'note-damaged' : 'not-checked';
        }
      }
    }
    out.push({ id, path, text, createdAt, items: kids.filter((k) => k !== note).map(listedItem), ...(setAside ? { setAside } : {}) });
  }
  return out;
}
