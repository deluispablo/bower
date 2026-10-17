/**
 * Google Drive in memory: ids, parents, the Bin, modified times and the
 * same failures as the real one. Used by unit tests and by the fake stack
 * (`?source=fake`), where it holds Alex's folder in the browser.
 */
import { BowerError, type ErrorCode } from '../types';
import { sha256, sha256Sync } from '../vault/hashes';
import { md5Hex } from '../contracts/hashes';
import { FOLDER, toFile } from './drive-http';
import { ancestryLookup, changesError, decodePrefix, drainChanges, driveError, PREFIX_BYTES, resolveDriveScope, RESUMABLE_UNIT, SEARCH_FOLDERS, SEARCH_MAX_PAGES, SEARCH_PAGE_SIZE, unconfirmedWriteError, type BinnedItem, type DriveApi, type DriveChange, type DriveChangePage, type DriveChanges, type DriveFile, type DrivePatch, type DriveScope, type FaultHook, type FencedCall, type FencedDrive, type ResumableTarget, type SessionStatus, type StoredEvidence } from './drive-api';
/** The fence's types live with the Drive ports; kept here for the tests that import them from the fake. */
export type { FaultAction, FaultHook, FencedCall, FencedDrive, StoredEvidence } from './drive-api';

interface Stored {
  meta: DriveFile & { mimeType?: string };
  trashed: boolean;
  content: string | Blob | null;
  /** A restored big-file placeholder has no original bytes; never certify it as content. */
  bytesUnavailable?: true;
  /** Its original bytes' SHA-256, kept when they were not (fake-stored evidence). */
  sha256?: string;
}

export interface FakeDriveOptions {
  clock?: () => number;
  /** A wait on every call, in ms, so screens show their loading states. */
  latency?: number;
  /** Every call fails as with no network. */
  offline?: boolean;
  /** Resumable chunks other than the last must be a multiple of this (Drive: 256 KiB). */
  chunkMultiple?: number;
  /** Recorded prefix response statuses; stored media otherwise answers as 206. */
  prefixResponses?: Record<string, 206 | 200 | 416>;
  /** Recorded feed responses; without them, tokens address this instance's in-memory changes. */
  startPageToken?: string;
  changePages?: Record<string, DriveChangePage>;
}

/** One resumable-upload call the pretend Drive answered, for tests. */
export interface ResumableCall {
  op: 'generateIds' | 'open' | 'put' | 'status';
  id?: string;
  session?: string;
  start?: number;
  bytes?: number;
}

interface FakeSession {
  target: ResumableTarget;
  parts: Blob[];
  held: number;
  expired: boolean;
  file: DriveFile | null;
}

