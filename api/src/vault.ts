/**
 * Vault provisioning: `POST /vault` gives the signed-in user a working
 * vault in their own Drive, either a new `TEMPLATE_FOLDER_NAME` folder
 * filled from the bundled template (`create`) or a folder they already
 * have, completed with whatever template files it lacks (`select`).
 * Nothing in Drive is ever overwritten or deleted.
 *
 * About 25 Drive calls for a fresh vault (one per folder and per file),
 * well under the Workers limit of 50 subrequests per request.
 *
 * Nothing here logs file names, file content or tokens.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AuthDeps } from './auth.js';
import { getAccessToken } from './drive.js';
import {
  DRIVE_FILES_URL,
  FOLDER_MIME_TYPE,
  createDriveApi,
} from './drive-api.js';
import type { DriveApi, DriveFile } from './drive-api.js';
import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';
import { requireSameOrigin } from './security.js';
import { deleteRunTicket, getUser, keys, updateUser } from './store.js';
import { TEMPLATE_FILES } from './template.generated.js';
import type { TemplateFile } from './template.generated.js';
import type { User } from './types.js';

export type Vault = NonNullable<User['vault']>;

/** The folder new notes land in; the runner processes it. */
export const INBOX_PATH = '0-Inbox';

/**
 * A `.gitkeep` exists only so the template keeps an empty folder in git:
 * its folder is created in Drive, the file itself is not uploaded.
 */
const FOLDER_PLACEHOLDER = '.gitkeep';

type VaultRequest = { mode: 'create' } | { mode: 'select'; folderId: string };

function badRequest(message: string): HttpError {
  return new HttpError(400, 'bad_request', message);
}

function parseVaultRequest(body: unknown): VaultRequest {
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    const { mode, folderId } = body as Record<string, unknown>;
    if (mode === 'create') return { mode };
    if (mode === 'select' && typeof folderId === 'string' && folderId !== '') {
      return { mode, folderId };
    }
  }
  throw badRequest(
    "Expected { mode: 'create' } or { mode: 'select', folderId }",
  );
}

function isFolder(file: DriveFile): boolean {
  return file.mimeType === FOLDER_MIME_TYPE;
}

function mimeTypeOf(path: string): string {
  return path.endsWith('.md') ? 'text/markdown' : 'text/plain';
}

/**
 * Copies `files` into the Drive folder `rootId` without overwriting
 * anything: missing folders are created (a folder with the right name is
 * reused), and a file is uploaded only when its folder has nothing with
 * that name. `rootIsEmpty` skips listing a folder that was just created.
 * Finds or creates `0-Inbox` and returns its id.
 */
export async function copyTemplate(
  drive: DriveApi,
  rootId: string,
  rootIsEmpty: boolean,
  files: readonly TemplateFile[] = TEMPLATE_FILES,
): Promise<{ inboxFolderId: string }> {
  // Folder path ('' is the root) → Drive id, and folder id → its children.
  const folders = new Map<string, string>([['', rootId]]);
  const children = new Map<string, DriveFile[]>();
  if (rootIsEmpty) children.set(rootId, []);

  async function childrenOf(folderId: string): Promise<DriveFile[]> {
    let listed = children.get(folderId);
    if (listed === undefined) {
      listed = await drive.listChildren(folderId);
      children.set(folderId, listed);
    }
    return listed;
  }

  async function ensureFolder(path: string): Promise<string> {
    const known = folders.get(path);
    if (known !== undefined) return known;
    const slash = path.lastIndexOf('/');
    const parentId = await ensureFolder(
      slash === -1 ? '' : path.slice(0, slash),
    );
    const name = path.slice(slash + 1);
    const existing = (await childrenOf(parentId)).find(
      (child) => child.name === name && isFolder(child),
    );
    let id: string;
    if (existing === undefined) {
      id = (await drive.createFolder(name, parentId)).id;
      children.set(id, []);
    } else {
      id = existing.id;
    }
    folders.set(path, id);
    return id;
  }

  // Folders first, one at a time (a child needs its parent's id); then the
  // uploads, which are independent of each other, in parallel.
  const uploads: { file: TemplateFile; name: string; parentId: string }[] = [];
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const name = file.path.slice(slash + 1);
    const parentId = await ensureFolder(
      slash === -1 ? '' : file.path.slice(0, slash),
    );
    if (name === FOLDER_PLACEHOLDER) continue;
    const taken = (await childrenOf(parentId)).some(
      (child) => child.name === name,
    );
    if (!taken) uploads.push({ file, name, parentId });
  }
  const inboxFolderId = await ensureFolder(INBOX_PATH);

  await Promise.all(
    uploads.map(({ file, name, parentId }) =>
      drive.uploadText(name, parentId, file.content, mimeTypeOf(file.path)),
    ),
  );
  return { inboxFolderId };
}

