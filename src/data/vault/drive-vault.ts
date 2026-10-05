/**
 * The Bower folder in Google Drive, behind the same door as the demo
 * (`VaultSource`). It lists the folder once into a `VaultIndex`, applies the
 * same naming rules as the demo (`tree.ts`) before any call to Drive, and
 * writes one journal line for each change you make, so the next tidy-up
 * knows what happened. It never writes Bower's own sections of a note.
 */
import type { DriveApi, DriveFile } from '../drive/drive-api';
import type { Unsubscribe, VaultSource } from '../sources';
import { PILE_NOTE, pileFolderName, pileHasFolder, safeInboxName } from '../piles';
import { buildTree, checkLength, displayName, freeName, join, kindOf, moveEntry, nameOf, parentOf, removeEntry, renameEntry } from '../tree';
import {
  BowerError,
  type ChangeEntry,
  type FileKind,
  type NewPile,
  type Note,
  type Pile,
  type PileItem,
  type Question,
  type Request,
  type Rule,
  type SearchHit,
  type Suggestion,
  type TreeNode,
} from '../types';
import { Journal, type JournalRecord } from './journal';
import { formerNames, linkTarget } from '../links';
import { ruleLike } from '../rules';
import { HIDDEN_AT_ROOT, PROP, SYSTEM, type HashesFile, type LastRunFile, type QuestionsFile, type RequestsFile, type SuggestionsFile } from './layout';
import { sha256 } from './hashes';
import { placeOf, plainSnippet, plainText, savedLinkAddress, savedLinkUrl, searchLines } from '../search-text';
import { parseNote, toggleTaskInText, type ParsedNote } from './note-format';
import { parseRules } from './rules-format';
import { isSeen, markSeen } from './seen';
import { VaultIndex } from './vault-index';

