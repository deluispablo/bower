/**
 * The Bower folder in Google Drive, behind the same door as the demo
 * (`VaultSource`). It lists the folder once into a `VaultIndex`, applies the
 * same naming rules as the demo (`tree.ts`) before any call to Drive, and
 * writes one journal line for each change you make, so the next tidy-up
 * knows what happened. It never writes Bower's own sections of a note.
 */
import type { DriveApi, DriveFile } from '../drive/drive-api';
import type { Unsubscribe, VaultSource } from '../sources';
import { buildTree, displayName, freeName, join, moveEntry, nameOf, parentOf, removeEntry, renameEntry } from '../tree';
import {
  BowerError,
  type ChangeEntry,
  type NewPile,
  type Note,
  type Pile,
  type Question,
  type Request,
  type Rule,
  type SearchHit,
  type Suggestion,
  type TreeNode,
} from '../types';
import { Journal, type JournalRecord } from './journal';
import { SYSTEM } from './layout';
import { parseNote, toggleTaskInText, type ParsedNote } from './note-format';
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

  // ---------- the inbox and Bower (next)

  piles(): Promise<Pile[]> {
    return notYet();
  }
  addPile(_pile: NewPile): Promise<Pile> {
    return notYet();
  }
  removePile(_id: string): Promise<void> {
    return notYet();
  }
  updatePile(_id: string, _text: string): Promise<Pile> {
    return notYet();
  }
  questions(): Promise<Question[]> {
    return notYet();
  }
  answer(_id: string, _yes: boolean): Promise<void> {
    return notYet();
  }
  rules(): Promise<Rule[]> {
    return notYet();
  }
  requests(): Promise<Request[]> {
    return notYet();
  }
  addRequest(_text: string): Promise<Request> {
    return notYet();
  }
  addRule(_text: string): Promise<Rule> {
    return notYet();
  }
  suggestions(): Promise<Suggestion[]> {
    return notYet();
  }
  dismissSuggestion(_id: string, _keep: boolean): Promise<void> {
    return notYet();
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

  protected mustFile(ix: VaultIndex, path: string): DriveFile {
    const f = ix.file(path);
    if (!f) throw new BowerError('not-found', 'That is no longer there.');
    return f;
  }

  protected async parsed(f: DriveFile, path: string): Promise<ParsedNote> {
    const cached = this.notes.get(f.id);
    if (cached && cached.modified === f.modifiedTime) return { ...cached.note, path, title: displayName(nameOf(path)) };
    const note = parseNote(path, await this.drive.readText(f.id));
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

function notYet(): Promise<never> {
  return Promise.reject(new BowerError('unknown', 'Not ready yet.'));
}

function toChange(r: JournalRecord): ChangeEntry {
  return { id: r.id, at: r.at, kind: r.kind, what: r.what, ...(r.path ? { path: r.path } : {}) };
}
