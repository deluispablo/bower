/**
 * The Bower folder in Google Drive, behind the same door as the demo
 * (`VaultSource`). It lists the folder once into a `VaultIndex`, applies the
 * same naming rules as the demo (`tree.ts`) before any call to Drive, and
 * writes one journal line for each change you make, so the next tidy-up
 * knows what happened. It never writes Bower's own sections of a note.
 */
import { hasBinLookup, type DriveApi, type DriveFile, type ResumableDrive } from '../drive/drive-api';
import type { Unsubscribe, VaultSource } from '../sources';
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
import type { Content, Declaration, DeclarationResult } from '../contracts/pile-declaration';
import type { DispositionResult } from '../contracts/pile-disposition';
import { SET_ASIDE_TEXT, accountPile, contextRemoved, declarationRecord, declaredName, findDeclaration, hasStoredDigests, journalValues, recordedNote, setAsideOf, shownName, writable, type Blocked, type DeclarationLookup, type Digest } from '../pile-readiness';
import { Journal, type JournalRecord } from './journal';
import { formerNames, linkTarget } from '../links';
import { ruleLike } from '../rules';
import { HIDDEN_AT_ROOT, PROP, SYSTEM, isRunnerFile, type RunnerFiles, type LastRunFile } from './layout';
import { sha256 } from './hashes';
import { placeOf, plainSnippet, plainText, savedLinkAddress, savedLinkUrl, searchLines } from '../search-text';
import { noteRefusal, parseNote, toggleTaskInText, type ParsedNote } from './note-format';
import { parseRules } from './rules-format';
import { isSeen, markSeen } from './seen';
import { VaultIndex } from './vault-index';
import { NOT_SENT_TEXT, PERSIST_REFUSED_TEXT, UNREADABLE_TEXT, stoppedText, type QueueItem, type UploadQueue } from '../upload-queue';

export interface DriveVaultOptions {
  driveLinks?: boolean;
  drive: DriveApi;
  rootId: () => Promise<string>;
  /** The piles the running tidy-up took; they cannot be changed until it ends. */
  runningPiles: () => ReadonlySet<string>;
  /** Names this device in the journal. */
  device?: string;
  /** Writes an immutable declaration before a pile folder and its things (off until every reader understands it). */
  declarePiles?: boolean;
  /** Files go through the persistent upload queue, so a reload only pauses them. */
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

const where = (folder: string): string => folder.replaceAll('/', ' / ') || 'your Bower folder';
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

export class DriveVault implements VaultSource {
  readonly driveLinks: boolean;
  protected readonly drive: DriveApi;
  protected readonly rootId: () => Promise<string>;
  protected readonly runningPiles: () => ReadonlySet<string>;
  protected readonly journal: Journal;
  private readonly declarePiles: boolean;
  /** Declarations never change: each copy is read once, by file id and modified time. */
  private declarationCache = new Map<string, DeclarationResult>();
  private dispositionCache = new Map<string, DispositionResult>();
  /** Pile folders whose declaration could not be read, already logged: once per failure, not per listing. */
  private unreadableLogged = new Set<string>();
  /**
   * Piles whose note the latest listing could not read, or will not parse, with why: the person saw no words,
   * so none are written over them.
   */
  private lockedNotes = new Map<string, string>();
  /** Pile notes Bower refused to parse, by file id and modified time, already logged: once until they change. */
  private refusalsLogged = new Set<string>();
  /** Sizes and hashes of files already checked, by file id and modified time. */
  private digests = new Map<string, Digest>();
  private ix: Promise<VaultIndex> | null = null;
  private listeners = new Set<() => void>();
  /** Parsed notes by file id, with the raw text they were parsed from (front matter included). */
  private notes = new Map<string, { modified: string; note: ParsedNote; text: string }>();
  /** What went to the Bin from here, by the path it had, so Undo can bring it back. */
  private bin = new Map<string, { id: string; change: string | null; top?: string; late?: string[]; pending?: Upload; pileKey?: string }>();
  private texts = new Map<string, { modified: string; text: string }>();
  /** Things on their way into the inbox, by pile; a failed one stays with upload -1. */
  private uploads = new Map<string, Upload>();
  private sendingPiles = new Set<string>();
  private making = new Map<string, Promise<string>>();
  private sending = new Set<Promise<void>>();
  private disposed = false;
  private readonly queued: DriveVaultUploads | null;
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
    this.rootId = opts.rootId;
    this.runningPiles = opts.runningPiles;
    this.declarePiles = opts.declarePiles ?? false;
    this.queued = opts.uploads ?? null;
    if (this.queued) this.unqueue = this.queued.queue.subscribe(() => this.fromQueue());
    this.journal = new Journal(
      this.drive,
      {
        folder: () => this.systemFolder(SYSTEM.changes),
        owner: journalOwner,
        files: async (fresh, archived) => {
          if (fresh) {
            const root = await this.rootId();
            return VaultIndex.build(root, await this.drive.listAll(root)).journalFiles(archived);
          }
          return (await this.index()).journalFiles(archived);
        },
        wrote: (f) => { if (this.current()) void this.ix?.then((ix) => { if (this.current()) ix.put(f); }); },
        removed: (id) => { if (this.current()) void this.ix?.then((ix) => { if (this.current()) ix.drop(id); }); },
        waiting: () => this.emit(),
      },
      opts.device ?? deviceId(),
      () => this.current(),
      memoryDrive,
    );
  }