export interface DriveVaultOptions {
  drive: DriveApi;
  rootId: () => Promise<string>;
  /** The piles the running tidy-up took; they cannot be changed until it ends. */
  runningPiles: () => ReadonlySet<string>;
  /** Names this device in the journal. */
  device?: string;
}

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
  protected readonly drive: DriveApi;
  protected readonly rootId: () => Promise<string>;
  protected readonly runningPiles: () => ReadonlySet<string>;
  protected readonly journal: Journal;
  private ix: Promise<VaultIndex> | null = null;
  private listeners = new Set<() => void>();
  private notes = new Map<string, { modified: string; note: ParsedNote }>();
  /** What went to the Bin from here, by the path it had, so Undo can bring it back. */
  private bin = new Map<string, { id: string; change: string | null; top?: string; late?: string[]; pending?: Upload; pileKey?: string }>();
  private texts = new Map<string, { modified: string; text: string }>();
  /** Things on their way into the inbox, by pile; a failed one stays with upload -1. */
  private uploads = new Map<string, Upload>();
  private sendingPiles = new Set<string>();
  private making = new Map<string, Promise<string>>();
  private sending = new Set<Promise<void>>();

  constructor(opts: DriveVaultOptions) {
    this.drive = opts.drive;
    this.rootId = opts.rootId;
    this.runningPiles = opts.runningPiles;
    this.journal = new Journal(
      this.drive,
      {
        folder: () => this.systemFolder(SYSTEM.changes),
        owner: () => this.rootId(),
        files: async () => (await this.index()).filesIn(SYSTEM.changes),
        wrote: (f) => void this.ix?.then((ix) => ix.put(f)),
        removed: (id) => void this.ix?.then((ix) => ix.drop(id)),
      },
      opts.device ?? deviceId(),
    );
  }

  dispose(): void {
    this.listeners.clear();
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
      return f && (await this.parsed(f, p)).links.some((l) => wanted.has(linkTarget(l))) ? p : null;
    });
    const backlinks = linking.filter((p): p is string => !!p);
    return { ...parsed, path, links: [...new Set(links)], backlinks };
  }

  async move(path: string, toFolder: string, opts?: { undo?: boolean }): Promise<string> {
    const ix = await this.index();
    const f = this.mustFile(ix, path);
    const out = moveEntry(ix.entries(), path, toFolder, Date.now());
    if (out === path) return path;
    refuseReserved(out);
    const to = ix.idOf(toFolder);
    if (!to) throw new BowerError('not-found', 'That folder is no longer there.');
    await this.stillAsSeen(f);
    const name = nameOf(out);
    ix.put(this.keepSeen(f, await this.drive.update(f.id, { ...(name !== f.name ? { name } : {}), addParent: to, ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) })));
    const last = opts?.undo ? [...(await this.journal.list())].reverse().find((c) => c.kind === 'move' && c.path === path) : undefined;
    if (last) await this.journal.remove(last.id);
    else await this.journal.record('move', `Moved ${displayName(nameOf(path))} to ${where(toFolder)}`, { path: out, from: path, fileId: f.id });
    this.emit();
    return out;
  }

  async rename(path: string, name: string): Promise<string> {
    const ix = await this.index();
    const f = this.mustFile(ix, path);
    const out = renameEntry(ix.entries(), path, name, Date.now());
    if (out === path) return path;
    refuseReserved(out);
    await this.stillAsSeen(f);
    ix.put(this.keepSeen(f, await this.drive.update(f.id, { name: nameOf(out) })));
    // A thing made since the last tidy-up and named now is one change: its making, under its name.
    const made = (await this.journal.list()).find((c) => c.kind === 'create' && c.path === path);
    if (made) {
      await this.journal.remove(made.id);
      await this.journal.record('create', `New ${f.folder ? 'folder' : 'note'} "${displayName(nameOf(out))}" in ${where(parentOf(out))}`, { path: out, fileId: f.id });
    } else await this.journal.record('rename', `Renamed ${displayName(nameOf(path))} to ${displayName(nameOf(out))}`, { path: out, from: path, fileId: f.id });
    this.emit();
    return out;
  }

  async create(folder: string, type: 'note' | 'folder', name?: string): Promise<string> {
    const ix = await this.index();
    const parent = ix.idOf(folder);
    if (!parent) throw new BowerError('not-found', 'That folder is no longer there.');
    if (name) checkLength(name, type);
    const path = join(folder, freeName(ix.entries(), folder, name ?? (type === 'folder' ? 'New folder' : 'Untitled.md')));
    refuseReserved(path);
    const made = type === 'folder' ? await this.drive.createFolder(parent, nameOf(path)) : await this.drive.createText(parent, nameOf(path), '');
    ix.put(made);
    await this.journal.record('create', `New ${type} "${displayName(nameOf(path))}" in ${where(folder)}`, { path, fileId: made.id });
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
      await this.drive.trash(f.id);
      ix.drop(f.id);
      this.bin.set(path, { id: f.id, change: null, top, ...(pending ? { pending, pileKey } : {}) });
      this.emit();
      return;
    }
    const f = this.mustFile(ix, path);
    removeEntry(ix.entries(), path);
    await this.drive.trash(f.id);
    ix.drop(f.id);
    // Something made and binned before any tidy-up saw it leaves no trace.
    const made = (await this.journal.list()).find((c) => c.kind === 'create' && c.path === path);
    let change: string | null = null;
    if (made) await this.journal.remove(made.id);
    else change = (await this.journal.record('trash', `Put ${displayName(nameOf(path))} in the Bin`, { path, fileId: f.id })).id;
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
    this.notes.set(f.id, { modified: written.modifiedTime, note: parseNote(path, out.text) });
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
      const title = displayName(nameOf(e.path));
      if (!words.every((w) => title.toLowerCase().includes(w))) continue;
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
        return address && words.every((w) => address.toLowerCase().includes(w)) ? { path, title: displayName(nameOf(path)), snippet: address, score: 1 } : null;
      }
      const n = await this.parsed(h, path);
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
    const ix = await this.index();
    const out: Pile[] = [];
    for (const f of ix.filesIn('Inbox')) {
      const path = ix.pathOf(f.id);
      if (!path) continue;
      const id = f.appProperties?.[PROP.pile] ?? f.id;
      const sending = (this.uploads.get(id)?.entries ?? []).map((e) => e.item);
      if (!f.folder) {
        out.push({ id, path, text: '', createdAt: Date.parse(f.createdTime), items: [itemOf(f)] });
        continue;
      }
      const kids = ix.filesIn(path).filter((k) => !k.folder);
      const note = kids.find((k) => k.name === PILE_NOTE);
      const text = note ? (await this.parsed(note, `${path}/${PILE_NOTE}`)).body.trim() : '';
      out.push({ id, path, text, createdAt: Date.parse(f.createdTime), items: [...kids.filter((k) => k !== note).map(itemOf), ...sending] });
    }
    // A lone thing still on its way has no file yet: show it from here.
    for (const [id, u] of this.uploads) if (u.lone && !out.some((p) => p.id === id)) out.push({ id, text: '', createdAt: u.createdAt, items: u.entries.map((e) => e.item) });
    return out.sort((a, b) => b.createdAt - a.createdAt);
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
    if (!lone) {
      path = join('Inbox', freeName(ix.entries(), 'Inbox', pileFolderName({ id, text, createdAt, items: [] })));
      const folder = await this.drive.createFolder(inbox, nameOf(path));
      ix.put(folder);
      id = folder.id;
      parent = folder.id;
      if (text) {
        try {
          ix.put(await this.drive.createText(folder.id, PILE_NOTE, text));
        } catch (e) {
          // Half a pile helps nobody: its empty folder goes to the Bin, and you can save again.
          await this.drive.trash(folder.id).catch((err: unknown) => console.error(err));
          ix.drop(folder.id);
          throw e;
        }
      }
    }
    const entries: Sending[] = input.items.map((it, i) => ({
      key: `${id}-${i}-${Math.random().toString(36).slice(2, 10)}`,
      tried: false,
      item: { id: `${id}-${i}`, name: it.name, kind: it.kind, origin: it.origin, upload: 0 },
      ...(it.body ? { body: it.body } : {}),
      ...(it.url ? { url: it.url } : {}),
    }));
    if (entries.length) {
      this.uploads.set(id, { lone, createdAt, parent, entries });
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
    this.uploads.delete(id);
    if (f) {
      await this.drive.trash(f.id);
      ix.drop(f.id);
    }
    this.emit();
  }

  async updatePile(id: string, input: string): Promise<Pile> {
    this.refuseWhileRunning();
    const pile = await this.pile(id);
    const text = input.trim();
    if (!pile.items.length && !text) throw new BowerError('conflict', 'A pile with no files needs its note.');
    const ix = await this.index();
    const f = pile.path ? ix.file(pile.path) : undefined;
    if (!f || !pile.path) throw new BowerError('not-found', 'That pile is already filed.');
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
    const note = ix.file(join(folderPath, PILE_NOTE));
    if (note && text) ix.put(await this.drive.writeText(note.id, text, note.modifiedTime));
    else if (note) {
      await this.drive.trash(note.id);
      ix.drop(note.id);
    } else if (text && folderId) ix.put(await this.drive.createText(folderId, PILE_NOTE, text));
    this.emit();
    return this.pile(id);
  }

  async retryPile(id: string): Promise<void> {
    const u = this.uploads.get(id);
    if (!u || this.sendingPiles.has(id)) return;
    for (const e of u.entries) e.item.upload = 0;
    this.emit();
    this.track(this.send(id));
  }

  async duplicates(files: Array<{ name: string; body?: Blob }>): Promise<Array<string | null>> {
    const known = (await this.json<HashesFile>(SYSTEM.hashes))?.hashes ?? {};
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
    return this.json<LastRunFile>(SYSTEM.lastRun);
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
    const done = (await this.json<RequestsFile>(SYSTEM.requests))?.done ?? [];
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
    const all = (await this.json<QuestionsFile>(SYSTEM.questions))?.questions ?? [];
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
    const all = (await this.json<SuggestionsFile>(SYSTEM.suggestions))?.suggestions ?? [];
    const dropped = dismissed();
    const rules = await this.rules();
    // A suggestion you already have as a rule is not offered again.
    return all.filter((s) => !dropped.includes(s.id) && !ruleLike(rules, s.title));
  }

  async dismissSuggestion(id: string, keep: boolean): Promise<() => Promise<void>> {
    const all = (await this.json<SuggestionsFile>(SYSTEM.suggestions))?.suggestions ?? [];
    const s = all.find((x) => x.id === id);
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

  protected index(): Promise<VaultIndex> {
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
    return this.ix;
  }

  protected emit(): void {
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

  /** One of Bower's JSON files, or null when it is not there or not readable. */
  protected async json<T>(path: string): Promise<T | null> {
    const id = (await this.index()).systemId(path);
    if (!id) return null;
    try {
      const v: unknown = JSON.parse(await this.drive.readText(id));
      return v && typeof v === 'object' && (v as { v?: unknown }).v === 1 ? (v as T) : null;
    } catch (e) {
      if (e instanceof SyntaxError) {
        console.error(`${path} is not valid JSON`);
        return null;
      }
      throw e;
    }
  }

  protected async text(f: DriveFile): Promise<string> {
    const cached = this.texts.get(f.id);
    if (cached && cached.modified === f.modifiedTime) return cached.text;
    const text = await this.drive.readText(f.id);
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
      await this.sendAll(pileId, u);
    } finally {
      this.sendingPiles.delete(pileId);
    }
  }

  private async sendAll(pileId: string, u: Upload): Promise<void> {
    for (const e of [...u.entries]) {
      if (this.uploads.get(pileId) !== u) return;
      try {
        const ix = await this.index();
        if (e.tried) {
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
        const props: Record<string, string> = { [PROP.asAdded]: e.item.name, [PROP.origin]: e.item.origin, [PROP.kind]: e.item.kind, [PROP.item]: e.key, ...(u.lone ? { [PROP.pile]: pileId } : {}) };
        e.item.upload = 0;
        const made = e.url
          ? await this.drive.createText(u.parent, name, `[InternetShortcut]\nURL=${e.url}\n`, props)
          : e.body
            ? await this.drive.upload(u.parent, name, e.body, (p) => {
                e.item.upload = Math.min(p, 0.99);
                this.emit();
              }, props)
            : await this.drive.createText(u.parent, name, '', props);
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
        console.error(err);
        e.item.upload = -1;
      }
      this.emit();
    }
    if (!u.entries.length && this.uploads.get(pileId) === u) this.uploads.delete(pileId);
    this.emit();
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
    if (isSeen(before.id, before.modifiedTime)) markSeen(after.id, after.modifiedTime);
    return after;
  }

  protected mustFile(ix: VaultIndex, path: string): DriveFile {
    const f = ix.file(path);
    if (!f) throw new BowerError('not-found', 'That is no longer there.');
    return f;
  }

  protected async parsed(f: DriveFile, path: string): Promise<ParsedNote> {
    const cached = this.notes.get(f.id);
    if (cached && cached.modified === f.modifiedTime) return { ...cached.note, path, title: displayName(nameOf(path)) };
    const note = parseNote(path, await this.text(f));
    this.notes.set(f.id, { modified: f.modifiedTime, note });
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
  item: PileItem;
  body?: Blob;
  url?: string;
}

interface Upload {
  lone: boolean;
  createdAt: number;
  parent: string;
  entries: Sending[];
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
