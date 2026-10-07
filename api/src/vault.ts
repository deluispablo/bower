/**
 * `POST /vault`: find or make the person's Bower folder in their own Drive
 * and keep only its pointer (`folder_id`) in the person object.
 *
 * Order: (1) the stored pointer, if it names a live folder; (2) the person's
 * existing Bower folder, found by the marker this app puts in the folder's
 * `appProperties` (Drive v3 `files.list`, "Search for files": `appProperties
 * has { key='k' and value='v' }`; app properties are private to the OAuth
 * client that wrote them, so another app's files never match); (3) a new
 * folder from the template. Adapted from the original app's `vault.ts`
 * (`copyTemplate`, `createVault`), which found its folder by name.
 *
 * Safe to repeat: the pointer is stored as soon as the folder exists, before
 * the template is filled, and a folder with nothing in it is filled on the
 * next call; a lost reply therefore finds the same folder, never a second
 * one. Only `files.create` is ever sent: nothing is deleted, moved,
 * renamed or overwritten. A folder that already has things in it is left as
 * it is (the person may have deleted a file on purpose).
 *
 * Nothing here logs a file name, file content or token.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AuthDeps } from './auth.js';
import { accessTokenFor } from './drive-token.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';
import { requireSameOrigin } from './security.js';
import { TEMPLATE_FILES } from './template.generated.js';
import type { TemplateFile } from './template.generated.js';

/** The marker every Bower folder carries in `appProperties` (private to this OAuth client). */
export const FOLDER_MARKER = { bowerFolder: '1' } as const;

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
/** Exists only so the template keeps an empty folder in git: the folder is made, the file is not uploaded. */
const PLACEHOLDER = '.gitkeep';

export interface VaultResult {
  folderId: string;
  /** True when the person already had the folder; false when it was just made. */
  found: boolean;
}

export interface VaultOptions {
  fetchImpl?: FetchLike;
  files?: readonly TemplateFile[];
}

interface DriveItem {
  id: string;
  trashed?: boolean;
  mimeType?: string;
}

