/**
 * Google Drive over its REST API (v3): the one Drive transport for the app, the runner and the Worker
 * (c2-drive-transport). The access token comes from the caller (the Worker's route, the run's ticket route, or the
 * Worker's own refresh); a 401 asks for a fresh one once. Every request goes under the one retry policy
 * (`transport.ts`: a bound per attempt, idempotent requests sent again with backoff inside a budget); everything
 * else becomes one of `DRIVE_MESSAGES`, worded for where it ran (`context`: never "offline" outside a browser).
 */
import { BowerError } from '../types';
import { BodyReadError } from '../wait';
import type { Digest } from '../pile-readiness';
import { sha256 } from '../vault/hashes';
import { answerKind, askAgainNow, isNoAnswer, mayHaveLanded, noAnswer, send, type Context, type Fetch, type Pacing } from './transport';
import { confirmedFrom, chunkRange } from './resumable-upload';
import { ancestryLookup, BIN_KEYS, changesError, decodePrefix, drainChanges, DRIVE_MESSAGES, driveError, driveFailure, PREFIX_BYTES, resolveDriveScope, RESUMABLE_UNIT, SEARCH_FOLDERS, SEARCH_MAX_PAGES, SEARCH_PAGE_SIZE, unconfirmedWriteError, type BinnedItem, type DriveApi, type DriveChange, type DriveChanges, type DriveFile, type DrivePatch, type DriveScope, type Fence, type ResumableTarget, type SessionStatus, type WriteOptions } from './drive-api';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FIELDS = 'id,name,mimeType,parents,modifiedTime,createdTime,size,appProperties,trashed';
/** A file made by a resumable upload, with its content's checksum to check it. */
const UPLOADED_FIELDS = `${FIELDS},sha256Checksum`;
/**
 * A listing with checksums: also `md5Checksum`, which names the same content uploaded again. Every write's answer asks
 * for them too, so the answer confirms the bytes Drive stored (`spine/write-once.ts`).
 */
export const LISTED_FIELDS = `${UPLOADED_FIELDS},md5Checksum`;
/** The only session addresses that get the person's token. */
const UPLOAD_SESSIONS = 'https://www.googleapis.com/upload/';
export const FOLDER = 'application/vnd.google-apps.folder';
/** The most ids one `files.generateIds` gives (https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds). */
const MAX_IDS = 1000;
const BATCH = SEARCH_FOLDERS;
/** How many folders up a binned file's place is looked for. */
const BIN_DEPTH = 8;

/** A fence's own refusal, carried through the transport's catch untouched (`authorized`). */
class FenceRefused {
  constructor(readonly error: unknown) {}
}

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

/** The waits between tries, as a client takes them (`transport.ts`). */
export type { Pacing };
/** The one table's retry question, for the Worker's other outbound calls (it imports only this adapter, TL-P3-21). */
export { askAgainNow };
/** A request that got no answer, for the Worker's fence (`checkStillAsSeen`'s `unanswered`), through this adapter. */
export { isNoAnswer };

export interface DriveHttpOptions {
  /** The access token; `fresh` asks the Worker for a new one. */
  token: (fresh: boolean) => Promise<string>;
  fetch?: Fetch;
  /** Where it runs: `browser` (the default) words a request with no answer as offline; `headless` never does. */
  context?: Context;
  /** The waits between tries (`transport.ts`); the real backoff when absent. A test passes `{ baseMs: 0 }`. */
  pacing?: Partial<Pacing>;
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
  ...(w.trashed ? { trashed: true as const } : {}),
});

export const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const mimeOf = (name: string): string => (name.endsWith('.md') ? 'text/markdown' : 'text/plain');
/** The error reasons Drive's answer names (its `error.errors[].reason`), for the transport's table. */
async function reasonsOf(res: Response): Promise<string[]> {
  if (res.ok) return [];
  try {
    const body = (await res.clone().json()) as { error?: { errors?: Array<{ reason?: unknown }> } };
    return (body.error?.errors ?? []).flatMap((e) => (typeof e.reason === 'string' ? [e.reason] : []));
  } catch {
    // expected: an error body that is not JSON names no reason; its status alone tells its kind.
    return [];
  }
}