  dispose(): void {
    this.disposed = true;
    this.unqueue();
    for (const u of this.uploads.values()) for (const e of u.entries) { delete e.body; delete e.url; }
    this.uploads.clear();
    this.bin.clear();
    this.ix = null;
    this.notes.clear();
    this.texts.clear();
    this.making.clear();
    this.journal.dispose();
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

  /** Lists the folder again (after a tidy-up, or when another device may have changed it). */
  async refresh(): Promise<void> {
    this.ix = null;
    await this.index();
    this.emit();
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
    const parsed = await this.parsed(f, path);
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
    const candidates = [...new Set(hits.map((h) => ix.pathOf(h.id)).filter((p): p is string => !!p && p !== path && p.endsWith('.md')))].slice(0, MAX_READS);
    const linking = await inBatches(candidates, async (p) => {
      const f = ix.file(p);
      const note = f ? await this.parsed(f, p, true) : null;
      return note?.links.some((l) => wanted.has(linkTarget(l))) ? p : null;
    });
    const backlinks = linking.filter((p): p is string => !!p);
    return { ...parsed, path, links: [...new Set(links)], backlinks };
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
    refuseReserved(out);
    const to = ix.idOf(toFolder);
    if (!to) throw new BowerError('not-found', 'That folder is no longer there.');
    const last = opts?.undo ? [...(await this.journal.list())].reverse().find((c) => c.kind === 'move' && c.path === path) : undefined;
    await this.stillAsSeen(f);
    const name = nameOf(out);
    ix.put(this.keepSeen(f, await this.drive.update(f.id, { ...(name !== f.name ? { name } : {}), addParent: to, ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) })));
    let removed = false;
    if (last) {
      try { await this.journal.remove(last.id); removed = true; } catch (e) { console.error(e); }
    }
    if (!removed) await this.journal.record('move', `Moved ${(f.folder ? nameOf(path) : thingName(nameOf(path)))} to ${where(toFolder)}`, { path: out, from: path, fileId: f.id });
    this.emit();
    return out;
  }

  async rename(path: string, name: string): Promise<string> {
    const ix = await this.index();
    const f = this.mustFile(ix, path);
    const out = renameEntry(ix.entries(), path, name, Date.now());
    if (out === path) return path;
    refuseReserved(out);
    // Read before the mutation: unreadable device storage must not leave an unjournaled rename.
    const made = (await this.journal.list()).find((c) => c.kind === 'create' && c.path === path);
    await this.stillAsSeen(f);
    ix.put(this.keepSeen(f, await this.drive.update(f.id, { name: nameOf(out) })));
    // A thing made since the last tidy-up and named now is one change: its making, under its name.
    let removed = false;
    if (made) {
      try { await this.journal.remove(made.id); removed = true; } catch (e) { console.error(e); }
    }
    if (removed) {
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
    const path = join(folder, freeName(ix.entries(), folder, base));
    refuseReserved(path);
    const made = type === 'folder' ? await this.drive.createFolder(parent, nameOf(path)) : await this.drive.createText(parent, nameOf(path), '');
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
      if (this.runningPiles().size) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
      // Things still on their way wait with the pile, and go on if Undo brings it back.
      const pileKey = f.appProperties?.[PROP.pile] ?? f.id;
      const pending = this.uploads.get(pileKey);
      this.uploads.delete(pileKey);
      const held = await this.haltQueued(pileKey);
      const binned: string[] = [];
      try {
        await this.drive.trash(f.id);
        ix.drop(f.id);
        for (const made of held.made) {
          if (made.id === f.id || made.parents.includes(f.id)) continue;
          await this.drive.trash(made.id);
          ix.drop(made.id);
          binned.push(made.id);
        }
      } catch (e) {
        if (pending && this.current()) this.uploads.set(pileKey, pending);
        this.resumeQueued(held.ids);
        throw e;
      }
      await this.endQueued(held.ids);
      // What arrived though its answer was lost, here or filed elsewhere, is not sent again on Undo.
      if (pending) pending.entries = pending.entries.filter((e) => !held.arrived.has(e.key));
      for (const e of pending?.entries ?? []) delete e.queued;
      this.bin.set(path, { id: f.id, change: null, top, ...(pending ? { pending, pileKey } : {}), ...(binned.length ? { late: binned } : {}) });
      this.emit();
      return;
    }
    const f = this.mustFile(ix, path);
    removeEntry(ix.entries(), path);
    const made = (await this.journal.list()).find((c) => c.kind === 'create' && c.path === path);
    await this.drive.trash(f.id);
    ix.drop(f.id);
    this.bin.set(path, { id: f.id, change: null });
    // Something made and binned before any tidy-up saw it leaves no trace.
    let change: string | null = null;
    let removed = false;
    if (made) {
      try { await this.journal.remove(made.id); removed = true; } catch (e) { console.error(e); }
    }
    if (!removed) {
      try {
        change = (await this.journal.record('trash', `Put ${(f.folder ? nameOf(path) : thingName(nameOf(path)))} in the Bin`, { path, fileId: f.id })).id;
      } catch (e) {
        if (e instanceof BowerError && e.applied) this.bin.set(path, { id: f.id, change: e.applied.changeId });
        throw e;
      }
    }
    this.bin.set(path, { id: f.id, change });
    this.emit();
  }

