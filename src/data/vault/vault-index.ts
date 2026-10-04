/**
 * The Bower folder as paths, over Drive's ids. Drive allows two files with
 * the same name in one folder; paths cannot, so the later one (by creation)
 * reads `Name (2).ext` here and is opened, moved and renamed as itself.
 * Names that differ only by case are told apart the same way.
 */
import type { DriveFile } from '../drive/drive-api';
import { extOf, kindOf, type Entries, type Entry } from '../tree';
import { isHidden, PROP } from './layout';
import { isSeen } from './seen';

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

  idOf(path: string): string | undefined {
    return path === '' ? this.rootId : this.ids.get(path);
  }

  pathOf(id: string): string | undefined {
    return id === this.rootId ? '' : this.paths.get(id);
  }

  file(path: string): DriveFile | undefined {
    const id = this.ids.get(path);
    return id ? this.files.get(id) : undefined;
  }

  /** The id of one of Bower's own files (`.bower/…`, `index.md`). */
  systemId(path: string): string | undefined {
    return isHidden(path) ? this.ids.get(path) : undefined;
  }

  /** Everything the explorer shows. */
  entries(): Entries {
    const out: Entries = new Map();
    for (const [id, path] of this.paths) {
      if (isHidden(path)) continue;
      const f = this.files.get(id);
      if (!f) continue;
      const e: Entry = { path, type: f.folder ? 'folder' : 'file', modified: Date.parse(f.modifiedTime), created: Date.parse(f.createdTime) };
      if (!f.folder) {
        e.kind = kindOf(f.name);
        if (f.appProperties?.[PROP.by] === 'bower') e.byBower = true;
        if (f.appProperties?.[PROP.isNew] === '1' && !isSeen(f.id, f.modifiedTime)) e.isNew = true;
        const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        if (parent && f.name === `${parent.slice(parent.lastIndexOf('/') + 1)}.md`) e.hub = true;
      }
      out.set(path, e);
    }
    return out;
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
