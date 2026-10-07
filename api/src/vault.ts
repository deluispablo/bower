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
 * - The same call reserves one id per template folder and file, kept with the
 *   pointer; every create sends its id, and a 409 (Drive: the id exists) means
 *   an earlier or stalled fill made it. So a fill resumed after its 60 s claim
 *   lapsed makes no duplicate (ids do not depend on the by-name listing).
 * - Every person-object write is a compare-and-set against what the call
 *   read (a reservation only when none is kept, template ids only when none
 *   are kept for that folder, the pointer only from the value read). A call
 *   whose claim lapsed and finds a write refused reads the state again and
 *   continues with what is stored: never a second folder or duplicate item.
 * - The person object records whether the template is complete in the
 *   pointed folder. Until it is, each call adds what is missing by name,
 *   create-only, as the original's `copyTemplate`; once it is, calls skip
 *   the fill (a file the person later deletes stays deleted).
 *
 * Only `files.create` (and reads) are ever sent: nothing is deleted, moved
 * or renamed. The one overwrite is the repair of an untouched old-template
 * `Rules.md` (`repairRules`). Nothing here logs a file name, content or token.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AuthDeps } from './auth.js';
import { accessTokenFor } from './drive-token.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';
import { requireSameOrigin } from './security.js';
import { requireLease } from './session-lease.js';
import { TEMPLATE_FILES } from './template.generated.js';
import type { TemplateFile } from './template.generated.js';
import { OLD_RULES_TEMPLATE, RULES_TEMPLATE } from '../../src/data/contracts/rules-format.js';

/** The marker every Bower folder carries in `appProperties` (private to this OAuth client). */
export const FOLDER_MARKER = { bowerFolder: '1' } as const;

/** The text the first template put in `Rules.md` (shared with the runner's repair). Only a file with exactly these bytes is repaired. */
export { OLD_RULES_TEMPLATE };

/** A template file, with the app properties it is created with. */
export interface VaultFile extends TemplateFile {
  appProperties?: Record<string, string>;
}

/**
 * The file `Rules.md` a new folder gets: the contracts' `RULES_TEMPLATE`, which the fake Worker uses too, so a
 * rule typed in the app is Bower's to word on real Drive too. It
 * is not in `api/template/`, whose bundler cannot run the app's code.
 */
export const RULES_FILE: VaultFile = { path: 'Rules.md', content: RULES_TEMPLATE.text, appProperties: { ...RULES_TEMPLATE.appProperties } };

/** Every file a new Bower folder gets. */
export const VAULT_TEMPLATE: readonly VaultFile[] = [...TEMPLATE_FILES, RULES_FILE];

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
  files?: readonly VaultFile[];
}

interface DriveItem {
  id: string;
  name?: string;
  trashed?: boolean;
  mimeType?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
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

  /** `files.generateIds`: `count` ids (Drive allows 1 to 1000) to create files with later. */
  async generateIds(count: number): Promise<string[]> {
    const params = new URLSearchParams({ count: String(count), space: 'drive', type: 'files' });
    const body = await this.json<{ ids?: unknown }>('generate ids', await this.send(`${FILES_URL}/generateIds?${params}`));
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length !== count || !ids.every((id) => typeof id === 'string' && id !== '')) {
      throw driveError('generate ids answered the wrong ids');
    }
    return ids as string[];
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

