/**
 * The runner's fenced Drive: the fake's `FencedDrive` on real Drive, built on
 * the app's `DriveHttp` with Node's `fetch` and the run ticket's token route
 * (TL-P3-19).
 *
 * Two checks guard every write, and both are PRECHECKS, NOT COMPARE-AND-SWAP
 * (ARCHITECTURE, "Safety at the actual storage boundary"):
 *
 * - Still as seen: right before each write, the target (or, for a create, its
 *   folder) is read again and compared with what this run read (`SeenFiles`).
 *   Drive v3 has no conditional write on files, so another client can still
 *   change the file in the window between that read and the write; the
 *   window is kept short (writes go one at a time) but it is not closed.
 * - Attempt: once per write batch (`batch()`), the token route is asked again
 *   and its `attempt` must equal this runner's. A takeover after that read
 *   can let the rest of the batch land; that attempt's next status report is
 *   refused (409 `stale-attempt`), so it can waste a batch but never finish
 *   the run.
 *
 * Faults for tests come through the fetch: `fault` sees each fenced write's
 * request once, as the fake's `FaultHook` does (`refuse`: nothing is sent;
 * `lose-reply`: the write lands, then its answer is lost).
 */
import { createHash } from 'node:crypto';
import { BowerError } from '../../src/data/types';
import { driveError, type DriveFile, type DrivePatch } from '../../src/data/drive/drive-api';
import { DriveHttp } from '../../src/data/drive/drive-http';
import type { FaultAction, FaultHook, FencedCall, FencedDrive, StoredEvidence } from '../../src/data/drive/fake-drive';
import type { SpineRead } from '../../src/data/spine/plan';
import { driveRead } from '../../src/data/spine/read';
import { sha256 } from '../../src/data/contracts/hashes';
import { SeenFiles, targetOf, type StoredNow } from './still-as-seen';
import { staleAttempt, type RunnerToken } from './token';

export interface RunnerDriveOptions {
  token: RunnerToken;
  /** This runner's attempt, from its dispatch. */
  attempt: number;
  fetch?: typeof fetch;
}

const API = 'https://www.googleapis.com/drive/v3';
const FIELDS = 'id,name,mimeType,parents,modifiedTime,createdTime,size,appProperties,trashed';
const FOLDER = 'application/vnd.google-apps.folder';
const WAITS = [500, 1000, 2000];

interface WireFile {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  modifiedTime: string;
  createdTime: string;
  size?: string;
  appProperties?: Record<string, string>;
}

