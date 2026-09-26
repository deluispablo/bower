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
import { FOLDER_MIME_TYPE, createDriveApi } from './drive-api.js';
import type { DriveApi, DriveFile } from './drive-api.js';
import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';
import { requireSameOrigin } from './security.js';
import { getUser, putUser } from './store.js';
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

/** Registers an existing folder, adding only the template files it lacks. */
async function selectVault(drive: DriveApi, folderId: string): Promise<Vault> {
  const folder = await drive.getFile(folderId);
  if (folder === undefined) throw badRequest('Folder not found');
  if (!isFolder(folder)) throw badRequest('That is not a folder');
  const { inboxFolderId } = await copyTemplate(drive, folder.id, false);
  return { folderId: folder.id, inboxFolderId, name: folder.name };
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
    if (request.mode === 'create' && user.vault !== undefined) {
      throw new HttpError(
        409,
        'vault_exists',
        'Your Bower folder is already set up',
      );
    }

    const { accessToken } = await getAccessToken(env, user, fetchImpl);
    const drive = createDriveApi(accessToken, fetchImpl);
    const vault =
      request.mode === 'create'
        ? await createVault(drive, env.TEMPLATE_FOLDER_NAME)
        : await selectVault(drive, request.folderId);

    await putUser(env.BOWER_KV, { ...user, vault });
    return c.json({ vault }, request.mode === 'create' ? 201 : 200);
  });

  return routes;
}
