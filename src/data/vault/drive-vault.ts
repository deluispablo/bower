/**
 * The Bower folder in Google Drive, behind the same door as the demo
 * (`VaultSource`). It lists the folder once into a `VaultIndex`, applies the
 * same naming rules as the demo (`tree.ts`) before any call to Drive, and
 * writes one journal line for each change you make, so the next tidy-up
 * knows what happened. It never writes Bower's own sections of a note.
 */
import { DRIVE_MESSAGES, type DriveApi, type DriveFile, type Fence } from '../drive/drive-api';
import { ReadCache, type Version } from '../drive/read-cache';
import { isNoAnswer, isUnconfirmedWrite } from '../drive/transport';
import { Intended, STAMP, byId, heldAs, landing, madeAt, makeFolder, makeOnce, makeText, sentAs, unbins, updateByStamp, withdraw, type Holder, type Intent, type Withdrawn } from '../spine/write-once';
import type { FailedChange, Unsubscribe, VaultSource } from '../sources';
import { PILE_NOTE, pileFolderName, pileHasFolder, safeInboxName } from '../piles';
import { buildTree, checkCreationName, displayName, thingName, freeName, join, kindOf, moveEntry, nameOf, parentOf, removeEntry, renameEntry } from '../tree';
import {
  BowerError,
  type ChangeEntry,
  type ChosenAgain,
  type FileKind,
  type NewPile,
  type Note,
  type Pile,
  type PileItem,
  type Question,
  type SetAside,
  type Request,
  type Rule,
  type SearchHit,
  type Suggestion,
  type TreeNode,
} from '../types';
import type { OwnershipContext } from '../contracts/ownership-format';
import { FIRST_TIDY_SAVE_FAILED, FIRST_TIDY_STEPS, firstTidyFrom, type FirstTidy, type FirstTidyStep } from '../contracts/first-tidy';
import type { Content, Declaration, DeclarationResult } from '../contracts/pile-declaration';
import type { DispositionResult } from '../contracts/pile-disposition';
import { SET_ASIDE_TEXT, binKeys, accountLoose, accountPile, contextRemoved, declarationCopies, declarationRecord, declaredName, findDeclaration, findLooseDeclarations, findPileDeclarations, orphanState, journalValues, looseSetAside, checkable, memberAsNote, recordablePile, recordedNote, sameText, setAsideOf, shownName, writable, type Blocked, type DeclarationLookup, type Digest, type LooseDeclaration } from '../pile-readiness';
import { Journal, type JournalRecord } from './journal';
import { formerNames, linkTarget } from '../links';
import { ruleLike } from '../rules';
import { ADOPT_STATES_ID, ADOPT_STATES_RULE, ruleSequence } from '../contracts/note-edit';
import { isWithdrawal, pairsOf, takenBack } from '../contracts/journal-record';
import { isHidden, isRunnerPath, PROP, SYSTEM, isRunnerFile, recordStamp, type RunnerFiles, type QuestionsFile, type LastRunFile } from './layout';
import { md5Hex, sha256 } from './hashes';
import { placeOf, plainSnippet, plainText, savedLinkAddress, savedLinkUrl, searchLines } from '../search-text';
import { readTypeTable } from '../contracts/note-format';
import { noteRefusal, parseNote, toggleTaskInText, type ParsedNote } from './note-format';
import { managedRules } from './rules-format';
import { isSeen, markSeen } from './seen';
import { VaultIndex } from './vault-index';
import { NOT_SENT_TEXT, PERSIST_REFUSED_TEXT, UNREADABLE_TEXT, createUploadQueue, stoppedText, type QueueItem, type UploadQueue } from '../upload-queue';
import { memoryUploadStore } from '../upload-store';
import { CHANGED_ELSEWHERE, checkStillAsSeen, notAsSeen, notAsSeenError, notAsSeenReason, notRead, openFolder, readForFence, type Landing, type SeenExpectation } from '../contracts/still-as-seen';
import { askingKey, publicQuestion, answeredAskings, checkedAnswer, pileQuestion, subjectPile, type PublicQuestion, type QuestionAnswer, type QuestionRound, openQuestions } from '../contracts/questions';

export interface DriveVaultOptions {
  driveLinks?: boolean;
  drive: DriveApi;
  /** The Drive a pile's link or empty thing is sent through: one that waits while another place is active (TL-P2-24). */
  addedDrive?: DriveApi;
  rootId: () => Promise<string>;
  /** The piles the running tidy-up took; they cannot be changed until it ends. */
  runningPiles: () => ReadonlySet<string>;
  /** Names this device in the journal. */
  device?: string;
  /** Writes an immutable declaration before a pile folder and its things (off until every reader understands it). */
  declarePiles?: boolean;
  /** The upload queue every file goes through, so a reload only pauses them (none: one over this page's memory). */
  uploads?: DriveVaultUploads;
}

export interface DriveVaultUploads {
  queue: UploadQueue;
  /** Who is signed in, as the queue keys their uploads (never shown). */
  account: () => Promise<string>;
}

/**
 * A file or link chosen again that is not the one the pile declared
 * (proposed copy, waiting for approval): what happened, then the action.
 */
/** Why a pile's note cannot be changed while Bower could not read it (proposed copy, for lead approval). */
export const NOTE_LOCKED = "Bower could not read this pile's note. Try again.";

export const NOT_THE_SAME_TEXT = {
  file: "That isn't the same file. Choose the file you added before.",
  link: "That isn't the same link. Paste the link you added before.",
} as const;

/** A file by the name and place it was listed with: what a move or a rename must still find. */
const seenPlace = (f: DriveFile): SeenExpectation => ({ id: f.id, name: f.name, parents: f.parents });
const where = (folder: string): string => folder.replaceAll('/', ' / ') || 'your Bower folder';
/** Each first tidy-up step's property on the Bower root. */
const FIRST_TIDY_PROP: Record<FirstTidyStep, string> = { added: PROP.firstAdded, started: PROP.firstStarted, reviewed: PROP.firstReviewed };
const inInbox = (path: string): boolean => path === 'Inbox' || path.startsWith('Inbox/');

