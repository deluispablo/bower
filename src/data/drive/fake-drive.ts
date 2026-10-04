/**
 * Google Drive in memory: ids, parents, the Bin, modified times and the
 * same failures as the real one. Used by unit tests and by the fake stack
 * (`?source=fake`), where it holds Alex's folder in the browser.
 */
import type { ErrorCode } from '../types';
import { driveError, type DriveApi, type DriveFile } from './drive-api';

interface Stored {
  meta: DriveFile;
  trashed: boolean;
  content: string | Blob | null;
}

export interface FakeDriveOptions {
  clock?: () => number;
}

export class FakeDrive implements DriveApi {
  private files = new Map<string, Stored>();
  private seq = 0;
  private last = 0;
  private failing: ErrorCode | null = null;
  private readonly clock: () => number;

  constructor(opts: FakeDriveOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    const at = this.stamp();
    this.files.set('root', { meta: { id: 'root', name: 'My Drive', folder: true, parents: [], modifiedTime: at, createdTime: at }, trashed: false, content: null });
  }

  /** The next call rejects with this code. */
  failNext(code: ErrorCode): void {
    this.failing = code;
  }

  /** Another device changed the file. */
  touch(id: string): void {
    const f = this.files.get(id);
    if (f) f.meta = { ...f.meta, modifiedTime: this.stamp() };
  }

  /** Every live file's path and text, for tests. */
  dump(rootId = 'root'): Map<string, string> {
    const out = new Map<string, string>();
    for (const f of this.live(rootId)) if (typeof f.content === 'string') out.set(this.pathOf(f.meta.id, rootId), f.content);
    return out;
  }

  /** The path of an id below a root, for tests and the fake runner. */
  pathOf(id: string, rootId: string): string {
    const names: string[] = [];
    let cur = this.files.get(id);
    while (cur && cur.meta.id !== rootId) {
      names.unshift(cur.meta.name);
      cur = this.files.get(cur.meta.parents[0] ?? '');
    }
    return names.join('/');
  }

  async listAll(rootId: string): Promise<DriveFile[]> {
    this.gate();
    return this.live(rootId).map((f) => this.copy(f.meta));
  }

  async get(id: string): Promise<DriveFile> {
    this.gate();
    return this.copy(this.find(id).meta);
  }

  async readText(id: string): Promise<string> {
    this.gate();
    const f = this.find(id);
    if (f.content === null) return '';
    return typeof f.content === 'string' ? f.content : f.content.text();
  }

  async createFolder(parentId: string, name: string): Promise<DriveFile> {
    this.gate();
    return this.add(parentId, name, true, null);
  }

  async createText(parentId: string, name: string, text: string, appProperties?: Record<string, string>): Promise<DriveFile> {
    this.gate();
    return this.add(parentId, name, false, text, appProperties);
  }

  async upload(parentId: string, name: string, body: Blob, onProgress?: (fraction: number) => void): Promise<DriveFile> {
    this.gate();
    const f = this.add(parentId, name, false, body);
    onProgress?.(1);
    return f;
  }

  async writeText(id: string, text: string, ifModified: string): Promise<DriveFile> {
    this.gate();
    const f = this.find(id);
    if (f.meta.modifiedTime !== ifModified) throw driveError('conflict');
    f.content = text;
    f.meta = { ...f.meta, modifiedTime: this.stamp(), size: text.length };
    return this.copy(f.meta);
  }

  async update(id: string, patch: { name?: string; addParent?: string; removeParent?: string }): Promise<DriveFile> {
    this.gate();
    const f = this.find(id);
    let parents = f.meta.parents;
    if (patch.removeParent) parents = parents.filter((p) => p !== patch.removeParent);
    if (patch.addParent) {
      this.find(patch.addParent);
      parents = [...parents, patch.addParent];
    }
    f.meta = { ...f.meta, parents, ...(patch.name ? { name: patch.name } : {}), modifiedTime: this.stamp() };
    return this.copy(f.meta);
  }

  async trash(id: string): Promise<void> {
    this.gate();
    this.find(id).trashed = true;
  }

  async untrash(id: string): Promise<DriveFile> {
    this.gate();
    const f = this.files.get(id);
    if (!f) throw driveError('not-found');
    f.trashed = false;
    return this.copy(f.meta);
  }

  async fullText(rootId: string, query: string): Promise<DriveFile[]> {
    this.gate();
    const q = query.toLowerCase();
    const out: DriveFile[] = [];
    for (const f of this.live(rootId)) {
      if (f.meta.folder) continue;
      const text = typeof f.content === 'string' ? f.content : '';
      if (f.meta.name.toLowerCase().includes(q) || text.toLowerCase().includes(q)) out.push(this.copy(f.meta));
    }
    return out;
  }

  private gate(): void {
    const code = this.failing;
    if (!code) return;
    this.failing = null;
    throw driveError(code);
  }

  private stamp(): string {
    this.last = Math.max(this.clock(), this.last + 1);
    return new Date(this.last).toISOString();
  }

  private find(id: string): Stored {
    const f = this.files.get(id);
    if (!f || f.trashed) throw driveError('not-found');
    return f;
  }

  private add(parentId: string, name: string, folder: boolean, content: string | Blob | null, appProperties?: Record<string, string>): DriveFile {
    this.find(parentId);
    const at = this.stamp();
    const id = `f${++this.seq}`;
    const size = content === null ? undefined : typeof content === 'string' ? content.length : content.size;
    const meta: DriveFile = { id, name, folder, parents: [parentId], modifiedTime: at, createdTime: at, ...(size !== undefined ? { size } : {}), ...(appProperties ? { appProperties: { ...appProperties } } : {}) };
    this.files.set(id, { meta, trashed: false, content });
    return this.copy(meta);
  }

  /** Files below the root whose every ancestor is out of the Bin. */
  private live(rootId: string): Stored[] {
    const kids = new Map<string, Stored[]>();
    for (const f of this.files.values()) {
      if (f.trashed) continue;
      for (const p of f.meta.parents) kids.set(p, [...(kids.get(p) ?? []), f]);
    }
    const out: Stored[] = [];
    const walk = (parent: string): void => {
      for (const f of kids.get(parent) ?? []) {
        out.push(f);
        if (f.meta.folder) walk(f.meta.id);
      }
    };
    walk(rootId);
    return out;
  }

  private copy(m: DriveFile): DriveFile {
    return { ...m, parents: [...m.parents], ...(m.appProperties ? { appProperties: { ...m.appProperties } } : {}) };
  }
}
