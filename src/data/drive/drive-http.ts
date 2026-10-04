/**
 * Google Drive over its REST API (v3), with the person's short-lived access
 * token from the Worker. A 401 asks for a fresh token once; rate limits and
 * server errors are retried three times with a growing wait; everything
 * else becomes one of `DRIVE_MESSAGES`.
 */
import { BowerError } from '../types';
import { driveError, type DriveApi, type DriveFile, type DrivePatch } from './drive-api';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FIELDS = 'id,name,mimeType,parents,modifiedTime,createdTime,size,appProperties,trashed';
const FOLDER = 'application/vnd.google-apps.folder';
const BATCH = 40;
const SMALL = 5 * 1024 * 1024;
const CHUNK = 8 * 1024 * 1024;
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
  trashed?: boolean;
}

export interface DriveHttpOptions {
  /** The access token; `fresh` asks the Worker for a new one. */
  token: (fresh: boolean) => Promise<string>;
  fetch?: typeof fetch;
}

const toFile = (w: WireFile): DriveFile => ({
  id: w.id,
  name: w.name,
  folder: w.mimeType === FOLDER,
  parents: w.parents ?? [],
  modifiedTime: w.modifiedTime,
  createdTime: w.createdTime,
  ...(w.size !== undefined ? { size: Number(w.size) } : {}),
  ...(w.appProperties ? { appProperties: w.appProperties } : {}),
});

const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const mimeOf = (name: string): string => (name.endsWith('.md') ? 'text/markdown' : 'text/plain');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function isRateLimit(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = (await res.clone().json()) as { error?: { errors?: Array<{ reason?: string }> } };
    return (body.error?.errors ?? []).some((e) => e.reason === 'rateLimitExceeded' || e.reason === 'userRateLimitExceeded');
  } catch {
    return false;
  }
}

export class DriveHttp implements DriveApi {
  private readonly token: (fresh: boolean) => Promise<string>;
  private readonly fetchFn: typeof fetch;
  /** Ids known under each root from the last listing, so full-text hits stay inside it. */
  private known = new Map<string, Set<string>>();

  constructor(opts: DriveHttpOptions) {
    this.token = opts.token;
    this.fetchFn = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  async listAll(rootId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let level = [rootId];
    while (level.length) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += BATCH) {
        const ids = level.slice(i, i + BATCH);
        const q = `(${ids.map((id) => `${quote(id)} in parents`).join(' or ')}) and trashed = false`;
        for (const f of await this.query(q)) {
          out.push(f);
          if (f.folder) next.push(f.id);
        }
      }
      level = next;
    }
    this.known.set(rootId, new Set(out.map((f) => f.id)));
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
      if (res.status !== 308) return toFile((await res.json()) as WireFile);
    }
    throw driveError('unknown');
  }

  /** Drive v3 has no If-Match on files: this reads, then writes, which leaves a short window. */
  async writeText(id: string, text: string, ifModified: string): Promise<DriveFile> {
    const now = await this.get(id);
    if (now.modifiedTime !== ifModified) throw driveError('conflict');
    const res = await this.call(`${UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`, { method: 'PATCH', headers: { 'content-type': mimeOf(now.name) }, body: text });
    return toFile((await res.json()) as WireFile);
  }

  async update(id: string, patch: DrivePatch): Promise<DriveFile> {
    const q = new URLSearchParams({ fields: FIELDS });
    if (patch.addParent) q.set('addParents', patch.addParent);
    if (patch.removeParent) q.set('removeParents', patch.removeParent);
    return this.json(`${API}/files/${id}?${q}`, 'PATCH', { ...(patch.name ? { name: patch.name } : {}), ...(patch.appProperties ? { appProperties: patch.appProperties } : {}) });
  }

  async trash(id: string): Promise<void> {
    await this.json(`${API}/files/${id}?fields=${FIELDS}`, 'PATCH', { trashed: true });
  }

  async untrash(id: string): Promise<DriveFile> {
    return this.json(`${API}/files/${id}?fields=${FIELDS}`, 'PATCH', { trashed: false });
  }

  async fullText(rootId: string, query: string): Promise<DriveFile[]> {
    const inside = this.known.get(rootId) ?? new Set((await this.listAll(rootId)).map((f) => f.id));
    // Full text runs over the person's whole Drive: the first two pages are plenty for one folder.
    const hits = await this.query(`fullText contains ${quote(query)} and trashed = false`, 2);
    return hits.filter((f) => inside.has(f.id));
  }

  private async query(q: string, maxPages = Infinity): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken = '';
    let pages = 0;
    do {
      if (++pages > maxPages) break;
      const params = new URLSearchParams({ q, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const body = (await (await this.call(`${API}/files?${params}`)).json()) as { files?: WireFile[]; nextPageToken?: string };
      out.push(...(body.files ?? []).map(toFile));
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  private async json(url: string, method: string, body: unknown): Promise<DriveFile> {
    const res = await this.call(url, { method, headers: { 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body) });
    return toFile((await res.json()) as WireFile);
  }

  private async multipart(meta: Record<string, unknown>, content: Blob): Promise<DriveFile> {
    const boundary = `bower${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\ncontent-type: ${content.type || 'application/octet-stream'}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ]);
    const res = await this.call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return toFile((await res.json()) as WireFile);
  }

  /** One request with the token, the one refresh and the retries. Answers ok or 308 (resumable). */
  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    let token = await this.token(false);
    let refreshed = false;
    let tries = 0;
    for (;;) {
      let res: Response;
      try {
        res = await this.fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } });
      } catch (e) {
        if (e instanceof BowerError) throw e;
        if (e instanceof TypeError) throw driveError('offline');
        console.error(e);
        throw driveError('unknown');
      }
      if (res.ok || res.status === 308) return res;
      if (res.status === 401) {
        if (refreshed) throw driveError('auth');
        refreshed = true;
        token = await this.token(true);
        continue;
      }
      const wait = WAITS[tries];
      // A create that failed on Google's side may still have made the file: never send it twice.
      const safe = res.status === 429 || (await isRateLimit(res)) || (res.status >= 500 && (init.method ?? 'GET') !== 'POST');
      if (safe && wait !== undefined) {
        tries++;
        await sleep(wait);
        continue;
      }
      if (res.status === 404) throw driveError('not-found');
      console.error(`Drive answered ${res.status} for ${init.method ?? 'GET'} ${new URL(url).pathname}`);
      throw driveError('unknown');
    }
  }
}
