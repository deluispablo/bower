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
 * - Every id goes through write-once (`reserveFor`, `makeOnce`, `makeFolder`,
 *   `makeText`), the person object as its keeper (the third, after the
 *   journal's outbox line and the device's upload record): a create refused
 *   outright (a permanent 4xx) lets its id go there, and the next call
 *   reserves anew for it; a lost answer, a 5xx, a rate limit, a full Drive or
 *   a 409 keep it.
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

import type { Pacing } from '../../src/data/drive/drive-http.js';
import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AuthDeps } from './auth.js';
import { accessTokenFor } from './drive-token.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import { personFor, signedInSub } from './route-helpers.js';
import type { FetchLike } from './google.js';
import { personKey, rateLimit, requireSameOrigin } from './security.js';
import { requireLease } from './session-lease.js';
import { FOLDER_TEMPLATE, PLACEHOLDER_FILE } from '../../src/data/contracts/folder-template.js';
import type { FolderTemplateFile } from '../../src/data/contracts/folder-template.js';
import { OLD_RULES_TEMPLATE, RULES_TEMPLATE } from '../../src/data/contracts/rules-format.js';
import { DriveHttp, FOLDER, isNoAnswer, quote, toFile, type WireFile } from '../../src/data/drive/drive-http.js';
import { DRIVE_MESSAGES, type DriveFile } from '../../src/data/drive/drive-api.js';
import { checkStillAsSeen } from '../../src/data/contracts/still-as-seen.js';
import { BowerError } from '../../src/data/types.js';
import { byId, heldAs, makeFolder, makeOnce, makeText, reserveFor, sentAs, updateByStamp, type Holder, type Sent } from '../../src/data/spine/write-once.js';

/** The marker every Bower folder carries in `appProperties` (private to this OAuth client). */
export const FOLDER_MARKER = { bowerFolder: '1' } as const;

/** The text the first template put in `Rules.md` (shared with the runner's repair). Only a file with exactly these bytes is repaired. */
export { OLD_RULES_TEMPLATE };

/** A template file, with the app properties it is created with. */
export type VaultFile = FolderTemplateFile;

/**
 * The file `Rules.md` a new folder gets: the contracts' `RULES_TEMPLATE`, so a rule typed in the app is Bower's
 * to word on real Drive too (and the fake Worker makes the same file).
 */
export const RULES_FILE: VaultFile = { path: 'Rules.md', content: RULES_TEMPLATE.text, appProperties: { ...RULES_TEMPLATE.appProperties } };

/** Every file a new Bower folder gets: the contracts' `FOLDER_TEMPLATE`, which the fake Worker uses too. */
export const VAULT_TEMPLATE: readonly VaultFile[] = FOLDER_TEMPLATE;

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const PLACEHOLDER = PLACEHOLDER_FILE;

export interface VaultResult {
  folderId: string;
  /** True when the person already had the folder; false when it was just made. */
  found: boolean;
}

export interface VaultOptions {
  fetchImpl?: FetchLike;
  files?: readonly VaultFile[];
  pacing?: Partial<Pacing>;
}

/** Drive's wire file, with only the fields each request asks for. */
type DriveItem = Partial<WireFile> & { id: string };

/** How long one call may hold the person's claim, and how often a waiting call looks again. */
const CLAIM_MS = 60_000;
const CLAIM_POLL_MS = 50;

/** Drive trouble is the person's "try again": the details go to the log only. */
function driveError(what: string, cause?: unknown): HttpError {
  return new HttpError(500, 'internal', undefined, { cause: cause ?? new Error(what) });
}

/** A Drive answer's body as JSON, or the person's "try again". */
async function json<T>(what: string, response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (err) {
    throw driveError(`${what} answered unreadable JSON`, err);
  }
}

/**
 * The few Drive v3 requests this route makes, for one person, over the one Drive transport (`DriveHttp.call`: the
 * token and its one refresh, the retry policy and the error mapping, c2-drive-transport). A 404 or a 409 is read
 * here; any other failure rejects, and the route answers it 500.
 */