  /**
   * `files.create` with a multipart upload of a new text file. With `id`,
   * Drive answers 409 when that id exists: made by an earlier try, so done.
   */
  async createText(name: string, parentId: string, content: string, id?: string, appProperties?: Record<string, string>): Promise<void> {
    const mimeType = name.endsWith('.md') ? 'text/markdown' : name.endsWith('.json') ? 'application/json' : 'text/plain';
    const boundary = `bower-${crypto.randomUUID()}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ name, mimeType, parents: [parentId], ...(id === undefined ? {} : { id }), ...(appProperties === undefined ? {} : { appProperties }) })}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    const params = new URLSearchParams({ uploadType: 'multipart', fields: 'id' });
    const response = await this.send(`${UPLOAD_URL}?${params}`, {
      method: 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (response.status === 409 && id !== undefined) return;
    await this.json('upload', response);
  }

  /** The one live file called `name` in `parentId` with what the repair checks, or null when there is none or more than one. */
  async onlyNamed(parentId: string, name: string): Promise<DriveItem | null> {
    const q = `${quote(parentId)} in parents and name = ${quote(name)} and trashed = false`;
    const params = new URLSearchParams({ q, fields: 'files(id,mimeType,modifiedTime,appProperties)', pageSize: '2', spaces: 'drive' });
    const body = await this.json<{ files?: DriveItem[] }>('list', await this.send(`${FILES_URL}?${params}`));
    return Array.isArray(body.files) && body.files.length === 1 ? (body.files[0] ?? null) : null;
  }

  /** `files.get` with `alt=media`: the text of a file, or null when Drive says 404. */
  async text(id: string): Promise<string | null> {
    const response = await this.send(`${FILES_URL}/${encodeURIComponent(id)}?alt=media`);
    if (response.status === 404) return null;
    if (!response.ok) throw driveError(`read answered ${response.status}`);
    return response.text();
  }

  /** `files.get`: when the file last changed, or null when Drive says 404. */
  async modifiedTime(id: string): Promise<string | null> {
    const params = new URLSearchParams({ fields: 'modifiedTime' });
    const response = await this.send(`${FILES_URL}/${encodeURIComponent(id)}?${params}`);
    if (response.status === 404) return null;
    return (await this.json<DriveItem>('get', response)).modifiedTime ?? null;
  }

  /** `files.update` with a multipart upload: new text and app properties for one file (Drive v3, "Upload file data"). */
  async replaceText(id: string, content: string, appProperties: Record<string, string>): Promise<void> {
    const boundary = `bower-${crypto.randomUUID()}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ appProperties })}\r\n` +
      `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    const params = new URLSearchParams({ uploadType: 'multipart', fields: 'id' });
    const response = await this.send(`${UPLOAD_URL}/${encodeURIComponent(id)}?${params}`, {
      method: 'PATCH',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    });
    await this.json('update', response);
  }
}

/**
 * The one-time repair: a folder made before the fix has `Rules.md` as plain text without Bower's mark, so a rule
 * typed in the app is refused as not Bower's to word. When the file's bytes are exactly the old template text, it
 * becomes the new template's file. Anything else (a file the person edited, the original app's plain file, two
 * files of the name) is left as it is. It runs only inside `POST /vault`, which the app calls when the person has
 * no folder yet (one list and, only for the old text, one read); an existing folder is repaired by the runner
 * before it plans (`runner/src/rules-repair.ts`). It needs no new state: once rewritten, the old text is gone, so
 * a second check finds nothing to do. Still as seen: the file's modifiedTime is read before the text and again
 * just before the write, and a change between them leaves the file alone (Drive v3 has no conditional write).
 */
async function repairRules(drive: Drive, folderId: string): Promise<void> {
  const file = await drive.onlyNamed(folderId, RULES_FILE.path);
  if (file === null || file.mimeType === FOLDER_MIME || file.modifiedTime === undefined) return;
  if (file.appProperties?.['by'] === 'bower') return;
  if ((await drive.text(file.id)) !== OLD_RULES_TEMPLATE) return;
  if ((await drive.modifiedTime(file.id)) !== file.modifiedTime) return;
  await drive.replaceText(file.id, RULES_FILE.content, RULES_FILE.appProperties ?? {});
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
  files: readonly VaultFile[],
  ids: Record<string, string>,
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
      id = await drive.createFolder(name, parent, ids[path] === undefined ? {} : { id: ids[path] });
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
    await drive.createText(name, parent, file.content, ids[file.path], file.appProperties);
  }
}