/** Drive trouble is the person's "try again": the details go to the log only. */
function driveError(what: string, cause?: unknown): HttpError {
  return new HttpError(500, 'internal', undefined, { cause: cause ?? new Error(what) });
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** A tiny Drive client for one person: one token, refreshed once when Drive answers 401. */
class Drive {
  private token: string | undefined;
  constructor(
    private readonly env: Env,
    private readonly sub: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  private async send(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
    this.token ??= (await accessTokenFor(this.env, this.sub, { fetchImpl: this.fetchImpl })).accessToken;
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${this.token}`);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, headers });
    } catch (err) {
      throw driveError('Drive unreachable', err);
    }
    if (response.status === 401 && !retried) {
      this.token = (await accessTokenFor(this.env, this.sub, { fetchImpl: this.fetchImpl, fresh: true })).accessToken;
      return this.send(url, init, true);
    }
    return response;
  }

  private async json<T>(what: string, response: Response): Promise<T> {
    if (!response.ok) throw driveError(`${what} answered ${response.status}`);
    try {
      return (await response.json()) as T;
    } catch (err) {
      throw driveError(`${what} answered unreadable JSON`, err);
    }
  }

  /** `files.get`: the item, or null when Drive says 404. */
  async get(id: string): Promise<DriveItem | null> {
    const params = new URLSearchParams({ fields: 'id,mimeType,trashed' });
    const response = await this.send(`${FILES_URL}/${encodeURIComponent(id)}?${params}`);
    if (response.status === 404) return null;
    return this.json<DriveItem>('get', response);
  }

  private async list(q: string, orderBy?: string): Promise<DriveItem[]> {
    const params = new URLSearchParams({ q, fields: 'files(id)', pageSize: '100', spaces: 'drive' });
    if (orderBy !== undefined) params.set('orderBy', orderBy);
    const body = await this.json<{ files?: DriveItem[] }>('list', await this.send(`${FILES_URL}?${params}`));
    return Array.isArray(body.files) ? body.files : [];
  }

  /** The person's oldest live folder carrying the Bower marker, or null. */
  async findMarked(): Promise<DriveItem | null> {
    const [key, value] = Object.entries(FOLDER_MARKER)[0] ?? ['', ''];
    const q = `mimeType = '${FOLDER_MIME}' and trashed = false and 'me' in owners and appProperties has { key=${quote(key)} and value=${quote(value)} }`;
    return (await this.list(q, 'createdTime'))[0] ?? null;
  }

  async children(parentId: string): Promise<DriveItem[]> {
    return this.list(`${quote(parentId)} in parents and trashed = false`);
  }

  /** `files.create` for a folder. */
  async createFolder(name: string, parentId: string | null, appProperties?: Record<string, string>): Promise<string> {
    const params = new URLSearchParams({ fields: 'id' });
    const metadata: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
    if (parentId !== null) metadata.parents = [parentId];
    if (appProperties !== undefined) metadata.appProperties = appProperties;
    const created = await this.json<DriveItem>(
      'create folder',
      await this.send(`${FILES_URL}?${params}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(metadata),
      }),
    );
    if (typeof created.id !== 'string') throw driveError('create folder answered no id');
    return created.id;
  }

  /** `files.create` with a multipart upload of a new text file. */
  async createText(name: string, parentId: string, content: string): Promise<void> {
    const mimeType = name.endsWith('.md') ? 'text/markdown' : name.endsWith('.json') ? 'application/json' : 'text/plain';
    const boundary = `bower-${crypto.randomUUID()}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ name, mimeType, parents: [parentId] })}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    const params = new URLSearchParams({ uploadType: 'multipart', fields: 'id' });
    await this.json(
      'upload',
      await this.send(`${UPLOAD_URL}?${params}`, {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body,
      }),
    );
  }
}

/** Fills `rootId` from the template: folders first (a child needs its parent), then each file. Creates only. */
async function fillTemplate(drive: Drive, rootId: string, files: readonly TemplateFile[]): Promise<void> {
  const folders = new Map<string, string>([['', rootId]]);
  async function folder(path: string): Promise<string> {
    const known = folders.get(path);
    if (known !== undefined) return known;
    const slash = path.lastIndexOf('/');
    const parent = await folder(slash === -1 ? '' : path.slice(0, slash));
    const id = await drive.createFolder(path.slice(slash + 1), parent);
    folders.set(path, id);
    return id;
  }
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const parent = await folder(slash === -1 ? '' : file.path.slice(0, slash));
    const name = file.path.slice(slash + 1);
    if (name !== PLACEHOLDER) await drive.createText(name, parent, file.content);
  }
}

/** The pointer if it names a live folder, else the person's marked folder, else a new one from the template. */
export async function ensureVault(env: Env, sub: string, options: VaultOptions = {}): Promise<VaultResult> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const files = options.files ?? TEMPLATE_FILES;
  const person = env.PERSON.get(env.PERSON.idFromName(sub));
  const drive = new Drive(env, sub, fetchImpl);

  let folderId: string | null = null;
  const pointer = await person.folderId();
  if (pointer !== null) {
    const item = await drive.get(pointer);
    if (item !== null && item.trashed !== true && item.mimeType === FOLDER_MIME) folderId = pointer;
  }
  folderId ??= (await drive.findMarked())?.id ?? null;

  if (folderId !== null) {
    await person.setFolderId(folderId);
    // A reply lost between making the folder and filling it leaves it empty: finish the job.
    if ((await drive.children(folderId)).length === 0) await fillTemplate(drive, folderId, files);
    return { folderId, found: true };
  }

  const name = env.TEMPLATE_FOLDER_NAME;
  const created = await drive.createFolder(name, null, FOLDER_MARKER);
  await person.setFolderId(created);
  await fillTemplate(drive, created, files);
  return { folderId: created, found: false };
}

/** `POST /vault`, mounted at `/` by `index.ts`. */
export function createVaultRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const vault = new Hono<AppEnv>();

  vault.post('/vault', requireSameOrigin, requireSession, async (c) => {
    const sub = c.get('userId');
    if (sub === undefined) throw new HttpError(500, 'internal');
    const options: VaultOptions = {};
    if (deps.fetchImpl !== undefined) options.fetchImpl = deps.fetchImpl;
    return c.json(await ensureVault(c.get('env'), sub, options));
  });

  return vault;
}