/** Creates `name` at the root of My Drive and fills it from the template. */
async function createVault(drive: DriveApi, name: string): Promise<Vault> {
  const existing = await drive.listChildren('root', name);
  if (existing.some(isFolder)) {
    throw new HttpError(
      409,
      'folder_exists',
      `A folder named "${name}" already exists in your Drive. Choose "use an existing folder" and pick it instead.`,
    );
  }
  const root = await drive.createFolder(name, 'root');
  const { inboxFolderId } = await copyTemplate(drive, root.id, true);
  return { folderId: root.id, inboxFolderId, name };
}

/**
 * What the Worker reads of a folder to judge a pointer (spec R-VAULT-1):
 * the Drive fields `trashed`, `driveId` and `capabilities.canAddChildren`
 * next to the usual id, name and type.
 */
export interface FolderCheck extends DriveFile {
  trashed: boolean;
  /** Set when the folder lives in a shared drive. */
  driveId?: string;
  /** `false` when the user may not add files to it. */
  canAddChildren?: boolean;
}

const FOLDER_CHECK_FIELDS =
  'id,name,mimeType,trashed,driveId,capabilities/canAddChildren';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates Drive's `files.get` answer; anything malformed is a 502. */
export function parseFolderCheck(value: unknown): FolderCheck {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.mimeType !== 'string'
  ) {
    throw new HttpError(502, 'drive_error', 'Drive get returned invalid JSON');
  }
  const check: FolderCheck = {
    id: value.id,
    name: value.name,
    mimeType: value.mimeType,
    trashed: value.trashed === true,
  };
  if (typeof value.driveId === 'string' && value.driveId !== '') {
    check.driveId = value.driveId;
  }
  const capabilities = value.capabilities;
  if (
    isRecord(capabilities) &&
    typeof capabilities.canAddChildren === 'boolean'
  ) {
    check.canAddChildren = capabilities.canAddChildren;
  }
  return check;
}

/**
 * Reads `folderId` with the fields a pointer check needs, or `undefined`
 * when Drive answers 404. A 401 is `reauth`; any other failure (403, 5xx,
 * the network) is a 502 `drive_error`: the folder's state is then unknown,
 * never taken for missing.
 */