function vaultDrive(env: Env, sub: string, fetchImpl: FetchLike, pacing?: Partial<Pacing>) {
  // One token for the call, asked again only after Drive answers 401.
  let kept: string | undefined;
  const http = new DriveHttp({
    token: async (fresh) => {
      if (fresh || kept === undefined) kept = (await accessTokenFor(env, sub, { fetchImpl, ...(fresh ? { fresh: true } : {}) })).accessToken;
      return kept;
    },
    fetch: fetchImpl,
    context: 'headless',
    ...(pacing ? { pacing } : {}),
  });
  const list = async (q: string, fields: string, extra: Record<string, string> = {}): Promise<DriveItem[]> => {
    const params = new URLSearchParams({ q, fields, pageSize: '1000', spaces: 'drive', ...extra });
    const body = await json<{ files?: DriveItem[] }>('list', await http.call(`${FILES_URL}?${params}`));
    return Array.isArray(body.files) ? body.files : [];
  };
  /** `files.get` with these fields: the item, or null when Drive says 404. */
  const get = async (id: string, fields: string): Promise<DriveItem | null> => {
    const response = await http.call(`${FILES_URL}/${encodeURIComponent(id)}?${new URLSearchParams({ fields })}`, {}, [404]);
    return response.status === 404 ? null : json<DriveItem>('get', response);
  };
  return {
    get: (id: string) => get(id, 'id,mimeType,trashed'),
    /** The person's oldest live folder carrying the Bower marker, or null. */
    async findMarked(): Promise<DriveItem | null> {
      const [key, value] = Object.entries(FOLDER_MARKER)[0] ?? ['', ''];
      const q = `mimeType = '${FOLDER}' and trashed = false and 'me' in owners and appProperties has { key=${quote(key)} and value=${quote(value)} }`;
      return (await list(q, 'files(id,name,mimeType)', { orderBy: 'createdTime' }))[0] ?? null;
    },
    children: (parentId: string) => list(`${quote(parentId)} in parents and trashed = false`, 'files(id,name,mimeType)'),
    /**
     * The one Drive transport, as the write-once makers take it: they reserve ids (`files.generateIds`) and send each
     * create with its id (`files.create`), found again by that id after a lost answer or a 409.
     */
    http,
    /** The one live file called `name` in `parentId` with what the repair checks, or null when there is none or more than one. */
    async onlyNamed(parentId: string, name: string): Promise<DriveItem | null> {
      const files = await list(`${quote(parentId)} in parents and name = ${quote(name)} and trashed = false`, 'files(id,mimeType,modifiedTime,appProperties)', { pageSize: '2' });
      return files.length === 1 ? (files[0] ?? null) : null;
    },
    /** `files.get` with `alt=media`: the text of a file, or null when Drive says 404. */
    async text(id: string): Promise<string | null> {
      const response = await http.call(`${FILES_URL}/${encodeURIComponent(id)}?alt=media`, {}, [404]);
      return response.status === 404 ? null : response.text();
    },
    /**
     * New text and app properties for one file as it was read (`seen`), sent once with its stamp and read back by it
     * when its answer is lost (`write-once.ts`). Drive v3 has no conditional write: the transport reads the file's
     * modifiedTime again right before the write, and a change since refuses it (`conflict`). A resend after a rate
     * limit or a refreshed token reads it again first (`checkStillAsSeen`, TL-P4-24 finding 1).
     */
    replaceText: (seen: DriveFile, content: string, appProperties: Record<string, string>): Promise<DriveFile> => {
      const fence = async (): Promise<void> =>
        void (await checkStillAsSeen({ id: seen.id, name: seen.name, parents: seen.parents, modifiedTime: seen.modifiedTime }, () => byId(http, seen.id), DRIVE_MESSAGES.conflict, { unanswered: isNoAnswer }));
      return updateByStamp(http, seen, { text: content }, (op) => http.writeText(seen.id, content, seen.modifiedTime, { ...appProperties, ...op }, { fence }));
    },
  };
}

type Drive = ReturnType<typeof vaultDrive>;

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
  if (file === null || file.mimeType === FOLDER || file.modifiedTime === undefined) return;
  if (file.appProperties?.['by'] === 'bower') return;
  if ((await drive.text(file.id)) !== OLD_RULES_TEMPLATE) return;
  const seen = toFile({ name: RULES_FILE.path, parents: [folderId], createdTime: '', ...file, modifiedTime: file.modifiedTime });
  try {
    await drive.replaceText(seen, RULES_FILE.content, RULES_FILE.appProperties ?? {});
  } catch (e) {
    // Changed between the read and the write: left as the person made it.
    if (!(e instanceof BowerError) || e.code !== 'conflict') throw e;
    console.error('Rules.md changed while Bower was repairing it; it is left as it is', e);
  }
}

/**
 * Completes `rootId` from the template by name, as the original's
 * `copyTemplate`: folders first (a child needs its parent), then each file
 * whose name is not taken. Creates only; whatever is there is left as it is.
 * `rootIsEmpty` skips listing a folder this call just made. Each create is
 * the home's (`makeOnce`), with the id `held` keeps for its path in the person
 * object, as the fake Worker makes the same template.
 */