/** The words of a text: runs of letters and digits, lower case. */
const words = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export class FakeDrive implements DriveApi {
  private files = new Map<string, Stored>();
  private seq = 0;
  private last = 0;
  private failing: ErrorCode | null = null;
  private readonly clock: () => number;
  private readonly chunkMultiple: number;
  private readonly prefixResponses: Record<string, 206 | 200 | 416>;
  private readonly startPageToken: string | undefined;
  private readonly changePages: Record<string, DriveChangePage> | undefined;
  private readonly changes: DriveChange[] = [];
  /** Can change after seeding, so a folder fills at once and then answers slowly or not at all. */
  latency: number;
  offline: boolean;
  /** How many calls have been made (for measuring what a screen asks of Drive). */
  calls = 0;
  /** At most this many calls wait at once, as a browser holds a few connections to one host; 0 is no limit. */
  concurrency = 0;
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(opts: FakeDriveOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    this.latency = opts.latency ?? 0;
    this.offline = opts.offline ?? false;
    this.chunkMultiple = opts.chunkMultiple ?? RESUMABLE_UNIT;
    this.prefixResponses = opts.prefixResponses ?? {};
    this.startPageToken = opts.startPageToken;
    this.changePages = opts.changePages;
    const at = this.stamp();
    this.files.set('root', { meta: { id: 'root', name: 'My Drive', folder: true, parents: [], modifiedTime: at, createdTime: at }, trashed: false, content: null });
  }

  /** Told after every change, so the fake source can keep the Drive across reloads. */
  onChange: (() => void) | null = null;
  /** Makes this Drive durable now; awaited before any write is answered, as Drive answers only what it stored. */
  persist: (() => Promise<void>) | null = null;

  /** Everything, as JSON: files, the Bin, contents (blobs as base64), changes feed and counters. */
  async snapshot(): Promise<string> {
    const files = [];
    for (const f of this.files.values()) {
      const c = f.content;
      // A tab keeps a few MB: a big file keeps its place and size, not its bytes.
      const big = c instanceof Blob && (f.bytesUnavailable || c.size > KEEP_BYTES);
      const content = c === null ? null : typeof c === 'string' ? { text: c } : big ? { big: true, type: c.type } : { b64: toBase64(new Uint8Array(await c.arrayBuffer())), type: c.type };
      // A big file keeps the hash of its bytes beside its name and size, so it can still be checked after a reload.
      const hash = big ? (f.bytesUnavailable ? f.sha256 : await sha256(c)) : undefined;
      files.push({ meta: f.meta, trashed: f.trashed, content, ...(hash ? { sha256: hash } : {}) });
    }
    return JSON.stringify({ v: 1, seq: this.seq, last: this.last, files, changes: this.changes, ...(await this.resumableSnapshot()) });
  }

  /** A FakeDrive back from `snapshot()`. */
  static restore(json: string, opts: FakeDriveOptions = {}): FakeDrive {
    const d = new FakeDrive(opts);
    const data = JSON.parse(json) as { seq: number; last: number; changes?: DriveChange[]; files: Array<{ meta: DriveFile; trashed: boolean; content: { text: string } | { b64: string; type: string } | { big: true; type: string } | null; sha256?: unknown }> };
    d.files.clear();
    for (const f of data.files) {
      const c = f.content;
      const content = c === null ? null : 'text' in c ? c.text : 'big' in c ? new Blob([`A big file, kept by name only on the pretend Drive.`], { type: c.type }) : new Blob([fromBase64(c.b64)], { type: c.type });
      // Old restore→snapshot could lose `big` and base64-encode the small placeholder.
      const unavailable = c && ('big' in c || ('b64' in c && (f.meta.size ?? 0) > KEEP_BYTES && content instanceof Blob && content.size <= KEEP_BYTES));
      // Legacy snapshots counted text characters; only original media can supply the byte size.
      if (f.meta.size !== undefined && content !== null && !unavailable) f.meta = { ...f.meta, size: typeof content === 'string' ? new TextEncoder().encode(content).byteLength : content.size };
      const kept = typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256) ? { sha256: f.sha256 } : {};
      d.files.set(f.meta.id, { meta: f.meta, trashed: f.trashed, content, ...(unavailable ? { bytesUnavailable: true as const, ...kept } : {}) });
    }
    d.seq = data.seq;
    d.last = data.last;
    d.changes.push(...data.changes ?? []);
    d.restoreResumable(JSON.parse(json) as unknown);
    return d;
  }

  /** The next call rejects with this code. */
  failNext(code: ErrorCode): void {
    this.failing = code;
  }

  /** Another device changed the file. */
  touch(id: string): void {
    const f = this.files.get(id);
    if (f) {
      f.meta = { ...f.meta, modifiedTime: this.stamp() };
      this.changes.push({ fileId: id, removed: false, file: this.listed(f) });
    }
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

  /** With `checksums`, each content file also carries the `sha256` and `size` Drive keeps, as the real listing's fields do. */
  async listAll(rootId: string, opts: { checksums?: boolean } = {}): Promise<DriveFile[]> {
    await this.gate();
    const out: DriveFile[] = [];
    for (const f of this.live(rootId)) {
      const listed = this.listed(f);
      if (!opts.checksums || f.meta.folder) { out.push(listed); continue; }
      // Text is hashed at once, so a listing takes no more turns than a plain one; only a Blob waits for Web Crypto.
      const d = f.bytesUnavailable ? (f.sha256 !== undefined && f.meta.size !== undefined ? { size: f.meta.size, sha256: f.sha256 } : null)
        : typeof f.content === 'string' || f.content === null ? this.textDigest(f.content) : await this.digestOfStored(f);
      out.push(d ? { ...listed, ...d } : listed);
    }
    return out;
  }

  private textDigest(text: string | null): { size: number; sha256: string } {
    const bytes = new TextEncoder().encode(text ?? '');
    return { size: bytes.byteLength, sha256: sha256Sync(bytes) };
  }

  async get(id: string, opts: { checksums?: boolean; binned?: boolean } = {}): Promise<DriveFile> {
    await this.gate();
    const kept = this.files.get(id);
    const f = this.listed(opts.binned && kept ? kept : this.find(id));
    return opts.checksums ? this.answered(f) : f;
  }

  /** A file as a listing gives it: its metadata, and whether a checksum of its content is kept (`unchecked`). */
  private listed(f: Stored): DriveFile {
    // Drive's trashed field includes inherited Bin status; keep the stored flag explicit for untrash.
    const seen = new Set<string>();
    const pending = [f];
    let trashed = false;
    while (pending.length) {
      const current = pending.pop();
      if (!current) break;
      if (seen.has(current.meta.id)) continue;
      seen.add(current.meta.id);
      if (current.trashed) {
        trashed = true;
        break;
      }
      for (const id of current.meta.parents) {
        const parent = this.files.get(id);
        if (parent) pending.push(parent);
      }
    }
    return { ...this.copy(f.meta), ...(f.bytesUnavailable && f.sha256 === undefined ? { unchecked: true as const } : {}), ...(trashed ? { trashed: true as const } : {}) };
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

  async readPrefix(id: string): Promise<string | null> {
    await this.gate();
    const f = this.find(id);
    if (this.listed(f).trashed) throw driveError('not-found');
    const mimeType = f.meta.mimeType ?? (f.content instanceof Blob ? f.content.type : undefined);
    if (f.meta.folder || mimeType?.startsWith('application/vnd.google-apps.')) return null;
    const status = this.prefixResponses[id] ?? 206;
    if (status === 416) return '';
    const bytes = await this.readBytes(id);
    return decodePrefix(status === 206 ? bytes.subarray(0, PREFIX_BYTES) : bytes);
  }

  async getStartPageToken(): Promise<string> {
    await this.gate();
    return this.startPageToken ?? String(this.changes.length);
  }

  async listChanges(pageToken: string): Promise<DriveChanges> {
    return drainChanges(pageToken, async (token) => {
      await this.gate();
      let page: DriveChangePage;
      if (this.changePages) {
        const recorded = this.changePages[token];
        if (!recorded) throw changesError('Unknown fake changes page token');
        page = recorded;
      } else {
        const from = Number(token);
        if (!/^\d+$/.test(token) || !Number.isSafeInteger(from) || from > this.changes.length) {
          throw changesError('Invalid fake changes page token');
        }
        page = { changes: this.changes.slice(from), newStartPageToken: String(this.changes.length) };
      }
      return {
        ...page,
        changes: page.changes.map((c) => ({
          fileId: c.fileId,
          removed: c.removed,
          ...(c.file ? { file: toFile({
            ...this.copy(c.file),
            mimeType: c.file.folder ? FOLDER : undefined,
            size: c.file.size?.toString(),
            sha256Checksum: c.file.sha256,
          }) } : {}),
        })),
      };
    });
  }

  async parents(id: string): Promise<string[]> {
    await this.gate();
    const f = this.files.get(id);
    if (!f) throw driveError('not-found');
    return [...f.meta.parents];
  }

  async resolveScope(rootId: string, unknownIds: readonly string[]): Promise<DriveScope> {
    return resolveDriveScope(rootId, unknownIds, (id) => this.parents(id));
  }

  /**
   * A file's size and SHA-256 as stored here (fake-stored evidence): from its
   * bytes, or, for a big file after a reload, from what the snapshot kept.
   * Null when they could not be checked.
   */
  async storedDigest(id: string, _known?: Uint8Array): Promise<{ size: number; sha256: string } | null> {
    await this.gate();
    const f = this.find(id);
    if (f.bytesUnavailable) return f.sha256 !== undefined && f.meta.size !== undefined ? { size: f.meta.size, sha256: f.sha256 } : null;
    const bytes = f.content === null ? new Uint8Array() : typeof f.content === 'string' ? new TextEncoder().encode(f.content) : new Uint8Array(await f.content.arrayBuffer());
    return { size: bytes.byteLength, sha256: await sha256(new Blob([bytes])) };
  }

  /** Bin entries below `rootId` (through any parent, in the Bin or not) whose `bowerItem` is one of `keys`. */
  async binnedByItem(rootId: string, keys: readonly string[]): Promise<BinnedItem[]> {
    await this.gate();
    const wanted = new Set(keys);
    const below = ancestryLookup(new Set([rootId]), async (id) => this.files.get(id)?.meta.parents ?? []);
    const out: BinnedItem[] = [];
    for (const f of this.files.values()) {
      const key = f.meta.appProperties?.bowerItem;
      if (!f.trashed || f.meta.folder || !key || !wanted.has(key) || !(await below(f.meta.id))) continue;
      const digest = f.bytesUnavailable ? null : await this.digestOfStored(f);
      out.push({ file: this.copy(f.meta), size: digest?.size ?? (f.sha256 ? (f.meta.size ?? null) : null), sha256: digest?.sha256 ?? f.sha256 ?? null });
    }
    return out;
  }

  private async digestOfStored(f: Stored): Promise<{ size: number; sha256: string }> {
    const bytes = f.content === null ? new Uint8Array() : typeof f.content === 'string' ? new TextEncoder().encode(f.content) : new Uint8Array(await f.content.arrayBuffer());
    return { size: bytes.byteLength, sha256: await sha256(new Blob([bytes])) };
  }

  async createFolder(parentId: string, name: string, appProperties?: Record<string, string>, id?: string): Promise<DriveFile> {
    await this.gate();
    return this.kept(this.changed(this.add(parentId, name, true, null, appProperties, id)));
  }

  async createText(parentId: string, name: string, text: string, appProperties?: Record<string, string>, id?: string): Promise<DriveFile> {
    await this.gate();
    return this.kept(this.answered(this.changed(this.add(parentId, name, false, text, appProperties, id))));
  }

  async upload(parentId: string, name: string, body: Blob, onProgress?: (fraction: number) => void, appProperties?: Record<string, string>): Promise<DriveFile> {
    await this.gate();
    const f = this.add(parentId, name, false, body, appProperties);
    onProgress?.(1);
    return this.kept(this.changed(f));
  }

  async writeText(id: string, text: string, ifModified: string, appProperties?: Record<string, string>): Promise<DriveFile> {
    await this.gate();
    return this.kept(this.answered(this.applyWrite(id, text, ifModified, appProperties)));
  }

  async update(id: string, patch: DrivePatch): Promise<DriveFile> {
    await this.gate();
    return this.kept(this.applyUpdate(id, patch));
  }

  async trash(id: string, appProperties?: Record<string, string>): Promise<DriveFile> {
    await this.gate();
    return this.kept(this.applyTrash(id, appProperties));
  }

  async untrash(id: string, appProperties?: Record<string, string>, name?: string): Promise<DriveFile> {
    await this.gate();
    const f = this.files.get(id);
    if (!f) throw driveError('not-found');
    f.trashed = false;
    if (appProperties) f.meta = { ...f.meta, appProperties: { ...f.meta.appProperties, ...appProperties } };
    if (name !== undefined) f.meta = { ...f.meta, name, modifiedTime: this.stamp() };
    return this.kept(this.changed(this.copy(f.meta)));
  }

  /**
   * As `DriveHttp.fullText` is answered: every word of the query, whole and in any order (Drive's `fullText contains`),
   * in the name or the text; for each batch of 40 folders, the first two pages of a thousand.
   */
  async fullText(rootId: string, query: string): Promise<DriveFile[]> {
    await this.gate();
    const asked = words(query);
    const live = this.live(rootId);
    const parents = [rootId, ...live.filter((f) => f.meta.folder).map((f) => f.meta.id)];
    const out = new Map<string, DriveFile>();
    for (let i = 0; i < parents.length; i += SEARCH_FOLDERS) {
      const batch = new Set(parents.slice(i, i + SEARCH_FOLDERS));
      const hits = live.filter((f) => {
        if (f.meta.folder || !f.meta.parents.some((p) => batch.has(p))) return false;
        const have = new Set(words(`${f.meta.name} ${typeof f.content === 'string' ? f.content : ''}`));
        return asked.every((w) => have.has(w));
      });
      for (const f of hits.slice(0, SEARCH_MAX_PAGES * SEARCH_PAGE_SIZE)) out.set(f.meta.id, this.copy(f.meta));
    }
    return [...out.values()];
  }

  /** Every resumable call, in order. */
  resumableCalls: ResumableCall[] = [];
  /** Runs before a chunk is taken: a test may wait here, expire sessions or lose the reply. */
  beforeChunk: ((call: { session: string; start: number; bytes: number }) => void | Promise<void>) | null = null;
  private reserved = new Set<string>();
  private reservedSeq = 0;
  private sessions = new Map<string, FakeSession>();
  private sessionSeq = 0;
  private loseReply = false;

  /** Every open session answers as expired from now on. */
  expireSessions(): void {
    for (const session of this.sessions.values()) session.expired = true;
  }

  /** The next resumable call, create, `update`, `writeText`, `trash` or `untrash` does what it was asked, then its answer is lost. */
  loseNextReply(): void {
    this.loseReply = true;
  }

  async generateIds(count: number): Promise<string[]> {
    this.resumableCalls.push({ op: 'generateIds' });
    await this.gate();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = `r${++this.reservedSeq}`;
      this.reserved.add(id);
      ids.push(id);
    }
    // Drive keeps a reservation at once, so it is answered only once the pretend Drive keeps it too.
    this.changed(null);
    await this.persist?.();
    return this.reply(ids);
  }

  async openResumable(target: ResumableTarget): Promise<string> {
    this.resumableCalls.push({ op: 'open', id: target.id });
    await this.gate();
    if (!this.reserved.has(target.id)) throw driveError('unknown');
    if (this.files.has(target.id)) throw driveError('conflict');
    this.find(target.parentId);
    const url = `https://drive.test/upload/session-${++this.sessionSeq}`;
    this.sessions.set(url, { target: { ...target }, parts: [], held: 0, expired: false, file: null });
    return this.reply(url);
  }

  async putChunk(session: string, start: number, chunk: Blob, size: number, signal?: AbortSignal): Promise<SessionStatus> {
    this.resumableCalls.push({ op: 'put', session, start, bytes: chunk.size });
    await this.beforeChunk?.({ session, start, bytes: chunk.size });
    if (signal?.aborted) throw new DOMException('The upload stopped.', 'AbortError');
    await this.gate();
    const s = this.sessions.get(session);
    if (!s || s.expired || s.file || start > s.held) return this.reply(this.statusOf(s));
    // Drive answers 400 to a size that changed, or a chunk off its 256 KiB unit before the last.
    if (size !== s.target.size || (start + chunk.size < size && chunk.size % this.chunkMultiple !== 0)) throw driveError('unknown');
    // Bytes Drive already holds are skipped, as Drive does with an overlapping chunk.
    const fresh = chunk.slice(s.held - start);
    s.parts.push(fresh);
    s.held += fresh.size;
    if (s.held >= s.target.size) {
      const { id, parentId, name, type, appProperties } = s.target;
      const content = new Blob(s.parts, { type });
      const hash = await sha256(content);
      if (this.files.has(id)) throw driveError('conflict');
      s.file = { ...this.changed(this.add(parentId, name, false, content, appProperties, id)), sha256: hash };
      s.parts = [];
    } else this.changed(null);
    // Drive keeps the bytes it confirms (or the finished file), so they are confirmed only once kept.
    await this.persist?.();
    return this.reply(this.statusOf(s));
  }

  async sessionStatus(session: string, _size: number): Promise<SessionStatus> {
    this.resumableCalls.push({ op: 'status', session });
    await this.gate();
    return this.reply(this.statusOf(this.sessions.get(session)));
  }

  async getUploaded(id: string): Promise<DriveFile> {
    await this.gate();
    const f = this.find(id);
    const hash = f.bytesUnavailable ? f.sha256 : (await this.digestOfStored(f)).sha256;
    return { ...this.copy(f.meta), ...(hash ? { sha256: hash } : {}) };
  }

  /** Reserved ids and open sessions, so an upload resumes after the fake source reloads. */
  private async resumableSnapshot(): Promise<{ resumable: KeptResumable }> {
    const sessions: KeptResumable['sessions'] = [];
    for (const [url, s] of this.sessions) {
      const bytes = new Blob(s.parts);
      // Like big files, a big session keeps no bytes: it comes back expired, to restart under its id.
      const keep = !s.expired && !s.file && bytes.size <= KEEP_BYTES;
      sessions.push({ url, target: s.target, ...(keep ? { b64: toBase64(new Uint8Array(await bytes.arrayBuffer())) } : {}), fileId: s.file?.id ?? null });
    }
    return { resumable: { reserved: [...this.reserved], reservedSeq: this.reservedSeq, sessionSeq: this.sessionSeq, sessions } };
  }

  private restoreResumable(data: unknown): void {
    const kept = typeof data === 'object' && data !== null && 'resumable' in data ? (data.resumable as Partial<KeptResumable>) : null;
    if (!kept) return;
    this.reserved = new Set(Array.isArray(kept.reserved) ? kept.reserved.filter((id): id is string => typeof id === 'string') : []);
    this.reservedSeq = typeof kept.reservedSeq === 'number' ? kept.reservedSeq : 0;
    this.sessionSeq = typeof kept.sessionSeq === 'number' ? kept.sessionSeq : 0;
    for (const k of Array.isArray(kept.sessions) ? kept.sessions : []) {
      const made = k.fileId ? this.files.get(k.fileId) : undefined;
      const parts = k.b64 !== undefined ? [new Blob([fromBase64(k.b64)])] : [];
      const held = parts[0]?.size ?? 0;
      this.sessions.set(k.url, { target: k.target, parts, held, expired: !made && k.b64 === undefined, file: made ? this.copy(made.meta) : null });
    }
  }

  private statusOf(s: FakeSession | undefined): SessionStatus {
    if (!s || s.expired) return { kind: 'expired' };
    if (s.file) return { kind: 'done', file: { ...this.copy(s.file), ...(s.file.sha256 ? { sha256: s.file.sha256 } : {}) } };
    return { kind: 'partial', confirmed: s.held };
  }

  /** The answer, unless a test asked for it to be lost after the effect. */
  /** `reply` once the tab keeps the write: the effect, then kept, then the answer (or its loss). */
  private async kept<T>(value: T): Promise<T> {
    await this.persist?.();
    return this.reply(value);
  }

  private reply<T>(value: T): T {
    if (!this.loseReply) return value;
    this.loseReply = false;
    throw driveError('offline');
  }

  private changed<T extends DriveFile | null>(out: T): T {
    if (out) {
      const f = this.files.get(out.id);
      if (f) this.changes.push({ fileId: out.id, removed: false, file: this.listed(f) });
    }
    this.onChange?.();
    return out;
  }

  private async gate(): Promise<void> {
    this.calls++;
    if (this.latency) {
      if (this.concurrency && this.active >= this.concurrency) await new Promise<void>((r) => this.queue.push(r));
      this.active++;
      try {
        await new Promise((r) => setTimeout(r, this.latency * (0.6 + Math.random() * 0.8)));
      } finally {
        this.active--;
        this.queue.shift()?.();
      }
    }
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

  /** With `reservedId` (`generateIds`), as Drive: an id it did not reserve is refused, and one taken already is a conflict (409). */
  private add(parentId: string, name: string, folder: boolean, content: string | Blob | null, appProperties?: Record<string, string>, reservedId?: string): DriveFile {
    if (reservedId !== undefined && !this.reserved.has(reservedId)) throw driveError('unknown');
    if (reservedId !== undefined && this.files.has(reservedId)) throw driveError('conflict');
    this.find(parentId);
    const at = this.stamp();
    const id = reservedId ?? `f${++this.seq}`;
    const size = content === null ? undefined : typeof content === 'string' ? new TextEncoder().encode(content).byteLength : content.size;
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

  // --- The run service's controlled boundary (fake only): fenced writes, a fault hook, stored evidence. ---

  /** Sees, and may refuse or lose the reply of, every fenced write. */
  fault: FaultHook | null = null;

  /**
   * Writes whose `check` runs right before the change, with nothing awaited in
   * between, and refuses it by throwing: the service's authority and
   * still-as-seen checks and the change they permit are one step. `check` may
   * look at what is stored at that instant, and is told which write it guards. The fault hook sees each call first.
   */
  fenced(check: (peek: Peek, call: FencedCall) => void): FencedDrive {
    const run = async (call: FencedCall, apply: () => DriveFile): Promise<DriveFile> => {
      await this.gate();
      const action = this.fault?.before?.(call) ?? 'pass';
      // A run's write with no answer, worded as the runner's transport words it: never offline (`transport.ts`).
      if (action === 'refuse') throw runNoAnswer();
      check((id) => this.peek(id), call);
      const out = this.answered(apply());
      this.fault?.applied?.(call);
      if (action === 'lose-reply') throw runNoAnswer();
      return out;
    };
    const props = (appProperties?: Record<string, string>): { appProperties?: Record<string, string> } => (appProperties ? { appProperties: { ...appProperties } } : {});
    return {
      generateIds: (count) => this.generateIds(count),
      createFolder: (parentId, name, appProperties, id) => run({ op: 'create-folder', parentId, name, ...props(appProperties), ...(id ? { reserved: id } : {}) }, () => this.changed(this.add(parentId, name, true, null, appProperties, id))),
      createText: (parentId, name, text, appProperties, id) => run({ op: 'create-text', parentId, name, text, ...props(appProperties), ...(id ? { reserved: id } : {}) }, () => this.changed(this.add(parentId, name, false, text, appProperties, id))),
      update: (id, patch) => run({ op: 'update', id, patch }, () => this.applyUpdate(id, patch)),
      trash: (id, appProperties) => run({ op: 'trash', id, ...props(appProperties) }, () => this.applyTrash(id, appProperties)),
      writeText: (id, text, ifModified, appProperties) => run({ op: 'write-text', id, text, ifModified, ...props(appProperties) }, () => this.applyWrite(id, text, ifModified, appProperties)),
    };
  }

  /** A write answered as Drive answers it when `fields` asks (every write does): with the stored text's `md5Checksum`. */
  private answered(file: DriveFile): DriveFile {
    const content = this.files.get(file.id)?.content;
    return typeof content === 'string' ? { ...file, md5Checksum: md5Hex(new TextEncoder().encode(content)) } : file;
  }

  /** What is stored for an id right now: for a fenced check. */
  private peek(id: string): PeekedFile | null {
    const f = this.files.get(id);
    return f ? { file: this.copy(f.meta), trashed: f.trashed } : null;
  }

  /** `update` after its gate, with nothing awaited: shared by `update` and fenced writes. */
  private applyUpdate(id: string, patch: DrivePatch): DriveFile {
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

  /** `writeText` after its gate, with nothing awaited: shared by `writeText` and fenced writes. */
  private applyWrite(id: string, text: string, ifModified: string, appProperties?: Record<string, string>): DriveFile {
    const f = this.find(id);
    if (f.meta.modifiedTime !== ifModified) throw driveError('conflict');
    f.content = text;
    delete f.bytesUnavailable;
    delete f.sha256;
    f.meta = { ...f.meta, ...(appProperties ? { appProperties: { ...f.meta.appProperties, ...appProperties } } : {}), modifiedTime: this.stamp(), size: new TextEncoder().encode(text).byteLength };
    return this.changed(this.copy(f.meta));
  }

  /** `trash` after its gate, with its properties set in the same change (Drive's `files.update` with `trashed`). */
  private applyTrash(id: string, appProperties?: Record<string, string>): DriveFile {
    const f = this.find(id);
    f.trashed = true;
    if (appProperties) f.meta = { ...f.meta, appProperties: { ...f.meta.appProperties, ...appProperties } };
    return this.changed(this.copy(f.meta));
  }

  /**
   * `snapshot()` together with `alongside()`, both taken at the same instant:
   * nothing can change between them, though the snapshot is encoded after.
   */
  async snapshotWith<T>(alongside: () => T): Promise<{ snapshot: string; alongside: T }> {
    const twin = new FakeDrive();
    twin.files = new Map([...this.files].map(([id, f]) => [id, { ...f, meta: this.copy(f.meta) }]));
    twin.seq = this.seq;
    twin.last = this.last;
    twin.changes.push(...this.changes.map((c) => ({ ...c, ...(c.file ? { file: this.copy(c.file) } : {}) })));
    // The resumable uploads too (reserved ids and open sessions), as `snapshot()` keeps them.
    twin.reserved = new Set(this.reserved);
    twin.reservedSeq = this.reservedSeq;
    twin.sessionSeq = this.sessionSeq;
    twin.sessions = new Map([...this.sessions].map(([url, x]) => [url, { ...x, target: { ...x.target }, parts: [...x.parts], file: x.file ? this.copy(x.file) : null }]));
    const kept = alongside();
    return { snapshot: await twin.snapshot(), alongside: kept };
  }

  /** What is stored for an id, in the Bin or not: its metadata, its own Bin flag and its bytes' size and SHA-256 (fake-stored). */
  async evidence(id: string): Promise<StoredEvidence | null> {
    await this.gate();
    const f = this.files.get(id);
    if (!f) return null;
    const content = f.meta.folder ? null : f.bytesUnavailable ? (f.sha256 !== undefined && f.meta.size !== undefined ? { size: f.meta.size, sha256: f.sha256 } : null) : await this.digestOfStored(f);
    return { file: this.copy(f.meta), trashed: f.trashed, content };
  }
}

/** What a fenced check sees of a stored file at the instant of the change. */
export interface PeekedFile {
  file: DriveFile;
  trashed: boolean;
}
export type Peek = (id: string) => PeekedFile | null;

/** The resumable part of a snapshot. */
interface KeptResumable {
  reserved: string[];
  reservedSeq: number;
  sessionSeq: number;
  sessions: Array<{ url: string; target: ResumableTarget; b64?: string; fileId: string | null }>;
}

/** A fenced write that got no answer, as the runner's headless transport words it: unconfirmed. */
const runNoAnswer = (): BowerError => unconfirmedWriteError();

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