const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class RunnerDrive {
  /** Sees, and may refuse or lose the reply of, every fenced write. */
  fault: FaultHook | null = null;
  private readonly http: DriveHttp;
  private readonly fetchFn: typeof fetch;
  private readonly token: RunnerToken;
  private readonly attempt: number;
  private readonly seen = new SeenFiles();
  private readonly writes: FencedDrive;
  /** The fenced write whose request is in flight, and what the fault hook said of it. */
  private current: { call: FencedCall; action: FaultAction | null } | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(opts: RunnerDriveOptions) {
    this.token = opts.token;
    this.attempt = opts.attempt;
    this.fetchFn = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.http = new DriveHttp({ token: (fresh) => this.token.token(fresh), fetch: (input, init) => this.hooked(input, init) });
    this.writes = {
      createFolder: (parentId, name, appProperties) => this.fenced({ op: 'create-folder', parentId, name, ...(appProperties ? { appProperties } : {}) }, () => this.http.createFolder(parentId, name, appProperties)),
      createText: (parentId, name, text, appProperties) => this.fenced({ op: 'create-text', parentId, name, text, ...(appProperties ? { appProperties } : {}) }, () => this.http.createText(parentId, name, text, appProperties)),
      update: (id: string, patch: DrivePatch) => this.fenced({ op: 'update', id, patch }, () => this.http.update(id, patch)),
      trash: (id) => this.fenced({ op: 'trash', id }, () => this.http.trash(id)),
      writeText: (id, text, ifModified) => this.fenced({ op: 'write-text', id, text, ifModified }, () => this.http.writeText(id, text, ifModified)),
    };
  }

  /**
   * The writes of one batch, after the token route confirms this runner's
   * attempt is still the current one. Call it again for each batch.
   */
  async batch(): Promise<FencedDrive> {
    const grant = await this.token.grant();
    if (grant.attempt !== this.attempt) {
      console.error(`Attempt ${this.attempt} was taken over by attempt ${grant.attempt}`);
      throw staleAttempt();
    }
    return this.seen.wrap(this.writes);
  }

  // --- Evidence reads: each file read is what later writes are checked against. ---

  async get(id: string): Promise<DriveFile> {
    return this.seen.note(await this.http.get(id));
  }

  /** A folder's live children, every page. */
  async list(parentId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q: `${quote(parentId)} in parents and trashed = false`, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const body = (await this.read(`${API}/files?${params}`)) as { files?: WireFile[]; nextPageToken?: string };
      for (const w of body.files ?? []) out.push(this.seen.note(toFile(w)));
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  async readText(id: string): Promise<string> {
    return this.http.readText(id);
  }

  /**
   * The plan's reads (`spine/read.ts` `driveRead`): the listing, Bower's own files and stored digests. Reads only;
   * a plan is fixed before any write, and every write later reads its target again (`get`) before it is fenced.
   */
  planReads(): SpineRead {
    return driveRead(this.http);
  }

  /**
   * What Drive stores for a file now, as evidence of an effect: its metadata, whether it is in the Bin, and its
   * content's size and SHA-256 (`sha256Checksum`, or the bytes read when Drive keeps none). Null when it is gone.
   */
  async evidence(id: string): Promise<StoredEvidence | null> {
    let w: WireFile & { trashed?: boolean; sha256Checksum?: string };
    try {
      w = (await this.read(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS},sha256Checksum`)) as typeof w;
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
    const file = toFile(w);
    if (file.folder) return { file, trashed: w.trashed === true, content: null };
    if (w.sha256Checksum !== undefined && file.size !== undefined) return { file, trashed: w.trashed === true, content: { size: file.size, sha256: w.sha256Checksum } };
    const bytes = await this.http.readBytes(id);
    return { file, trashed: w.trashed === true, content: { size: bytes.byteLength, sha256: await sha256(new Blob([bytes.slice()])) } };
  }

  /** The bytes of a file. */
  async readBytes(id: string): Promise<Uint8Array> {
    return this.http.readBytes(id);
  }

  /** The MD5 of a file's stored bytes, hex, as Drive's `md5Checksum` gives it. */
  async md5(id: string): Promise<string> {
    return createHash('md5').update(await this.http.readBytes(id)).digest('hex');
  }

  /** One fenced write: one at a time, after its still-as-seen read. */
  private fenced<T>(call: FencedCall, write: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const target = targetOf(call);
      this.seen.assert(target, await this.peek(target.id));
      this.current = { call, action: null };
      try {
        return await write();
      } finally {
        this.current = null;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async peek(id: string): Promise<StoredNow | null> {
    try {
      return { file: await this.http.get(id), trashed: false };
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
  }

  /** The fetch `DriveHttp` uses: a fenced write's own request meets the fault hook once. */
  private async hooked(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const now = this.current;
    if (!now || (init?.method ?? 'GET').toUpperCase() === 'GET') return this.fetchFn(input, init);
    now.action ??= this.fault?.before?.(now.call) ?? 'pass';
    // A TypeError is how fetch fails with no network; DriveHttp reads it as offline.
    if (now.action === 'refuse') throw new TypeError('A fault refused this write.');
    const res = await this.fetchFn(input, init);
    if (!res.ok) return res;
    this.current = null;
    this.fault?.applied?.(now.call);
    if (now.action === 'lose-reply') throw new TypeError('A fault lost the answer to this write.');
    return res;
  }

  /** A read with the token, its one refresh and the retries, as `DriveHttp` makes them. */
  private async read(url: string): Promise<unknown> {
    let refreshed = false;
    let tries = 0;
    for (;;) {
      let res: Response;
      try {
        res = await this.fetchFn(url, { headers: { authorization: `Bearer ${await this.token.token(refreshed)}` } });
      } catch (e) {
        if (e instanceof BowerError) throw e;
        if (e instanceof TypeError) throw driveError('offline');
        console.error(e);
        throw driveError('unknown');
      }
      if (res.ok) return res.json();
      if (res.status === 401) {
        if (refreshed) throw driveError('auth');
        refreshed = true;
        continue;
      }
      const wait = WAITS[tries];
      if (wait !== undefined && (res.status === 429 || res.status >= 500 || (await rateLimited(res)))) {
        tries++;
        await sleep(wait);
        continue;
      }
      if (res.status === 404) throw driveError('not-found');
      console.error(`Drive answered ${res.status} for a listing`);
      throw driveError('unknown');
    }
  }
}

/** Drive's 403 for a rate limit, told apart from a refusal by its reason, as `DriveHttp` does. */
async function rateLimited(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = (await res.clone().json().catch(() => null)) as { error?: { errors?: Array<{ reason?: string }> } } | null;
  return (body?.error?.errors ?? []).some((e) => e.reason === 'rateLimitExceeded' || e.reason === 'userRateLimitExceeded');
}

function toFile(w: WireFile): DriveFile {
  return {
    id: w.id,
    name: w.name,
    folder: w.mimeType === FOLDER,
    parents: w.parents ?? [],
    modifiedTime: w.modifiedTime,
    createdTime: w.createdTime,
    ...(w.size !== undefined ? { size: Number(w.size) } : {}),
    ...(w.appProperties ? { appProperties: w.appProperties } : {}),
  };
}