async function completeTemplate(
  drive: Drive,
  rootId: string,
  rootIsEmpty: boolean,
  files: readonly VaultFile[],
  held: (path: string) => Holder,
): Promise<void> {
  // A template path names one place and name, the same on every try: its intent is not picked anew.
  const make = (path: string, fresh: Sent, create: (id: string, sent: Sent) => Promise<DriveFile>): Promise<DriveFile> => makeOnce(held(path), drive.http, fresh, create);
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
    const existing = (await childrenOf(parent)).find((c) => c.name === name && c.mimeType === FOLDER);
    let id: string;
    if (existing === undefined) {
      id = (await make(path, sentAs(parent, name), (at, sent) => makeFolder(drive.http, drive.http, { ...sent, id: at }))).id;
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
    await make(file.path, sentAs(parent, name, file.content), (at, sent) => makeText(drive.http, drive.http, { ...sent, id: at, ...(file.appProperties ? { props: file.appProperties } : {}) }, file.content));
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
  item !== null && item.trashed !== true && item.mimeType === FOLDER;

/** The pointer if it names a live folder, else a reserved one, else the marked one, else a new one from the template. */
export async function ensureVault(
  env: Env,
  sub: string,
  gen: number,
  options: VaultOptions = {},
): Promise<VaultResult> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const files = options.files ?? VAULT_TEMPLATE;
  const person = personFor(env, sub);
  const drive = vaultDrive(env, sub, fetchImpl, options.pacing);

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
      // One request reserves the folder's id and one per template folder and file (`reserveFor`), all kept in the
      // person object before any create is sent.
      const keys = templateKeys(files);
      const folder: Holder = {};
      const items = keys.map((): Holder => ({}));
      await reserveFor(drive.http, [folder, ...items]);
      reserved = folder.reserved ?? '';
      const ids = Object.fromEntries(keys.map((k, i) => [k, items[i]?.reserved ?? '']));
      if (!(await person.reserveFolder(gen, reserved, { folderId: reserved, ids }, state.folderId))) return null;
    }
    // Kept in the person object until made; a refusal outright lets it go there (`makeOnce`).
    const at = reserved;
    const keptFolder = heldAs(at, () => person.dropReservation(gen, at));
    folderId = (await makeOnce(keptFolder, drive.http, sentAs('root', env.TEMPLATE_FOLDER_NAME), (id, sent) => makeFolder(drive.http, drive.http, { ...sent, props: { ...FOLDER_MARKER }, id }))).id;
    made = true;
  }

  // A folder this app reserved is brand-new until its template is complete: its first answer says found false.
  const brandNew = made || folderId === reserved;
  if (!(await person.pointFolder(gen, state.folderId, folderId))) return null;
  const kept = await person.vaultState();
  if (kept.folderId !== folderId) return null;
  if (!kept.complete) {
    let ids = kept.templateIds?.folderId === folderId ? kept.templateIds.ids : {};
    const bare = templateKeys(files).filter((k) => ids[k] === undefined);
    if (bare.length > 0) {
      // A folder found rather than reserved here, or an item whose id was let go: reserve those ids before any
      // create and keep them, or use the ones another call kept for them meanwhile.
      const fresh = bare.map((): Holder => ({}));
      await reserveFor(drive.http, fresh);
      const keptIds = await person.reserveTemplate(gen, { folderId, ids: Object.fromEntries(bare.map((k, i) => [k, fresh[i]?.reserved ?? ''])) });
      if (keptIds === null) return null;
      ids = keptIds;
    }
    const root = folderId;
    await completeTemplate(drive, root, made, files, (path) => {
      const id = ids[path];
      if (id === undefined) throw driveError(`no id kept for a template item`);
      return heldAs(id, () => person.letTemplateIdGo(gen, root, path, id));
    });
    await person.markFolderComplete(gen, folderId);
  }
  await repairRules(drive, folderId);
  return { folderId, found: !brandNew };
}

/** `POST /vault`, mounted at `/` by `index.ts`. */
export function createVaultRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const vault = new Hono<AppEnv>();

  // Only the window holding the person's session lease may make or find the folder (TL-P3-14).
  vault.post('/vault', requireSameOrigin, requireSession, requireLease, rateLimit('VAULT_RATE_LIMIT', personKey), async (c) => {
    const sub = signedInSub(c.get('userId'));
    const options: VaultOptions = {};
    if (deps.fetchImpl !== undefined) options.fetchImpl = deps.fetchImpl;
    if (deps.pacing !== undefined) options.pacing = deps.pacing;
    const account = c.get('account');
    if (account === undefined) throw new HttpError(500, 'internal');
    return c.json(await ensureVault(c.get('env'), sub, account.generation, options));
  });

  return vault;
}