/** Drive's answer as an error with its kind (`transport.ts`), the one place an answer is classified. */
async function failureOf(res: Response, write: boolean): Promise<BowerError> {
  const reasons = await reasonsOf(res);
  const kind = answerKind(res.status, reasons);
  if (res.status === 404) return driveFailure('not-found', kind, reasons);
  // A create whose reserved id is taken (https://developers.google.com/workspace/drive/api/guides/handle-errors).
  if (res.status === 409) return driveError('conflict');
  if (res.status === 401) return driveFailure('auth', kind, reasons);
  // A 5xx on a write may have landed: it is unconfirmed, never sent again as if it had not.
  if (mayHaveLanded(res.status, write)) return unconfirmedWriteError();
  return driveFailure('unknown', kind, reasons);
}

export class DriveHttp implements DriveApi {
  private readonly token: (fresh: boolean) => Promise<string>;
  private readonly fetchFn: Fetch;
  private readonly context: Context;
  private readonly pacing: Partial<Pacing> | undefined;
  /** Ids known under each root from the last listing, so full-text hits stay inside it. */
  private known = new Map<string, Set<string>>();
  /** Root and descendant folders from the same listing, for parent-scoped searches. */
  private searchParents = new Map<string, string[]>();

  constructor(opts: DriveHttpOptions) {
    this.token = opts.token;
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
    this.context = opts.context ?? 'browser';
    this.pacing = opts.pacing;
  }

  /** No answer, worded for where this runs. */
  private lost(): BowerError {
    return noAnswer(this.context, { offline: DRIVE_MESSAGES.offline, elsewhere: DRIVE_MESSAGES.unknown });
  }

