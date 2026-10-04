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
import { buildTree, displayName, freeName, join, kindOf, moveEntry, nameOf, parentOf, removeEntry, renameEntry } from '../tree';
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
import { PROP, SYSTEM, type HashesFile, type LastRunFile, type QuestionsFile, type RequestsFile, type SuggestionsFile } from './layout';
import { sha256 } from './hashes';
import { parseNote, toggleTaskInText, type ParsedNote } from './note-format';
import { parseRules } from './rules-format';
import { markSeen } from './seen';
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
  private bin = new Map<string, { id: string; change: string | null }>();
  private texts = new Map<string, { modified: string; text: string }>();
  /** Things on their way into the inbox, by pile; a failed one stays with upload -1. */
  private uploads = new Map<string, { lone: boolean; createdAt: number; parent: string; entries: Sending[] }>();
  private sending = new Set<Promise<void>>();

  constructor(opts: DriveVaultOptions) {
    this.drive = opts.drive;
    this.rootId = opts.rootId;
    this.runningPiles = opts.runningPiles;
    this.journal = new Journal(
      this.drive,
      {
        folder: () => this.systemFolder(SYSTEM.changes),
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
    const links = parsed.links.map((l) => byName.get(l.toLowerCase())).filter((p): p is string => !!p && p !== path);
    const hits = await this.drive.fullText(await this.rootId(), `[[${parsed.title}`);
    const backlinks = [...new Set(hits.map((h) => ix.pathOf(h.id)).filter((p): p is string => !!p && p !== path && p.endsWith('.md')))];
    return { ...parsed, path, links: [...new Set(links)], backlinks };
  }

  async move(path: string, toFolder: string, opts?: { undo?: boolean }): Promise<string> {
    const ix = await this.index();
    const f = this.mustFile(ix, path);
    const out = moveEntry(ix.entries(), path, toFolder, Date.now());
    if (out === path) return path;
    const to = ix.idOf(toFolder);
    if (!to) throw new BowerError('not-found', 'That folder is no longer there.');
    const name = nameOf(out);
    ix.put(await this.drive.update(f.id, { ...(name !== f.name ? { name } : {}), addParent: to, ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) }));
    const last = opts?.undo ? [...(await this.journal.list())].reverse().find((c) => c.kind === 'move' && c.path === path) : undefined;
    if (last) await this.journal.remove(last.id);
    else await this.journal.record('move', `Moved ${displayName(nameOf(path))} to ${where(toFolder)}`, { path: out, from: path });
    this.emit();
    return out;
  }

  async rename(path: string, name: string): Promise<string> {
    const ix = await this.index();
    const f = this.mustFile(ix, path);
    const out = renameEntry(ix.entries(), path, name, Date.now());
    if (out === path) return path;
    ix.put(await this.drive.update(f.id, { name: nameOf(out) }));
    await this.journal.record('rename', `Renamed ${displayName(nameOf(path))} to ${displayName(nameOf(out))}`, { path: out, from: path });
    this.emit();
    return out;
  }

  async create(folder: string, type: 'note' | 'folder', name?: string): Promise<string> {
    const ix = await this.index();
    const parent = ix.idOf(folder);
    if (!parent) throw new BowerError('not-found', 'That folder is no longer there.');
    const path = join(folder, freeName(ix.entries(), folder, name ?? (type === 'folder' ? 'New folder' : 'Untitled.md')));
    const made = type === 'folder' ? await this.drive.createFolder(parent, nameOf(path)) : await this.drive.createText(parent, nameOf(path), '');
    ix.put(made);
    await this.journal.record('create', `New ${type} "${displayName(nameOf(path))}" in ${where(folder)}`, { path });
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
      await this.drive.trash(f.id);
      ix.drop(f.id);
      this.bin.set(path, { id: f.id, change: null });
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
    else change = (await this.journal.record('trash', `Put ${displayName(nameOf(path))} in the Bin`, { path })).id;
    this.bin.set(path, { id: f.id, change });
    this.emit();
  }

  async restore(path: string): Promise<void> {
    const gone = this.bin.get(path);
    if (!gone) throw new BowerError('not-found', 'It is no longer in the Bin.');
    const ix = await this.index();
    // The name may have been taken since: come back under a free one, never over it.
    const want = freeName(ix.entries(), parentOf(path), nameOf(path));
    const back = await this.drive.untrash(gone.id);
    if (want !== nameOf(path) || back.name !== want) await this.drive.update(gone.id, { name: want });
    if (gone.change) await this.journal.remove(gone.change);
    this.bin.delete(path);
    await this.refresh();
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
    ix.put(written);
    this.notes.set(f.id, { modified: written.modifiedTime, note: parseNote(path, out.text) });
    await this.journal.record('task', `${out.done ? 'Ticked' : 'Unticked'} "${out.label}" in ${displayName(nameOf(path))}`, { path });
    this.emit();
  }

  async search(query: string): Promise<SearchHit[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const first = words[0];
    if (!first) return [];
    const ix = await this.index();
    const hits: Array<SearchHit & { score: number }> = [];
    const named = new Set<string>();
    for (const e of ix.entries().values()) {
      if (e.type !== 'file' || inInbox(e.path)) continue;
      const title = displayName(nameOf(e.path));
      if (!words.every((w) => title.toLowerCase().includes(w))) continue;
      named.add(e.path);
      hits.push({ path: e.path, title, snippet: where(parentOf(e.path)), score: 3 });
    }
    for (const h of await this.drive.fullText(await this.rootId(), first)) {
      const path = ix.pathOf(h.id);
      if (!path || named.has(path) || inInbox(path) || !path.endsWith('.md') || !ix.entries().has(path)) continue;
      const n = await this.parsed(h, path);
      const lines = [n.summary, ...n.currentState, ...n.body.split('\n'), ...n.properties.map((p) => `${p.label}: ${p.value}`)];
      const line = lines.find((l) => words.every((w) => l.toLowerCase().includes(w)));
      if (!line) continue;
      const snippet = line.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1').replace(/^[-*#\s|]+/, '').slice(0, 120);
      hits.push({ path, title: n.title, snippet, score: 1 });
    }
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
      if (text) ix.put(await this.drive.createText(folder.id, PILE_NOTE, text));
    }
    const entries: Sending[] = input.items.map((it, i) => ({
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
    if (!u || this.sending.size) return;
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
    const pending = (await this.journal.list())
      .filter((r) => r.kind === 'rule')
      .reverse()
      .map((r): Rule => ({ id: r.id, text: r.text ?? r.what, yourWords: r.text ?? r.what, since: r.at, pending: true }));
    return [...pending, ...worded];
  }

  async addRule(input: string): Promise<Rule> {
    const text = input.trim();
    if (!text) throw new BowerError('conflict', 'Write the rule first.');
    const r = await this.journal.record('rule', `New rule: "${text}"`, { path: 'Rules.md', text });
    this.emit();
    return { id: r.id, text, yourWords: text, since: r.at, pending: true };
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
    return all.filter((s) => !dropped.includes(s.id));
  }

  async dismissSuggestion(id: string, keep: boolean): Promise<void> {
    const s = (await this.suggestions()).find((x) => x.id === id);
    dismiss(id);
    if (keep && s) await this.journal.record('rule', `Kept a suggestion as a rule: "${s.title}"`, { path: 'Rules.md', text: s.title });
    this.emit();
  }

  // ---------- plumbing

  protected index(): Promise<VaultIndex> {
    if (!this.ix) {
      const p = (async () => {
        const root = await this.rootId();
        return VaultIndex.build(root, await this.drive.listAll(root));
      })();
      this.ix = p;
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
    if (!u) return;
    for (const e of [...u.entries]) {
      if (this.uploads.get(pileId) !== u) return;
      try {
        const ix = await this.index();
        const parentPath = ix.pathOf(u.parent) ?? 'Inbox';
        const name = freeName(ix.entries(), parentPath, safeInboxName(e.item));
        const props: Record<string, string> = { [PROP.asAdded]: e.item.name, [PROP.origin]: e.item.origin, [PROP.kind]: e.item.kind, ...(u.lone ? { [PROP.pile]: pileId } : {}) };
        e.item.upload = 0;
        const made = e.url
          ? await this.drive.createText(u.parent, name, `[InternetShortcut]\nURL=${e.url}\n`, props)
          : e.body
            ? await this.drive.upload(u.parent, name, e.body, (p) => {
                e.item.upload = Math.min(p, 0.99);
                this.emit();
              }, props)
            : await this.drive.createText(u.parent, name, '', props);
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
  protected async systemFolder(path: string): Promise<string> {
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
  item: PileItem;
  body?: Blob;
  url?: string;
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
    return [];
  }
}

function dismiss(id: string): void {
  try {
    localStorage.setItem(DISMISSED, JSON.stringify([...dismissed(), id].slice(-200)));
  } catch {
    // Without storage it comes back next time; nothing is lost.
  }
}

function toChange(r: JournalRecord): ChangeEntry {
  return { id: r.id, at: r.at, kind: r.kind, what: r.what, ...(r.path ? { path: r.path } : {}) };
}
