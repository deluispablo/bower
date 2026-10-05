/**
 * Google Drive in memory: ids, parents, the Bin, modified times and the
 * same failures as the real one. Used by unit tests and by the fake stack
 * (`?source=fake`), where it holds Alex's folder in the browser.
 */
import { BowerError, type ErrorCode } from '../types';
import { driveError, type DriveApi, type DriveFile, type DrivePatch } from './drive-api';

interface Stored {
  meta: DriveFile;
  trashed: boolean;
  content: string | Blob | null;
  /** A restored big-file placeholder has no original bytes; never certify it as content. */
  bytesUnavailable?: true;
}

export interface FakeDriveOptions {
  clock?: () => number;
  /** A wait on every call, in ms, so screens show their loading states. */
  latency?: number;
  /** Every call fails as with no network. */
  offline?: boolean;
}

export class FakeDrive implements DriveApi {
  private files = new Map<string, Stored>();
  private seq = 0;
  private last = 0;
  private failing: ErrorCode | null = null;
  private readonly clock: () => number;
  /** Can change after seeding, so a folder fills at once and then answers slowly or not at all. */
  latency: number;
  offline: boolean;

  constructor(opts: FakeDriveOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    this.latency = opts.latency ?? 0;
    this.offline = opts.offline ?? false;
    const at = this.stamp();
    this.files.set('root', { meta: { id: 'root', name: 'My Drive', folder: true, parents: [], modifiedTime: at, createdTime: at }, trashed: false, content: null });
  }

  /** Told after every change, so the fake source can keep the Drive across reloads. */
  onChange: (() => void) | null = null;

  /** Everything, as JSON: files, the Bin, contents (blobs as base64) and the counters. */
  async snapshot(): Promise<string> {
    const files = [];
    for (const f of this.files.values()) {
      const c = f.content;
      // A tab keeps a few MB: a big file keeps its place and size, not its bytes.
      const content = c === null ? null : typeof c === 'string' ? { text: c } : f.bytesUnavailable || c.size > KEEP_BYTES ? { big: true, type: c.type } : { b64: toBase64(new Uint8Array(await c.arrayBuffer())), type: c.type };
      files.push({ meta: f.meta, trashed: f.trashed, content });
    }
    return JSON.stringify({ v: 1, seq: this.seq, last: this.last, files });
  }