export async function checkFolder(
  accessToken: string,
  fetchImpl: FetchLike,
  folderId: string,
): Promise<FolderCheck | undefined> {
  const params = new URLSearchParams({
    fields: FOLDER_CHECK_FIELDS,
    supportsAllDrives: 'true',
  });
  let response: Response;
  try {
    response = await fetchImpl(
      `${DRIVE_FILES_URL}/${encodeURIComponent(folderId)}?${params.toString()}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
  } catch (err) {
    throw new HttpError(502, 'drive_error', 'Drive get unreachable', {
      cause: err,
    });
  }
  if (response.status === 404) return undefined;
  if (response.status === 401) {
    throw new HttpError(401, 'reauth', 'Google access expired, sign in again');
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      'drive_error',
      `Drive get returned ${response.status}`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new HttpError(502, 'drive_error', 'Drive get returned invalid JSON', {
      cause: err,
    });
  }
  return parseFolderCheck(body);
}

/**
 * Whether a vault pointer is dead (spec R-VAULT-4): the folder is gone
 * (404), in the Bin, not a folder, closed to new files, or in a shared
 * drive (which the app and rclone do not support). Only then may `create`
 * replace it.
 */
export function isDeadPointer(folder: FolderCheck | undefined): boolean {
  return (
    folder === undefined ||
    folder.trashed ||
    !isFolder(folder) ||
    folder.canAddChildren === false ||
    folder.driveId !== undefined
  );
}

/**
 * Registers an existing folder, adding only the template files it lacks.
 * A folder in the Bin is refused (spec R-VAULT-5).
 */
async function selectVault(
  drive: DriveApi,
  folder: FolderCheck | undefined,
): Promise<Vault> {
  if (folder === undefined) throw badRequest('Folder not found');
  if (!isFolder(folder)) throw badRequest('That is not a folder');
  if (folder.trashed) {
    throw new HttpError(
      400,
      'folder_trashed',
      'That folder is in your Drive Bin. Put it back first, or choose another folder.',
    );
  }
  const { inboxFolderId } = await copyTemplate(drive, folder.id, false);
  return { folderId: folder.id, inboxFolderId, name: folder.name };
}

/** Deletes every key under `prefix`, paging through `kv.list`. */
async function deletePrefix(kv: KVNamespace, prefix: string): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const listed = await kv.list({ prefix, cursor });
    await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
}

/**
 * A re-point leaves the old folder's runs behind (spec R-VAULT-6): both
 * run tickets are retired, so a run still going on the old folder can
 * neither fetch a Drive token nor report, and the current runs and the
 * run history are cleared (`clearRunHistory`, once the new pointer is
 * written).
 */
async function retireOldRuns(kv: KVNamespace, userId: string): Promise<void> {
  await Promise.all([
    deleteRunTicket(kv, userId, 'ingest'),
    deleteRunTicket(kv, userId, 'lint'),
  ]);
}

/** The second half of a re-point: the old folder's runs and history. */
async function clearRunHistory(kv: KVNamespace, userId: string): Promise<void> {
  await Promise.all([
    kv.delete(keys.run(userId)),
    kv.delete(keys.lintRun(userId)),
    kv.delete(keys.runIndex(userId)),
    deletePrefix(kv, keys.runRecordPrefix(userId)),
  ]);
}

/** `POST /vault` as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createVaultRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const routes = new Hono<AppEnv>();

  routes.post('/vault', requireSameOrigin, requireSession, async (c) => {
    const env = c.get('env');
    const user = await getUser(env.BOWER_KV, c.get('userId'));
    if (user === undefined) {
      throw new HttpError(401, 'unauthenticated', 'Not signed in');
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch (err) {
      throw new HttpError(400, 'bad_request', 'Expected a JSON body', {
        cause: err,
      });
    }
    const request = parseVaultRequest(body);

    const { accessToken } = await getAccessToken(env, user, fetchImpl);
    const previous = user.vault;
    // `create` over an existing pointer only when the Worker itself finds
    // it dead (R-VAULT-4); the client's word is never enough.
    if (
      request.mode === 'create' &&
      previous !== undefined &&
      !isDeadPointer(
        await checkFolder(accessToken, fetchImpl, previous.folderId),
      )
    ) {
      throw new HttpError(
        409,
        'vault_exists',
        'Your Bower folder is already set up',
      );
    }

    const drive = createDriveApi(accessToken, fetchImpl);
    const found =
      request.mode === 'create'
        ? await createVault(drive, env.TEMPLATE_FOLDER_NAME)
        : await selectVault(
            drive,
            await checkFolder(accessToken, fetchImpl, request.folderId),
          );

    // The same folder again keeps its `setAt` and drops the missing mark
    // (R-VAULT-8); another folder is a re-point (R-VAULT-6).
    const repoint =
      previous !== undefined && previous.folderId !== found.folderId;
    const setAt =
      previous !== undefined && !repoint ? previous.setAt : undefined;
    const vault: Vault = {
      ...found,
      setAt: setAt ?? new Date().toISOString(),
    };
    const kv = env.BOWER_KV;
    if (repoint) await retireOldRuns(kv, user.id);

    // Only `vault` is written, merged into a fresh read of the record.
    if ((await updateUser(kv, user.id, { vault })) === undefined) {
      throw new HttpError(401, 'unauthenticated', 'Not signed in');
    }
    if (repoint) await clearRunHistory(kv, user.id);
    return c.json({ vault }, request.mode === 'create' ? 201 : 200);
  });

  return routes;
}
