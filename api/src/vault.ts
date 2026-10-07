/**
 * `POST /vault`: find or make the person's Bower folder in their own Drive
 * and keep only its pointer (`folder_id`) in the person object.
 *
 * Order: (1) the stored pointer, if it names a live folder; (2) a folder id
 * reserved earlier and not yet complete; (3) the person's existing Bower
 * folder, found by the marker this app puts in the folder's `appProperties`
 * (Drive v3 `files.list`, "Search for files": `appProperties has { key='k'
 * and value='v' }`; app properties are private to the OAuth client that
 * wrote them); (4) a new folder from the template. Adapted from the
 * original app's `vault.ts` (`copyTemplate`, `ensureFolder`).
 *
 * Safe under retries and two tabs (TL-P3-09):
 * - One call at a time per person: a claim with an expiry in the person
 *   Durable Object (Cloudflare, "Rules of Durable Objects": one object
 *   serializes a person's work); a second call waits for it, then finds the
 *   folder the first one made.
 * - A new folder's id is reserved first with Drive `files.generateIds` and
 *   kept in the person object before `files.create` is sent with that id.
 *   Drive refuses a second file with the same id, so a retry after a lost
 *   reply adopts or creates that one folder, never a second one.
 * - The person object records whether the template is complete in the
 *   pointed folder. Until it is, each call adds what is missing by name,
 *   create-only, as the original's `copyTemplate`; once it is, calls skip
 *   the fill (a file the person later deletes stays deleted).
 *
 * Only `files.create` (and reads) are ever sent: nothing is deleted, moved,
 * renamed or overwritten. Nothing here logs a file name, content or token.
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
  name?: string;
  trashed?: boolean;
  mimeType?: string;
}

/** How long one call may hold the person's claim, and how often a waiting call looks again. */
const CLAIM_MS = 60_000;
const CLAIM_POLL_MS = 50;

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
    const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType)', pageSize: '1000', spaces: 'drive' });
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

  /** `files.generateIds`: one id to create a file with later. */
  async generateId(): Promise<string> {
    const params = new URLSearchParams({ count: '1', space: 'drive', type: 'files' });
    const body = await this.json<{ ids?: unknown }>('generate id', await this.send(`${FILES_URL}/generateIds?${params}`));
    const id = Array.isArray(body.ids) ? body.ids[0] : undefined;
    if (typeof id !== 'string' || id === '') throw driveError('generate id answered no id');
    return id;
  }

  /**
   * `files.create` for a folder. With `id` (from `generateId`), Drive answers
   * 409 when a file with that id exists already: that is our folder, made by
   * an earlier try whose answer was lost.
   */
  async createFolder(
    name: string,
    parentId: string | null,
    extra: { appProperties?: Record<string, string>; id?: string } = {},
  ): Promise<string> {
    const params = new URLSearchParams({ fields: 'id' });
    const metadata: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
    if (extra.id !== undefined) metadata.id = extra.id;
    if (parentId !== null) metadata.parents = [parentId];
    if (extra.appProperties !== undefined) metadata.appProperties = extra.appProperties;
    const response = await this.send(`${FILES_URL}?${params}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(metadata),
    });
    if (response.status === 409 && extra.id !== undefined) return extra.id;
    const created = await this.json<DriveItem>('create folder', response);
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

/**
 * Completes `rootId` from the template by name, as the original's
 * `copyTemplate`: folders first (a child needs its parent), then each file
 * whose name is not taken. Creates only; whatever is there is left as it is.
 * `rootIsEmpty` skips listing a folder this call just made.
 */
async function completeTemplate(
  drive: Drive,
  rootId: string,
  rootIsEmpty: boolean,
  files: readonly TemplateFile[],
): Promise<void> {
  const folders = new Map<string, string>([['', rootId]]);
  const children = new Map<string, DriveItem[]>();
  if (rootIsEmpty) children.set(rootId, []);
  async function childrenOf(id: string): Promise<DriveItem[]> {
    let listed = children.get(id);
    if (listed === undefined) {
      listed = await drive.children(id);
      children.set(id, listed);
    }
    return listed;
  }
  async function folder(path: string): Promise<string> {
    const known = folders.get(path);
    if (known !== undefined) return known;
    const slash = path.lastIndexOf('/');
    const parent = await folder(slash === -1 ? '' : path.slice(0, slash));
    const name = path.slice(slash + 1);
    const existing = (await childrenOf(parent)).find((c) => c.name === name && c.mimeType === FOLDER_MIME);
    let id: string;
    if (existing === undefined) {
      id = await drive.createFolder(name, parent);
      children.set(id, []);
    } else {
      id = existing.id;
    }
    folders.set(path, id);
    return id;
  }
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const parent = await folder(slash === -1 ? '' : file.path.slice(0, slash));
    const name = file.path.slice(slash + 1);
    if (name === PLACEHOLDER) continue;
    if ((await childrenOf(parent)).some((c) => c.name === name)) continue;
    await drive.createText(name, parent, file.content);
  }
}

type PersonStub = ReturnType<Env['PERSON']['get']>;

/** Runs `work` while holding the person's vault claim; a second call waits for the first. */
async function withVaultClaim<T>(person: PersonStub, work: () => Promise<T>): Promise<T> {
  const holder = crypto.randomUUID();
  const giveUpAt = Date.now() + CLAIM_MS;
  while (!(await person.claimVault(holder, Date.now(), Date.now() + CLAIM_MS))) {
    if (Date.now() > giveUpAt) throw driveError('another POST /vault held the claim too long');
    await new Promise((resolve) => setTimeout(resolve, CLAIM_POLL_MS));
  }
  try {
    return await work();
  } finally {
    await person.releaseVault(holder);
  }
}

const isLiveFolder = (item: DriveItem | null): boolean =>
  item !== null && item.trashed !== true && item.mimeType === FOLDER_MIME;

/** The pointer if it names a live folder, else a reserved one, else the marked one, else a new one from the template. */
export async function ensureVault(env: Env, sub: string, options: VaultOptions = {}): Promise<VaultResult> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const files = options.files ?? TEMPLATE_FILES;
  const person = env.PERSON.get(env.PERSON.idFromName(sub));
  const drive = new Drive(env, sub, fetchImpl);

  return withVaultClaim(person, async () => {
    const state = await person.vaultState();
    let folderId: string | null = null;
    let made = false;
    if (state.folderId !== null && isLiveFolder(await drive.get(state.folderId))) folderId = state.folderId;

    // A reserved id: made by an earlier try (adopt it), never made (make it now), or unusable (drop it).
    let reserved = state.pending;
    if (folderId === null && reserved !== null) {
      const item = await drive.get(reserved);
      if (isLiveFolder(item)) folderId = reserved;
      else if (item !== null) {
        await person.dropReservation(reserved);
        reserved = null;
      }
    }
    folderId ??= reserved === null ? ((await drive.findMarked())?.id ?? null) : null;

    if (folderId === null) {
      if (reserved === null) {
        reserved = await drive.generateId();
        await person.reserveFolder(reserved);
      }
      folderId = await drive.createFolder(env.TEMPLATE_FOLDER_NAME, null, { appProperties: FOLDER_MARKER, id: reserved });
      made = true;
    }

    // A folder this app reserved is brand-new until its template is complete: its first answer says found false.
    const brandNew = made || folderId === reserved;
    await person.setFolderId(folderId);
    const kept = await person.vaultState();
    if (!kept.complete) {
      await completeTemplate(drive, folderId, made, files);
      await person.markFolderComplete(folderId);
    }
    return { folderId, found: !brandNew };
  });
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
