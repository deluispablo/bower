/**
 * Whether the Bower folder is still where Drive keeps it (R-VAULT-1). One
 * `files.get` decides: gone (404), in the Bin, out of reach (a shared drive,
 * or no right to add files), fine, or unknown (Drive did not answer, or the
 * device is offline: never a reason to redirect anywhere).
 */

import { driveFetch } from './drive.js';

export type FolderState =
  'ok' | 'missing' | 'trashed' | 'no-access' | 'unknown';

/** The states that send the app to `/recover`. */
export type RecoverReason = 'missing' | 'trashed' | 'no-access';

export const FOLDER_FIELDS =
  'id,name,trashed,parents,driveId,capabilities/canAddChildren';

/** How long a tab may sit before the next focus checks the folder again. */
export const FOLDER_RECHECK_MS = 10 * 60 * 1000;

export function isRecoverReason(value: unknown): value is RecoverReason {
  return value === 'missing' || value === 'trashed' || value === 'no-access';
}

/** The state for a `files.get` answer. Pure. */
export function stateOfFile(file: unknown): FolderState {
  if (typeof file !== 'object' || file === null) return 'unknown';
  const record = file as Record<string, unknown>;
  if (record.trashed === true) return 'trashed';
  if (typeof record.driveId === 'string' && record.driveId !== '') {
    return 'no-access';
  }
  const caps = record.capabilities;
  if (
    typeof caps === 'object' &&
    caps !== null &&
    (caps as Record<string, unknown>).canAddChildren === false
  ) {
    return 'no-access';
  }
  return 'ok';
}

/** The state for a failed check: only a 404 means missing. Pure. */
export function stateOfError(err: unknown): FolderState {
  if (typeof err === 'object' && err !== null) {
    const status = (err as { status?: unknown }).status;
    if (status === 404) return 'missing';
  }
  return 'unknown';
}

/** The `files.get` call: the file's JSON, or a thrown error with `status`. */
export type GetFolder = (folderId: string) => Promise<unknown>;

const driveGetFolder: GetFolder = async (folderId) => {
  const response = await driveFetch(
    `/drive/v3/files/${encodeURIComponent(folderId)}?fields=${encodeURIComponent(FOLDER_FIELDS)}&supportsAllDrives=true`,
  );
  return (await response.json()) as unknown;
};

/** Checks the folder once. Never throws: any failure but 404 is `unknown`. */
export async function folderState(
  folderId: string,
  get: GetFolder = driveGetFolder,
): Promise<FolderState> {
  try {
    return stateOfFile(await get(folderId));
  } catch (err) {
    const state = stateOfError(err);
    if (state === 'unknown') console.error(err);
    return state;
  }
}

/** Takes the folder out of the Bin (`trashed:false`). Throws on failure. */
export type Untrash = (folderId: string) => Promise<void>;

const driveUntrash: Untrash = async (folderId) => {
  await driveFetch(
    `/drive/v3/files/${encodeURIComponent(folderId)}?supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: false }),
    },
  );
};

export interface PutItBackDeps {
  untrash?: Untrash;
  get?: GetFolder;
}

/**
 * "Put it back": takes the folder out of the Bin, then reads its state
 * again. The caller goes Home only when this answers `ok`; anything else
 * stays on the screen.
 */
export async function putItBack(
  folderId: string,
  deps: PutItBackDeps = {},
): Promise<FolderState> {
  try {
    await (deps.untrash ?? driveUntrash)(folderId);
  } catch (err) {
    console.error(err);
    return stateOfError(err) === 'missing' ? 'missing' : 'trashed';
  }
  return folderState(folderId, deps.get);
}
