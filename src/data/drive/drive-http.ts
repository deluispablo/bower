/**
 * Google Drive over its REST API (v3): the one Drive transport for the app, the runner and the Worker
 * (c2-drive-transport). The access token comes from the caller (the Worker's route, the run's ticket route, or the
 * Worker's own refresh); a 401 asks for a fresh one once. Every request goes under the one retry policy
 * (`transport.ts`: a bound per attempt, idempotent requests sent again with backoff inside a budget); everything
 * else becomes one of `DRIVE_MESSAGES`, worded for where it ran (`context`: never "offline" outside a browser).
 */
import { BowerError } from '../types';
import type { Digest } from '../pile-readiness';
import { sha256 } from '../vault/hashes';
import { noAnswer, send, type Context, type Fetch } from './transport';
import { confirmedFrom, chunkRange } from './resumable-upload';
import { DRIVE_MESSAGES, driveError, RESUMABLE_UNIT, SEARCH_FOLDERS, SEARCH_MAX_PAGES, SEARCH_PAGE_SIZE, unconfirmedWriteError, type BinnedItem, type DriveApi, type DriveFile, type DrivePatch, type ResumableDrive, type ResumableTarget, type SessionStatus } from './drive-api';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FIELDS = 'id,name,mimeType,parents,modifiedTime,createdTime,size,appProperties,trashed';
/** A file made by a resumable upload, with its content's checksum to check it. */
const UPLOADED_FIELDS = `${FIELDS},sha256Checksum`;
/** A listing with checksums: also `md5Checksum`, which names the same content uploaded again. */
const LISTED_FIELDS = `${UPLOADED_FIELDS},md5Checksum`;
/** The only session addresses that get the person's token. */
const UPLOAD_SESSIONS = 'https://www.googleapis.com/upload/';
export const FOLDER = 'application/vnd.google-apps.folder';
const BATCH = SEARCH_FOLDERS;
/** Keys looked up in one Bin query. */
const BIN_KEYS = 20;
/** How many folders up a binned file's place is looked for. */
const BIN_DEPTH = 8;
const SMALL = 5 * 1024 * 1024;
const CHUNK = 8 * 1024 * 1024;

/** A file as Drive v3 answers it (`FIELDS`, and the checksums when asked); the one wire type of every client. */
export interface WireFile {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  modifiedTime: string;
  createdTime: string;
  size?: string;
  appProperties?: Record<string, string>;
  trashed?: boolean;
  sha256Checksum?: string;
  md5Checksum?: string;
}

export interface DriveHttpOptions {
  /** The access token; `fresh` asks the Worker for a new one. */
  token: (fresh: boolean) => Promise<string>;
  fetch?: Fetch;
  /** Where it runs: `browser` (the default) words a request with no answer as offline; `headless` never does. */
  context?: Context;
}

export const toFile = (w: WireFile): DriveFile => ({
  id: w.id,
  name: w.name,
  folder: w.mimeType === FOLDER,
  parents: w.parents ?? [],
  modifiedTime: w.modifiedTime,
  createdTime: w.createdTime,
  ...(w.size !== undefined ? { size: Number(w.size) } : {}),
  ...(w.appProperties ? { appProperties: w.appProperties } : {}),
  ...(w.sha256Checksum ? { sha256: w.sha256Checksum } : {}),
  ...(w.md5Checksum ? { md5Checksum: w.md5Checksum } : {}),
});

export const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const mimeOf = (name: string): string => (name.endsWith('.md') ? 'text/markdown' : 'text/plain');
/** Drive's 403 for a rate limit, told apart from a refusal by its reason. */
async function isRateLimit(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = (await res.clone().json()) as { error?: { errors?: Array<{ reason?: string }> } };
    return (body.error?.errors ?? []).some((e) => e.reason === 'rateLimitExceeded' || e.reason === 'userRateLimitExceeded');
  } catch {
    // expected: an error body that is not JSON is not a rate limit.
    return false;
  }
}

export class DriveHttp implements DriveApi, ResumableDrive {
  private readonly token: (fresh: boolean) => Promise<string>;
  private readonly fetchFn: Fetch;
  private readonly context: Context;
  /** Ids known under each root from the last listing, so full-text hits stay inside it. */
  private known = new Map<string, Set<string>>();
  /** Root and descendant folders from the same listing, for parent-scoped searches. */
  private searchParents = new Map<string, string[]>();