  async restore(path: string): Promise<void> {
    const gone = this.bin.get(path);
    if (!gone) throw new BowerError('not-found', 'It is no longer in the Bin.');
    const ix = await this.index();
    // The name may have been taken since: come back under a free one, never over it.
    // A pile goes back whole, under its own folder's name.
    const at = gone.top ?? path;
    const want = freeName(ix.entries(), parentOf(at), nameOf(at));
    const back = await this.drive.untrash(gone.id);
    for (const id of gone.late ?? []) await this.drive.untrash(id);
    if (want !== nameOf(at) || back.name !== want) await this.drive.update(gone.id, { name: want });
    if (gone.change) await this.journal.remove(gone.change);
    this.bin.delete(path);
    await this.refresh();
    if (gone.pending && gone.pileKey) {
      for (const e of gone.pending.entries) e.item.upload = 0;
      this.uploads.set(gone.pileKey, gone.pending);
      this.track(this.send(gone.pileKey));
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
    const ix = await this.index();
    const f = this.mustFile(ix, path);
    const out = toggleTaskInText(await this.drive.readText(f.id), index);
    let written: DriveFile;
    try {
      written = await this.drive.writeText(f.id, out.text, f.modifiedTime);
    } catch (e) {
      // Changed somewhere else: show the new version, write nothing.
      if (e instanceof BowerError && e.code === 'conflict') void this.refresh();
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
    return (await this.journal.list()).map(toChange);
  }

  // ---------- the inbox

  async piles(): Promise<Pile[]> {
    // What a reload left on its way goes on, from where Drive stopped.
    this.startQueue().catch((e: unknown) => {
      // Signed out: nothing to resume, and nothing to say.
      if (!(e instanceof BowerError && e.code === 'auth')) console.error(e);
    });
    const ix = await this.index();
    const out: Pile[] = [];
    // Your changes, read at most once for this listing, and only if a pile needs them.
    let journal: Promise<unknown[]> | null = null;
    const changes = (): Promise<unknown[]> =>
      (journal ??= journalValues(ix.journalFiles(true), (id) => this.drive.readText(id)).catch((e: unknown) => {
        // Logged once for this listing; each pile that needed them says it could not be checked.
        console.error(e);
        throw e;
      }));
    // A thing whose lost answer already shows in the folder is listed as itself, once.
    const listed = (id: string | null): boolean => id !== null && ix.pathOf(id) !== undefined;
    for (const f of ix.filesIn('Inbox')) {
      const path = ix.pathOf(f.id);
      if (!path) continue;
      const id = f.appProperties?.[PROP.pile] ?? f.id;
      const queued = this.queuedItems(id).filter((i) => !listed(i.reserved));
      const sending = [...(this.uploads.get(id)?.entries ?? []).filter((e) => !listed(this.reservedFor(e))).map((e) => e.item), ...queued.map(queuedRow)];
      if (!f.folder) {
        out.push({ id, path, text: '', createdAt: Date.parse(f.createdTime), items: [itemOf(f)] });
        continue;
      }
      const kids = ix.filesIn(path).filter((k) => !k.folder);
      const note = kids.find((k) => k.name === PILE_NOTE);
      let parsed: ParsedNote | null = null;
      let unread = false;
      let refused: SetAside | null = null;
      try {
        parsed = note ? await this.parsed(note, `${path}/${PILE_NOTE}`) : null;
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
      const declared = marked && !locked ? await this.declaredState(f, this.uploads.get(id), queued.map((i) => i.memberKey)) : null;
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
          parseNote(`${path}/${PILE_NOTE}`, raw);
        } catch (e) {
          const format = noteRefusal(e);
          if (!format || !(e instanceof BowerError)) throw e;
          refused = format === 'newer' ? 'note-format' : 'note-damaged';
          logRefusal(recorded, e);
        }
      }
      const noteLocked = locked || refused !== null;
      const setAside = refused ?? (unread || raw === null || !writable([f.name, raw, ...kids.map((k) => k.name)]) ? 'not-checked' : declared ? await this.setAsideFor(declared, path, kids, things.length, text, sending, changes) : null);
      // Its note is shown read-only until a listing reads it (RFC 9110 §13.1.1: no update over an unseen version).
      if (noteLocked) this.lockedNotes.set(id, refused ? SET_ASIDE_TEXT[refused] : NOTE_LOCKED);
      else this.lockedNotes.delete(id);
      out.push({ id, path, text: refused ? '' : text, createdAt: Date.parse(f.createdTime), items, ...(setAside ? { setAside } : {}), ...(noteLocked ? { noteLocked: true as const } : {}) });
    }
    // A lone thing still on its way has no file yet: show it from here.
    for (const [id, u] of this.uploads) if (u.lone && !out.some((p) => p.id === id)) out.push({ id, text: '', createdAt: u.createdAt, items: u.entries.map((e) => e.item) });
    // A lone thing a reload left on its way: the upload queue still holds it.
    for (const item of this.queuedItems()) {
      if (listed(item.reserved)) continue;
      const pile = out.find((p) => p.id === item.pileId);
      if (pile) {
        if (!pile.path && !pile.items.some((i) => i.id === item.memberKey)) pile.items.push(queuedRow(item));
      } else out.push({ id: item.pileId, text: '', createdAt: Date.parse(item.addedAt), items: [queuedRow(item)] });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * A declared pile as Drive has it, from the facts a tidy-up reads: its
   * things that have not arrived and are not on their way from here (shown
   * while its folder is there, so any device can see them), its changed
   * things, and why a tidy-up would leave it in the inbox.
   */
  private async declaredState(folder: DriveFile, u: Upload | undefined, queued: readonly string[] = []): Promise<DeclaredState> {
    const ix = await this.index();
    const files = this.known(ix);
    const found = await this.declarationOf(folder, files);
    if (found.state !== 'found') return { rows: [], contextKey: null, changed: new Set(), lookup: found.state, blocked: null, missing: [] };
    const contextKey = found.declaration.context.kind === 'text' ? found.declaration.context.memberKey : null;
    const local = new Set([...(u?.entries.map((e) => e.key) ?? []), ...queued]);
    const drive = this.drive;
    const root = await this.rootId();
    // Only when a member is missing everywhere live: one Bin lookup for all of them.
    const binned = hasBinLookup(drive) ? (keys: readonly string[]) => drive.binnedByItem(root, keys) : undefined;
    // The tidy-up's own accounting: a member a consumed disposition records is filed, the rest looked up.
    const readiness = await accountPile(found.declaration, found.sha256, folder, files, (id) => drive.readBytes(id), (f) => this.digestOf(f), binned, this.dispositionCache);
    this.checkCurrent();
    const state = new Map(readiness.members.map((m) => [m.memberKey, m]));
    // Only a member with no file anywhere has not arrived; a changed or unchecked one is not sent again.
    const missing = found.declaration.members.filter((m) => state.get(m.memberKey)?.state === 'missing');
    const rows = missing
      .filter((m) => !local.has(m.memberKey))
      .map((m) => ({ id: m.memberKey, name: shownName(m), kind: m.kind, origin: m.origin ?? 'Added in Drive', upload: -1, chooseAgain: true as const }));
    const changed = new Set(readiness.members.flatMap((m) => (m.state === 'changed' ? m.fileIds : [])));
    return { rows, contextKey, changed, lookup: found.state, blocked: readiness.blocked, missing: missing.map((m) => m.memberKey) };
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
    let records: unknown[];
    try {
      records = await changes();
    } catch {
      // expected: logged once by the listing; only this pile waits, the rest of the inbox is listed.
      return 'not-checked';
    }
    this.checkCurrent();
    return contextRemoved(records, path) ? setAsideOf(d.lookup, d.blocked, { things, text, restore: false }) : 'not-arrived';
  }

  private async declarationOf(folder: DriveFile, files: readonly DriveFile[]): Promise<DeclarationLookup> {
    const found = await findDeclaration(files, await this.rootId(), folder, (id) => this.drive.readBytes(id), this.declarationCache);
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
    const key = `${f.id}@${f.modifiedTime}`;
    const known = this.digests.get(key);
    if (known) return known;
    let d: Digest | null;
    try {
      // The pretend Drive says what it stored (fake-stored); any other Drive is read.
      const drive = this.drive;
      if (hasStoredDigests(drive)) d = await drive.storedDigest(f.id);
      else {
        const bytes = await drive.readBytes(f.id);
        d = { size: bytes.byteLength, sha256: await sha256(new Blob([new Uint8Array(bytes).buffer])) };
      }
    } catch (e) {
      // A file that cannot be read now is not counted as arrived; the next listing asks again.
      console.error(e);
      return null;
    }
    if (d) this.digests.set(key, d);
    return d;
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
    if (contextRemoved(await journalValues(ix.journalFiles(true), (id) => this.drive.readText(id)), pile.path)) return;
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
    const made = await this.drive.createText(folder.id, PILE_NOTE, context.originalText, { [PROP.item]: context.memberKey });
    this.checkCurrent();
    ix.put(made);
    this.emit();
  }

  /** Writes a pile's declaration in `.bower/piles`, before anything of the pile exists. */
  private async declare(input: NewPile, text: string, inbox: string, name: string, createdAt: number): Promise<Declared> {
    const root = await this.rootId();
    const mint = (kind: string): string => `${kind}-${createdAt.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const contextKey = mint('context');
    const members = await Promise.all(input.items.map(async (it) => ({ memberKey: mint('member'), name: declaredName(it), kind: it.kind, origin: it.origin, content: await contentOf(it) })));
    const declaration: Declaration = {
      v: 1, kind: 'pile-declaration', scope: { rootId: root }, declarationId: mint('decl'), pileId: mint('pile'), createdAt,
      anchor: { kind: 'folder', inboxId: inbox, name, createKey: mint('anchor') }, members,
      context: text ? { kind: 'text', memberKey: contextKey, originalText: text, content: await utf8(text) } : { kind: 'absent' },
    };
    const record = await declarationRecord(declaration, root);
    if (!record) {
      console.error('A pile declaration was refused by its own contract check.');
      throw new BowerError('unknown', 'Bower could not save this pile. Try again.');
    }
    const at = await this.systemFolder(SYSTEM.piles);
    const written = await this.drive.createText(at, record.name, record.text);
    this.checkCurrent();
    (await this.index()).put(written);
    return { pileId: declaration.pileId, declarationId: declaration.declarationId, contextKey, keys: members.map((m) => m.memberKey), hashes: members.map((m) => m.content.sha256) };
  }

  async addPile(input: NewPile): Promise<Pile> {
    const text = input.text.trim();
    if (!input.items.length && !text) throw new BowerError('conflict', 'Add a file, a link or a line first.');
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
      const folder = declared
        ? await this.drive.createFolder(inbox, nameOf(path), { [PROP.pile]: declared.pileId, [PROP.declaration]: declared.declarationId })
        : await this.drive.createFolder(inbox, nameOf(path));
      this.checkCurrent();
      ix.put(folder);
      id = declared?.pileId ?? folder.id;
      parent = folder.id;
      if (text) {
        try {
          ix.put(declared ? await this.drive.createText(folder.id, PILE_NOTE, text, { [PROP.item]: declared.contextKey }) : await this.drive.createText(folder.id, PILE_NOTE, text));
        } catch (e) {
          if (!this.current()) throw e;
          // Half a pile helps nobody: its empty folder goes to the Bin, and you can save again.
          await this.drive.trash(folder.id).catch((err: unknown) => console.error(err));
          ix.drop(folder.id);
          throw e;
        }
      }
    }
    const entries: Sending[] = input.items.map((it, i) => ({
      key: declared?.keys[i] ?? `${id}-${i}-${Math.random().toString(36).slice(2, 10)}`,
      tried: false,
      item: { id: declared?.keys[i] ?? `${id}-${i}`, name: it.name, kind: it.kind, origin: it.origin, upload: 0 },
      ...(it.body ? { body: it.body } : {}),
      ...(it.url ? { url: it.url } : {}),
      ...(it.body && declared?.hashes[i] ? { sha256: declared.hashes[i] } : {}),
    }));
    if (entries.length) {
      this.uploads.set(id, { lone, createdAt, parent, entries, ...(declared ? { declaration: declared.declarationId } : {}) });
      this.track(this.send(id));
    }
    this.emit();
    return { id, text, createdAt, items: entries.map((e) => ({ ...e.item })), ...(path ? { path } : {}) };
  }

  async removePile(id: string): Promise<void> {
    this.refuseWhileRunning();
    const pile = await this.pile(id);
    const ix = await this.index();
    const f = pile.path ? ix.file(pile.path) : undefined;
    const u = this.uploads.get(id);
    this.uploads.delete(id);
    const held = await this.haltQueued(id);
    try {
      if (f) {
        await this.drive.trash(f.id);
        ix.drop(f.id);
      }
      // A thing whose answer was lost may be in Drive already, where it was sent: it goes to the Bin too.
      for (const made of held.made) {
        if (made.id === f?.id || (f && made.parents.includes(f.id))) continue;
        await this.drive.trash(made.id);
        ix.drop(made.id);
      }
    } catch (e) {
      // Nothing was removed for good: the pile keeps its things, and they go on.
      if (u && this.current()) this.uploads.set(id, u);
      this.resumeQueued(held.ids);
      throw e;
    }
    // Only now are their bytes no longer needed.
    await this.endQueued(held.ids);
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
      void this.refresh();
      throw new BowerError('conflict', 'This changed somewhere else. Look again and try once more.');
    }
    const text = input.trim();
    if (!pile.items.length && !text) throw new BowerError('conflict', 'A pile with no files needs its note.');
    const ix = await this.index();
    const f = pile.path ? ix.file(pile.path) : undefined;
    if (!f || !pile.path) throw new BowerError('not-found', 'That pile is already filed.');
    await this.stillAsSeen(f);
    const note = ix.file(join(pile.path, PILE_NOTE));
    // Words Bower could not read are never saved over: the note must read back first.
    if (note) await this.text(note);
    // Check the context before a rename or removal can partially apply a stale edit.
    if (note && (await this.drive.get(note.id)).modifiedTime !== note.modifiedTime) {
      void this.refresh();
      throw new BowerError('conflict', 'This changed somewhere else. Look again and try once more.');
    }
    let folderPath = pile.path;
    if (!f.folder) {
      // A lone thing that gets a note becomes a pile folder; the pile keeps its id.
      if (!text) return pile;
      folderPath = join('Inbox', freeName(ix.entries(), 'Inbox', pileFolderName({ ...pile, text })));
      const folder = await this.drive.createFolder(f.parents[0] ?? (await this.rootId()), nameOf(folderPath), { [PROP.pile]: id });
      ix.put(folder);
      ix.put(await this.drive.update(f.id, { addParent: folder.id, ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) }));
    } else if (text) {
      const name = freeName(ix.entries(), 'Inbox', pileFolderName({ ...pile, text }), pile.path);
      if (name !== nameOf(pile.path)) {
        ix.put(await this.drive.update(f.id, { name }));
        folderPath = join('Inbox', name);
      }
    }
    const folderId = ix.idOf(folderPath);
    const declared = f.folder && f.appProperties?.[PROP.declaration] ? await this.declarationOf(f, this.known(ix)) : null;
    const contextKey = declared?.state === 'found' && declared.declaration.context.kind === 'text' ? declared.declaration.context.memberKey : null;
    if (note && text) ix.put(await this.drive.writeText(note.id, text, note.modifiedTime));
    // A declared pile's note stays, empty: its context arrived, and only your words changed.
    else if (note && declared) ix.put(await this.drive.writeText(note.id, '', note.modifiedTime));
    else if (note) {
      await this.drive.trash(note.id);
      ix.drop(note.id);
    } else if (text && folderId) ix.put(contextKey ? await this.drive.createText(folderId, PILE_NOTE, text, { [PROP.item]: contextKey }) : await this.drive.createText(folderId, PILE_NOTE, text));
    this.emit();
    return this.pile(id);
  }

  async retryPile(id: string): Promise<void> {
    // The queue tries again what waited for a connection or stopped, this page's or a reload's.
    if (this.queued?.queue.items().some((i) => i.pileId === id && i.state !== 'done' && !i.gone)) this.queued.queue.retry();
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
    for (const e of u.entries) e.item.upload = 0;
    this.emit();
    this.track(this.send(id));
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
      tried: false,
      sha256: member.content.sha256,
      item: { id: key, name: shownName(member), kind: member.kind, origin: member.origin ?? 'Added in Drive', upload: 0 },
      ...(url === undefined ? { body: bytes } : { url }),
    };
    if (u) u.entries.push(entry);
    else this.uploads.set(pileId, { lone: false, createdAt: pile.createdAt, parent: folder.id, entries: [entry], declaration: found.declaration.declarationId });
    this.emit();
    // A send already going picks it up; otherwise one starts.
    this.track(this.send(pileId));
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

  /** One plain sentence about keeping uploads on this device, or `null`. */
  uploadNotice(): string | null {
    const queue = this.queued?.queue;
    if (!queue) return null;
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
    const file = ix.file('Rules.md');
    const worded = file ? parseRules(await this.text(file)) : [];
    const lines = await this.journal.list();
    const removed = new Set(lines.filter((r) => r.kind === 'rule' && r.removes).map((r) => r.removes));
    const pending = lines
      .filter((r) => r.kind === 'rule' && !r.removes)
      .reverse()
      .map((r): Rule => ({ id: r.id, text: r.text ?? r.what, yourWords: r.text ?? r.what, since: r.at, pending: true }));
    return [...pending, ...worded.filter((r) => !removed.has(r.text))];
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
    const r = (await this.rules()).find((x) => x.id === id);
    if (!r) throw new BowerError('not-found', 'That rule is no longer there.');
    if (r.pending) {
      // Not worded yet: its line goes, and Undo writes it again.
      await this.journal.remove(r.id);
      this.emit();
      return async () => {
        await this.addRule(r.yourWords ?? r.text);
      };
    }
    const line = await this.journal.record('rule', `Removed the rule "${r.text}"`, { path: 'Rules.md', removes: r.text });
    this.emit();
    return async () => {
      await this.journal.remove(line.id);
      this.emit();
    };
  }

  async requests(): Promise<Request[]> {
    const waiting = (await this.journal.list())
      .filter((r) => r.kind === 'request')
      .reverse()
      .map((r): Request => ({ id: r.id, text: r.text ?? r.what, at: r.at }));
    const done = (await this.json(SYSTEM.requests))?.done ?? [];
    return [...waiting, ...done];
  }

  async addRequest(input: string): Promise<Request> {
    const text = input.trim();
    if (!text) throw new BowerError('conflict', 'Write what you want first.');
    const r = await this.journal.record('request', `Asked Bower: "${text}"`, { text });
    this.emit();
    return { id: r.id, text, at: r.at };
  }

  async questions(): Promise<Question[]> {
    const all = (await this.json(SYSTEM.questions))?.questions ?? [];
    const answered = new Set((await this.journal.list()).filter((r) => r.kind === 'answer').map((r) => r.questionId));
    return all.filter((q) => !answered.has(q.id));
  }

  async answer(id: string, yes: boolean): Promise<void> {
    const q = (await this.questions()).find((x) => x.id === id);
    if (!q) return;
    await this.journal.record('answer', `Answered "${yes ? q.yes : q.no}" to a question`, { questionId: id, text: yes ? 'yes' : 'no' });
    this.emit();
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
      if (line) await this.journal.remove(line.id);
      this.emit();
    };
  }

  // ---------- plumbing

  protected async index(): Promise<VaultIndex> {
    this.checkCurrent();
    if (!this.ix) {
      const p = (async () => {
        const root = await this.rootId();
        return VaultIndex.build(root, await this.drive.listAll(root));
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
      value = JSON.parse(await this.drive.readText(id));
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

  protected async text(f: DriveFile): Promise<string> {
    const cached = this.texts.get(f.id);
    if (cached && cached.modified === f.modifiedTime) return cached.text;
    const text = await this.drive.readText(f.id);
    this.checkCurrent();
    this.texts.set(f.id, { modified: f.modifiedTime, text });
    return text;
  }

  private track(p: Promise<void>): void {
    this.sending.add(p);
    void p.finally(() => this.sending.delete(p));
  }

  /** Sends a pile's things one by one; a failure marks that thing and goes on. */
  private async send(pileId: string): Promise<void> {
    const u = this.uploads.get(pileId);
    if (!u || this.sendingPiles.has(pileId)) return;
    this.sendingPiles.add(pileId);
    try {
      // Each thing once in this run: one chosen again while it ran is sent by it too, and one that
      // failed (even before it was tried) waits for Try again, never looped on.
      const seen = new Set<Sending>();
      for (let next: Upload | undefined = u; next; next = this.uploads.get(pileId)) {
        await this.sendAll(pileId, next, seen);
        if (!this.current() || !this.uploads.get(pileId)?.entries.some((e) => !seen.has(e))) break;
      }
    } finally {
      this.sendingPiles.delete(pileId);
    }
  }

  private async sendAll(pileId: string, u: Upload, seen: Set<Sending>): Promise<void> {
    const next = (): Sending | undefined => u.entries.find((x) => !seen.has(x));
    // Each thing once, in order, those added while this runs included.
    for (let e = next(); e; e = next()) {
      seen.add(e);
      if (!this.current()) return;
      if (this.uploads.get(pileId) !== u) return;
      try {
        const ix = await this.index();
        if (e.tried && !e.queued) {
          // The last try may have arrived with its answer lost: look before sending again.
          const there = (await this.drive.listAll(u.parent)).find((f) => f.parents[0] === u.parent && f.appProperties?.[PROP.item] === e.key);
          if (there) {
            ix.put(there);
            u.entries = u.entries.filter((x) => x !== e);
            this.emit();
            continue;
          }
        }
        e.tried = true;
        const parentPath = ix.pathOf(u.parent) ?? 'Inbox';
        const name = freeName(ix.entries(), parentPath, safeInboxName(e.item));
        // The session fence (live/index.ts) recognises a pile's thing by PROP.asAdded: it waits for Use here.
        const props: Record<string, string> = { [PROP.asAdded]: e.item.name, [PROP.origin]: e.item.origin, [PROP.kind]: e.item.kind, [PROP.item]: e.key, ...(u.lone ? { [PROP.pile]: pileId } : {}), ...(u.declaration ? { [PROP.declaration]: u.declaration } : {}) };
        e.item.upload = 0;
        const made = e.url
          ? await this.drive.createText(u.parent, name, shortcut(e.url), props)
          : e.body
              ? this.queued
                ? await this.sendQueued(pileId, u, e, e.body, name, props)
                : await this.drive.upload(u.parent, name, e.body, (p) => {
                  if (!this.current()) return;
                  e.item.upload = Math.min(p, 0.99);
                  this.emit();
                }, props)
            : await this.drive.createText(u.parent, name, '', props);
        if (!this.current()) return;
        if (this.uploads.get(pileId) !== u) {
          // The pile was removed while this was on its way: it follows the pile to the Bin,
          // and comes back with it on Undo.
          await this.drive.trash(made.id).catch(async (err: unknown) => {
            console.error(err);
            await this.drive.trash(made.id);
          });
          for (const g of this.bin.values()) if (g.id === u.parent || g.id === pileId) g.late = [...(g.late ?? []), made.id];
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

  /** Starts the upload queue for this person and folder, once: it resumes what a reload left. */
  private startQueue(): Promise<void> {
    const q = this.queued;
    if (!q) return Promise.resolve();
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
    const queue = this.queued?.queue;
    if (!queue) return [];
    const mine = new Set<string>();
    for (const u of this.uploads.values()) for (const e of u.entries) if (e.queued) mine.add(e.queued);
    return queue.items().filter((i) => (pileId === undefined || i.pileId === pileId) && (i.state === 'waiting' || i.state === 'uploading' || i.state === 'failed') && !i.gone && !mine.has(i.id));
  }

  /** Sends one thing through the upload queue and waits for Drive to have it. */
  private async sendQueued(pileId: string, u: Upload, e: Sending, body: Blob, name: string, props: Record<string, string>): Promise<DriveFile> {
    const queue = this.queued?.queue;
    if (!queue) throw new BowerError('unknown', NOT_SENT_TEXT);
    await this.startQueue();
    const added = await queue.add({ declarationId: u.declaration ?? pileId, memberKey: e.key, sha256: e.sha256 ?? (await sha256(body)), pileId, parentId: u.parent, name, body, type: body.type, appProperties: props });
    e.queued = added.id;
    return new Promise<DriveFile>((resolve, reject) => {
      let off = (): void => undefined;
      const look = (): void => {
        const it = queue.items().find((i) => i.id === added.id);
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
    const queue = this.queued?.queue;
    if (!queue || !this.current()) return;
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
    return e.queued ? (this.queued?.queue.items().find((i) => i.id === e.queued)?.reserved ?? null) : null;
  }

  /**
   * Holds a pile's queued things back, each once its send settled, and finds
   * the files a lost answer already made where they were sent, as sent.
   */
  private async haltQueued(pileId: string): Promise<{ ids: string[]; made: DriveFile[]; arrived: Set<string> }> {
    const queue = this.queued?.queue;
    const arrived = new Set<string>();
    if (!queue) return { ids: [], made: [], arrived };
    const ids: string[] = [];
    const made: DriveFile[] = [];
    for (const it of queue.items()) {
      if (it.pileId !== pileId || it.state === 'done') continue;
      // M4, accepted: a last chunk already on the wire may still land after this settles; it then shows in the inbox.
      const item = await queue.halt(it.id);
      if (!item) continue;
      ids.push(item.id);
      const found = item.reserved ? await this.reservedFile(item) : null;
      if (!found) continue;
      // Arrived, wherever it is now: never sent again. Binned only where it was sent.
      arrived.add(item.memberKey);
      if (found.inPlace) made.push(found.file);
    }
    return { ids, made, arrived };
  }

  /**
   * The file made under a thing's reserved id with its bytes: it arrived. It is
   * `inPlace` only while still where it was sent; filed elsewhere, it stays.
   */
  private async reservedFile(item: QueueItem): Promise<{ file: DriveFile; inPlace: boolean } | null> {
    if (!item.reserved) return null;
    let file: DriveFile;
    try {
      file = hasUploadedLookup(this.drive) ? await this.drive.getUploaded(item.reserved) : await this.drive.get(item.reserved);
    } catch (err) {
      // Not made: nothing to bin. Unknown: it stays, where the person sees it.
      if (!(err instanceof BowerError && err.code === 'not-found')) console.error(err);
      return null;
    }
    if (file.size !== item.size || file.sha256 !== item.sha256) {
      console.error('A reserved upload holds other bytes; it stays where it is');
      return null;
    }
    if (file.parents.includes(item.parentId)) return { file, inPlace: true };
    console.error('A reserved upload was filed elsewhere; it stays where it is');
    return { file, inPlace: false };
  }

  private resumeQueued(ids: readonly string[]): void {
    for (const id of ids) this.queued?.queue.resume(id);
  }

  private async endQueued(ids: readonly string[]): Promise<void> {
    for (const id of ids) await this.queued?.queue.discard(id);
  }

  /** Refuses to change a file that changed name or place elsewhere since the folder was listed. */
  protected async stillAsSeen(f: DriveFile): Promise<void> {
    const now = await this.drive.get(f.id);
    if (now.name !== f.name || now.parents[0] !== f.parents[0]) {
      void this.refresh();
      throw new BowerError('conflict', 'This changed somewhere else. Look again and try once more.');
    }
  }

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
      text = await this.drive.readText(f.id);
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

  protected parsed(f: DriveFile, path: string): Promise<ParsedNote>;
  protected parsed(f: DriveFile, path: string, skipUnreadable: true): Promise<ParsedNote | null>;
  protected async parsed(f: DriveFile, path: string, skipUnreadable = false): Promise<ParsedNote | null> {
    const cached = this.notes.get(f.id);
    if (cached && cached.modified === f.modifiedTime) return { ...cached.note, path, title: displayName(nameOf(path)) };
    // Read/session failures still reject the operation; only a note's parse refusal is isolated.
    const text = await this.text(f);
    let note: ParsedNote;
    try {
      note = parseNote(path, text);
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
    const made = await this.drive.createFolder(parent ? await this.systemFolder(parent) : await this.rootId(), nameOf(path));
    ix.put(made);
    return made.id;
  }
}

interface Sending {
  /** Set on the file as appProperties.bowerItem, so a retry can tell it already arrived. */
  key: string;
  tried: boolean;
  /** The bytes' SHA-256 as the declaration has it. */
  sha256?: string;
  /** Its id in the upload queue, once added. */
  queued?: string;
  item: PileItem;
  body?: Blob;
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
  /** Files whose bytes differ from what was declared for them. */
  changed: Set<string>;
  lookup: DeclarationLookup['state'];
  blocked: Blocked;
  /** Member keys with no file anywhere. */
  missing: string[];
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

/** Bower's own files at the top of the folder (index.md, hot.md, log.md) keep their names. */
function refuseReserved(path: string): void {
  if (!path.includes('/') && (HIDDEN_AT_ROOT as readonly string[]).includes(path.toLowerCase())) throw new BowerError('conflict', "That name is kept for Bower's own files. Choose another.");
}

/** A Drive client that can read a file back with its content's checksum. */
const hasUploadedLookup = (drive: object): drive is Pick<ResumableDrive, 'getUploaded'> => typeof (drive as { getUploaded?: unknown }).getUploaded === 'function';

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