/** The template's folders (one per path that holds a file) and files, each once: what needs an id. */
function templateKeys(files: readonly VaultFile[]): string[] {
  const keys = new Set<string>();
  for (const { path } of files) {
    const parts = path.split('/');
    parts.forEach((_, i) => {
      const key = parts.slice(0, i + 1).join('/');
      if (!key.endsWith(PLACEHOLDER)) keys.add(key);
    });
  }
  return [...keys];
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
export async function ensureVault(
  env: Env,
  sub: string,
  gen: number,
  options: VaultOptions = {},
): Promise<VaultResult> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const files = options.files ?? VAULT_TEMPLATE;
  const person = env.PERSON.get(env.PERSON.idFromName(sub));
  const drive = new Drive(env, sub, fetchImpl);

  // Delete me or a sign-out may land while this call waits on Drive: each person-object write below carries
  // the generation the request was authenticated with and the person object refuses it when it differs
  // (checked in the same synchronous section as the write). A refusal, or any trouble after it, is then
  // 401 `signed-out`; nothing is cleaned up in Drive, and the next sign-in finds the folder by its marker.
  const signedOutNow = async (): Promise<boolean> => (await person.account())?.generation !== gen;
  const refuse = (): HttpError =>
    new HttpError(401, 'signed-out', undefined, { cause: new Error('signed out during POST /vault') });

  return withVaultClaim(person, async () => {
    try {
      // A refused write means another call (this one's claim lapsed) changed the state: read it again.
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const result = await attemptVault(env, person, gen, drive, files);
        if (result !== null) {
          if (await signedOutNow()) throw refuse();
          return result;
        }
        if (await signedOutNow()) throw refuse();
      }
    } catch (err) {
      if (!(err instanceof HttpError && err.code === 'signed-out') && (await signedOutNow())) throw refuse();
      throw err;
    }
    throw driveError('POST /vault kept finding the state changed under it');
  });
}

/** How many times one call reads the state again after a refused write. */
const MAX_ATTEMPTS = 5;

/**
 * One pass from the state as read. Every person-object write is a
 * compare-and-set against that read (TL-P3-09, delta review): a call whose
 * claim lapsed never reserves a second folder, never replaces template ids
 * kept for its folder and never moves a pointer another call set. Null when a
 * write was refused.
 */
async function attemptVault(
  env: Env,
  person: PersonStub,
  gen: number,
  drive: Drive,
  files: readonly VaultFile[],
): Promise<VaultResult | null> {
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
      await person.dropReservation(gen, reserved);
      return null;
    }
  }
  folderId ??= reserved === null ? ((await drive.findMarked())?.id ?? null) : null;

  if (folderId === null) {
    if (reserved === null) {
      // One call reserves the folder's id and one per template folder and file.
      const keys = templateKeys(files);
      const [folder, ...rest] = await drive.generateIds(keys.length + 1);
      reserved = folder ?? '';
      const ids = Object.fromEntries(keys.map((k, i) => [k, rest[i] ?? '']));
      if (!(await person.reserveFolder(gen, reserved, { folderId: reserved, ids }, state.folderId))) return null;
    }
    folderId = await drive.createFolder(env.TEMPLATE_FOLDER_NAME, null, { appProperties: FOLDER_MARKER, id: reserved });
    made = true;
  }

  // A folder this app reserved is brand-new until its template is complete: its first answer says found false.
  const brandNew = made || folderId === reserved;
  if (!(await person.pointFolder(gen, state.folderId, folderId))) return null;
  const kept = await person.vaultState();
  if (kept.folderId !== folderId) return null;
  if (!kept.complete) {
    let templateIds = kept.templateIds?.folderId === folderId ? kept.templateIds.ids : null;
    if (templateIds === null) {
      // A folder found rather than reserved here: reserve its template ids before any create,
      // or use the ones another call kept for it meanwhile.
      const keys = templateKeys(files);
      const fresh = await drive.generateIds(keys.length);
      templateIds = await person.reserveTemplate(gen, {
        folderId,
        ids: Object.fromEntries(keys.map((k, i) => [k, fresh[i] ?? ''])),
      });
      if (templateIds === null) return null;
    }
    await completeTemplate(drive, folderId, made, files, templateIds);
    await person.markFolderComplete(gen, folderId);
  }
  await repairRules(drive, folderId);
  return { folderId, found: !brandNew };
}

/** `POST /vault`, mounted at `/` by `index.ts`. */
export function createVaultRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const vault = new Hono<AppEnv>();

  // Only the window holding the person's session lease may make or find the folder (TL-P3-14).
  vault.post('/vault', requireSameOrigin, requireSession, requireLease, async (c) => {
    const sub = c.get('userId');
    if (sub === undefined) throw new HttpError(500, 'internal');
    const options: VaultOptions = {};
    if (deps.fetchImpl !== undefined) options.fetchImpl = deps.fetchImpl;
    const account = c.get('account');
    if (account === undefined) throw new HttpError(500, 'internal');
    return c.json(await ensureVault(c.get('env'), sub, account.generation, options));
  });

  return vault;
}