  constructor(opts: DriveHttpOptions) {
    this.token = opts.token;
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
    this.context = opts.context ?? 'browser';
  }

  /** No answer, worded for where this runs. */
  private lost(): BowerError {
    return noAnswer(this.context, { offline: DRIVE_MESSAGES.offline, elsewhere: DRIVE_MESSAGES.unknown });
  }

  /**
   * Every file and folder under `rootId`, one `files.list` per level of up to 40 folders, paged. With `checksums`,
   * each file also carries the `sha256Checksum` and `md5Checksum` Drive keeps (Drive v3, "Return specific fields"), so a reader checks
   * stored bytes from the listing rather than one `files.get` per file.
   */
  async listAll(rootId: string, opts: { checksums?: boolean } = {}): Promise<DriveFile[]> {
    const fields = opts.checksums ? LISTED_FIELDS : FIELDS;
    const out: DriveFile[] = [];
    let level = [rootId];
    while (level.length) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += BATCH) {
        const ids = level.slice(i, i + BATCH);
        const q = `(${ids.map((id) => `${quote(id)} in parents`).join(' or ')}) and trashed = false`;
        for (const f of await this.query(q, Infinity, fields)) {
          // No checksum and no size: a Docs Editors file or a shortcut, whose content Drive keeps no checksum of.
          out.push(opts.checksums && !f.folder && f.sha256 === undefined && f.size === undefined ? { ...f, unchecked: true } : f);
          if (f.folder) next.push(f.id);
        }
      }
      level = next;
    }
    this.known.set(rootId, new Set(out.map((f) => f.id)));
    this.searchParents.set(rootId, [rootId, ...out.filter((f) => f.folder).map((f) => f.id)]);
    return out;
  }

  async get(id: string): Promise<DriveFile> {
    const w = (await (await this.call(`${API}/files/${id}?fields=${FIELDS}`)).json()) as WireFile;
    if (w.trashed) throw driveError('not-found');
    return toFile(w);
  }

  async readText(id: string): Promise<string> {
    return (await this.call(`${API}/files/${id}?alt=media`)).text();
  }

  async readBytes(id: string): Promise<Uint8Array> {
    const response = await this.call(`${API}/files/${id}?alt=media`);
    try {
      // Copy even when an injected transport retains its returned body buffer.
      return new Uint8Array(new Uint8Array(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      if (e instanceof BowerError) throw e;
      throw e instanceof TypeError ? this.lost() : driveError('unknown');
    }
  }

  async createFolder(parentId: string, name: string, appProperties?: Record<string, string>): Promise<DriveFile> {
    return this.json(`${API}/files?fields=${FIELDS}`, 'POST', { name, mimeType: FOLDER, parents: [parentId], ...(appProperties ? { appProperties } : {}) });
  }

  async createText(parentId: string, name: string, text: string, appProperties?: Record<string, string>): Promise<DriveFile> {
    const meta = { name, parents: [parentId], mimeType: mimeOf(name), ...(appProperties ? { appProperties } : {}) };
    return this.multipart(meta, new Blob([text], { type: mimeOf(name) }));
  }

  async upload(parentId: string, name: string, body: Blob, onProgress?: (fraction: number) => void, appProperties?: Record<string, string>): Promise<DriveFile> {
    const meta = { name, parents: [parentId], ...(appProperties ? { appProperties } : {}) };
    if (body.size <= SMALL) {
      const f = await this.multipart(meta, body);
      onProgress?.(1);
      return f;
    }
    const start = await this.call(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(body.size) },
      body: JSON.stringify(meta),
    });
    const session = start.headers.get('location');
    if (!session) throw driveError('unknown');
    for (let at = 0; at < body.size; at += CHUNK) {
      const end = Math.min(at + CHUNK, body.size);
      const res = await this.call(session, {
        method: 'PUT',
        headers: { 'content-range': `bytes ${at}-${end - 1}/${body.size}` },
        body: body.slice(at, end),
      });
      onProgress?.(Math.round((end / body.size) * 100) / 100);
      if (res.status !== 308) return this.changed(toFile((await res.json()) as WireFile));
    }
    throw driveError('unknown');
  }

  /** Drive v3 has no If-Match on files: this reads, then writes, which leaves a short window. */
  /**
   * `appProperties`, when given, go in the same request: a multipart `files.update`, metadata then media
   * (https://developers.google.com/workspace/drive/api/guides/manage-uploads#multipart).
   */
  /** `current`, when given, is the file as the caller read it moments ago (the runner's fence): it is compared in place of one more read. */
  async writeText(id: string, text: string, ifModified: string, appProperties?: Record<string, string>, current?: DriveFile): Promise<DriveFile> {
    const now = current ?? (await this.get(id));
    if (now.modifiedTime !== ifModified) throw driveError('conflict');
    if (appProperties) return this.multipart({ appProperties }, new Blob([text], { type: mimeOf(now.name) }), id);
    const res = await this.call(`${UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`, { method: 'PATCH', headers: { 'content-type': mimeOf(now.name) }, body: text });
    return toFile((await res.json()) as WireFile);
  }

  async update(id: string, patch: DrivePatch): Promise<DriveFile> {
    const q = new URLSearchParams({ fields: FIELDS });
    if (patch.addParent) q.set('addParents', patch.addParent);
    if (patch.removeParent) q.set('removeParents', patch.removeParent);
    return this.json(`${API}/files/${id}?${q}`, 'PATCH', { ...(patch.name ? { name: patch.name } : {}), ...(patch.appProperties ? { appProperties: patch.appProperties } : {}) });
  }

  /** `appProperties`, when given, are set by the same `files.update` that puts it in the Bin. */
  async trash(id: string, appProperties?: Record<string, string>): Promise<void> {
    await this.json(`${API}/files/${id}?fields=${FIELDS}`, 'PATCH', { trashed: true, ...(appProperties ? { appProperties } : {}) });
  }

  async untrash(id: string): Promise<DriveFile> {
    return this.json(`${API}/files/${id}?fields=${FIELDS}`, 'PATCH', { trashed: false });
  }

  async fullText(rootId: string, query: string): Promise<DriveFile[]> {
    const inside = this.known.get(rootId) ?? new Set((await this.listAll(rootId)).map((f) => f.id));
    // Unrelated Drive hits cannot spend this folder's page allowance. Parent queries
    // are bounded to 40 folders and two pages each, even for a large folder tree.
    const parents = this.searchParents.get(rootId) ?? [rootId];
    const hits = new Map<string, DriveFile>();
    for (let i = 0; i < parents.length; i += BATCH) {
      const scope = parents.slice(i, i + BATCH).map((id) => `${quote(id)} in parents`).join(' or ');
      const files = await this.query(`fullText contains ${quote(query)} and (${scope}) and trashed = false`, SEARCH_MAX_PAGES);
      for (const f of files) if (inside.has(f.id)) hits.set(f.id, f);
    }
    return [...hits.values()];
  }

  /** The bytes are read to be hashed and not kept; the caller that holds them already passes them as `known`. */
  async storedDigest(id: string, known?: Uint8Array): Promise<Digest | null> {
    const bytes = known ?? (await this.readBytes(id));
    return { size: bytes.byteLength, sha256: await sha256(new Blob([new Uint8Array(bytes).buffer])) };
  }

  /**
   * The Bin's files carrying one of `keys` as `bowerItem`, from inside `rootId`: one `trashed = true` listing for each
   * 20 keys (an `appProperties has` for each), with Drive's own checksums. A file Drive keeps no checksum of is listed
   * with a null size and hash.
   */
  async binnedByItem(rootId: string, keys: readonly string[]): Promise<BinnedItem[]> {
    if (!keys.length) return [];
    const inside = new Set(this.known.get(rootId) ?? (await this.listAll(rootId)).map((f) => f.id)).add(rootId);
    const hits = new Map<string, BinnedItem>();
    // A file in a folder that is itself in the Bin is trashed too (`trashed` true, `explicitlyTrashed` false), and its
    // folder is in no listing: its place is found by walking up the folders it names, a few `files.get` at most.
    const placed = new Map<string, Promise<boolean>>();
    const below = (id: string, depth = 0): Promise<boolean> => {
      if (inside.has(id)) return Promise.resolve(true);
      if (depth >= BIN_DEPTH) return Promise.resolve(false);
      let known = placed.get(id);
      if (!known) {
        known = (async () => {
          let res: Response;
          try {
            res = await this.call(`${API}/files/${id}?fields=id,parents`);
          } catch (e) {
            // expected: a folder outside this Drive (or not shared) is not below the folder; anything else stops the look.
            if (e instanceof BowerError && e.code === 'not-found') return false;
            throw e;
          }
          const parents = ((await res.json()) as { parents?: string[] }).parents ?? [];
          return (await Promise.all(parents.map((p) => below(p, depth + 1)))).some(Boolean);
        })();
        placed.set(id, known);
      }
      return known;
    };
    for (let i = 0; i < keys.length; i += BIN_KEYS) {
      const has = keys.slice(i, i + BIN_KEYS).map((k) => `appProperties has { key='bowerItem' and value=${quote(k)} }`).join(' or ');
      for (const file of await this.query(`trashed = true and (${has})`, SEARCH_MAX_PAGES, LISTED_FIELDS)) {
        if (file.folder || !(await Promise.all(file.parents.map((p) => below(p)))).some(Boolean)) continue;
        hits.set(file.id, { file, size: file.sha256 !== undefined ? (file.size ?? null) : null, sha256: file.sha256 ?? null });
      }
    }
    return [...hits.values()];
  }

  async generateIds(count: number): Promise<string[]> {
    const q = new URLSearchParams({ count: String(count), space: 'drive', type: 'files' });
    const body = (await (await this.call(`${API}/files/generateIds?${q}`)).json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : [];
    if (ids.length !== count) {
      console.error(`Drive generated ${ids.length} of ${count} ids`);
      throw driveError('unknown');
    }
    return ids;
  }

  async openResumable(target: ResumableTarget): Promise<string> {
    const meta = { id: target.id, name: target.name, parents: [target.parentId], ...(target.appProperties ? { appProperties: target.appProperties } : {}) };
    const res = await this.raw(`${UPLOAD}/files?uploadType=resumable&fields=${UPLOADED_FIELDS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': target.type || 'application/octet-stream', 'x-upload-content-length': String(target.size) },
      body: JSON.stringify(meta),
    });
    const session = res.headers.get('location');
    if (res.ok && session) return session;
    throw this.sessionFailure(res, 'opening an upload');
  }

  async putChunk(session: string, start: number, chunk: Blob, size: number, signal?: AbortSignal): Promise<SessionStatus> {
    this.mustBeSession(session);
    if (start + chunk.size < size && chunk.size % RESUMABLE_UNIT !== 0) {
      console.error(`Refused an upload chunk of ${chunk.size} bytes: not a multiple of 256 KiB`);
      throw driveError('unknown');
    }
    const res = await this.raw(session, { method: 'PUT', headers: { 'content-range': chunkRange(start, start + chunk.size, size) }, body: chunk, ...(signal ? { signal } : {}) });
    return this.sessionAnswer(res, 'an upload chunk');
  }

  async sessionStatus(session: string, size: number): Promise<SessionStatus> {
    this.mustBeSession(session);
    // A question, not a write: safe to ask again after a stall.
    const res = await this.raw(session, { method: 'PUT', headers: { 'content-range': `bytes */${size}` } }, true);
    return this.sessionAnswer(res, 'an upload status');
  }

  async getUploaded(id: string): Promise<DriveFile> {
    const w = (await (await this.call(`${API}/files/${id}?fields=${UPLOADED_FIELDS}`)).json()) as WireFile;
    if (w.trashed) throw driveError('not-found');
    return toFile(w);
  }

  /** A kept session address is sent the token only when it is Google's upload service. */
  private mustBeSession(session: string): void {
    if (session.startsWith(UPLOAD_SESSIONS)) return;
    console.error('Refused a resumable session outside Google upload');
    throw driveError('unknown');
  }

  /** 200/201 done, 308 partial, 404/410 the session expired; anything else rejects. */
  private async sessionAnswer(res: Response, what: string): Promise<SessionStatus> {
    if (res.status === 200 || res.status === 201) return { kind: 'done', file: this.changed(toFile((await res.json()) as WireFile)) };
    if (res.status === 308) return { kind: 'partial', confirmed: confirmedFrom(res.headers.get('range')) };
    if (res.status === 404 || res.status === 410) return { kind: 'expired' };
    throw this.sessionFailure(res, what);
  }

  /** A reserved id already taken answers 409: `conflict`, so the caller reads the file back. */
  private sessionFailure(res: Response, what: string): BowerError {
    if (res.status === 409) return driveError('conflict');
    if (res.status === 404) return driveError('not-found');
    console.error(`Drive answered ${res.status} for ${what}`);
    return driveError('unknown');
  }

  /**
   * One resumable request with the token, its one refresh and the retries; every other answer goes back as is. Busy or
   * failing on Google's side is asked again: a chunk carries its range, a create its reserved id. A stall is sent
   * again only for a status question (`idempotent`); a chunk or a create is not, and its caller asks the status.
   */
  private async raw(url: string, init: RequestInit, idempotent = false): Promise<Response> {
    return this.authorized(url, init, { idempotent, again: async (res) => res.status === 429 || res.status >= 500 || (await isRateLimit(res)) });
  }

  /** The request under the transport's policy, with the token and its one refresh; any answer but a 401 goes back. */
  private async authorized(url: string, init: RequestInit, opts: Parameters<typeof send>[3], write = false): Promise<Response> {
    // Only a browser known offline before the call proves nothing was sent; any other write with no answer may have landed.
    const knownOffline = this.context === 'browser' && (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine === false;
    let token = await this.token(false);
    for (let refreshed = false; ; refreshed = true) {
      let res: Response;
      try {
        res = await send(this.fetchFn, url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } }, opts);
      } catch (e) {
        if (e instanceof BowerError) throw e;
        // Stopped on purpose: the queue tells this from a failure.
        if (e instanceof DOMException && e.name === 'AbortError' && init.signal) throw e;
        if (e instanceof TypeError) throw write && !knownOffline ? unconfirmedWriteError() : this.lost();
        console.error(e);
        throw driveError('unknown');
      }
      if (res.status !== 401) return res;
      if (refreshed) throw driveError('auth');
      token = await this.token(true);
    }
  }

  private async query(q: string, maxPages = Infinity, fields = FIELDS): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken = '';
    let pages = 0;
    do {
      if (++pages > maxPages) break;
      const params = new URLSearchParams({ q, fields: `nextPageToken,files(${fields})`, pageSize: String(SEARCH_PAGE_SIZE) });
      if (pageToken) params.set('pageToken', pageToken);
      const body = (await (await this.call(`${API}/files?${params}`)).json()) as { files?: WireFile[]; nextPageToken?: string };
      out.push(...(body.files ?? []).map(toFile));
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  /** A structural write can change which roots contain a file or a new folder.
   * Forget both halves together; the next search lists its root once afresh.
   * Existing VaultIndexes keep their own immediate updates without extra reads.
   */
  private changed(file: DriveFile): DriveFile {
    this.known.clear();
    this.searchParents.clear();
    return file;
  }

  private async json(url: string, method: string, body: unknown): Promise<DriveFile> {
    const res = await this.call(url, { method, headers: { 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body) });
    return this.changed(toFile((await res.json()) as WireFile));
  }

  /** A create, or with `id` an update of that file's metadata and content in one request. */
  private async multipart(meta: Record<string, unknown>, content: Blob, id?: string): Promise<DriveFile> {
    const boundary = `bower${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\ncontent-type: ${content.type || 'application/octet-stream'}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ]);
    const res = await this.call(`${UPLOAD}/files${id ? `/${id}` : ''}?uploadType=multipart&fields=${FIELDS}`, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return this.changed(toFile((await res.json()) as WireFile));
  }

  /**
   * One request with the token, the one refresh and the retries (`transport.ts`): a read is sent again after a stall
   * or a 5xx; a write only after a rate limit, which says it did not land. A write with no definitive answer (5xx, network error, stall) is unconfirmed, unless the browser was known offline before it (nothing was sent).
   * Answers ok or 308 (resumable), or a status in `pass` for the caller to read; anything else is a `BowerError`.
   */
  async call(url: string, init: RequestInit = {}, pass: readonly number[] = []): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    // A rate limit says the request did not land: ask again. A 5xx on a write may have landed (a create made the
    // file, an update overwrote a newer edit): only a read is asked again; a write's 5xx is told as unconfirmed below.
    const again = async (res: Response): Promise<boolean> => res.status === 429 || (await isRateLimit(res)) || (res.status >= 500 && method === 'GET');
    const res = await this.authorized(url, init, { idempotent: method === 'GET', again }, method !== 'GET');
    if (res.ok || res.status === 308 || pass.includes(res.status)) return res;
    if (res.status === 404) throw driveError('not-found');
    console.error(`Drive answered ${res.status} for ${method} ${new URL(url).pathname}`);
    throw res.status >= 500 && method !== 'GET' ? unconfirmedWriteError() : driveError('unknown');
  }
}