function deviceId(): string {
  try {
    const known = localStorage.getItem('bower:device');
    if (known) return known;
    const id = `device-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('bower:device', id);
    return id;
  } catch {
    // expected: storage may be blocked (a private window); the default holds.
    return 'this-device';
  }
}

/** The pretend Drive stored no digest for a file: not an error, and not kept. */
class NoDigest extends Error {}

export class DriveVault implements VaultSource {
  readonly driveLinks: boolean;
  protected readonly drive: DriveApi;
  private readonly addedDrive: DriveApi;
  protected readonly rootId: () => Promise<string>;
  protected readonly runningPiles: () => ReadonlySet<string>;
  protected readonly journal: Journal;
  /** The ids reserved for the creates a person means to make, until each intent is complete (`write-once.ts`). */
  private readonly intended = new Intended();
  /** The words each try of a kept pile-note create sent, so a retry writes only over a note that still holds them. */
  private readonly pileNoteSent = new Map<string, string[]>();
  private readonly declarePiles: boolean;
  /** Declarations never change: each copy is read once, by file id and modified time. */
  private declarationCache = new Map<string, DeclarationResult>();
  private dispositionCache = new Map<string, DispositionResult>();
  /** The general declaration classification from the current full-read snapshot, never persisted. */
  private fullDeclarations: {
    ix: VaultIndex;
    files: readonly DriveFile[];
    read: Promise<{ declarations: Array<LooseDeclaration & { missingLoose: boolean }>; summary: { count: number; complete: boolean } }> | null;
    binned: Map<string, ReturnType<DriveApi['binnedByItem']>>;
  } | null = null;
  /**
   * What files hold, by id and the modifiedTime the listing gives (`read-cache.ts`, shared with the journal). A refresh
   * lists again and nothing else: a file whose version moved is read at its new one, the others and the reads on
   * their way stay. Never used to verify a write.
   */
  protected readonly reads = new ReadCache();
  /** The latest listing, as this page's own writes keep it: the version each file's read is kept under. */
  private listed: VaultIndex | null = null;
  /** Pile folders whose declaration could not be read, already logged: once per failure, not per listing. */
  private unreadableLogged = new Set<string>();
  /**
   * Piles whose note the latest listing could not read, or will not parse, with why: the person saw no words,
   * so none are written over them.
   */
  private lockedNotes = new Map<string, string>();
  /** Pile notes Bower refused to parse, by file id and modified time, already logged: once until they change. */
  private refusalsLogged = new Set<string>();
  private ix: Promise<VaultIndex> | null = null;
  private listeners = new Set<() => void>();
  /** Parsed notes by file id, with the raw text they were parsed from (front matter included). */
  private notes = new Map<string, { modified: string; note: ParsedNote; text: string }>();
  /** What went to the Bin from here, by the path it had, so Undo can bring it back. */
  /** What went to the Bin here, by where it was; a pile also takes its declaration copies (TL-P2-31). A pile that had no place has no id. */
  /** Declaration copies a Remove of this pile sent to the Bin before it stopped: Undo restores them with the rest. */
  private removing = new Map<string, DriveFile[]>();
  /** What went to the Bin, as each Bin answered it, so Undo takes each back by the stamp of its own write. */
  private bin = new Map<string, { file: DriveFile | null; change: string | null; top?: string; late?: DriveFile[]; pending?: Upload; pileKey?: string; declarations?: DriveFile[]; back?: string }>();
  /** Things on their way into the inbox, by pile; a failed one stays with upload -1. */
  private uploads = new Map<string, Upload>();
  private sendingPiles = new Set<string>();
  private making = new Map<string, Promise<string>>();
  /** Answers being recorded on this page, by question: a second tap waits for the first (TL-P4-08 addendum 8). */
  private answering = new Map<string, Promise<void>>();
  private sending = new Set<Promise<void>>();
  private disposed = false;
  /** Files that landed and went to the Bin before their pile's Bin entry existed, by the pile's folder and key. */
  private readonly lateFor = new Map<string, DriveFile[]>();
  private readonly queued: DriveVaultUploads;
  private queueStart: Promise<void> | null = null;
  private unqueue: () => void = () => undefined;
  /** Queue items whose file is already in this vault's index. */
  private arrived = new Set<string>();
  /** The queue held something when it last changed. */
  private heldBefore = false;
  /** The upload notice the inbox last heard of. */
  private noticeBefore: string | null = null;

  constructor(opts: DriveVaultOptions, private readonly lifetime: () => boolean = () => true, journalOwner = opts.rootId, memoryDrive = opts.drive) {
    this.driveLinks = opts.driveLinks ?? false;
    this.drive = opts.drive;
    this.addedDrive = opts.addedDrive ?? opts.drive;
    this.rootId = opts.rootId;
    this.runningPiles = opts.runningPiles;
    this.declarePiles = opts.declarePiles ?? false;
    this.queued = opts.uploads ?? { queue: createUploadQueue({ drive: opts.drive, store: memoryUploadStore() }), account: async () => 'this page' };
    this.unqueue = this.queued.queue.subscribe(() => this.fromQueue());
    this.journal = new Journal(
      this.drive,
      {
        folder: () => this.systemFolder(SYSTEM.changes),
        owner: journalOwner,
        reads: this.reads,
        files: async () => (await this.index()).journalFiles(),
        wrote: (f) => { if (this.current()) void this.ix?.then((ix) => { if (this.current()) ix.put(f); }); },
        waiting: () => this.emit(),
        // The changes folder Drive no longer knows: the next send lists the folder again (and makes it, if gone).
        stale: () => { if (this.current()) this.ix = null; },
        failed: () => this.emit(),
      },
      opts.device ?? deviceId(),
      () => this.current(),
      memoryDrive,
    );
  }

  dispose(): void {
    this.disposed = true;
    this.reads.clear();
    this.listed = null;
    this.fullDeclarations = null;
    this.unqueue();
    for (const u of this.uploads.values()) for (const e of u.entries) { delete e.body; delete e.url; }
    this.uploads.clear();
    this.bin.clear();
    this.removing.clear();
    this.ix = null;
    this.notes.clear();
    this.making.clear();
    this.listeners.clear();
  }

  private current(): boolean { return !this.disposed && this.lifetime(); }

  private checkCurrent(): void {
    if (this.disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
    if (!this.lifetime()) throw new BowerError('conflict', 'Your session changed; try again.');
  }

  /** Sends this device's waiting journal lines (before a tidy-up, back online, at start). */
  flushJournal(): Promise<void> {
    return this.journal.flush();
  }

  /** The changes whose line Drive refused while nobody waited on it, until put away (shown once among what failed). */
  failedChanges(): Promise<FailedChange[]> {
    return this.journal.failed();
  }

  async putAwayFailed(id: string): Promise<void> {
    await this.journal.putAway(id);
    this.emit();
  }

  async markFailedSeen(id: string): Promise<void> {
    await this.journal.markSeen(id);
    this.emit();
  }

  /** Lists the folder again (after a tidy-up, or when another device may have changed it). */
  async refresh(): Promise<void> {
    this.fullDeclarations = null;
    this.ix = null;
    await this.index();
    if (!this.current()) return;
    this.listeners.forEach((l) => l());
  }

  /** A listing no caller waits for (after a refused write): its failure is logged, and the next call lists again; none once closed. */
  private refreshAside(): void {
    this.refresh().catch((e) => { if (this.current()) console.error(e); });
  }

  subscribe(cb: () => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---------- files

  async tree(): Promise<TreeNode[]> {
    return buildTree((await this.index()).entries());
  }

  async note(path: string): Promise<Note> {
    const ix = await this.index();
    const f = ix.file(path);
    if (!f || f.folder) throw new BowerError('not-found', 'That note is no longer there.');
    let parsed: ParsedNote;
    try {
      parsed = await this.parsed(f, path);
    } catch (e) {
      // A note Bower refuses says so on its screen; its cause reaches the console once until it changes.
      if (noteRefusal(e) && !this.refusalsLogged.has(`${f.id}@${f.modifiedTime}`)) {
        this.refusalsLogged.add(`${f.id}@${f.modifiedTime}`);
        console.error(e);
      }
      throw e;
    }
    const byName = new Map<string, string>();
    for (const p of ix.entries().keys()) if (p.endsWith('.md')) {
      const key = displayName(nameOf(p)).toLowerCase();
      if (!byName.has(key)) byName.set(key, p);
    }
    // A link to a name the note had before a rename since the last tidy-up still finds it.
    const former = await this.journal.list().then(
      (lines) => formerNames(lines.map(toChange)),
      (e: unknown) => {
        // The note opens anyway; only links to names it had before a rename wait for the journal.
        console.error(e);
        return new Map<string, string>();
      },
    );
    const links = parsed.links.map((l) => byName.get(linkTarget(l)) ?? former.get(linkTarget(l))).filter((p): p is string => !!p && p !== path);
    // Full text only finds the words; a backlink is a note whose own links name this one (or a name it had).
    const names = [parsed.title, ...[...former].filter(([, now]) => now === path).map(([was]) => was)];
    const hits = (await Promise.all(names.map(async (n) => this.drive.fullText(await this.rootId(), `[[${n}`)))).flat();
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    const candidates = [...new Set(hits.map((h) => ix.pathOf(h.id)).filter((p): p is string => !!p && p !== path && p.endsWith('.md') && !isHidden(p)))].slice(0, MAX_READS);
    const linking = await inBatches(candidates, async (p) => {
      const f = ix.file(p);
      const note = f ? await this.parsed(f, p, true) : null;
      return note?.links.some((l) => wanted.has(linkTarget(l))) ? p : null;
    });
    const backlinks = linking.filter((p): p is string => !!p);
    // The file as read, for the New mark (TL-P4-19 addendum 5): its stamp from the listing (which asks for
    // appProperties), and the MD5 of the very bytes this read holds, which is Drive's md5Checksum of them.
    const read = this.notes.get(f.id);
    const stamp = f.appProperties?.[STAMP];
    const file = read?.modified === f.modifiedTime ? { md5: md5Hex(new TextEncoder().encode(read.text)), ...(stamp === undefined ? {} : { stamp }) } : undefined;
    return { ...parsed, path, links: [...new Set(links)], backlinks, ...(file ? { file } : {}) };
  }

  async driveLink(path = ''): Promise<string | null> {
    if (!this.driveLinks) return null;
    if (!path) return `https://drive.google.com/drive/folders/${encodeURIComponent(await this.rootId())}`;
    const file = (await this.index()).file(path);
    if (!file) return null;
    const id = encodeURIComponent(file.id);
    return file.folder ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`;
  }

  async move(path: string, toFolder: string, opts?: { undo?: boolean }): Promise<string> {
    const ix = await this.index();
    const f = this.mustFile(ix, path);
    const out = moveEntry(ix.entries(), path, toFolder, Date.now());
    if (out === path) return path;
    const to = ix.idOf(toFolder);
    // The folder read right before the send (`openFolder`, as the runner's fence): binned elsewhere, the note would follow it.
    if (!to || !openFolder(await readForFence(byId(this.drive, to), isNoAnswer))) {
      console.error(`Refused a move into ${toFolder}: the folder is gone or in the Bin`);
      throw new BowerError('not-found', 'That folder is no longer there.');
    }
    const last = opts?.undo ? [...(await this.journal.list())].reverse().find((c) => c.kind === 'move' && c.path === path) : undefined;
    const name = nameOf(out);
    const patch = { ...(name !== f.name ? { name } : {}), addParent: to, ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) };
    ix.put(this.keepSeen(f, await this.once(f, `move:${to}:${name}`, (op, fence) => this.drive.update(f.id, { ...patch, appProperties: op }, { fence }))));
    // The Undo of a move (TL-P4-27 addendum 4 (3)): its line dropped when never sent, otherwise the move back is recorded
    // as its inverse; a line no longer listed, or a drop that failed, is answered by the forward move as ever.
    const taken = last ? await this.retracted(last.id) : null;
    if (taken !== 'dropped') await this.journal.record('move', `Moved ${(f.folder ? nameOf(path) : thingName(nameOf(path)))} to ${where(toFolder)}`, { path: out, from: path, fileId: f.id, ...(last && taken === 'sent' ? { undoes: last.id } : {}) });
    this.emit();
    return out;
  }

  /** `retract` for a line-folding site: a decision that failed is logged, and the site records its forward line. */
  private async retracted(id: string): Promise<'dropped' | 'sent'> {
    try {
      return await this.journal.retract(id);
    } catch (e) {
      console.error(e);
      return 'sent';
    }
  }

  async rename(path: string, name: string): Promise<string> {
    const ix = await this.index();
    const f = this.mustFile(ix, path);
    const out = renameEntry(ix.entries(), path, name, Date.now());
    if (out === path) return path;
    // Read before the mutation: unreadable device storage must not leave an unjournaled rename.
    const made = (await this.journal.list()).find((c) => c.kind === 'create' && c.path === path);
    ix.put(this.keepSeen(f, await this.once(f, `rename:${nameOf(out)}`, (op, fence) => this.drive.update(f.id, { name: nameOf(out), appProperties: op }, { fence }))));
    // A thing made since the last tidy-up and named now is one change: its making, under its name.
    // Its making never sent: one line under the new name; otherwise the rename is its own forward line.
    if (made && (await this.retracted(made.id)) === 'dropped') {
      await this.journal.record('create', `New ${f.folder ? 'folder' : 'note'} "${(f.folder ? nameOf(out) : thingName(nameOf(out)))}" in ${where(parentOf(out))}`, { path: out, fileId: f.id });
    } else await this.journal.record('rename', `Renamed ${(f.folder ? nameOf(path) : thingName(nameOf(path)))} to ${(f.folder ? nameOf(out) : thingName(nameOf(out)))}`, { path: out, from: path, fileId: f.id });
    this.emit();
    return out;
  }

  async create(folder: string, type: 'note' | 'folder', name?: string): Promise<string> {
    const ix = await this.index();
    const parent = ix.idOf(folder);
    if (!parent) throw new BowerError('not-found', 'That folder is no longer there.');
    const base = name ?? (type === 'folder' ? 'New folder' : 'Untitled.md');
    checkCreationName(base, type);
    // One intended note or folder, one id: tried again after a lost answer, it is found by that id, not made twice. A
    // free name is picked for its first send only; a retry resends that one (the folder listed since may show it).
    const fresh = sentAs(parent, freeName(ix.entries(), folder, base), type === 'folder' ? undefined : '');
    const made = await this.intended.make(`create:${parent}:${type}:${base}`, this.drive, fresh, (id, sent) =>
      type === 'folder' ? makeFolder(this.drive, this.drive, { ...sent, id }) : makeText(this.drive, this.drive, { ...sent, id }, ''));
    const path = join(folder, made.name);
    ix.put(made);
    await this.journal.record('create', `New ${type} "${(type === 'folder' ? nameOf(path) : thingName(nameOf(path)))}" in ${where(folder)}`, { path, fileId: made.id });
    this.emit();
    return path;
  }

  async trash(path: string): Promise<void> {
    const ix = await this.index();
    if (inInbox(path)) {
      // A pile goes to the Bin as a whole: its folder, or its lone file.
      const top = path.split('/').slice(0, 2).join('/');
      const f = ix.file(top);
      if (!f || top === 'Inbox') throw new BowerError('not-found', 'That is no longer in the inbox.');
      this.refuseWhileRunning();
      // Things still on their way wait with the pile, and go on if Undo brings it back.
      const pileKey = f.appProperties?.[PROP.pile] ?? f.id;
      const declarations = await this.declarationCopiesOf(pileKey, f);
      const pending = this.uploads.get(pileKey);
      this.uploads.delete(pileKey);
      const held = await this.withdrawPile(pileKey, pending, f.folder ? f.id : undefined).catch((e: unknown) => {
        if (pending && this.current()) this.uploads.set(pileKey, pending);
        throw e;
      });
      // What landed though its answer was lost is in the Bin already, and comes back with the pile on Undo.
      const binned: DriveFile[] = [...held.binned];
      for (const made of held.binned) ix.drop(made.id);
      let pileFile: DriveFile;
      try {
        // Its declaration goes with it, so no device lists it again; Undo brings both back. The copies go first:
        // stopped halfway, the pile is still listed, and removing it again finishes the job.
        await this.binDeclarations(pileKey, declarations);
        pileFile = await this.toBin(f);
        ix.drop(f.id);
      } catch (e) {
        if (pending && this.current()) this.uploads.set(pileKey, pending);
        this.resumeQueued(held.ids);
        throw e;
      }
      await this.endQueued(held.ids);
      // What arrived though its answer was lost, here or filed elsewhere, is not sent again on Undo.
      if (pending) pending.entries = pending.entries.filter((e) => !held.arrived.has(e.key));
      for (const e of pending?.entries ?? []) delete e.queued;
      for (const key of new Set([f.id, pileKey])) {
        binned.push(...(this.lateFor.get(key) ?? []));
        this.lateFor.delete(key);
      }
      const copies = this.removedDeclarations(pileKey);
      const late = [...new Map(binned.map((b) => [b.id, b])).values()];
      this.bin.set(path, { file: pileFile, change: null, top, ...(pending ? { pending, pileKey } : {}), ...(late.length ? { late } : {}), ...(copies.length ? { declarations: copies } : {}) });
      this.emit();
      return;
    }
    const f = this.mustFile(ix, path);
    removeEntry(ix.entries(), path);
    const made = (await this.journal.list()).find((c) => c.kind === 'create' && c.path === path);
    const binned = await this.toBin(f);
    ix.drop(f.id);
    this.bin.set(path, { file: binned, change: null });
    // Something made and binned before any tidy-up saw it leaves no trace.
    let change: string | null = null;
    // Its making never sent: it leaves no trace; otherwise the Bin is its own forward line.
    if (!made || (await this.retracted(made.id)) !== 'dropped') {
      try {
        change = (await this.journal.record('trash', `Put ${(f.folder ? nameOf(path) : thingName(nameOf(path)))} in the Bin`, { path, fileId: f.id })).id;
      } catch (e) {
        if (e instanceof BowerError && e.applied) this.bin.set(path, { file: binned, change: e.applied.changeId ?? null });
        throw e;
      }
    }
    this.bin.set(path, { file: binned, change });
    this.emit();
  }

  async restore(path: string): Promise<void> {
    const gone = this.bin.get(path);
    if (!gone) throw new BowerError('not-found', 'It is no longer in the Bin.');
    const version = gone.pending?.entries.some((e) => e.body) ? await this.captureUploadVersion() : null;
    for (const f of gone.declarations ?? []) await this.fromBin(f);
    if (gone.file === null) {
      // A loose thing that never arrived: its declaration was all there was of it.
      this.bin.delete(path);
      await this.refresh();
      return;
    }
    const ix = await this.index();
    // The name may have been taken since: come back under a free one, never over it.
    // A pile goes back whole, under its own folder's name.
    const at0 = gone.top ?? path;
    // Out of the Bin and under that name in one write, fenced on a fresh read every press (`once`): a press after a lost
    // answer finds it by its stamp only while it is still out of the Bin, there, under that name. Only the name chosen
    // is kept across presses (once taken by the file itself, it is no longer free), never what the file was.
    const want = gone.back ?? freeName(ix.entries(), parentOf(at0), nameOf(at0));
    gone.back = want;
    let back: DriveFile;
    try {
      back = await this.fromBin(gone.file, want);
      for (const f of gone.late ?? []) await this.fromBin(f);
    } catch (e) {
      // No network for the restore or its check (TL-P4-27 addenda 4 (4) and 5): said as offline, so the Undo says it
      // is not undone yet, in place; any other refusal is its own.
      const read = notRead(e) ? (e as BowerError & { cause: { error: unknown } }).cause.error : e;
      if (isNoAnswer(read)) throw new BowerError('offline', DRIVE_MESSAGES.offline, undefined, { cause: e });
      throw e;
    }
    // Its Bin line dropped when never sent; otherwise a move line back from the Bin, where it came back, is its inverse
    // (TL-P4-27 addendum 4 (2)): a run sees both, and the thing as it is.
    if (gone.change && (await this.journal.retract(gone.change)) === 'sent') {
      const at = join(parentOf(at0), want);
      await this.journal.record('move', `Put back ${back.folder ? want : thingName(want)}`, { path: at, from: at, fileId: back.id, undoes: gone.change });
    }
    this.bin.delete(path);
    await this.refresh();
    if (gone.pending && gone.pileKey) {
      for (const e of gone.pending.entries) { e.item.upload = 0; e.forgetVersion = version; }
      this.uploads.set(gone.pileKey, gone.pending);
      this.track(this.send(gone.pileKey, version));
    }
  }

  async markSeen(path: string): Promise<void> {
    const f = (await this.index()).file(path);
    if (!f) return;
    this.checkCurrent();
    markSeen(f.id, f.modifiedTime);
    this.emit();
  }

  async toggleTask(path: string, index: number): Promise<void> {
    this.refuseWhileRunning();
    if (isRunnerPath(path)) throw new BowerError('conflict', 'Bower keeps this file up to date.');
    const ix = await this.index();
    const f = this.mustFile(ix, path);
    // The text of the version toggled, so a retry of the same toggle is the same write (`once`).
    const out = toggleTaskInText(await this.reads.text(f, () => this.drive.readText(f.id)), index);
    let written: DriveFile;
    try {
      written = await this.once(f, { text: out.text }, (op, fence) => this.drive.writeText(f.id, out.text, f.modifiedTime, op, { fence }), () => this.refuseWhileRunning());
    } catch (e) {
      // Changed somewhere else: show the new version, write nothing.
      if (e instanceof BowerError && e.code === 'conflict') this.refreshAside();
      throw e;
    }
    ix.put(this.keepSeen(f, written));
    if (this.current()) this.notes.set(f.id, { modified: written.modifiedTime, note: parseNote(path, out.text), text: out.text });
    await this.journal.record('task', `${out.done ? 'Ticked' : 'Unticked'} "${out.label}" in ${displayName(nameOf(path))}`, { path, fileId: f.id });
    this.emit();
  }

  async linkAddress(path: string): Promise<string | null> {
    const f = (await this.index()).file(path);
    if (!f || f.folder || !path.endsWith('.url')) return null;
    return savedLinkUrl(await this.drive.readText(f.id));
  }

  async search(query: string): Promise<SearchHit[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const first = words[0];
    if (!first) return [];
    const ix = await this.index();
    const hits: Array<SearchHit & { score: number }> = [];
    const named = new Set<string>();
    for (const e of ix.entries().values()) {
      // What waits in the inbox is found by its name too (a pile's own note is not a thing).
      if (e.type !== 'file' || nameOf(e.path) === PILE_NOTE) continue;
      const title = thingName(nameOf(e.path));
      const searchable = displayName(nameOf(e.path)).toLowerCase();
      if (!words.every((w) => searchable.includes(w))) continue;
      named.add(e.path);
      hits.push({ path: e.path, title, snippet: inInbox(e.path) ? 'Waiting in the inbox' : placeOf(parentOf(e.path)), score: 3 });
    }
    const entries = ix.entries();
    // Drive's full text has no "#": a tag is found by its word, then matched as #tag below.
    const candidates = (await this.drive.fullText(await this.rootId(), first.replace(/^#/, '')))
      .map((h) => ({ h, path: ix.pathOf(h.id) }))
      .filter((c): c is { h: DriveFile; path: string } => !!c.path && !named.has(c.path) && !inInbox(c.path) && /\.(md|url)$/.test(c.path) && entries.has(c.path))
      .slice(0, MAX_READS);
    const found = await inBatches(candidates, async ({ h, path }) => {
      // A saved link is found by its web address, never by its file's syntax.
      if (path.endsWith('.url')) {
        const address = savedLinkAddress(await this.drive.readText(h.id));
        return address && words.every((w) => address.toLowerCase().includes(w)) ? { path, title: thingName(nameOf(path)), snippet: address, score: 1 } : null;
      }
      const n = await this.parsed(h, path, true);
      if (!n) return null;
      const line = searchLines(n).map(plainText).find((l) => words.every((w) => l.toLowerCase().includes(w)));
      return line ? { path, title: n.title, snippet: plainSnippet(line), score: 1 } : null;
    });
    for (const f of found) if (f) hits.push(f);
    return hits
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 50)
      .map(({ score: _score, ...h }) => h);
  }

  async changes(): Promise<ChangeEntry[]> {
    // An original and its inverse are hidden as a pair (`pairsOf`, TL-P4-27 addendum 3): presentation only.
    const lines = await this.journal.list();
    const paired = pairsOf(lines);
    return lines.filter((l) => !paired.has(l.id)).map(toChange);
  }

  // ---------- the inbox

  /**
   * The piles as the folder listing alone shows them, with no file read: what Home draws first while `piles()` reads
   * each pile's note and what was filed of it. A pile's words are its folder's name; whether a pile is ready, held or
   * has things on their way is for `piles()` to say.
   */
  async pilesListed(): Promise<Pile[]> {
    const ix = await this.index();
    const out: Pile[] = [];
    for (const f of ix.filesIn('Inbox')) {
      const path = ix.pathOf(f.id);
      if (!path) continue;
      const id = f.appProperties?.[PROP.pile] ?? f.id;
      const createdAt = Date.parse(f.createdTime);
      if (!f.folder) {
        out.push({ id, path, text: '', createdAt, items: [itemOf(f)] });
        continue;
      }
      const items = ix.filesIn(path).filter((k) => !k.folder && k.name !== PILE_NOTE).map(itemOf);
      const words = f.name.replace(/^\d{4}-\d{2}-\d{2} /, '');
      out.push({ id, path, text: words === 'Pile' ? '' : words, createdAt, items: [...items, ...this.sendingRows(ix, id)] });
    }
    // What is on its way is known here, with no read; the queue is read as it is, never started (Home's full read starts it).
    this.addSending(ix, out);
    out.sort((a, b) => b.createdAt - a.createdAt);
    return ix.file(SYSTEM.questions) ? this.projectQuestions(out, ix, true) : out;
  }

  /** A pile's things still on its way from this page or a reload, minus those whose file already shows (listed once). */
  private sendingRows(ix: VaultIndex, pileId: string): PileItem[] {
    const listed = (id: string | null): boolean => id !== null && ix.pathOf(id) !== undefined;
    const queued = this.queuedItems(pileId).filter((i) => !listed(i.fileId));
    return [...(this.uploads.get(pileId)?.entries ?? []).filter((e) => !listed(this.reservedFor(e))).map((e) => e.item), ...queued.map(queuedRow)];
  }

  /** Lone things on their way have no file yet: they are shown from this page's uploads and the queue a reload left. */
  private addSending(ix: VaultIndex, out: Pile[]): void {
    for (const [id, u] of this.uploads) if (u.lone && !out.some((p) => p.id === id)) out.push({ id, text: '', createdAt: u.createdAt, items: u.entries.map((e) => e.item) });
    for (const item of this.queuedItems()) {
      if (item.fileId !== null && ix.pathOf(item.fileId) !== undefined) continue;
      const pile = out.find((p) => p.id === item.pileId);
      if (pile) {
        if (!pile.path && !pile.items.some((i) => i.id === item.memberKey)) pile.items.push(queuedRow(item));
      } else out.push({ id: item.pileId, text: '', createdAt: Date.parse(item.addedAt), items: [queuedRow(item)] });
    }
  }

  async piles(context?: OwnershipContext): Promise<Pile[]> {
    const arrivals = this.arrived.size;
    // What a reload left on its way goes on, from where Drive stopped.
    this.startQueue().catch((e: unknown) => {
      // Signed out: nothing to resume, and nothing to say.
      if (!(e instanceof BowerError && e.code === 'auth')) console.error(e);
    });
    const ix = await this.index();
    const out: Pile[] = [];
    // Current context-removal lines, read at most once for this listing, only if a pile needs them.
    let journal: Promise<unknown[]> | null = null;
    const changes = (): Promise<unknown[]> =>
      (journal ??= journalValues(ix.journalFiles(), (id) => this.readTextOnce(id)).catch((e: unknown) => {
        // Logged once for this listing; each pile that needed them says it could not be checked.
        console.error(e);
        throw e;
      }));
    // Each pile is read at the same time as the others: the slowest pile, not their sum, is the wait.
    const row = async (f: DriveFile): Promise<Pile | null> => {
      const path = ix.pathOf(f.id);
      if (!path) return null;
      const id = f.appProperties?.[PROP.pile] ?? f.id;
      if (!f.folder) {
        // A declared loose file waits for the run's reason, by the rule the run shares (TL-P2-21, TL-P2-29).
        const loose = f.appProperties?.[PROP.declaration] ? await this.looseState(f) : null;
        const item = loose?.changed ? { ...itemOf(f), changed: true as const } : itemOf(f);
        const setAside = loose?.setAside ?? (await this.untidied(id, f, [f]));
        return { id, path, text: '', createdAt: Date.parse(f.createdTime), items: [item], ...(setAside ? { setAside } : {}) };
      }
      const kids = ix.filesIn(path).filter((k) => !k.folder);
      const note = kids.find((k) => k.name === PILE_NOTE);
      let parsed: ParsedNote | null = null;
      let unread = false;
      let refused: SetAside | null = null;
      try {
        parsed = note ? await this.parsed(note, `${path}/${PILE_NOTE}`, false, context) : null;
      } catch (e) {
        // A note Drive cannot give back now holds only its own pile (TL-P2-08 (a)): logged once for this pile and
        // listing, never kept, so the next listing reads it again. Signed out, or a session that changed, stops all.
        if (!(e instanceof BowerError) || e.code === 'auth' || !this.current()) throw e;
        // A note Bower will not parse keeps its pile visible and held, with why; a retry does not change a format.
        // It is logged once until it changes (TL-P2-08); a read failure, once per listing.
        const format = noteRefusal(e);
        const seen = note ? `${note.id}@${note.modifiedTime}` : '';
        if (!format || !this.refusalsLogged.has(seen)) console.error(e);
        if (format) {
          this.refusalsLogged.add(seen);
          refused = format === 'newer' ? 'note-format' : 'note-damaged';
        } else unread = true;
      }
      // Pile.text is editable context, so a refusal must not masquerade as saved text: the note is locked instead.
      const locked = unread || refused !== null;
      const text = parsed?.body.trim() ?? '';
      // A pile whose note could not be read already waits, logged: nothing more of it is read (or logged) now.
      const marked = !!f.appProperties?.[PROP.declaration];
      const declared = marked && !locked ? await this.declaredState(f, this.uploads.get(id)) : null;
      const sending = this.sendingRows(ix, id);
      const contextKey = declared?.contextKey ?? null;
      // Every note with the pile's context key is its context, never a thing to file; unread, any keyed pile note.
      const bound = (k: DriveFile): boolean => (contextKey ? k.appProperties?.[PROP.item] === contextKey : marked && locked && k.name === PILE_NOTE && !!k.appProperties?.[PROP.item]);
      const things = kids.filter((k) => k !== note && !bound(k));
      // A changed thing shows as changed; one that has left the pile is not listed again, and the reason says so.
      const items = [...things.map((k) => (declared?.changed.has(k.id) ? { ...itemOf(k), changed: true as const } : itemOf(k))), ...sending, ...(declared?.rows ?? [])];
      // What the tidy-up cannot write down waits, as not checked, here and in the tidy-up (pile-readiness `writable`):
      // the names, and the raw text (front matter included) of the one note it records (`recordedNote`).
      const recorded = recordedNote(kids, contextKey);
      // A note already found unreadable in this listing is not read (nor logged) again.
      const raw = locked && recorded === note ? null : recorded ? await this.rawText(recorded) : '';
      // A note with text no record can carry is a damaged note (TL-P2-36 (9)): Remove, no Try again, never written
      // over; logged once until it changes.
      const logRefusal = (file: DriveFile | undefined, e: BowerError): void => {
        const seen = file ? `${file.id}@${file.modifiedTime}` : '';
        if (this.refusalsLogged.has(seen)) return;
        this.refusalsLogged.add(seen);
        console.error(e);
      };
      if (refused === null && raw !== null && !writable([raw])) {
        refused = 'note-damaged';
        logRefusal(recorded, new BowerError('unknown', SET_ASIDE_TEXT['note-damaged'], undefined, { cause: { kind: 'note-refused', refusal: 'damaged', reason: 'text-cannot-be-recorded' } }));
      }
      // The note a run records, when it is not the first one, is refused the same way (its format, or damage).
      if (refused === null && raw !== null && recorded && recorded !== note) {
        try {
          parseNote(`${path}/${PILE_NOTE}`, raw, context ? { fileId: recorded.id, context } : undefined);
        } catch (e) {
          const format = noteRefusal(e);
          if (!format || !(e instanceof BowerError)) throw e;
          refused = format === 'newer' ? 'note-format' : 'note-damaged';
          logRefusal(recorded, e);
        }
      }
      const noteLocked = locked || refused !== null;
      const setAside = refused ?? (unread || raw === null || !writable([f.name, raw, ...kids.map((k) => k.name)]) ? 'not-checked' : declared ? await this.setAsideFor(declared, path, kids, things.length, text, sending, changes) : null)
        ?? (raw === null ? null : await this.untidied(id, f, things, { kids, recorded, raw, remaining: declared?.remaining ?? [] }));
      // Its note is shown read-only until a listing reads it (RFC 9110 §13.1.1: no update over an unseen version).
      if (noteLocked) this.lockedNotes.set(id, refused ? SET_ASIDE_TEXT[refused] : NOTE_LOCKED);
      else this.lockedNotes.delete(id);
      return { id, path, text: refused ? '' : text, createdAt: Date.parse(f.createdTime), items, ...(setAside ? { setAside } : {}), ...(noteLocked ? { noteLocked: true as const } : {}) };
    };
    for (const pile of await Promise.all(ix.filesIn('Inbox').map(row))) if (pile) out.push(pile);
    this.addSending(ix, out);
    for (const pile of await this.looseMissing(new Set(out.map((p) => p.id)))) out.push(pile);
    // Queue completion updates the listing through fromQueue. Publish only when that listing and the
    // queued rows stayed consistent across the reads; otherwise reuse the listing and read caches.
    // The queue keeps read-back pending members in flight. A done file still needs its completion event here.
    if (this.arrived.size !== arrivals || this.queued.queue.items().some((i) => i.state === 'done' && i.file && !this.arrived.has(i.id))) return this.piles(context);
    out.sort((a, b) => b.createdAt - a.createdAt);
    return ix.file(SYSTEM.questions) ? this.projectQuestions(out, ix) : out;
  }

  async orphanSummary(): Promise<{ count: number; complete: boolean }> {
    await this.piles();
    const result = await this.declarationsFor(await this.index());
    this.checkCurrent();
    return { ...result.summary };
  }

  /** The same cached record query used by a full piles read, including its unknown evidence. */
  private declarationsFor(ix: VaultIndex): Promise<{ declarations: Array<LooseDeclaration & { missingLoose: boolean }>; summary: { count: number; complete: boolean } }> {
    const files = this.known(ix);
    const kept = this.declarationSnapshot(ix);
    if (kept.read) return kept.read;
    const read = (async () => {
      const inbox = ix.file('Inbox');
      if (!inbox?.folder) return { declarations: [], summary: { count: 0, complete: false } };
      const root = ix.idOf('');
      if (!root) throw new BowerError('unknown', 'Bower could not find your folder.');
      const found = await findPileDeclarations(files, root, inbox.id, (id) => this.readBytesOnce(id), this.declarationCache);
      const summary = { count: 0, complete: found.complete };
      const declarations: Array<LooseDeclaration & { missingLoose: boolean }> = [];
      let journal: Promise<unknown[]> | null = null;
      const journalFailure: { error?: unknown } = {};
      // Only current context-removal lines apply; archived changes are not recovery evidence.
      const removed = async (path: string, contextBinned: boolean): Promise<boolean> => contextRemoved(
        await (journal ??= journalValues(ix.journalFiles(), (id) => this.readTextOnce(id)).catch((e: unknown) => {
          if ((e instanceof BowerError && e.code === 'auth') || !this.current()) throw e;
          // Every candidate shares this rejection and its one log for the snapshot.
          console.error(e);
          journalFailure.error = e;
          throw e;
        })), path, contextBinned);
      // One Bin lookup serves every declaration of this read, started by the first that asks; its failure is logged once.
      let bin: ReturnType<DriveApi['binnedByItem']> | null = null;
      const binFailure: { error?: unknown } = {};
      const binned = async (keys: readonly string[]) => (await (bin ??= this.drive.binnedByItem(root, [...new Set(found.declarations.flatMap((d) => binKeys(d.declaration, files)))]).catch((e: unknown) => {
        if ((e instanceof BowerError && e.code === 'auth') || !this.current()) throw e;
        console.error(e);
        binFailure.error = e;
        throw e;
      }))).filter((h) => keys.includes(h.file.appProperties?.[PROP.item] ?? ''));
      for (const declaration of found.declarations) {
        try {
          const state = await orphanState(declaration, inbox, files, (id) => this.readBytesOnce(id),
            (f) => this.digestOf(f), binned, this.dispositionCache, removed);
          declarations.push({ ...declaration, missingLoose: state.missingLoose });
          if (state.state === 'orphan') summary.count++;
          if (state.state === 'unknown') summary.complete = false;
        } catch (e) {
          if ((e instanceof BowerError && e.code === 'auth') || !this.current()) throw e;
          if ((!('error' in journalFailure) || journalFailure.error !== e) && binFailure.error !== e) console.error(e);
          summary.complete = false;
        }
      }
      this.checkCurrent();
      return { declarations, summary };
    })();
    kept.read = read;
    // A session refusal reaches its caller; it must not poison later reads of this snapshot.
    read.catch((e: unknown) => {
      console.error(e);
      if (this.fullDeclarations?.read === read) this.fullDeclarations = null;
    });
    return read;
  }

  /** Row accounting and the summary share the current full-read snapshot, invalidated by the same evidence. */
  private declarationSnapshot(ix: VaultIndex): NonNullable<DriveVault['fullDeclarations']> {
    const evidence = [...this.known(ix), ...ix.journalFiles()];
    const kept = this.fullDeclarations;
    if (kept?.ix === ix && evidence.length === kept.files.length && evidence.every((f, i) => f === kept.files[i])) return kept;
    return (this.fullDeclarations = { ix, files: evidence, read: null, binned: new Map() });
  }

  /** Sends a removed pile's declaration copies to the Bin, remembering each one in case the Remove stops halfway. */
  private async binDeclarations(pileKey: string, copies: readonly DriveFile[]): Promise<void> {
    const ix = await this.index();
    const done = this.removing.get(pileKey) ?? [];
    this.removing.set(pileKey, done);
    for (const copy of copies) {
      done.push(await this.toBin(copy));
      ix.drop(copy.id);
    }
  }

  /** Every copy this pile's Remove sent to the Bin, across tries; forgotten once the Remove is done. */
  private removedDeclarations(pileKey: string): DriveFile[] {
    const done = this.removing.get(pileKey) ?? [];
    this.removing.delete(pileKey);
    return done;
  }

  /**
   * Every copy of a pile's declaration: by the declaration id its folder or loose file carries, or, for a
   * loose thing that never arrived (no file), by its pile id. None for a pile with no declaration.
   */
  private async declarationCopiesOf(pileId: string, marked: DriveFile | undefined): Promise<DriveFile[]> {
    const declarationId = marked?.appProperties?.[PROP.declaration];
    if (marked && !declarationId) return [];
    if (!declarationId) return this.looseDeclarationOf(pileId);
    return declarationCopies(this.known(await this.index()), await this.rootId(), declarationId);
  }

  /** The files holding a loose pile's declaration, found by its pile id; none for any other pile. */
  private async looseDeclarationOf(pileId: string): Promise<DriveFile[]> {
    const ix = await this.index();
    const inbox = ix.file('Inbox');
    if (!inbox?.folder) return [];
    const found = await findLooseDeclarations(this.known(ix), await this.rootId(), inbox.id, (id) => this.readBytesOnce(id), this.declarationCache, new Set(), pileId);
    this.checkCurrent();
    return found.filter((d) => d.declaration.pileId === pileId).flatMap((d) => d.copies);
  }

  /**
   * Declared loose things that have not arrived, from any device (fixture 07): the folder-pile accounting
   * with the inbox as the pile's place. One in the inbox is listed as itself, one filed has left it, and
   * one you put in the Bin from the inbox was removed; only one with no file anywhere waits, to be sent
   * from the device that has it. `listed` are the piles already shown, this device's own sends included.
   */
  private async looseMissing(listed: ReadonlySet<string>): Promise<Pile[]> {
    const ix = await this.index();
    const inbox = ix.file('Inbox');
    if (!inbox?.folder) return [];
    // The full-read snapshot already excluded anchors and retired stamps and accounted for the Bin.
    const found = (await this.declarationsFor(ix)).declarations.filter((d) => d.missingLoose);
    this.checkCurrent();
    const out: Pile[] = [];
    for (const { declaration } of found) {
      const [member] = declaration.members;
      if (!member || listed.has(declaration.pileId)) continue;
      // Only a missing-member decision waits for device hydration; an ordinary listing can finish before sign-in.
      await this.startQueue();
      this.checkCurrent();
      const retained = this.queued.queue.items().find((i) => i.pileId === declaration.pileId && i.memberKey === member.memberKey);
      if (retained && !retained.gone) {
        out.push({ id: declaration.pileId, text: '', createdAt: declaration.createdAt, items: [retained.file ? itemOf(retained.file) : queuedRow(retained)] });
        continue;
      }
      out.push({ id: declaration.pileId, text: '', createdAt: declaration.createdAt, items: [{ id: member.memberKey, name: shownName(member), kind: member.kind, origin: member.origin ?? 'Added in Drive', upload: -1, chooseAgain: true }] });
    }
    return out;
  }

  /**
   * A declared pile as Drive has it, from the facts a tidy-up reads: its
   * things that have not arrived and are not on their way from here (shown
   * while its folder is there, so any device can see them), its changed
   * things, and why a tidy-up would leave it in the inbox.
   */
  private async declaredState(folder: DriveFile, u: Upload | undefined, queued: readonly string[] = []): Promise<DeclaredState> {
    const ix = await this.index();
    const found = await this.declarationOf(folder, this.known(ix));
    if (found.state !== 'found') return { rows: [], contextKey: null, contextBinned: false, changed: new Set(), lookup: found.state, blocked: null, missing: [], remaining: [] };
    const contextKey = found.declaration.context.kind === 'text' ? found.declaration.context.memberKey : null;
    const drive = this.drive;
    const root = await this.rootId();
    const snapshot = this.declarationSnapshot(ix);
    // Missing context and members share one identity-based Bin lookup, including after queue hydration.
    let binRead: ReturnType<DriveApi['binnedByItem']> | null = null;
    const binned = (keys: readonly string[]) => {
      if (binRead) return binRead;
      const wanted = [...keys].sort();
      const key = JSON.stringify([folder.id, wanted]);
      binRead = snapshot.binned.get(key) ?? drive.binnedByItem(root, wanted);
      snapshot.binned.set(key, binRead);
      return binRead;
    };
    // The tidy-up's own accounting: a member a consumed disposition records is filed, the rest looked up.
    const account = async () => {
      // Take the file evidence and in-flight members together, before any accounting read can yield.
      const files = this.known(ix);
      const local = new Set([...(u?.entries.map((e) => e.key) ?? []), ...queued, ...this.queuedItems(found.declaration.pileId).map((i) => i.memberKey)]);
      const readiness = await accountPile(found.declaration, found.sha256, folder, files, (id) => this.readBytesOnce(id), (f) => this.digestOf(f), binned, this.dispositionCache);
      return { readiness, local };
    };
    let { readiness, local } = await account();
    this.checkCurrent();
    if (readiness.members.some((m) => m.state === 'missing')) {
      await this.startQueue();
      this.checkCurrent();
      // Hydration may have brought in a member or its arrival: decide from one fresh snapshot of both.
      ({ readiness, local } = await account());
      this.checkCurrent();
    }
    const contextBinned = readiness.contextBinned;
    const state = new Map(readiness.members.map((m) => [m.memberKey, m]));
    // Only a member with no file anywhere has not arrived; a changed or unchecked one is not sent again.
    const missing = found.declaration.members.filter((m) => state.get(m.memberKey)?.state === 'missing');
    const rows = missing
      .filter((m) => !local.has(m.memberKey))
      .map((m) => ({ id: m.memberKey, name: shownName(m), kind: m.kind, origin: m.origin ?? 'Added in Drive', upload: -1, chooseAgain: true as const }));
    const changed = new Set(readiness.members.flatMap((m) => (m.state === 'changed' ? m.fileIds : [])));
    return { rows, contextKey, contextBinned, changed, lookup: found.state, blocked: readiness.blocked, missing: missing.map((m) => m.memberKey), remaining: readiness.remaining };
  }

  /**
   * Why a tidy-up that would take this pile cannot write it down now, by the rules the run shares (TL-P2-38): its id
   * or a name no run record can carry, a thing Drive keeps no checksum of (`checkable`, from the listing alone), a
   * note whose text is not the bytes stored, or a declared member read as the pile's note. The run holds such a pile;
   * null when it can take it. A listing reads no thing's bytes (it would read every file in the inbox each time): a
   * thing whose bytes cannot be read just now holds its pile for that run only, and the next run tries again.
   */
  private async untidied(id: string, place: DriveFile, things: readonly DriveFile[], folder?: { kids: readonly DriveFile[]; recorded: DriveFile | undefined; raw: string; remaining: readonly string[] }): Promise<SetAside | null> {
    if (!recordablePile(id, [place.name, ...(folder?.kids ?? []).map((k) => k.name)])) return 'not-tidied';
    if (!things.every(checkable)) return 'not-tidied';
    if (folder && memberAsNote(folder.kids, folder.remaining)) return 'not-tidied';
    if (folder?.recorded && !(await sameText(folder.raw, await this.digestOf(folder.recorded)))) return 'not-tidied';
    this.checkCurrent();
    return null;
  }

  /** An arrived declared loose file as the run takes it: why it waits, and whether its bytes changed. */
  private async looseState(file: DriveFile): Promise<{ setAside: SetAside | null; changed: boolean }> {
    const ix = await this.index();
    const files = this.known(ix);
    const drive = this.drive;
    const root = await this.rootId();
    const binned = (keys: readonly string[]) => drive.binnedByItem(root, keys);
    const loose = await accountLoose(await this.declarationOf(file, files), ix.file('Inbox'), files, (id) => this.readBytesOnce(id), (f) => this.digestOf(f), binned, this.dispositionCache);
    this.checkCurrent();
    const changed = loose.found?.accounting.members.some((m) => m.state === 'changed' && m.fileIds.includes(file.id)) ?? false;
    return { setAside: looseSetAside(loose), changed };
  }

  /** Why a tidy-up would leave this declared pile in the inbox now, or null. */
  private async setAsideFor(d: DeclaredState, path: string, kids: readonly DriveFile[], things: number, text: string, sending: readonly PileItem[], changes: () => Promise<unknown[]>): Promise<SetAside | null> {
    // Things still on their way from this device have not failed to arrive: they say Sending….
    const onTheirWay = new Set(sending.filter((i) => i.upload !== -1).map((i) => i.id));
    if (d.blocked === 'not-arrived' && d.missing.every((k) => onTheirWay.has(k))) return null;
    // A note missing though you never removed it has not arrived: the tidy-up holds the pile (TL-P2-32), and Try
    // again writes it again from its first words, so the pile is not empty either.
    const key = d.contextKey;
    if (d.lookup !== 'found' || d.blocked || !key || kids.some((k) => k.appProperties?.[PROP.item] === key)) return setAsideOf(d.lookup, d.blocked, { things, text, restore: false });
    if (contextRemoved([], path, d.contextBinned)) return setAsideOf(d.lookup, d.blocked, { things, text, restore: false });
    let records: unknown[];
    try {
      records = await changes();
    } catch {
      // expected: logged once by the listing; only this pile waits, the rest of the inbox is listed.
      return 'not-checked';
    }
    this.checkCurrent();
    return contextRemoved(records, path, d.contextBinned) ? setAsideOf(d.lookup, d.blocked, { things, text, restore: false }) : 'not-arrived';
  }

  private async declarationOf(folder: DriveFile, files: readonly DriveFile[]): Promise<DeclarationLookup> {
    const found = await findDeclaration(files, await this.rootId(), folder, (id) => this.readBytesOnce(id), this.declarationCache);
    this.checkCurrent();
    // Only this pile waits (TL-P2-08 (a)); its failure is logged once, until its list can be read again.
    if (found.state !== 'unreadable') this.unreadableLogged.delete(folder.id);
    else if (!this.unreadableLogged.has(folder.id)) {
      this.unreadableLogged.add(folder.id);
      console.error(found.error);
    }
    return found;
  }

  /** Everything already listed, Bower's own pile declarations included, by real parents: no new listing. */
  private known(ix: VaultIndex): DriveFile[] {
    const out = new Map<string, DriveFile>();
    for (const path of ix.entries().keys()) {
      const f = ix.file(path);
      if (f) out.set(f.id, f);
    }
    const under = (parent: DriveFile, name?: string): DriveFile[] => {
      const path = ix.pathOf(parent.id);
      return path === undefined ? [] : ix.filesIn(path).filter((f) => name === undefined || (f.folder && f.name === name));
    };
    const root = ix.filesIn('').filter((f) => f.folder && f.name === SYSTEM.dir);
    for (const bower of root) {
      out.set(bower.id, bower);
      for (const piles of under(bower, nameOf(SYSTEM.piles))) {
        out.set(piles.id, piles);
        for (const f of under(piles)) out.set(f.id, f);
      }
    }
    return [...out.values()];
  }

  /** A file's size and hash from its bytes, kept while it is unchanged; null when they cannot be read. */
  private async digestOf(f: DriveFile): Promise<Digest | null> {
    try {
      return await this.reads.digest(f, () => this.digestFresh(f));
    } catch (e) {
      // A file that cannot be read now is not counted as arrived; the next listing asks again.
      if (!(e instanceof NoDigest)) console.error(e);
      return null;
    }
  }

  private async digestFresh(f: DriveFile): Promise<Digest> {
    // The listing carries what Drive stored: no download. A Docs file keeps none (`unchecked`); one just written is not listed yet.
    if (f.sha256 !== undefined && f.size !== undefined) return { size: f.size, sha256: f.sha256 };
    if (f.unchecked) throw new NoDigest();
    // The Drive says what it stored; one that must read the file is given the bytes the text read already holds.
    // None stored: not kept, so the next listing asks again. The digest is what is kept; the bytes behind it are not.
    const d = await this.drive.storedDigest(f.id, (await this.bytesFromText(f)) ?? undefined);
    if (d) return d;
    throw new NoDigest();
  }

  /** A declared pile's note, missing though you never removed it, written again from its first words. */
  private async restoreContext(pile: Pile): Promise<void> {
    const ix = await this.index();
    const folder = pile.path ? ix.file(pile.path) : undefined;
    if (!pile.path || !folder?.folder || !folder.appProperties?.[PROP.declaration]) return;
    const found = await this.declarationOf(folder, this.known(ix));
    if (found.state !== 'found' || found.declaration.context.kind !== 'text') return;
    const context = found.declaration.context;
    if (ix.filesIn(pile.path).some((f) => f.appProperties?.[PROP.item] === context.memberKey)) return;
    const state = await this.declaredState(folder, this.uploads.get(pile.id));
    if (contextRemoved(await journalValues(ix.journalFiles(true), (id) => this.readTextOnce(id)), pile.path, state.contextBinned)) return;
    // A tidy-up may be writing it too: wait for it; and look again right before writing, so it is written once.
    if (this.runningPiles().has(pile.id)) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
    const now = (await this.drive.listAll(folder.id)).filter((f) => f.parents[0] === folder.id);
    this.checkCurrent();
    const there = now.find((f) => f.appProperties?.[PROP.item] === context.memberKey);
    if (there) {
      ix.put(there);
      this.emit();
      return;
    }
    const made = await makeText(this.drive, this.drive, { parent: folder.id, name: PILE_NOTE, props: { [PROP.item]: context.memberKey } }, context.originalText);
    this.checkCurrent();
    ix.put(made);
    this.emit();
  }

  /**
   * Writes a pile's declaration in `.bower/piles`, before anything of the pile exists. With no folder
   * name it declares a loose single thing (fixture 07): its anchor is the inbox it is sent into.
   */
  private async declare(input: NewPile, text: string, inbox: string, name: string | null, createdAt: number): Promise<Declared> {
    const root = await this.rootId();
    const mint = (kind: string): string => `${kind}-${createdAt.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const contextKey = mint('context');
    const members = await Promise.all(input.items.map(async (it) => ({ memberKey: mint('member'), name: declaredName(it), kind: it.kind, origin: it.origin, content: await contentOf(it) })));
    const declaration: Declaration = {
      v: 1, kind: 'pile-declaration', scope: { rootId: root }, declarationId: mint('decl'), pileId: mint('pile'), createdAt,
      anchor: name === null ? { kind: 'loose', inboxId: inbox } : { kind: 'folder', inboxId: inbox, name, createKey: mint('anchor') }, members,
      context: text ? { kind: 'text', memberKey: contextKey, originalText: text, content: await utf8(text) } : { kind: 'absent' },
    };
    const record = await declarationRecord(declaration, root);
    if (!record) {
      console.error('A pile declaration was refused by its own contract check.');
      throw new BowerError('unknown', 'Bower could not save this pile. Try again.');
    }
    const at = await this.systemFolder(SYSTEM.piles);
    const written = await makeText(this.drive, this.drive, { parent: at, name: record.name, props: recordStamp(declaration.pileId, name === null ? 'loose' : 'folder') }, record.text);
    this.checkCurrent();
    (await this.index()).put(written);
    return { pileId: declaration.pileId, declarationId: declaration.declarationId, contextKey, keys: members.map((m) => m.memberKey), hashes: members.map((m) => m.content.sha256) };
  }

  async addPile(input: NewPile): Promise<Pile> {
    const text = input.text.trim();
    if (!input.items.length && !text) throw new BowerError('conflict', 'Add a file, a link or a line first.');
    const version = input.items.some((it) => it.body) ? await this.captureUploadVersion() : null;
    const ix = await this.index();
    const inbox = ix.idOf('Inbox') ?? (await this.systemFolder('Inbox'));
    const createdAt = Date.now();
    let id = `new-${createdAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let parent = inbox;
    let path: string | undefined;
    const lone = !pileHasFolder({ id, text, createdAt, items: input.items.map((it, i) => ({ ...it, id: String(i) })) });
    let declared: Declared | null = null;
    if (!lone) {
      path = join('Inbox', freeName(ix.entries(), 'Inbox', pileFolderName({ id, text, createdAt, items: [] })));
      // A declared pile's declaration comes first: a failed write leaves nothing to send.
      if (this.declarePiles) declared = await this.declare(input, text, inbox, nameOf(path), createdAt);
      const folder = await makeFolder(this.drive, this.drive, { parent: inbox, name: nameOf(path), ...(declared ? { props: { [PROP.pile]: declared.pileId, [PROP.declaration]: declared.declarationId } } : {}) });
      this.checkCurrent();
      ix.put(folder);
      id = declared?.pileId ?? folder.id;
      parent = folder.id;
      if (text) {
        try {
          ix.put(await makeText(this.drive, this.drive, { parent: folder.id, name: PILE_NOTE, ...(declared ? { props: { [PROP.item]: declared.contextKey } } : {}) }, text));
        } catch (e) {
          if (!this.current()) throw e;
          // Half a pile helps nobody: its empty folder goes to the Bin, and you can save again.
          await this.toBin(folder).catch((err: unknown) => console.error(err));
          ix.drop(folder.id);
          throw e;
        }
      }
    } else if (this.declarePiles && input.items.length === 1) {
      // A loose single thing is declared too, before it is sent, so any device sees it until it arrives.
      declared = await this.declare(input, '', inbox, null, createdAt);
      id = declared.pileId;
    }
    const entries: Sending[] = input.items.map((it, i) => ({
      key: declared?.keys[i] ?? `${id}-${i}-${Math.random().toString(36).slice(2, 10)}`,
      item: { id: declared?.keys[i] ?? `${id}-${i}`, name: it.name, kind: it.kind, origin: it.origin, upload: 0 },
      ...(it.body ? { body: it.body, forgetVersion: version } : {}),
      ...(it.url ? { url: it.url } : {}),
      ...(it.body && declared?.hashes[i] ? { sha256: declared.hashes[i] } : {}),
    }));
    if (entries.length) {
      const u: Upload = { lone, createdAt, parent, entries, ...(declared ? { declaration: declared.declarationId } : {}) };
      this.uploads.set(id, u);
      // Queue.add resolves after the device transaction (or its explicit memory fallback), never after transfer.
      // Stage every accepted Blob before reporting saved, even while the first transfer is held.
      for (const e of entries) if (e.body) {
        await this.startQueue();
        this.checkCurrent();
        const { name, props } = this.sendTarget(ix, id, u, e);
        await this.stageQueued(id, u, e, e.body, name, props, version);
        this.checkCurrent();
      }
      this.track(this.send(id, version));
    }
    this.emit();
    return { id, text, createdAt, items: entries.map((e) => ({ ...e.item })), ...(path ? { path } : {}) };
  }

  async removePile(id: string): Promise<void> {
    this.refuseWhileRunning();
    const pile = await this.pile(id);
    const ix = await this.index();
    const f = pile.path ? ix.file(pile.path) : undefined;
    // Its declaration goes to the Bin with it (TL-P2-31), so no device lists it any more; for a loose
    // thing that never arrived, the declaration is all there is of it.
    const declarations = await this.declarationCopiesOf(id, f);
    const u = this.uploads.get(id);
    this.uploads.delete(id);
    // A thing whose answer was lost may be in Drive already, where it was sent: it goes to the Bin first (`withdraw`).
    // Drive not answering whether it landed, nothing is removed and the pile stays as it was.
    const held = await this.withdrawPile(id, u, f?.folder ? f.id : undefined).catch((e: unknown) => {
      if (u && this.current()) this.uploads.set(id, u);
      throw e;
    });
    for (const made of held.binned) ix.drop(made.id);
    let binned: DriveFile | null = null;
    try {
      // The copies first: stopped halfway, the pile is still listed, and Remove again finishes the job.
      await this.binDeclarations(id, declarations);
      if (f) {
        binned = await this.toBin(f);
        ix.drop(f.id);
      }
    } catch (e) {
      // Nothing was removed for good: the pile keeps its things, and they go on.
      if (u && this.current()) this.uploads.set(id, u);
      this.resumeQueued(held.ids);
      throw e;
    }
    // Only now are their bytes no longer needed.
    await this.endQueued(held.ids);
    // Undo, from where it was (or by its id when it had no place), brings back its folder and declaration.
    const copies = this.removedDeclarations(id);
    if (f || copies.length) this.bin.set(pile.path ?? id, { file: binned, change: null, ...(pile.path ? { top: pile.path } : {}), ...(copies.length ? { declarations: copies } : {}) });
    this.emit();
  }

  async updatePile(id: string, input: string, base?: string): Promise<Pile> {
    this.refuseWhileRunning();
    // Words typed over a note the person was shown without its words would replace it unseen (a lost update,
    // RFC 9110 §13.1.1): refused while the listing they saw could not read it, even if Drive answers now.
    const seen = this.lockedNotes.get(id);
    if (seen) throw new BowerError('conflict', seen);
    const pile = await this.pile(id);
    if (pile.noteLocked) throw new BowerError('conflict', this.lockedNotes.get(id) ?? NOTE_LOCKED);
    // A draft is saved only over the words it started from (RFC 9110 §13.1.1, If-Match): words changed elsewhere
    // since are never replaced unseen; the person looks again, and their draft stays on the screen.
    if (base !== undefined && pile.text !== base.trim()) {
      this.refreshAside();
      throw new BowerError('conflict', 'This changed somewhere else. Look again and try once more.');
    }
    const text = input.trim();
    if (!pile.items.length && !text) throw new BowerError('conflict', 'A pile with no files needs its note.');
    const ix = await this.index();
    const conversionKey = `pile-conversion:${id}`;
    const pending = this.intended.conversion(conversionKey);
    // Resume the whole conversion before a refreshed folder can enter the ordinary edit branch.
    let f = pending?.loose ?? (pile.path ? ix.file(pile.path) : undefined);
    if (!f || !pile.path) throw new BowerError('not-found', 'That pile is already filed.');
    let pilePath = pile.path;
    const converting = pending !== undefined || (!f.folder && text !== '');
    if (converting) {
      const loose = f;
      if (!pending) {
        await this.stillAsSeen(f);
        // A declared loose thing becomes an ordinary pile: its declaration copies go to the Bin first.
        for (const copy of await this.declarationCopiesOf(id, f)) {
          await this.toBin(copy);
          ix.drop(copy.id);
        }
      }
      const parent = loose.parents[0] ?? (await this.rootId());
      const converted = await this.intended.convert(conversionKey, this.drive, this.drive, () => ({
        loose,
        folder: sentAs(parent, freeName(ix.entries(), 'Inbox', pileFolderName({ ...pile, text }))),
        props: { [PROP.pile]: id },
        noteName: PILE_NOTE,
        text,
      }), (loose, folder) => this.once(loose, `move:${folder.id}`, (op, fence) => this.drive.update(loose.id, { addParent: folder.id, ...(loose.parents[0] ? { removeParent: loose.parents[0] } : {}), appProperties: op }, { fence })));
      ix.put(converted.folder);
      ix.put(converted.loose);
      ix.put(converted.note);
      if (!pending || text === pending.text) {
        this.emit();
        return this.pile(id);
      }
      // The first intent has fully landed. Newer words now use the ordinary fenced note update below,
      // with the note's landed modifiedTime, while the conversion keeps its first folder name.
      f = converted.folder;
      pilePath = join('Inbox', f.name);
    }
    if (!f.folder) return pile;
    // The folder as listed, unless it already holds this very edit's rename (its answer lost): then the retry
    // goes on, and `once` takes that landed write as done.
    const folderIntent = text && !converting ? `rename:${freeName(ix.entries(), 'Inbox', pileFolderName({ ...pile, text }), pilePath)}` : null;
    await this.fence(seenPlace(f), f.id, folderIntent === null ? undefined : landing(f, folderIntent));
    const note = ix.file(join(pilePath, PILE_NOTE));
    // A note listed is the one this pile has: an id kept for an earlier create of it is no longer needed.
    if (note) {
      this.intended.forget(`pile-note:${id}`);
      this.pileNoteSent.delete(`pile-note:${id}`);
    }
    // Words Bower could not read are never saved over: the note must read back first.
    if (note) await this.text(note);
    // Check the context before a rename or removal can partially apply a stale edit: its name, place and words as
    // read (the one fence, as every content write), unless this very write already landed (a retry of the person's own
    // unknown write, `once`).
    // What this edit does to the note decides what "landed" means: its words, a declared pile's empty note, or the Bin.
    const declared = f.folder && f.appProperties?.[PROP.declaration] ? await this.declarationOf(f, this.known(ix)) : null;
    if (note) await this.fence({ ...seenPlace(note), modifiedTime: note.modifiedTime }, note.id, landing(note, text ? { text } : declared ? { text: '' } : 'bin'));
    let folderPath = pilePath;
    if (text && !converting) {
      const name = freeName(ix.entries(), 'Inbox', pileFolderName({ ...pile, text }), pilePath);
      if (name !== nameOf(pilePath)) {
        ix.put(await this.once(f, `rename:${name}`, (op, fence) => this.drive.update(f.id, { name, appProperties: op }, { fence })));
        folderPath = join('Inbox', name);
      }
    }
    const folderId = ix.idOf(folderPath);
    const contextKey = declared?.state === 'found' && declared.declaration.context.kind === 'text' ? declared.declaration.context.memberKey : null;
    if (note && text) ix.put(await this.once(note, { text }, (op, fence) => this.drive.writeText(note.id, text, note.modifiedTime, op, { fence })));
    // A declared pile's note stays, empty: its context arrived, and only your words changed.
    else if (note && declared) ix.put(await this.once(note, { text: '' }, (op, fence) => this.drive.writeText(note.id, '', note.modifiedTime, op, { fence })));
    else if (note) {
      await this.toBin(note);
      ix.drop(note.id);
    } else if (text && folderId) {
      // One intended note per pile: a try again after a double failure, with new words, writes them into the same note.
      const key = `pile-note:${id}`;
      const props = contextKey ? { props: { [PROP.item]: contextKey } } : {};
      const kept = this.intended.kept(key);
      const sent = kept ? (this.pileNoteSent.get(key) ?? []) : [];
      this.pileNoteSent.set(key, [...sent, text]);
      let made: DriveFile;
      try {
        made = await this.intended.make(key, this.drive, sentAs(folderId, PILE_NOTE, text), async (reserved, first) => {
          // Where and as what it was first sent with this id (`write-once.ts`), never a place read anew.
          const at = { ...first, ...props };
          // Found by its reserved id, it is Bower's to write over only as it was made: in this pile, under its name,
          // out of the Bin, with words Bower sent (write-once's `landed`). Moved, renamed, binned or edited since, it is
          // refused, and its id let go: it stays as the person left it.
          const there = reserved === kept ? await madeAt(this.drive, { ...at, id: reserved }, sent) : null;
          if (!there) return makeText(this.drive, this.drive, { ...at, id: reserved }, text);
          // It landed with words Bower sent: the new ones go into it, stamped and fenced on the version that holds them.
          return this.once(there, { text }, (op, fence) => this.drive.writeText(there.id, text, there.modifiedTime, op, { fence }));
        });
      } catch (e) {
        // Refused or let go: nothing more is kept for it, and the pile is shown as it is now.
        if (this.intended.kept(key) === undefined) this.pileNoteSent.delete(key);
        if (notAsSeenReason(e) !== null) this.refreshAside();
        throw e;
      }
      this.pileNoteSent.delete(key);
      ix.put(made);
    }
    this.emit();
    return this.pile(id);
  }

  async retryPile(id: string): Promise<void> {
    const version = await this.captureUploadVersion();
    // The queue tries again what waited for a connection or stopped, this page's or a reload's.
    if (this.queued.queue.items().some((i) => i.pileId === id && i.state !== 'done' && !i.gone)) this.queued.queue.retry(undefined, version);
    const held = this.queuedItems(id);
    const u = this.uploads.get(id);
    if (!u) {
      // Left on its way by a reload: the upload queue sends it again.
      if (held.length) {
        this.emit();
        return;
      }
      const pile = (await this.piles()).find((p) => p.id === id);
      if (!pile) return;
      // A declared pile's note needs no bytes from you: it is written again from its first words.
      await this.restoreContext(pile);
      // Another device's declared thing that never arrived: only its file can send it.
      const missing = pile.items.find((i) => i.upload === -1);
      if (missing) throw new BowerError('conflict', missing.kind === 'link' ? 'Paste the link again on this device to send it.' : `Choose ${missing.name} again on this device to send it.`);
      // Nothing to send from here (a pile Bower could not check): look at Drive again now.
      await this.refresh();
      return;
    }
    if (this.sendingPiles.has(id)) return;
    for (const e of u.entries) { e.item.upload = 0; e.forgetVersion = version; }
    this.emit();
    this.track(this.send(id, version));
  }

  /**
   * A declared thing that has not arrived, and whose bytes are not on this
   * device, chosen again (D02, TL-P2-07): sent once, under its declared member
   * key and declaration, only when its size and hash are the declared ones.
   * `itemId` is the thing asked for; bytes that are another thing waiting to
   * be chosen in the same pile are sent as that one. Anything else is refused
   * and nothing is sent: it stays missing, and can be chosen again. Its
   * siblings are never sent again.
   */
  async chooseAgain(pileId: string, itemId: string, chosen: ChosenAgain): Promise<void> {
    this.refuseWhileHeld(pileId);
    const version = chosen.body ? await this.captureUploadVersion() : null;
    const pile = await this.pile(pileId);
    const ix = await this.index();
    const folder = pile.path ? ix.file(pile.path) : undefined;
    const found = folder?.folder && folder.appProperties?.[PROP.declaration] ? await this.declarationOf(folder, this.known(ix)) : null;
    const asked = found?.state === 'found' ? found.declaration.members.find((m) => m.memberKey === itemId) : undefined;
    if (!folder || found?.state !== 'found' || !asked) throw new BowerError('not-found', 'That is no longer there.');
    const link = asked.kind === 'link';
    const url = link ? chosen.url : undefined;
    const bytes = link ? (url === undefined ? null : new Blob([shortcut(url)])) : (chosen.body ?? null);
    const refused = new BowerError('conflict', link ? NOT_THE_SAME_TEXT.link : NOT_THE_SAME_TEXT.file);
    if (!bytes) throw refused;
    const digest = await sha256(bytes);
    this.checkCurrent();
    // The things still missing, and not on its way from here: only one of them is sent.
    const state = await this.declaredState(folder, this.uploads.get(pileId), this.queuedItems(pileId).map((i) => i.memberKey));
    const waiting = new Set(state.rows.map((r) => r.id));
    const same = found.declaration.members.filter((m) => (m.kind === 'link') === link && m.content.size === bytes.size && m.content.sha256 === digest);
    const member = same.find((m) => m.memberKey === itemId && waiting.has(m.memberKey)) ?? same.find((m) => waiting.has(m.memberKey)) ?? same[0];
    if (!member) throw refused;
    // The thing asked for still waits, and these are a sibling's bytes that already arrived: not it.
    if (!waiting.has(member.memberKey) && waiting.has(itemId)) throw refused;
    // The same as the thing asked for, which arrived or is on its way from here meanwhile: nothing to send.
    if (!waiting.has(member.memberKey)) {
      this.emit();
      return;
    }
    const key = member.memberKey;
    // Another device may have sent it since this one listed the folder: look before sending.
    const there = (await this.drive.listAll(folder.id)).find((f) => f.parents[0] === folder.id && f.appProperties?.[PROP.item] === key);
    this.checkCurrent();
    if (there) {
      ix.put(there);
      this.emit();
      return;
    }
    // Nothing awaited from here on: a tidy-up that took the pile meanwhile, or the same thing
    // chosen twice at once, is seen now and never sent.
    this.refuseWhileHeld(pileId);
    const u = this.uploads.get(pileId);
    if (u?.entries.some((e) => e.key === key) || this.queuedItems(pileId).some((i) => i.memberKey === key)) return;
    const entry: Sending = {
      key,
      sha256: member.content.sha256,
      item: { id: key, name: shownName(member), kind: member.kind, origin: member.origin ?? 'Added in Drive', upload: 0 },
      ...(url === undefined ? { body: bytes, forgetVersion: version } : { url }),
    };
    if (u) u.entries.push(entry);
    else this.uploads.set(pileId, { lone: false, createdAt: pile.createdAt, parent: folder.id, entries: [entry], declaration: found.declaration.declarationId });
    this.emit();
    // A send already going picks it up; otherwise one starts.
    this.track(this.send(pileId, version));
  }

  /** A tidy-up holds this pile: nothing is sent into it until it ends. */
  private refuseWhileHeld(pileId: string): void {
    if (this.runningPiles().has(pileId)) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
  }

  async duplicates(files: Array<{ name: string; body?: Blob }>): Promise<Array<string | null>> {
    const known = (await this.json(SYSTEM.hashes))?.hashes ?? {};
    const ix = await this.index();
    return Promise.all(
      files.map(async (f) => {
        if (!f.body) return null;
        const path = known[await sha256(f.body)];
        return path && ix.entries().has(path) ? path : null;
      }),
    );
  }

  /** The last tidy-up's own report, as the runner wrote it. */
  lastRun(): Promise<LastRunFile | null> {
    return this.json(SYSTEM.lastRun);
  }

  /** The Bower root as Drive keeps it now; gone or in the Bin, the folder is not there. */
  private async liveRoot(): Promise<DriveFile> {
    const root = await byId(this.drive, await this.rootId());
    if (!root || root.trashed) throw new BowerError('not-found', 'Your Bower folder is not there any more.');
    return root;
  }

  async firstTidy(): Promise<FirstTidy> {
    const props = (await this.liveRoot()).appProperties ?? {};
    const marks = new Set(FIRST_TIDY_STEPS.filter((s) => props[FIRST_TIDY_PROP[s]] === '1'));
    const [listed, run] = await Promise.all([this.pilesListed(), this.lastRun()]);
    return firstTidyFrom(marks, { piles: listed.length > 0, ran: run !== null });
  }

  async markFirstTidy(step: FirstTidyStep): Promise<FirstTidy> {
    try {
      const root = await this.liveRoot();
      const key = FIRST_TIDY_PROP[step];
      if (root.appProperties?.[key] !== '1') {
        // Drive merges a properties patch: only this step's key is sent, so marks from any device all stay.
        await this.once(root, `first-tidy:${step}`, (op, fence) => this.drive.update(root.id, { appProperties: { ...op, [key]: '1' } }, { fence }));
        this.emit();
      }
      return await this.firstTidy();
    } catch (e) {
      if (e instanceof BowerError) throw e;
      console.error(e);
      throw new BowerError('unknown', FIRST_TIDY_SAVE_FAILED, undefined, { cause: e });
    }
  }

  /** One plain sentence about keeping uploads on this device, or `null`. */
  uploadNotice(): string | null {
    const queue = this.queued.queue;
    const told = queue.notice();
    // What this device could not read stays said: those things must be chosen again.
    if (told === UNREADABLE_TEXT) return told;
    // Keeping Bower open matters while this device holds bytes not yet in Drive: waiting, on their
    // way, or failed and waiting for Try again (TL-P2-19, TL-P2-22). Discarded ones are no longer held.
    const held = queue.items().filter((i) => !i.gone && (i.state === 'waiting' || i.state === 'uploading' || i.state === 'failed'));
    if (!held.length) return null;
    if (told) return told;
    if (queue.persistence() === 'refused') return PERSIST_REFUSED_TEXT;
    return held.find((i) => i.note)?.note ?? null;
  }

  /** Waits until every thing being sent to the inbox has arrived or failed. */
  async settled(): Promise<void> {
    while (this.sending.size) await Promise.all([...this.sending]);
  }

  // ---------- Bower: rules, requests, questions, suggestions

  async rules(): Promise<Rule[]> {
    const ix = await this.index();
    let file = ix.file('Rules.md');
    let worded: Rule[] = [];
    if (file && !file.folder) {
      // A tidy-up may have worded the pending lines since this view's last listing.
      file = await this.drive.get(file.id);
      ix.put(file);
      const text = await this.text(file);
      try {
        worded = managedRules(text, file.appProperties?.[PROP.by] === 'bower' || parseNote('Rules.md', text).byBower);
      } catch (error) {
        if (noteRefusal(error) !== 'damaged' || !this.current()) throw error;
        const seen = `${file.id}@${file.modifiedTime}`;
        if (!this.refusalsLogged.has(seen)) {
          this.refusalsLogged.add(seen);
          console.error(error, 'The rules note could not be read; only pending rules are listed.');
        }
      }
    }
    const all = await this.journal.list();
    const paired = pairsOf(all);
    const lines = all.filter((r) => r.kind === 'rule' && !paired.has(r.id));
    // Your rule lines in line order, as the next tidy-up words them (`ruleSequence`, the one home): an add taken out
    // by a later line is not listed; a rule line and its standing Undo cancel (`pairsOf`).
    const { removed, accepted } = ruleSequence(
      worded,
      lines.filter((r) => !r.removes).map((r) => ({ recordId: r.id, text: r.text ?? r.what, yourWords: r.text ?? r.what, since: r.at })),
      lines.flatMap((r) => (r.removes ? [{ recordId: r.id, text: r.removes, since: r.at }] : [])),
    );
    const pending = [...accepted].reverse().map((a): Rule => ({ id: a.recordId, text: a.text, yourWords: a.yourWords, since: a.since, pending: true }));
    return [...pending, ...worded.filter((r) => !removed.has(r.text))];
  }

  /** The person's own text in the rules note, as the note page shows it; '' for Bower's own note, no note or a damaged region. */
  async rulesProse(): Promise<string> {
    let file = (await this.index()).file('Rules.md');
    if (!file || file.folder) return '';
    file = await this.drive.get(file.id);
    try {
      const note = await this.parsed(file, 'Rules.md');
      return note.byBower ? '' : note.body.trim();
    } catch (error) {
      // rules() already logs a damaged region once; no second message for one file.
      if (noteRefusal(error) !== 'damaged' || !this.current()) throw error;
      return '';
    }
  }

  async addRule(input: string): Promise<Rule> {
    const text = input.trim();
    if (!text) throw new BowerError('conflict', 'Write the rule first.');
    if (ruleLike(await this.rules(), text)) throw new BowerError('conflict', 'You have that rule already.');
    const r = await this.journal.record('rule', `New rule: "${text}"`, { path: 'Rules.md', text });
    this.emit();
    return { id: r.id, text, yourWords: text, since: r.at, pending: true };
  }

  async removeRule(id: string): Promise<() => Promise<void>> {
    const r = (await this.rulesForRemoval(id)).find((x) => x.id === id);
    if (!r) throw new BowerError('not-found', 'That rule is no longer there.');
    if (r.pending) {
      // Not worded yet: its line goes when never sent, and Undo writes it again. Sent, it is taken out by a forward
      // line that undoes it (TL-P4-27 addendum 4 (3)), and Undo takes that line back in turn.
      if ((await this.journal.retract(r.id)) === 'dropped') {
        this.emit();
        return async () => {
          await this.addRule(r.yourWords ?? r.text);
        };
      }
      const out = await this.journal.record('rule', `Removed the rule "${r.text}"`, { path: 'Rules.md', removes: r.text, undoes: r.id });
      this.emit();
      return () => this.undoRuleLine(out.id, r.text);
    }
    const line = await this.journal.record('rule', `Removed the rule "${r.text}"`, { path: 'Rules.md', removes: r.text });
    this.emit();
    return () => this.undoRuleLine(line.id, r.text);
  }

  /** Another page may have sent a rule and drained the shared outbox since this listing was cached. */
  private async rulesForRemoval(id: string): Promise<Rule[]> {
    const rules = await this.rules();
    if (rules.some((r) => r.id === id)) return rules;
    await this.refresh();
    return this.rules();
  }

  /**
   * The Undo of a rule line (TL-P4-27 addenda 2 and 4 (3)): dropped when never sent; otherwise its inverse is recorded,
   * the rule again for a removal, its removal for a rule kept.
   */
  private async undoRuleLine(id: string, text: string, kept = false): Promise<void> {
    if ((await this.journal.retract(id)) === 'sent') {
      if (kept) {
        const { removed } = ruleSequence(await this.rulesForRemoval(id), [], [{ recordId: id, text }]);
        const words = [...removed][0] ?? text;
        await this.journal.record('rule', `Removed the rule "${words}"`, { path: 'Rules.md', removes: words, undoes: id });
      } else await this.journal.record('rule', `New rule: "${text}"`, { path: 'Rules.md', text, undoes: id });
    }
    this.emit();
  }

  /** The requests waiting for a tidy-up, newest first: not taken back, and not a withdrawal or its undo (a line with `undoes` and no `text`). */
  private async waitingRequests(): Promise<Request[]> {
    const lines = await this.journal.list();
    const gone = takenBack(lines);
    return lines
      .filter((r) => r.kind === 'request' && !gone.has(r.id) && !isWithdrawal(r))
      .reverse()
      .map((r): Request => ({ id: r.id, text: r.text ?? r.what, at: r.at }));
  }

  async requests(): Promise<Request[]> {
    const done = (await this.json(SYSTEM.requests))?.done ?? [];
    return [...(await this.waitingRequests()), ...done];
  }

  /**
   * Takes a waiting request back (qa-live-claude-F3): a withdrawal line, never a drop of the request line, so a line
   * whose reply was lost cannot run unwithdrawn and Undo finds the request as it was (`takenBack` reads the pair).
   */
  async removeRequest(id: string): Promise<() => Promise<void>> {
    let r = (await this.waitingRequests()).find((x) => x.id === id);
    if (!r) {
      // Another page may have sent or drained the line since this listing.
      await this.refresh();
      r = (await this.waitingRequests()).find((x) => x.id === id);
    }
    if (!r) throw new BowerError('not-found', 'That request is no longer there.');
    const words = r.text;
    const w = await this.journal.record('request', 'Took back a request', { undoes: id });
    this.emit();
    return () => this.putBackRequest(w.id, words);
  }

  /**
   * Undo of a withdrawal: dropped when never sent; otherwise a line that undoes it, unless a tidy-up took or archived
   * the pair, when the words are asked again. Known limit: an Undo pressed offline whose line arrives after another
   * device's tidy-up took the pair is archived with it and the request is not back (rare; the person asks again).
   */
  private async putBackRequest(w: string, words: string): Promise<void> {
    if ((await this.journal.retract(w)) === 'sent') {
      await this.refresh();
      const ix = await this.index();
      const listed = (await this.journal.list()).some((l) => l.id === w);
      const file = ix.journalFiles().find((f) => f.name === `${w}.json`);
      // A line with no listed file is still in the outbox: its undo is queued after it. A file a run holds is not ours to undo.
      if (listed && !(file && ix.waitingRun(file.id) !== null)) await this.journal.record('request', 'Put back a request', { undoes: w });
      else await this.addRequest(words);
    }
    this.emit();
  }

  async addRequest(input: string, intent?: string): Promise<Request> {
    const text = input.trim();
    if (!text) throw new BowerError('conflict', 'Write what you want first.');
    const r = await this.journal.record('request', `Asked Bower: "${text}"`, { text }, intent);
    this.emit();
    return { id: r.id, text, at: r.at };
  }

  private runQuestions: () => readonly PublicQuestion[] = () => [];

  /** A view of the existing run stream, with no copied snapshot or additional polling. */
  bindRunQuestions(read: () => readonly PublicQuestion[]): () => void {
    this.runQuestions = read;
    return () => this.emit();
  }

  /** Shared subject policy over stored and live askings and the existing versioned reads. */
  private async questionSnapshot(inbox: Pile[], stored: QuestionsFile | null, lines: JournalRecord[], cachedOnly = false): Promise<{ open: Question[]; rounds: QuestionRound[]; piles: Pile[] }> {
    const ix = await this.index();
    const live = this.runQuestions();
    const merged = new Map((stored?.questions ?? []).map((q) => [askingKey(q), publicQuestion(q)]));
    for (const q of live) if (!merged.has(askingKey(q))) merged.set(askingKey(q), q);
    const questions = [...merged.values()];
    // Stored-only legacy reads keep their order; the additive live view presents askings chronologically.
    if (live.length) questions.sort((a, b) => a.askedAt - b.askedAt);
    inbox = await Promise.all(inbox.map(async (p) => {
      if (!(stored?.rounds?.length || questions.some((q) => q.words !== undefined))) return p;
      const note = p.path ? ix.file(join(p.path, PILE_NOTE)) : undefined;
      if (!note) return p;
      if (cachedOnly) {
        const read = this.reads.keptText(note, true);
        if (!read) return p;
        try { return { ...p, text: parseNote(join(p.path ?? '', PILE_NOTE), await read).body.trim() }; }
        catch (e) { console.error(e); return p; }
      }
      try { return { ...p, text: (await this.parsed(note, join(p.path ?? '', PILE_NOTE))).body.trim() }; }
      catch (e) { console.error(e); return p; }
    }));
    const here = new Set(inbox.flatMap((p) => [p.id, ...p.items.map((i) => i.id)]));
    for (const [id, u] of this.uploads) for (const e of u.entries) here.add(id).add(e.item.id);
    for (const item of this.queuedItems()) here.add(item.pileId).add(item.memberKey);
    const inboxHashes = new Map(ix.filesIn('Inbox').flatMap((f) => f.md5Checksum ? [[f.id, f.md5Checksum] as const] : []));
    const all = questions.filter((q) => {
      const pile = subjectPile(q, inbox, inboxHashes);
      if (!pile) return true;
      if (q.words !== undefined) return q.words === pile.text;
      // Old askings have no words. A fenced edit of their pile after asking ends them too.
      const folder = pile.path ? ix.file(pile.path) : undefined;
      return !folder?.appProperties?.[STAMP] || Date.parse(folder.modifiedTime) <= q.askedAt;
    });
    const hashes = new Set(ix.filesIn('Inbox').flatMap((f) => f.md5Checksum ? [f.md5Checksum] : []));
    return { open: openQuestions(all, answeredAskings(lines), { ids: here, hashes }, ix.notesSeen()), rounds: stored?.rounds ?? [], piles: inbox };
  }

  private async projectQuestions(piles: Pile[], ix: VaultIndex, cachedOnly = false): Promise<Pile[]> {
    const file = ix.file(SYSTEM.questions);
    const live = this.runQuestions().length > 0;
    if (!file && !live) return piles;
    const cached = file ? this.reads.keptText(file, cachedOnly) : null;
    // The listing initiates no media or checksum read. Full piles may read a nonempty questions file.
    if (!live && !cached && (cachedOnly || (file?.size !== undefined && file.size <= 40))) return piles;
    let stored: QuestionsFile = { v: 1, questions: [] };
    try {
      if (file && (cached || !cachedOnly)) {
        const value: unknown = JSON.parse(await (cached ?? this.readTextOnce(file.id)));
        if (isRunnerFile(SYSTEM.questions, value)) stored = value;
        else {
          if (!cached) console.error(new BowerError('unknown', 'Bower could not read its latest update. Try again.'), `${SYSTEM.questions} has an unsupported shape`);
          if (!live) return piles;
        }
      }
    } catch (e) {
      // The explicit questions reader owns its error; a marker cannot refuse the inbox or admission.
      if (e instanceof BowerError && (e.code === 'auth' || !this.current())) throw e;
      if (!cached) console.error(e);
      if (!live) return piles;
    }
    if (!live && !stored.questions.length && !stored.rounds?.length) return piles;
    const snapshot = await this.questionSnapshot(piles, stored, await this.journal.list(true), true);
    const hashes = new Map(piles.flatMap((p) => p.items.flatMap((i) => {
      const hash = ix.byId(i.id)?.md5Checksum;
      return hash ? [[i.id, hash] as const] : [];
    })));
    if (!cachedOnly && snapshot.rounds.some((r) => r.hash)) for (const p of piles) for (const i of p.items) {
      if (hashes.has(i.id)) continue;
      const meta = await this.drive.get(i.id, { checksums: true });
      if (meta.md5Checksum) hashes.set(i.id, meta.md5Checksum);
    }
    return piles.map((p) => {
      const question = pileQuestion(snapshot.piles.find((x) => x.id === p.id) ?? p, snapshot.open, snapshot.rounds, hashes);
      return { ...p, ...(question ? { question } : {}) };
    });
  }

  async typeTable() {
    return (await this.json(SYSTEM.typeTable))?.rows ?? [];
  }

  async questions(): Promise<Question[]> {
    const [stored, lines, inbox] = await Promise.all([this.json(SYSTEM.questions), this.journal.list(), this.pilesListed()]);
    const snapshot = await this.questionSnapshot(inbox, stored, lines);
    const file = (await this.index()).file(SYSTEM.questions);
    // Publish once per questions version through the existing cache and subscription. A subscriber may read
    // questions again; the cached publication prevents a refresh loop and belongs to this vault's lifetime.
    if (file) this.reads.publishText(file, () => this.emit());
    return snapshot.open;
  }

  /**
   * One answer per question (TL-P4-08 addendum 8): a question answered already, or being answered now on this page,
   * records nothing more. A yes to Bower keeping the summaries it did not write is also your rule saying so.
   */
  async answer(id: string, yes: QuestionAnswer): Promise<void> {
    const going = this.answering.get(id);
    if (going) return await going;
    const work = (async () => {
      const q = (await this.questions()).find((x) => x.id === id);
      if (!q) return;
      const answer = checkedAnswer(q, yes);
      const label = typeof answer === 'boolean' ? answer ? q.yes : q.no : 'text' in answer ? 'your words' : q.options?.find((o) => o.id === answer.option)?.label;
      await this.journal.record('answer', `Answered "${label}" to a question`, { questionId: id, askedAt: q.askedAt, answer,
        ...(typeof answer === 'boolean' ? { text: answer ? 'yes' : 'no' } : {}) });
      if (yes === true && id === ADOPT_STATES_ID && !ruleLike(await this.rules(), ADOPT_STATES_RULE)) {
        await this.journal.record('rule', `New rule: "${ADOPT_STATES_RULE}"`, { path: 'Rules.md', text: ADOPT_STATES_RULE });
      }
      this.emit();
    })();
    this.answering.set(id, work);
    try {
      await work;
    } finally {
      this.answering.delete(id);
    }
  }

  async suggestions(): Promise<Suggestion[]> {
    const all = (await this.json(SYSTEM.suggestions))?.suggestions ?? [];
    const dropped = dismissed();
    const rules = await this.rules();
    // A suggestion you already have as a rule is not offered again.
    return all.filter((s) => !dropped.includes(s.id) && !ruleLike(rules, s.title));
  }

  async dismissSuggestion(id: string, keep: boolean): Promise<() => Promise<void>> {
    const all = (await this.json(SYSTEM.suggestions))?.suggestions ?? [];
    const s = all.find((x) => x.id === id);
    this.checkCurrent();
    dismiss(id);
    const line = keep && s && !ruleLike(await this.rules(), s.title) ? await this.journal.record('rule', `Kept a suggestion as a rule: "${s.title}"`, { path: 'Rules.md', text: s.title }) : null;
    this.emit();
    return async () => {
      undismiss(id);
      if (line) await this.undoRuleLine(line.id, line.text ?? line.what, true);
      else this.emit();
    };
  }

  // ---------- plumbing

  protected async index(): Promise<VaultIndex> {
    this.checkCurrent();
    if (!this.ix) {
      const p = (async () => {
        const root = await this.rootId();
        const ix = VaultIndex.build(root, await this.drive.listAll(root, { checksums: true }));
        if (this.current()) this.listed = ix;
        return ix;
      })();
      this.ix = p;
      // expected: the caller hears the error; this only forgets the failed listing, so the next call lists again.
      p.catch(() => {
        if (this.ix === p) this.ix = null;
      });
    }
    const ix = await this.ix;
    this.checkCurrent();
    return ix;
  }

  protected emit(): void {
    if (!this.current()) return;
    this.listeners.forEach((l) => l());
  }

  /** The person's piles, as the inbox lists them. */
  protected async pile(id: string): Promise<Pile> {
    const p = (await this.piles()).find((x) => x.id === id);
    if (!p) throw new BowerError('not-found', 'That pile is already filed.');
    return p;
  }

  protected refuseWhileRunning(): void {
    if (this.runningPiles().size) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
  }

  /** A missing runner file is normal; an unreadable existing file needs attention. */
  protected async json<K extends keyof RunnerFiles>(path: K): Promise<RunnerFiles[K] | null> {
    const id = (await this.index()).systemId(path);
    if (!id) return null;
    let value: unknown;
    try {
      const text = await this.readTextOnce(id);
      if (path === SYSTEM.typeTable) {
        const read = readTypeTable(text);
        if (!read.writeAllowed) console.error(new BowerError('unknown', 'Bower could not read its latest update. Try again.'));
        return { ...read.table, rows: read.writeAllowed ? read.table.rows : [] } as RunnerFiles[K];
      }
      value = JSON.parse(text);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(`${path} is not valid JSON`);
      throw new BowerError('unknown', 'Bower could not read its latest update. Try again.');
    }
    if (!isRunnerFile(path, value)) {
      console.error(`${path} has an unsupported shape`);
      throw new BowerError('unknown', 'Bower could not read its latest update. Try again.');
    }
    return value;
  }

  /** A file at the version the latest listing gives it, by id. */
  private versionOf(id: string): Version {
    return { id, modifiedTime: this.listed?.byId(id)?.modifiedTime };
  }

  /** `drive.readText`, once per version of the file (`reads`); a failed read is forgotten so the next ask tries again. */
  protected readTextOnce(id: string): Promise<string> {
    return this.reads.text(this.versionOf(id), () => this.drive.readText(id));
  }

  protected readBytesOnce(id: string): Promise<Uint8Array> {
    return this.reads.bytes(this.versionOf(id), () => this.drive.readBytes(id));
  }

  /**
   * The bytes of a file whose text this view already read, without reading it again: text with no replacement
   * character is well-formed UTF-8, which has exactly one byte form, so its encoding is the stored bytes when it has
   * the stored size (a byte-order mark, dropped by the read, shows as a size that differs). Otherwise null.
   */
  private async bytesFromText(f: DriveFile): Promise<Uint8Array | null> {
    const read = this.reads.keptText(f);
    if (!read || f.size === undefined) return null;
    let text: string;
    try {
      text = await read;
    } catch {
      // expected: the text read's own caller hears the failure; the bytes are then read on their own.
      return null;
    }
    if (text.includes('\uFFFD')) return null;
    const bytes = new TextEncoder().encode(text);
    return bytes.byteLength === f.size ? bytes : null;
  }

  protected async text(f: DriveFile): Promise<string> {
    const text = await this.reads.text(f, () => this.drive.readText(f.id));
    this.checkCurrent();
    return text;
  }

  private track(p: Promise<void>): void {
    this.sending.add(p);
    void p.finally(() => this.sending.delete(p));
  }

  /** Sends a pile's things one by one; a failure marks that thing and goes on. */
  private async send(pileId: string, version: number | null): Promise<void> {
    const u = this.uploads.get(pileId);
    if (!u || this.sendingPiles.has(pileId)) return;
    this.sendingPiles.add(pileId);
    try {
      // Each thing once in this run: one chosen again while it ran is sent by it too, and one that
      // failed (even before it was tried) waits for Try again, never looped on.
      const seen = new Set<Sending>();
      for (let next: Upload | undefined = u; next; next = this.uploads.get(pileId)) {
        await this.sendAll(pileId, next, seen, version);
        if (!this.current() || !this.uploads.get(pileId)?.entries.some((e) => !seen.has(e))) break;
      }
    } finally {
      this.sendingPiles.delete(pileId);
    }
  }

  private async sendAll(pileId: string, u: Upload, seen: Set<Sending>, version: number | null): Promise<void> {
    const next = (): Sending | undefined => u.entries.find((x) => !seen.has(x));
    // Each thing once, in order, those added while this runs included.
    for (let e = next(); e; e = next()) {
      seen.add(e);
      if (!this.current()) return;
      if (this.uploads.get(pileId) !== u) return;
      try {
        const ix = await this.index();
        // Removed while the folder was listed: nothing is sent for it (its removal withdrew the holder already).
        if (!this.current() || this.uploads.get(pileId) !== u) return;
        const { name, props } = this.sendTarget(ix, pileId, u, e);
        e.item.upload = 0;
        // A link or an empty thing keeps the id reserved for it (`write-once.ts`): a try after a lost answer is that same file.
        const text = e.url ? shortcut(e.url) : '';
        const made = e.body ? await this.sendQueued(pileId, u, e, e.body, name, props, e.forgetVersion === undefined ? version : e.forgetVersion) : await makeOnce(e, this.addedDrive, sentAs(u.parent, name, text), (id, sent) => makeText(this.addedDrive, this.addedDrive, { ...sent, props, id }, text));
        if (!this.current()) return;
        if (this.uploads.get(pileId) !== u) {
          // The pile was removed while this was on its way. A link or an empty thing: its removal waited for this create
          // to settle (`withdraw`, one operation per holder) and decides on it, binning what landed; never twice.
          if (!e.body) return;
          // A queued thing: it follows the pile to the Bin, and comes back with it on Undo.
          const binned = await this.toBin(made).catch(async (err: unknown) => {
            console.error(err);
            return this.toBin(made);
          });
          // Its Bin entry may not exist yet (the pile's own Bin is still being written): then trash() takes it from here.
          let kept = false;
          for (const g of this.bin.values()) if (g.file?.id === u.parent || g.file?.id === pileId) { g.late = [...(g.late ?? []), binned]; kept = true; }
          if (!kept) for (const key of new Set([u.parent, pileId])) this.lateFor.set(key, [...(this.lateFor.get(key) ?? []), binned]);
          return;
        }
        ix.put(made);
        u.entries = u.entries.filter((x) => x !== e);
      } catch (err) {
        if (!this.current()) return;
        // The pile was removed while this was on its way: its upload stopped on purpose.
        if (this.uploads.get(pileId) !== u && e.queued) return;
        console.error(err);
        e.item.upload = -1;
      }
      this.emit();
    }
    if (!u.entries.length && this.uploads.get(pileId) === u) this.uploads.delete(pileId);
    this.emit();
  }

  /** Capture before an enclosing action hashes bytes or waits for Drive, including Undo. */
  private async captureUploadVersion(): Promise<number | null> {
    const account = await this.queued.account();
    try {
      const capture = this.queued.queue.captureForgetVersion;
      if (!capture) throw new Error('The upload queue cannot capture its forget version.');
      return await capture(account);
    }
    catch (error) {
      // expected: the queue reports its established memory fallback and never writes without a version.
      console.error(error);
      return null;
    }
  }

  /** Starts the upload queue for this person and folder, once: it resumes what a reload left. */
  private startQueue(): Promise<void> {
    const q = this.queued;
    if (!this.queueStart) {
      const p = (async () => {
        // Who it is first: signed out, the queue is never started.
        const account = await q.account();
        const folder = await this.rootId();
        this.checkCurrent();
        await q.queue.start(account, folder);
      })();
      this.queueStart = p;
      // expected: the caller hears the error; this only forgets the failed start, so the next call starts again.
      p.catch(() => {
        if (this.queueStart === p) this.queueStart = null;
      });
    }
    return this.queueStart;
  }

  /** The queue's things not yet in Drive and not sent by this page, for one pile or all. */
  private queuedItems(pileId?: string): QueueItem[] {
    const queue = this.queued.queue;
    const mine = new Set<string>();
    for (const u of this.uploads.values()) for (const e of u.entries) if (e.queued) mine.add(e.queued);
    return queue.items().filter((i) => (pileId === undefined || i.pileId === pileId) && (i.state === 'waiting' || i.state === 'uploading' || i.state === 'failed') && !i.gone && !mine.has(i.id));
  }

  /** Names include staged siblings not yet in the listing; the queue keeps the original target for every retry. */
  private sendTarget(ix: VaultIndex, pileId: string, u: Upload, e: Sending): { name: string; props: Record<string, string> } {
    const parentPath = ix.pathOf(u.parent) ?? 'Inbox';
    const entries = ix.entries();
    const items = this.queued.queue.items();
    for (const item of items) if (item.parentId === u.parent && item.id !== e.queued && item.state !== 'done') {
      const path = join(parentPath, item.name);
      entries.set(path, { path, type: 'file', modified: u.createdAt, created: u.createdAt });
    }
    const name = items.find((i) => i.id === e.queued)?.name ?? freeName(entries, parentPath, safeInboxName(e.item));
    // The existing session fence recognises a pile's thing by PROP.asAdded.
    const props = { [PROP.asAdded]: e.item.name, [PROP.origin]: e.item.origin, [PROP.kind]: e.item.kind, [PROP.item]: e.key, ...(u.lone ? { [PROP.pile]: pileId } : {}), ...(u.declaration ? { [PROP.declaration]: u.declaration } : {}) };
    return { name, props };
  }

  /** Retains one Blob through the queue's existing committed-device or memory-fallback boundary. */
  private async stageQueued(pileId: string, u: Upload, e: Sending, body: Blob, name: string, props: Record<string, string>, version: number | null): Promise<void> {
    if (e.queued) return;
    const queue = this.queued.queue;
    await this.startQueue();
    const added = await queue.add({ declarationId: u.declaration ?? pileId, memberKey: e.key, sha256: e.sha256 ?? (await sha256(body)), pileId, parentId: u.parent, name, body, type: body.type, appProperties: props }, version);
    e.queued = added.id;
  }

  /** Waits for the already staged member; transfer remains the queue's one mechanism. */
  private async sendQueued(pileId: string, u: Upload, e: Sending, body: Blob, name: string, props: Record<string, string>, version: number | null): Promise<DriveFile> {
    await this.stageQueued(pileId, u, e, body, name, props, version);
    const queue = this.queued.queue;
    return new Promise<DriveFile>((resolve, reject) => {
      let off = (): void => undefined;
      const look = (): void => {
        const it = queue.items().find((i) => i.id === e.queued);
        if (!this.current() || !it) {
          off();
          reject(new BowerError('unknown', stoppedText(e.item.kind)));
          return;
        }
        if (it.state === 'done' && it.file) {
          off();
          resolve(it.file);
          return;
        }
        if (it.state === 'failed' || it.error) {
          off();
          reject(it.error ?? new BowerError('unknown', NOT_SENT_TEXT));
          return;
        }
        const p = it.size ? Math.min(it.sent / it.size, 0.99) : 0;
        if (p !== e.item.upload) {
          e.item.upload = p;
          this.emit();
        }
      };
      off = queue.subscribe(look);
      look();
    });
  }

  /** The queue finished something, perhaps one a reload left: it is in Drive now. */
  private fromQueue(): void {
    const queue = this.queued.queue;
    if (!this.current()) return;
    const items = queue.items();
    // A new notice about this device's storage is news for the inbox, even with nothing held.
    const notice = this.uploadNotice();
    const told = notice !== this.noticeBefore;
    this.noticeBefore = notice;
    // Nothing held now nor before, and nothing new to say: nothing on screen changes.
    if (!items.length && !this.heldBefore && !told) return;
    this.heldBefore = items.length > 0;
    for (const item of items) {
      if (item.state !== 'done' || !item.file || this.arrived.has(item.id)) continue;
      this.arrived.add(item.id);
      const file = item.file;
      for (const [pileId, u] of this.uploads) {
        if (!u.entries.some((e) => e.queued === item.id)) continue;
        u.entries = u.entries.filter((e) => e.queued !== item.id);
        if (!u.entries.length && !this.sendingPiles.has(pileId)) this.uploads.delete(pileId);
      }
      void this.ix?.then((ix) => {
        if (this.current()) ix.put(file);
      });
    }
    this.emit();
  }

  /** The file id reserved for a thing this page is sending, once the queue has one. */
  private reservedFor(e: Sending): string | null {
    return e.queued ? (this.queued.queue.items().find((i) => i.id === e.queued)?.fileId ?? null) : null;
  }

  /**
   * Withdraws every create a pile still holds (`withdraw`, write-once's one exit): its queued things (their upload
   * records, each held back once its send settled), the links and empty things this page sends (`Sending`), and its
   * intended folder and note (`Intended`). A file that landed though its answer was lost goes to the Bin where it was
   * sent; one filed elsewhere, holding other bytes, or inside `folder` (which goes to the Bin with its things) stays,
   * and only what holds the bytes sent counts as arrived. Drive not answering: refused (`unreached`), the queue goes on
   * and the pile keeps every id.
   */
  private async withdrawPile(pileId: string, u: Upload | undefined, folder: string | undefined): Promise<{ ids: string[]; binned: DriveFile[]; arrived: Set<string> }> {
    const queue = this.queued.queue;
    const arrived = new Set<string>();
    const ids: string[] = [];
    const binned: DriveFile[] = [];
    const inFolder = (f: DriveFile): boolean => folder !== undefined && f.parents.includes(folder);
    const took = (w: Withdrawn, key: string): void => {
      if (w) arrived.add(key);
      if (w?.binned) binned.push(w.file);
    };
    try {
      for (const it of queue.items()) {
        if (it.pileId !== pileId || it.state === 'done') continue;
        // M4, accepted: a last chunk already on the wire may still land after this settles; it then shows in the inbox.
        const item = await queue.halt(it.id);
        if (!item) continue;
        ids.push(item.id);
        let ours = true;
        const w = await withdraw(heldAs(item.fileId, async () => undefined), this.drive, async (f) => {
          const sent = await this.drive.getUploaded(f.id);
          ours = sent.size === item.size && sent.sha256 === item.sha256;
          if (!ours) console.error('A reserved upload holds other bytes; it stays where it is');
          // Still where it was sent (`notAsSeen`, the one check, on its place): binned there; filed elsewhere, it stays.
          const there = notAsSeen({ id: f.id, name: f.name, parents: [item.parentId] }, f) === null;
          if (ours && !there) console.error('A reserved upload was filed elsewhere; it stays where it is');
          return !ours || !there || inFolder(f);
        });
        if (ours) took(w, item.memberKey);
      }
      for (const e of u?.entries ?? []) if (!e.queued) took(await withdraw(e, this.drive, inFolder), e.key);
      for (const key of [`pile-conversion:${pileId}`, `pile-folder:${pileId}`, `pile-note:${pileId}`]) {
        took(await this.intended.withdraw(key, this.drive, inFolder), key);
        this.pileNoteSent.delete(key);
      }
    } catch (e) {
      this.resumeQueued(ids);
      throw e;
    }
    return { ids, binned, arrived };
  }

  private resumeQueued(ids: readonly string[]): void {
    for (const id of ids) this.queued.queue.resume(id);
  }

  private async endQueued(ids: readonly string[]): Promise<void> {
    for (const id of ids) await this.queued.queue.discard(id);
  }

  /** Refuses to change a file that changed name or place elsewhere since the folder was listed (`notAsSeen`, the one check). */
  protected async stillAsSeen(f: DriveFile): Promise<void> {
    await this.fence(seenPlace(f), f.id);
  }

  /**
   * The app's still-as-seen fence (`checkStillAsSeen`, the one helper): reads the file by its id, the Bin included,
   * right before a write. Resolves with the file when it already holds that write (`landed`), null when still as
   * `seen`; a refusal shows the new version (`refresh`) and says it changed somewhere else.
   */
  private async fence(seen: SeenExpectation, id: string, landed?: Landing<DriveFile>): Promise<DriveFile | null> {
    try {
      return await checkStillAsSeen(seen, () => byId(this.drive, id), CHANGED_ELSEWHERE, { unanswered: isNoAnswer, ...(landed ? { landed } : {}) });
    } catch (e) {
      if (notAsSeenReason(e) !== null) this.refreshAside();
      throw e;
    }
  }

  /**
   * One of the person's writes to `f`, every one fenced first (`fence`): changed name or place since it was read (its
   * words too, for text), or in or out of the Bin against what the write expects, nothing is sent; already holding this
   * write (a second press after a lost answer), it is that landed write, not sent again. Then sent once with its stamp
   * (`updateByStamp`): with its answer lost and the file read by id not holding it, still as read the error stands;
   * changed or gone since, it is a change elsewhere. The write passes the same fence to the transport (`WriteOptions`),
   * which runs it again right before any resend (TL-P4-24 finding 1).
   */
  private async once(f: DriveFile, intent: Intent, write: (op: Record<string, string>, fence: Fence) => Promise<DriveFile>, beforeWrite?: () => void): Promise<DriveFile> {
    const seen: SeenExpectation = { ...seenPlace(f), ...(typeof intent !== 'string' ? { modifiedTime: f.modifiedTime } : {}), ...(unbins(intent) ? { trashed: true } : {}) };
    const landed = await this.fence(seen, f.id, landing(f, intent));
    if (landed) return landed;
    // Before a resend: still as seen, or that very write already there (the resend is then the same write, by its stamp).
    const fence: Fence = async () => {
      await this.fence(seen, f.id, landing(f, intent));
      beforeWrite?.();
    };
    let now: DriveFile | null | undefined;
    try {
      return await updateByStamp(this.drive, f, intent, (op) => {
        beforeWrite?.();
        return write(op, fence);
      }, (read) => (now = read));
    } catch (e) {
      if (!isNoAnswer(e) && !isUnconfirmedWrite(e)) throw e;
      if (now === undefined) throw isUnconfirmedWrite(e) ? e : new BowerError('offline', "Bower isn't sure that saved. Check again when you're back online.");
      // Changed or gone since it was read (a lost answer's read found it so): the fence's refusal, with its reason.
      const reason = notAsSeen(seen, now);
      if (reason === null) throw e;
      this.refreshAside();
      throw notAsSeenError(reason, CHANGED_ELSEWHERE);
    }
  }

  /** `f` to the Bin, once; the answer is what Undo takes back out (`fromBin`), once too. */
  private toBin = (f: DriveFile): Promise<DriveFile> => this.once(f, 'bin', (op, fence) => this.drive.trash(f.id, op, { fence }));
  /** Out of the Bin; with `name` (a free name other than its own), under it in the same write. */
  private fromBin = (f: DriveFile, name: string = f.name): Promise<DriveFile> =>
    name === f.name ? this.once(f, 'unbin', (op, fence) => this.drive.untrash(f.id, op, undefined, { fence })) : this.once(f, `unbin:${name}`, (op, fence) => this.drive.untrash(f.id, op, name, { fence }));

  /** Your own write changes the file's time; if you had seen it, it stays seen. */
  protected keepSeen(before: DriveFile, after: DriveFile): DriveFile {
    if (this.current() && isSeen(before.id, before.modifiedTime)) markSeen(after.id, after.modifiedTime);
    return after;
  }

  protected mustFile(ix: VaultIndex, path: string): DriveFile {
    const f = ix.file(path);
    if (!f) throw new BowerError('not-found', 'That is no longer there.');
    return f;
  }

  /** A note's raw text, from the parsed-note cache when it is current; null, logged, when it cannot be read now. */
  private async rawText(f: DriveFile): Promise<string | null> {
    const cached = this.notes.get(f.id);
    if (cached && cached.modified === f.modifiedTime) return cached.text;
    let text: string;
    try {
      text = await this.reads.text(f, () => this.drive.readText(f.id));
    } catch (e) {
      // A note that cannot be read now holds only its pile, as not checked; the next listing asks again.
      // Signed out, or a session that changed, stops the whole listing.
      if (!(e instanceof BowerError) || e.code === 'auth' || !this.current()) throw e;
      console.error(e);
      return null;
    }
    // A session that changed meanwhile still stops the listing.
    this.checkCurrent();
    return text;
  }

  protected parsed(f: DriveFile, path: string, skipUnreadable?: false, context?: OwnershipContext): Promise<ParsedNote>;
  protected parsed(f: DriveFile, path: string, skipUnreadable: true, context?: OwnershipContext): Promise<ParsedNote | null>;
  protected async parsed(f: DriveFile, path: string, skipUnreadable = false, context?: OwnershipContext): Promise<ParsedNote | null> {
    const cached = this.notes.get(f.id);
    if (cached && cached.modified === f.modifiedTime) return { ...cached.note, path, title: displayName(nameOf(path)) };
    // Read/session failures still reject the operation; only a note's parse refusal is isolated.
    const text = await this.text(f);
    let note: ParsedNote;
    try {
      note = parseNote(path, text, context ? { fileId: f.id, context } : undefined);
    } catch (e) {
      if (!skipUnreadable || !(e instanceof BowerError)) throw e;
      console.error(e);
      return null;
    }
    this.checkCurrent();
    this.notes.set(f.id, { modified: f.modifiedTime, note, text });
    return note;
  }

  /** The id of one of Bower's own folders (`.bower/changes`), made if missing. */
  protected systemFolder(path: string): Promise<string> {
    // Two first writes at once share one folder, never make two.
    const going = this.making.get(path);
    if (going) return going;
    const p = this.makeSystemFolder(path).finally(() => this.making.delete(path));
    this.making.set(path, p);
    return p;
  }

  private async makeSystemFolder(path: string): Promise<string> {
    const ix = await this.index();
    const known = ix.idOf(path);
    if (known) return known;
    const parent = parentOf(path);
    const made = await makeFolder(this.drive, this.drive, { parent: parent ? await this.systemFolder(parent) : await this.rootId(), name: nameOf(path) });
    ix.put(made);
    return made.id;
  }
}

interface Sending extends Holder {
  /** Set on the file as appProperties.bowerItem: the thing as the pile declares it. */
  key: string;
  /** A link's or an empty thing's id, reserved for its create (`spine/write-once.ts`): every try makes that one file. */
  reserved?: string;
  /** The bytes' SHA-256 as the declaration has it. */
  sha256?: string;
  /** Its id in the upload queue, once added. */
  queued?: string;
  item: PileItem;
  body?: Blob;
  /** Its enclosing action's captured version, including additions picked up by an ongoing send. */
  forgetVersion?: number | null;
  url?: string;
}

interface Upload {
  lone: boolean;
  createdAt: number;
  parent: string;
  entries: Sending[];
  /** A declared pile's declaration id, set on each thing it sends. */
  declaration?: string;
}

/** What `declare` minted: the pile's ids and one key per thing, in order. */
interface Declared {
  pileId: string;
  declarationId: string;
  contextKey: string;
  keys: string[];
  /** Each thing's declared SHA-256, in order: the upload queue keys it by this. */
  hashes: string[];
}

/** A declared pile as Drive has it now (`declaredState`). */
interface DeclaredState {
  /** Its things that have not arrived and are not on their way from here. */
  rows: PileItem[];
  /** The member key of its context note, when it was added with words. */
  contextKey: string | null;
  /** Its absent context is in the Bin, from the same lookup that accounted for its members. */
  contextBinned: boolean;
  /** Files whose bytes differ from what was declared for them. */
  changed: Set<string>;
  lookup: DeclarationLookup['state'];
  blocked: Blocked;
  /** Member keys with no file anywhere. */
  missing: string[];
  /** Member keys still in its folder with their declared bytes: what a tidy-up files now. */
  remaining: string[];
}

/** A pasted link, as the `.url` file it becomes. */
const shortcut = (url: string): string => `[InternetShortcut]\nURL=${url}\n`;

async function utf8(text: string): Promise<Content> {
  return { encoding: 'utf8', size: new TextEncoder().encode(text).byteLength, sha256: await sha256(new Blob([text])) };
}

/** The bytes a thing will have in Drive, as sendAll writes them. */
async function contentOf(it: NewPile['items'][number]): Promise<Content> {
  if (it.url) return utf8(shortcut(it.url));
  if (it.body) return { encoding: 'blob', size: it.body.size, sha256: await sha256(it.body) };
  return utf8('');
}

/** Notes read for one search or one backlink list, at most. */
const MAX_READS = 60;

/** Runs `fn` over the list a few at a time, keeping the order. */
async function inBatches<T, R>(list: readonly T[], fn: (x: T) => Promise<R>, size = 5): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

/** A thing the upload queue holds, as the inbox shows it while it is on its way. */
function queuedRow(i: QueueItem): PileItem {
  const p = i.appProperties;
  const kind = p[PROP.kind];
  return {
    id: i.memberKey,
    name: p[PROP.asAdded] ?? i.name,
    kind: kind && (FILE_KINDS as readonly string[]).includes(kind) ? (kind as FileKind) : kindOf(i.name),
    origin: p[PROP.origin] ?? 'Added in Drive',
    upload: i.state === 'failed' || i.error ? -1 : i.size ? Math.min(i.sent / i.size, 0.99) : 0,
  };
}

function itemOf(f: DriveFile): PileItem {
  const p = f.appProperties ?? {};
  const kind = p[PROP.kind];
  return {
    id: f.id,
    name: p[PROP.asAdded] ?? f.name,
    kind: kind && (FILE_KINDS as readonly string[]).includes(kind) ? (kind as FileKind) : kindOf(f.name),
    origin: p[PROP.origin] ?? 'Added in Drive',
  };
}

const FILE_KINDS = ['note', 'pdf', 'image', 'link', 'doc', 'sheet', 'audio', 'other'] as const satisfies readonly FileKind[];
const DISMISSED = 'bower:dismissed';

function dismissed(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(DISMISSED) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // expected: storage may be blocked (a private window); the default holds.
    return [];
  }
}

function dismiss(id: string): void {
  try {
    localStorage.setItem(DISMISSED, JSON.stringify([...dismissed(), id].slice(-200)));
  } catch {
    // expected: Without storage it comes back next time; nothing is lost.
  }
}

function undismiss(id: string): void {
  try {
    localStorage.setItem(DISMISSED, JSON.stringify(dismissed().filter((x) => x !== id)));
  } catch (e) {
    console.error(e);
  }
}

function toChange(r: JournalRecord): ChangeEntry {
  return { id: r.id, at: r.at, kind: r.kind, what: r.what, ...(r.path ? { path: r.path } : {}), ...(r.from ? { from: r.from } : {}) };
}
