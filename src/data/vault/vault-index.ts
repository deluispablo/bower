/**
 * The Bower folder as paths, over Drive's ids. Drive allows two files with
 * the same name in one folder; paths cannot, so the later one (by creation)
 * reads `Name (2).ext` here and is opened, moved and renamed as itself.
 * Names that differ only by case are told apart the same way.
 */
import type { DriveFile } from '../drive/drive-api';
import type { NotesSeen } from '../contracts/questions';
import { isHub } from '../contracts/hub';
import { displayName, extOf, kindOf, nameOf, type Entries, type Entry } from '../tree';
import { isHidden, PROP } from './layout';
import { seenNow } from './seen';

export class VaultIndex {
  private files = new Map<string, DriveFile>();
  private paths = new Map<string, string>();
  private ids = new Map<string, string>();

  private constructor(private readonly rootId: string) {}

  static build(rootId: string, files: readonly DriveFile[]): VaultIndex {
    const ix = new VaultIndex(rootId);
    for (const f of files) ix.files.set(f.id, f);
    ix.reindex();
    return ix;
  }

  /** The shared hub/MOC recognition for the explorer and edit contract. */
  static readonly isHub = isHub;

  idOf(path: string): string | undefined {
    return path === '' ? this.rootId : this.ids.get(path);
  }

  pathOf(id: string): string | undefined {
    return id === this.rootId ? '' : this.paths.get(id);
  }

  /** A listed file by its id, wherever it is. */
  byId(id: string): DriveFile | undefined {
    return this.files.get(id);
  }

  file(path: string): DriveFile | undefined {
    const id = this.ids.get(path);
    return id ? this.files.get(id) : undefined;
  }

  /** The id of one of Bower's own files (`.bower/…`, `index.md`). */
  systemId(path: string): string | undefined {
    return isHidden(path) ? this.ids.get(path) : undefined;
  }

  /** The files and folders directly in a folder, hidden ones included. */
  filesIn(path: string): DriveFile[] {
    const id = this.idOf(path);
    if (!id) return [];
    return [...this.files.values()].filter((f) => f.parents[0] === id);
  }

  /** Concurrent clients can create duplicate bookkeeping folders. Use their
   * actual Drive names and parents, before path disambiguation, so no line
   * is hidden by `.bower (2)` or `changes (2)`. Archives acknowledge old writes.
   */
  journalFiles(archived = false): DriveFile[] {
    const all = [...this.files.values()];
    const bower = new Set(all.filter((f) => f.folder && f.name === '.bower' && f.parents.includes(this.rootId)).map((f) => f.id));
    const changes = new Set(all.filter((f) => f.folder && f.name === 'changes' && f.parents.some((p) => bower.has(p))).map((f) => f.id));
    const parents = new Set(changes);
    const pending = new Set(all.filter((f) => f.folder && f.name === 'pending' && f.parents.some((p) => changes.has(p))).map((f) => f.id));
    for (const f of all) if (f.folder && f.parents.some((p) => pending.has(p))) parents.add(f.id);
    if (archived) for (const f of all) if (f.folder && f.name === 'archive' && f.parents.some((p) => changes.has(p))) parents.add(f.id);
    return all.filter((f) => !f.folder && f.parents.some((p) => parents.has(p)));
  }

  /** A waiting request's published evidence pointer, falling back to actual pending containment. */
  waitingRun(fileId: string): string | null {
    const file = this.files.get(fileId);
    // The in-place move publishes the next run before its append. Until relocation lands and clears it,
    // that pointer wins over the old pending folder, including duplicate bookkeeping folders.
    const publishedRun = file?.appProperties?.[PROP.run];
    if (publishedRun !== undefined) return publishedRun;
    const run = file && this.files.get(file.parents[0] ?? '');
    const pending = run && this.files.get(run.parents[0] ?? '');
    const changes = pending && this.files.get(pending.parents[0] ?? '');
    const bower = changes && this.files.get(changes.parents[0] ?? '');
    if (run?.folder && pending?.folder && pending.name === 'pending' && changes?.folder && changes.name === 'changes'
      && bower?.folder && bower.name === '.bower' && bower.parents.includes(this.rootId)) return run.name;
    return null;
  }

  /** Everything the explorer shows. */
  entries(): Entries {
    const out: Entries = new Map();
    const seen = seenNow();
    for (const [id, path] of this.paths) {
      if (isHidden(path)) continue;
      const f = this.files.get(id);
      if (!f) continue;
      const e: Entry = { path, type: f.folder ? 'folder' : 'file', modified: Date.parse(f.modifiedTime), created: Date.parse(f.createdTime) };
      if (!f.folder) {
        e.kind = kindOf(f.name);
        if (f.appProperties?.[PROP.by] === 'bower') e.byBower = true;
        if (f.appProperties?.[PROP.isNew] === '1' && !seen(f.id, f.modifiedTime)) e.isNew = true;
        if (VaultIndex.isHub(path, f.name)) e.hub = true;
      }
      out.set(path, e);
    }
    return out;
  }

  /**
   * The folder's notes as listed (the Bin left out): every file's id, and each visible note's name without ".md" in
   * lower case. The one place both readers of a question's subject, the app's and the planner's, take them from.
   */
  notesSeen(): NotesSeen {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const [id, path] of this.paths) {
      if (this.files.get(id)?.folder !== false) continue;
      ids.add(id);
      if (path.endsWith('.md') && !isHidden(path)) names.add(displayName(nameOf(path)).toLowerCase());
    }
    return { ids, names };
  }

  /** Adds a file or takes in its new name and parent. */
  put(file: DriveFile): void {
    this.files.set(file.id, file);
    this.reindex();
  }

  /** Forgets a file, and everything under it for a folder. */
  drop(id: string): void {
    const gone = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of this.files.values()) if (!gone.has(f.id) && f.parents.some((p) => gone.has(p))) {
        gone.add(f.id);
        grew = true;
      }
    }
    for (const g of gone) this.files.delete(g);
    this.reindex();
  }

  private reindex(): void {
    this.paths.clear();
    this.ids.clear();
    const kids = new Map<string, DriveFile[]>();
    for (const f of this.files.values()) {
      const p = f.parents[0];
      if (p) kids.set(p, [...(kids.get(p) ?? []), f]);
    }
    const walk = (parentId: string, parentPath: string): void => {
      const list = (kids.get(parentId) ?? []).sort((a, b) => a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id));
      const taken = new Set<string>();
      for (const f of list) {
        const ext = f.folder ? '' : extOf(f.name);
        const base = ext ? f.name.slice(0, -ext.length) : f.name;
        let name = f.name;
        for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`;
        taken.add(name.toLowerCase());
        const path = parentPath ? `${parentPath}/${name}` : name;
        this.paths.set(f.id, path);
        this.ids.set(path, f.id);
        if (f.folder) walk(f.id, path);
      }
    };
    walk(this.rootId, '');
  }
}