  /** A FakeDrive back from `snapshot()`. */
  static restore(json: string, opts: FakeDriveOptions = {}): FakeDrive {
    const d = new FakeDrive(opts);
    const data = JSON.parse(json) as { seq: number; last: number; files: Array<{ meta: DriveFile; trashed: boolean; content: { text: string } | { b64: string; type: string } | { big: true; type: string } | null }> };
    d.files.clear();
    for (const f of data.files) {
      const c = f.content;
      const content = c === null ? null : 'text' in c ? c.text : 'big' in c ? new Blob([`A big file, kept by name only on the pretend Drive.`], { type: c.type }) : new Blob([fromBase64(c.b64)], { type: c.type });
      // Old restore→snapshot could lose `big` and base64-encode the small placeholder.
      const unavailable = c && ('big' in c || ('b64' in c && (f.meta.size ?? 0) > KEEP_BYTES && content instanceof Blob && content.size <= KEEP_BYTES));
      d.files.set(f.meta.id, { meta: f.meta, trashed: f.trashed, content, ...(unavailable ? { bytesUnavailable: true as const } : {}) });
    }
    d.seq = data.seq;
    d.last = data.last;
    return d;
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

  /** Sets a file's times, for seeding a folder with some history. */
  setTimes(id: string, created: number, modified: number): void {
    const f = this.files.get(id);
    if (f) f.meta = { ...f.meta, createdTime: new Date(created).toISOString(), modifiedTime: new Date(modified).toISOString() };
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
    await this.gate();
    return this.live(rootId).map((f) => this.copy(f.meta));
  }

  async get(id: string): Promise<DriveFile> {
    await this.gate();
    return this.copy(this.find(id).meta);
  }

  async readText(id: string): Promise<string> {
    await this.gate();
    const f = this.find(id);
    if (f.content === null) return '';
    return typeof f.content === 'string' ? f.content : f.content.text();
  }

  async readBytes(id: string): Promise<Uint8Array> {
    await this.gate();
    const f = this.find(id);
    if (f.bytesUnavailable) throw new BowerError('unknown', "This device no longer has this file's contents.");
    if (f.content === null) return new Uint8Array();
    if (typeof f.content === 'string') return new TextEncoder().encode(f.content);
    try {
      return new Uint8Array(new Uint8Array(await f.content.arrayBuffer()));
    } catch (e) {
      console.error(e);
      if (e instanceof BowerError) throw e;
      throw driveError(e instanceof TypeError ? 'offline' : 'unknown');
    }
  }

  async createFolder(parentId: string, name: string, appProperties?: Record<string, string>): Promise<DriveFile> {
    await this.gate();
    return this.changed(this.add(parentId, name, true, null, appProperties));
  }

  async createText(parentId: string, name: string, text: string, appProperties?: Record<string, string>): Promise<DriveFile> {
    await this.gate();
    return this.changed(this.add(parentId, name, false, text, appProperties));
  }

  async upload(parentId: string, name: string, body: Blob, onProgress?: (fraction: number) => void, appProperties?: Record<string, string>): Promise<DriveFile> {
    await this.gate();
    const f = this.add(parentId, name, false, body, appProperties);
    onProgress?.(1);
    return this.changed(f);
  }

  async writeText(id: string, text: string, ifModified: string): Promise<DriveFile> {
    await this.gate();
    const f = this.find(id);
    if (f.meta.modifiedTime !== ifModified) throw driveError('conflict');
    f.content = text;
    delete f.bytesUnavailable;
    f.meta = { ...f.meta, modifiedTime: this.stamp(), size: text.length };
    return this.changed(this.copy(f.meta));
  }

  async update(id: string, patch: DrivePatch): Promise<DriveFile> {
    await this.gate();
    const f = this.find(id);
    let parents = f.meta.parents;
    if (patch.removeParent) parents = parents.filter((p) => p !== patch.removeParent);
    if (patch.addParent) {
      this.find(patch.addParent);
      parents = [...parents, patch.addParent];
    }
    let appProperties = f.meta.appProperties;
    if (patch.appProperties) {
      const merged: Record<string, string | null> = { ...appProperties, ...patch.appProperties };
      const next = Object.fromEntries(Object.entries(merged).filter((e): e is [string, string] => e[1] !== null));
      appProperties = Object.keys(next).length ? next : undefined;
    }
    const { appProperties: _old, ...rest } = f.meta;
    f.meta = { ...rest, parents, ...(patch.name ? { name: patch.name } : {}), ...(appProperties ? { appProperties } : {}), modifiedTime: this.stamp() };
    return this.changed(this.copy(f.meta));
  }

  async trash(id: string): Promise<void> {
    await this.gate();
    this.find(id).trashed = true;
    this.changed(null);
  }

  async untrash(id: string): Promise<DriveFile> {
    await this.gate();
    const f = this.files.get(id);
    if (!f) throw driveError('not-found');
    f.trashed = false;
    return this.changed(this.copy(f.meta));
  }

  async fullText(rootId: string, query: string): Promise<DriveFile[]> {
    await this.gate();
    const q = query.toLowerCase();
    const out: DriveFile[] = [];
    for (const f of this.live(rootId)) {
      if (f.meta.folder) continue;
      const text = typeof f.content === 'string' ? f.content : '';
      if (f.meta.name.toLowerCase().includes(q) || text.toLowerCase().includes(q)) out.push(this.copy(f.meta));
    }
    return out;
  }

  private changed<T>(out: T): T {
    this.onChange?.();
    return out;
  }

  private async gate(): Promise<void> {
    if (this.latency) await new Promise((r) => setTimeout(r, this.latency * (0.6 + Math.random() * 0.8)));
    if (this.offline) throw driveError('offline');
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

/** Files bigger than this keep only their name and size across a reload. */
const KEEP_BYTES = 256 * 1024;

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