  /**
   * Every file and folder under `rootId`, one `files.list` per level of up to 40 folders, paged. With `checksums`,
   * each file also carries the `sha256Checksum` and `md5Checksum` Drive keeps (Drive v3, "Return specific fields"), so a reader checks
   * stored bytes from the listing rather than one `files.get` per file. `beforePage` runs before each page's fetch; its
   * throw ends the listing as it is (the Worker's admission budget).
   */
  async listAll(rootId: string, opts: { checksums?: boolean; beforePage?: () => void } = {}): Promise<DriveFile[]> {
    const fields = opts.checksums ? LISTED_FIELDS : FIELDS;
    const out: DriveFile[] = [];
    let level = [rootId];
    while (level.length) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += BATCH) {
        const ids = level.slice(i, i + BATCH);
        const q = `(${ids.map((id) => `${quote(id)} in parents`).join(' or ')}) and trashed = false`;
        for (const f of await this.query(q, Infinity, fields, opts.beforePage)) {
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

  async get(id: string, opts: { checksums?: boolean; binned?: boolean } = {}): Promise<DriveFile> {
    const w = (await (await this.call(`${API}/files/${id}?fields=${opts.checksums ? LISTED_FIELDS : FIELDS}`)).json()) as WireFile;
    if (w.trashed && !opts.binned) throw driveError('not-found');
    return toFile(w);
  }

  async readText(id: string): Promise<string> {
    return (await this.call(`${API}/files/${id}?alt=media`)).text();
  }

  async readBytes(id: string): Promise<Uint8Array> {
    const response = await this.call(`${API}/files/${id}?alt=media`);
    // Copy even when an injected transport retains its returned body buffer.
    return this.readBody(async () => new Uint8Array(new Uint8Array(await response.arrayBuffer())));
  }

  async readPrefix(id: string, opts: { precheck?: boolean } = {}): Promise<string | null> {
    return this.readBody(async () => {
      if (opts.precheck !== false) {
        const meta = (await (await this.call(`${API}/files/${id}?fields=mimeType,trashed`)).json()) as Pick<WireFile, 'mimeType' | 'trashed'>;
        if (meta.trashed) throw driveError('not-found');
        if (meta.mimeType?.startsWith('application/vnd.google-apps.')) return null;
      }
      const response = await this.call(`${API}/files/${id}?alt=media`, { headers: { Range: `bytes=0-${PREFIX_BYTES - 1}` } }, [416]);
      if (response.status === 416) return '';
      return decodePrefix(new Uint8Array(await response.arrayBuffer()));
    });
  }

  async getStartPageToken(): Promise<string> {
    return this.readBody(async () => {
      const body = (await (await this.call(`${API}/changes/startPageToken?fields=startPageToken`)).json()) as { startPageToken?: string };
      if (!body.startPageToken) throw changesError('Drive returned no start page token');
      return body.startPageToken;
    });
  }

  async listChanges(pageToken: string): Promise<DriveChanges> {
    return this.readBody(() => drainChanges(pageToken, async (token) => {
      const params = new URLSearchParams({
        pageToken: token, pageSize: String(SEARCH_PAGE_SIZE), spaces: 'drive',
        restrictToMyDrive: 'true', includeRemoved: 'true',
        fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FIELDS}))`,
      });
      const body = await this.readBody(async () =>
        (await (await this.call(`${API}/changes?${params}`)).json()) as {
          changes?: Array<Omit<DriveChange, 'file'> & { file?: WireFile }>;
          nextPageToken?: string;
          newStartPageToken?: string;
        });
      return {
        changes: (body.changes ?? []).map((c) => ({ fileId: c.fileId, removed: c.removed ?? false, ...(c.file ? { file: toFile(c.file) } : {}) })),
        nextPageToken: body.nextPageToken,
        newStartPageToken: body.newStartPageToken,
      };
    }));
  }

  async parents(id: string): Promise<string[]> {
    return this.readBody(async () => {
      const body = (await (await this.call(`${API}/files/${id}?fields=id,parents`)).json()) as { parents?: string[] };
      return body.parents ?? [];
    });
  }

  async resolveScope(rootId: string, unknownIds: readonly string[]): Promise<DriveScope> {
    return resolveDriveScope(rootId, unknownIds, (id) => this.parents(id));
  }

  /** Consume response bodies under the same error mapping as media bytes. */
  private async readBody<T>(read: () => Promise<T>, write = false): Promise<T> {
    try {
      return await read();
    } catch (e) {
      if (write) {
        console.error('Drive write response body could not be read');
        throw unconfirmedWriteError();
      }
      console.error(e);
      if (e instanceof BowerError) throw e;
      throw e instanceof TypeError ? this.lost() : driveError('unknown');
    }
  }

  async createFolder(parentId: string, name: string, appProperties?: Record<string, string>, id?: string): Promise<DriveFile> {
    return this.json(`${API}/files?fields=${LISTED_FIELDS}`, 'POST', { name, mimeType: FOLDER, parents: [parentId], ...(appProperties ? { appProperties } : {}), ...(id ? { id } : {}) });
  }

  async createText(parentId: string, name: string, text: string, appProperties?: Record<string, string>, id?: string): Promise<DriveFile> {
    const meta = { name, parents: [parentId], mimeType: mimeOf(name), ...(appProperties ? { appProperties } : {}), ...(id ? { id } : {}) };
    return this.multipart(meta, new Blob([text], { type: mimeOf(name) }));
  }

  /**
   * Drive v3 has no If-Match on files: this reads, then writes, which leaves a short window. `current`, when given, is
   * the file as the caller read it moments ago (the runner's fence), compared in place of one more read. `fence` runs
   * again before any resend (`WriteOptions`); this compare runs once, before the first send.
   * `appProperties`, when given, go in the same request: a multipart `files.update`, metadata then media
   * (https://developers.google.com/workspace/drive/api/guides/manage-uploads#multipart).
   */
  async writeText(id: string, text: string, ifModified: string, appProperties?: Record<string, string>, opts: WriteOptions & { current?: DriveFile } = {}): Promise<DriveFile> {
    const now = opts.current ?? (await this.get(id));
    if (now.modifiedTime !== ifModified) throw driveError('conflict');
    if (appProperties) return this.multipart({ appProperties }, new Blob([text], { type: mimeOf(now.name) }), id, opts.fence);
    const res = await this.call(`${UPLOAD}/files/${id}?uploadType=media&fields=${LISTED_FIELDS}`, { method: 'PATCH', headers: { 'content-type': mimeOf(now.name) }, body: text }, [], opts.fence);
    return toFile((await res.json()) as WireFile);
  }

  async update(id: string, patch: DrivePatch, opts: WriteOptions = {}): Promise<DriveFile> {
    const q = new URLSearchParams({ fields: LISTED_FIELDS });
    if (patch.addParent) q.set('addParents', patch.addParent);
    if (patch.removeParent) q.set('removeParents', patch.removeParent);
    return this.json(`${API}/files/${id}?${q}`, 'PATCH', { ...(patch.name ? { name: patch.name } : {}), ...(patch.appProperties ? { appProperties: patch.appProperties } : {}) }, opts.fence);
  }

  /** `appProperties`, when given, are set by the same `files.update` that puts it in the Bin. */
  async trash(id: string, appProperties?: Record<string, string>, opts: WriteOptions = {}): Promise<DriveFile> {
    return this.json(`${API}/files/${id}?fields=${LISTED_FIELDS}`, 'PATCH', { trashed: true, ...(appProperties ? { appProperties } : {}) }, opts.fence);
  }

  /** `appProperties` and `name`, when given, are set by the same `files.update` that takes it out of the Bin. */
  async untrash(id: string, appProperties?: Record<string, string>, name?: string, opts: WriteOptions = {}): Promise<DriveFile> {
    return this.json(`${API}/files/${id}?fields=${FIELDS}`, 'PATCH', { trashed: false, ...(name !== undefined ? { name } : {}), ...(appProperties ? { appProperties } : {}) }, opts.fence);
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
  async binnedByItem(rootId: string, keys: readonly string[], beforeGet?: () => void): Promise<BinnedItem[]> {
    if (!keys.length) return [];
    const inside = new Set(this.known.get(rootId) ?? (await this.listAll(rootId)).map((f) => f.id)).add(rootId);
    const hits = new Map<string, BinnedItem>();
    // A file in a folder that is itself in the Bin is trashed too (`trashed` true, `explicitlyTrashed` false), and its
    // folder is in no listing: its place is found by walking up the folders it names, a few `files.get` at most.
    const below = ancestryLookup(inside, async (id) => {
      beforeGet?.();
      return this.parents(id);
    }, BIN_DEPTH);
    for (let i = 0; i < keys.length; i += BIN_KEYS) {
      const has = keys.slice(i, i + BIN_KEYS).map((k) => `appProperties has { key='bowerItem' and value=${quote(k)} }`).join(' or ');
      // A Bin answer cut at the page cap would lose hits silently: the read says it is incomplete instead.
      const cut = (): never => { throw driveError('unknown'); };
      for (const file of await this.query(`trashed = true and (${has})`, SEARCH_MAX_PAGES, LISTED_FIELDS, undefined, cut)) {
        if (file.folder || !(await Promise.all(file.parents.map((p) => below(p)))).some(Boolean)) continue;
        hits.set(file.id, { file, size: file.sha256 !== undefined ? (file.size ?? null) : null, sha256: file.sha256 ?? null });
      }
    }
    return [...hits.values()];
  }

  /** `count` ids for creates to come, asked at most `MAX_IDS` a request (Drive's limit for one `files.generateIds`). */
  async generateIds(count: number, signal?: AbortSignal): Promise<string[]> {
    const out: string[] = [];
    for (let left = count; left > 0; left -= MAX_IDS) {
      const n = Math.min(left, MAX_IDS);
      const q = new URLSearchParams({ count: String(n), space: 'drive', type: 'files' });
      const body = (await (await this.call(`${API}/files/generateIds?${q}`, signal ? { signal } : {})).json()) as { ids?: unknown };
      const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : [];
      if (ids.length !== n) {
        console.error(`Drive generated ${ids.length} of ${n} ids`);
        throw driveError('unknown');
      }
      out.push(...ids);
    }
    return out;
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
    throw await this.sessionFailure(res, 'opening an upload');
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

  async getUploaded(id: string, signal?: AbortSignal): Promise<DriveFile> {
    const w = (await (await this.call(`${API}/files/${id}?fields=${UPLOADED_FIELDS}`, signal ? { signal } : {})).json()) as WireFile;
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
    throw await this.sessionFailure(res, what);
  }

  /** A reserved id already taken answers 409: `conflict`, so the caller reads the file back; any other, by its kind. */
  private async sessionFailure(res: Response, what: string): Promise<BowerError> {
    if (res.status !== 409 && res.status !== 404) console.error(`Drive answered ${res.status} for ${what}`);
    return failureOf(res, false);
  }

  /**
   * One resumable request with the token, its one refresh and the retries; every other answer goes back as is. Busy or
   * failing on Google's side is asked again: a chunk carries its range, a create its reserved id. A stall is sent
   * again only for a status question (`idempotent`); a chunk or a create is not, and its caller asks the status.
   */
  private async raw(url: string, init: RequestInit, idempotent = false): Promise<Response> {
    return this.authorized(url, init, { idempotent, again: async (res) => askAgainNow(res.status, await reasonsOf(res)) });
  }

  /**
   * The request under the transport's policy, with the token and its one refresh; any answer but a 401 goes back.
   * `existing` is set for a write to a file that exists (TL-P4-24 finding 1): with its `fence`, the fence runs before
   * every resend, after a rate limit (`send`'s `beforeResend`) or a refreshed token, and its refusal ends the request
   * as it is; with none (`fence` absent), a 401 refreshes the token for the next try and fails as `retry`, unsent.
   */
  private async authorized(url: string, init: RequestInit, opts: Parameters<typeof send>[3], write = false, existing?: { fence?: Fence | undefined }): Promise<Response> {
    // Only a browser known offline before the call proves nothing was sent; any other write with no answer may have landed.
    const knownOffline = this.context === 'browser' && (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine === false;
    const given = existing?.fence;
    const fence = given
      ? async (): Promise<void> => {
          try {
            await given();
          } catch (e) {
            throw new FenceRefused(e);
          }
        }
      : undefined;
    let token = await this.token(false);
    for (let refreshed = false; ; refreshed = true) {
      let res: Response;
      try {
        // A resend after the refresh runs the fence first, as one after a rate limit does.
        if (refreshed) await fence?.();
        res = await send(this.fetchFn, url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } }, { ...opts, knownOffline, pacing: this.pacing, ...(fence ? { beforeResend: fence } : {}) });
      } catch (e) {
        if (e instanceof BodyReadError) return this.readBody(() => Promise.reject(e.cause), !opts.idempotent);
        if (e instanceof FenceRefused) throw e.error;
        if (e instanceof BowerError) throw e;
        // Stopped on purpose: the queue tells this from a failure.
        if (e instanceof DOMException && e.name === 'AbortError' && init.signal) throw e;
        if (e instanceof TypeError) throw write && !knownOffline ? unconfirmedWriteError() : this.lost();
        console.error(e);
        throw driveError('unknown');
      }
      if (res.status !== 401) {
        if (res.ok) {
          // Keep the public Response API while mapping JSON failures for every caller here.
          const json = res.json.bind(res);
          res.json = (() => this.readBody(json, !opts.idempotent)) as typeof res.json;
        }
        return res;
      }
      if (refreshed) throw await failureOf(res, write);
      token = await this.refreshed();
      if (existing && !fence) {
        // Sent once with no fence to run again: refused unsent, so the caller's next try checks and sends it.
        console.error(`Drive answered 401 for ${init.method ?? 'GET'} ${new URL(url).pathname}; not sent again without its fence`);
        throw driveFailure('unknown', 'retry');
      }
    }
  }

  /**
   * The token's one refresh after a 401. In the browser, a refresh refused for the sign-in (`auth`) is the table's
   * `authError`: the person signs in again, and what waits on it keeps waiting. Headless, its own error goes as it is:
   * the runner and the Worker tell a refused ticket or grant themselves, never as a person's sign-in.
   */
  private async refreshed(): Promise<string> {
    try {
      return await this.token(true);
    } catch (e) {
      if (this.context !== 'browser' || !(e instanceof BowerError) || e.code !== 'auth') throw e;
      console.error(e);
      throw driveFailure('auth', 'wait');
    }
  }

  /** The files `q` finds, every page up to `maxPages`, as Drive answers them. */
  async query(q: string, maxPages = Infinity, fields = FIELDS, beforePage?: () => void, cut?: () => void): Promise<DriveFile[]> {
    return (await this.wires(q, maxPages, fields, beforePage, cut)).map(toFile);
  }

  private async wires(q: string, maxPages: number, fields: string, beforePage?: () => void, cut?: () => void): Promise<WireFile[]> {
    const out: WireFile[] = [];
    let pageToken = '';
    let pages = 0;
    do {
      if (++pages > maxPages) { cut?.(); break; }
      beforePage?.();
      const params = new URLSearchParams({ q, fields: `nextPageToken,files(${fields})`, pageSize: String(SEARCH_PAGE_SIZE) });
      if (pageToken) params.set('pageToken', pageToken);
      const body = (await (await this.call(`${API}/files?${params}`)).json()) as { files?: WireFile[]; nextPageToken?: string };
      out.push(...(body.files ?? []));
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  /** A write can change which roots contain a file or a folder: each listed root takes it in or lets it go from the
   * write's own answer (write-through, as TanStack Query's "Updates from mutation responses"), so no search lists again.
   * The Bin is left to each search's `trashed = false`: a file written under a binned folder is found once it is restored.
   * shortcut: a folder moved out of the root keeps its descendants known and searched; the app never moves one out,
   * else drop the root's cache here.
   */
  private changed(file: DriveFile): DriveFile {
    for (const [root, known] of this.known) {
      const inside = file.parents.some((p) => p === root || known.has(p));
      if (inside) known.add(file.id);
      else known.delete(file.id);
      if (!file.folder) continue;
      const parents = (this.searchParents.get(root) ?? [root]).filter((id) => id !== file.id);
      this.searchParents.set(root, inside && !file.trashed ? [...parents, file.id] : parents);
    }
    return file;
  }

  private async json(url: string, method: string, body: unknown, fence?: Fence): Promise<DriveFile> {
    const res = await this.call(url, { method, headers: { 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body) }, [], fence);
    return this.changed(toFile((await res.json()) as WireFile));
  }

  /** A create, or with `id` an update of that file's metadata and content in one request (`fence`: `WriteOptions`). */
  private async multipart(meta: Record<string, unknown>, content: Blob, id?: string, fence?: Fence): Promise<DriveFile> {
    const boundary = `bower${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\ncontent-type: ${content.type || 'application/octet-stream'}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ]);
    const res = await this.call(`${UPLOAD}/files${id ? `/${id}` : ''}?uploadType=multipart&fields=${LISTED_FIELDS}`, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    }, [], fence);
    return this.changed(toFile((await res.json()) as WireFile));
  }

  /**
   * One request with the token, the one refresh and the retries (`transport.ts`): a read is sent again after a stall
   * or a 5xx; a write only after a rate limit, which says it did not land. A write with no definitive answer (5xx, network error, stall) is unconfirmed, unless the browser was known offline before it (nothing was sent).
   * A write to a file that exists (a PATCH of `files/{id}`) is sent again only with its `fence`, run right before
   * each resend; with none it is sent once (TL-P4-24 finding 1). A create (a POST, by a reserved id or not) and a
   * read go again as they always have.
   * Answers ok or 308 (resumable), or a status in `pass` for the caller to read; anything else is a `BowerError`.
   */
  async call(url: string, init: RequestInit = {}, pass: readonly number[] = [], fence?: Fence): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    // Every PATCH here is `files.update` of a file that exists: keyed by the method and its target, not by an id.
    const existing = method === 'PATCH' ? { fence } : undefined;
    // A rate limit says the request did not land: ask again. A 5xx on a write may have landed (a create made the
    // file, an update overwrote a newer edit): only a read is asked again; a write's 5xx is told as unconfirmed below.
    // A write to a file that exists goes again only behind its fence.
    const again = async (res: Response): Promise<boolean> =>
      (!existing || fence !== undefined) && !mayHaveLanded(res.status, method !== 'GET') && askAgainNow(res.status, await reasonsOf(res));
    const res = await this.authorized(url, init, { idempotent: method === 'GET', again }, method !== 'GET', existing);
    if (res.ok || res.status === 308 || pass.includes(res.status)) return res;
    if (res.status !== 404 && res.status !== 409) console.error(`Drive answered ${res.status} for ${method} ${new URL(url).pathname}`);
    // Told by kind, never by words (`transport.ts`): what is asked again, what waits for the person, what never goes.
    throw await failureOf(res, method !== 'GET');
  }
}
