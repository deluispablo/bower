/**
 * Typed client for Google Drive. The browser talks to Drive directly with
 * the short-lived access token from the Worker's `GET /drive/token`; this
 * module keeps that token in memory, retries once with a fresh token when
 * Drive answers 401, and wraps the few endpoints the app needs: recursive
 * listing of the Bower folder, file download, uploads, copies into the
 * inbox (a Google Doc, Sheet or Slides file exported first, #218), appending
 * to a note and saving an edited note.
 *
 * Tokens are never logged. Failures surface as `DriveError` (Drive itself)
 * or `ApiError` (the Worker, including code `reauth` when Google access has
 * to be granted again).
 */

import { ApiError, getDriveToken, whenReady } from './api.js';

export const DRIVE_BASE = 'https://www.googleapis.com';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
/** Files up to this size go in one multipart request; larger ones are resumable. */
export const MULTIPART_MAX_BYTES = 5 * 1024 * 1024;
/** Resumable chunk size. Drive requires a multiple of 256 KiB. */
export const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024;
/** Folder listings in flight at once while walking the Bower folder. */
export const LIST_CONCURRENCY = 4;

const TOKEN_MARGIN_MS = 60_000;
const FILE_FIELDS = 'id,name,mimeType,parents,modifiedTime,size,webViewLink';

export interface DriveToken {
  accessToken: string;
  /** ISO timestamp. */
  expiresAt: string;
  folderId: string | null;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime?: string;
  size?: number;
  webViewLink?: string;
  /**
   * `/`-joined path relative to the listed folder (`listVault`), or just the
   * file name for a file returned by an upload (relative to its parent).
   */
  path: string;
}

export class DriveError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

// --- Token -----------------------------------------------------------------

let cachedToken: DriveToken | null = null;
let cachedUntil = 0;
let pendingToken: Promise<DriveToken> | null = null;

export interface GetTokenOptions {
  /**
   * Skips the cache and asks the Worker for a fresh token (`?fresh=1`),
   * bypassing its own cache too. Used after Drive has already rejected the
   * cached token with a 401.
   */
  fresh?: boolean;
}

/**
 * The current Drive access token, fetched from the Worker when none is
 * cached or the cached one expires within 60 s. Concurrent callers share one
 * request. A Worker `ApiError` (for example code `reauth`) propagates.
 */
export function getToken(options: GetTokenOptions = {}): Promise<DriveToken> {
  const fresh = options.fresh ?? false;
  if (!fresh && cachedToken !== null && Date.now() < cachedUntil) {
    return Promise.resolve(cachedToken);
  }
  if (pendingToken !== null) return pendingToken;

  const request = getDriveToken(fresh).then(
    (token) => {
      if (pendingToken === request) {
        cachedToken = token;
        cachedUntil = Date.parse(token.expiresAt) - TOKEN_MARGIN_MS;
        pendingToken = null;
      }
      return token;
    },
    (err: unknown) => {
      if (pendingToken === request) pendingToken = null;
      throw err;
    },
  );
  pendingToken = request;
  return request;
}

/** Forgets the cached token so the next call fetches a fresh one. */
export function invalidateToken(): void {
  cachedToken = null;
  cachedUntil = 0;
  pendingToken = null;
}

// --- Requests --------------------------------------------------------------

function resolveUrl(path: string): string {
  const url = new URL(path, DRIVE_BASE);
  // The bearer token only ever goes to Google's API host.
  if (url.origin !== DRIVE_BASE) {
    throw new DriveError(0, 'Refusing to send a Drive request elsewhere.');
  }
  return url.toString();
}

async function send(
  url: string,
  init: RequestInit,
  accessToken: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  try {
    return await fetch(url, { ...init, headers });
  } catch {
    throw new DriveError(0, 'network');
  }
}

/**
 * Sends an authorised request and returns whatever Drive answered. On a 401
 * the token is invalidated and the request retried once with a fresh one; a
 * second 401 becomes `ApiError(401, 'reauth')`.
 */
async function authorizedFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const url = resolveUrl(path);
  let response = await send(url, init, (await getToken()).accessToken);
  if (response.status !== 401) return response;

  invalidateToken();
  response = await send(
    url,
    init,
    (await getToken({ fresh: true })).accessToken,
  );
  if (response.status === 401) {
    throw new ApiError(401, 'reauth', 'Google access needs to be renewed.');
  }
  return response;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const err = body.error;
      if (
        typeof err === 'object' &&
        err !== null &&
        'message' in err &&
        typeof err.message === 'string'
      ) {
        return err.message;
      }
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return `Drive request failed (${response.status}).`;
}

async function toDriveError(response: Response): Promise<DriveError> {
  return new DriveError(response.status, await errorMessage(response));
}

/**
 * `fetch` against the Drive API (`path` relative to
 * `https://www.googleapis.com`) with the bearer token and one retry on 401.
 * A non-2xx answer throws `DriveError(status, message)`; a network failure
 * throws `DriveError(0, 'network')`.
 */
export async function driveFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await authorizedFetch(path, init);
  if (!response.ok) throw await toDriveError(response);
  return response;
}

// --- Parsing ---------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function unexpected(): DriveError {
  return new DriveError(0, 'Unexpected Drive response.');
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw unexpected();
  }
  if (!isRecord(body)) throw unexpected();
  return body;
}

function parseFile(value: unknown, path: string): DriveFile {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.mimeType !== 'string'
  ) {
    throw unexpected();
  }
  const parents = Array.isArray(value.parents)
    ? value.parents.filter((p): p is string => typeof p === 'string')
    : [];
  const file: DriveFile = {
    id: value.id,
    name: value.name,
    mimeType: value.mimeType,
    parents,
    path,
  };
  if (typeof value.modifiedTime === 'string') {
    file.modifiedTime = value.modifiedTime;
  }
  // Drive sends int64 fields as strings.
  if (typeof value.size === 'string' || typeof value.size === 'number') {
    const size = Number(value.size);
    if (Number.isFinite(size)) file.size = size;
  }
  if (typeof value.webViewLink === 'string') {
    file.webViewLink = value.webViewLink;
  }
  return file;
}

// --- Listing ---------------------------------------------------------------

/** Escapes a value for use inside single quotes in a Drive `q` query. */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** All direct children of a folder, every page joined. */
async function listChildren(folderId: string): Promise<unknown[]> {
  const children: unknown[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${escapeQuery(folderId)}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: '1000',
    });
    if (pageToken !== undefined) params.set('pageToken', pageToken);
    const body = await readJson(
      await driveFetch(`/drive/v3/files?${params.toString()}`),
    );
    if (!Array.isArray(body.files)) throw unexpected();
    children.push(...(body.files as unknown[]));
    pageToken =
      typeof body.nextPageToken === 'string' && body.nextPageToken !== ''
        ? body.nextPageToken
        : undefined;
  } while (pageToken !== undefined);
  return children;
}

/** Runs at most `max` tasks at once; later ones wait for a free slot. */
function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < max) {
      active++;
    } else {
      // The releasing task hands its slot over, so `active` stays put.
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next !== undefined) next();
      else active--;
    }
  };
}

export interface ListOptions {
  /** Folder listings in flight at once. Defaults to `LIST_CONCURRENCY`. */
  concurrency?: number;
}

/**
 * Every file and folder under `folderId` (not trashed), walking subfolders
 * with at most `concurrency` folder listings in flight. Each entry carries
 * its `/`-joined path relative to `folderId`; the result is sorted by path.
 */
async function listVaultHttp(
  folderId: string,
  options: ListOptions = {},
): Promise<DriveFile[]> {
  const limit = createLimiter(
    Math.max(1, options.concurrency ?? LIST_CONCURRENCY),
  );
  const files: DriveFile[] = [];

  const walk = async (id: string, prefix: string): Promise<void> => {
    const children = await limit(() => listChildren(id));
    await Promise.all(
      children.map(async (child) => {
        const name =
          isRecord(child) && typeof child.name === 'string' ? child.name : '';
        const file = parseFile(
          child,
          prefix === '' ? name : `${prefix}/${name}`,
        );
        files.push(file);
        if (file.mimeType === FOLDER_MIME) await walk(file.id, file.path);
      }),
    );
  };

  await walk(folderId, '');
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Direct children of `folderId` (not trashed), one level, no recursion. Used
 * where `listVault`'s full recursive walk would be needlessly heavy, e.g.
 * checking names already in the inbox before an upload.
 */
async function listFolderHttp(folderId: string): Promise<DriveFile[]> {
  const children = await listChildren(folderId);
  return children.map((child) => {
    const name =
      isRecord(child) && typeof child.name === 'string' ? child.name : '';
    return parseFile(child, name);
  });
}

// --- Search ------------------------------------------------------------

const SEARCH_FIELDS = 'files(id,name,mimeType,modifiedTime)';
const SEARCH_PAGE_SIZE = '50';

/**
 * Files anywhere in the user's Drive whose text matches `query` (Drive's own
 * full-text index over supported types, including `.md`). Not scoped to the
 * Bower folder: callers narrow the result to the vault themselves (see
 * `filterToIndex` in `search.ts`). One page (50 files) is enough for a
 * search box.
 */
async function searchFullTextHttp(query: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `fullText contains '${escapeQuery(query)}' and trashed = false`,
    fields: SEARCH_FIELDS,
    pageSize: SEARCH_PAGE_SIZE,
  });
  const body = await readJson(
    await driveFetch(`/drive/v3/files?${params.toString()}`),
  );
  if (!Array.isArray(body.files)) throw unexpected();
  return body.files.map((child) => {
    const name =
      isRecord(child) && typeof child.name === 'string' ? child.name : '';
    return parseFile(child, name);
  });
}

// --- Download --------------------------------------------------------------

function mediaPath(id: string): string {
  return `/drive/v3/files/${encodeURIComponent(id)}?alt=media`;
}

/** A file's content as text. */
async function getTextHttp(id: string): Promise<string> {
  return (await driveFetch(mediaPath(id))).text();
}

/** A file's content as a `Blob`. */
async function getBlobHttp(id: string): Promise<Blob> {
  return (await driveFetch(mediaPath(id))).blob();
}

// --- Upload ----------------------------------------------------------------

export type UploadProgress = (sent: number, total: number) => void;

export interface UploadOptions {
  /** Resumable chunk size in bytes; a multiple of 256 KiB. */
  chunkSize?: number;
}

interface Metadata {
  name: string;
  parents: string[];
  mimeType?: string;
  appProperties?: Record<string, string>;
}

function metadataFor(parentId: string, name: string, type: string): Metadata {
  const metadata: Metadata = { name, parents: [parentId] };
  if (type !== '') metadata.mimeType = type;
  return metadata;
}

async function uploadMultipart(
  metadata: Metadata,
  content: Blob,
): Promise<DriveFile> {
  const boundary = `bower-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${content.type || 'application/octet-stream'}\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ]);
  const response = await driveFetch(
    `/upload/drive/v3/files?uploadType=multipart&fields=${FILE_FIELDS}`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  return parseFile(await readJson(response), metadata.name);
}

/** The next byte Drive expects, from a 308's `Range: bytes=0-N` header. */
function nextOffset(response: Response): number {
  const match = /bytes=0-(\d+)/.exec(response.headers.get('Range') ?? '');
  return match?.[1] !== undefined ? Number(match[1]) + 1 : 0;
}

async function uploadResumable(
  metadata: Metadata,
  file: File,
  onProgress: UploadProgress | undefined,
  chunkSize: number,
): Promise<DriveFile> {
  const total = file.size;
  const initiated = await driveFetch(
    `/upload/drive/v3/files?uploadType=resumable&fields=${FILE_FIELDS}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(total),
      },
      body: JSON.stringify(metadata),
    },
  );
  const session = initiated.headers.get('Location');
  if (session === null) throw unexpected();

  let offset = 0;
  for (;;) {
    const end = Math.min(offset + chunkSize, total);
    const response = await authorizedFetch(session, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${total}` },
      body: file.slice(offset, end),
    });
    if (response.ok) {
      onProgress?.(total, total);
      return parseFile(await readJson(response), metadata.name);
    }
    if (response.status !== 308) throw await toDriveError(response);
    const next = nextOffset(response);
    if (next <= offset) throw new DriveError(308, 'Upload made no progress.');
    offset = next;
    onProgress?.(offset, total);
  }
}

/**
 * Uploads `file` into `parentId`: one multipart request up to 5 MB, a
 * resumable upload in chunks above. `onProgress(sent, total)` is called
 * after each chunk (once, at the end, for a multipart upload).
 */
async function uploadHttp(
  parentId: string,
  file: File,
  onProgress?: UploadProgress,
  options: UploadOptions = {},
): Promise<DriveFile> {
  const metadata = metadataFor(parentId, file.name, file.type);
  if (file.size <= MULTIPART_MAX_BYTES) {
    const created = await uploadMultipart(metadata, file);
    onProgress?.(file.size, file.size);
    return created;
  }
  return uploadResumable(
    metadata,
    file,
    onProgress,
    options.chunkSize ?? RESUMABLE_CHUNK_BYTES,
  );
}

/**
 * The Drive file property the app sets on an instruction note it writes
 * (Tell Bower). Drive keeps `appProperties` private to this app's OAuth
 * client, so a file uploaded through Add, clipped, or dropped into the
 * folder by hand never carries it; the runner lists the inbox files that
 * do and quarantines every other `Bower - *.md` before the agent starts
 * (#255, `agent/run.sh`).
 */
export const INSTRUCTION_APP_PROPERTIES: Readonly<Record<string, string>> =
  Object.freeze({ bower: 'instruction' });

export interface CreateTextFileOptions {
  /** Set on the new file (`files.create`) only when given. */
  appProperties?: Readonly<Record<string, string>>;
}

/** Creates a Markdown file named `name` in `parentId`. */
function createTextFileHttp(
  parentId: string,
  name: string,
  content: string,
  options: CreateTextFileOptions = {},
): Promise<DriveFile> {
  const metadata = metadataFor(parentId, name, 'text/markdown');
  if (options.appProperties !== undefined) {
    metadata.appProperties = { ...options.appProperties };
  }
  return uploadMultipart(
    metadata,
    new Blob([content], { type: 'text/markdown' }),
  );
}

/**
 * Creates a folder named `name` in `parentId` (`files.create`, no media):
 * the first-run interview's own area folders (#198), each holding one
 * `_<name>.md` folder note, same convention as any other folder's
 * (`vault-index.ts`'s `isFolderNoteName`).
 */
async function createFolderHttp(
  parentId: string,
  name: string,
): Promise<DriveFile> {
  const response = await driveFetch(`/drive/v3/files?fields=${FILE_FIELDS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [parentId], mimeType: FOLDER_MIME }),
  });
  return parseFile(await readJson(response), name);
}

/**
 * Copies the Drive file `id` into the inbox folder `inboxId` as `name`
 * (`files.copy`), unconditionally: the original keeps its id, its parent
 * and its content. Used directly for a plain copy; a Google Doc, Sheet or
 * Slides pick goes through `copyOrExportIntoInbox` instead, which exports
 * it first (#218). Never an instruction note: the copy's `bower` app
 * property is cleared (#255).
 */
async function copyIntoInboxHttp(
  id: string,
  name: string,
  inboxId: string,
): Promise<DriveFile> {
  const response = await driveFetch(
    `/drive/v3/files/${encodeURIComponent(id)}/copy?fields=${FILE_FIELDS}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Drive carries a file's appProperties over to its copy; clearing
      // `bower` keeps a picked file (an old instruction note, or one shared
      // by another Bower user) from arriving as an instruction (#255).
      body: JSON.stringify({
        name,
        parents: [inboxId],
        appProperties: { bower: null },
      }),
    },
  );
  return parseFile(await readJson(response), name);
}

// --- Export on the way into the inbox (#218) --------------------------

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const GOOGLE_SLIDES_MIME = 'application/vnd.google-apps.presentation';
const GOOGLE_DRAWING_MIME = 'application/vnd.google-apps.drawing';
const GOOGLE_FORM_MIME = 'application/vnd.google-apps.form';

export type ExportPlan =
  | { action: 'copy' }
  | { action: 'skip' }
  | {
      action: 'export';
      /** MIME type requested from `files.export`. */
      mimeType: string;
      /** Extension `name` gets instead of any it already has. */
      extension: string;
      /** Retried once, on a 400 or 403 for `mimeType`. Docs only. */
      fallbackMimeType?: string;
    };

/**
 * What a picked Drive item's MIME type means for "Add from your Drive"
 * (#218): a Google Doc is exported as Markdown (falling back to plain text
 * if Drive refuses the Markdown export), a Sheet as CSV (its first sheet),
 * Slides as a PDF; a Drawing or a Form has no format that fits, so it is
 * skipped; anything else (a PDF, a photo, an already-plain file) is copied
 * as it is. Pure: no Drive, no fetch, unit-tested directly.
 */
export function exportPlanFor(mimeType: string): ExportPlan {
  switch (mimeType) {
    case GOOGLE_DOC_MIME:
      return {
        action: 'export',
        mimeType: 'text/markdown',
        fallbackMimeType: 'text/plain',
        extension: '.md',
      };
    case GOOGLE_SHEET_MIME:
      return { action: 'export', mimeType: 'text/csv', extension: '.csv' };
    case GOOGLE_SLIDES_MIME:
      return {
        action: 'export',
        mimeType: 'application/pdf',
        extension: '.pdf',
      };
    case GOOGLE_DRAWING_MIME:
    case GOOGLE_FORM_MIME:
      return { action: 'skip' };
    default:
      return { action: 'copy' };
  }
}

/** `name` with `extension` in place of any it already has. */
function withExtension(name: string, extension: string): string {
  return `${name.replace(/\.[^./]+$/, '')}${extension}`;
}

/**
 * `files.export`'s bytes for `id` as `mimeType`. On a 400 or 403 with
 * `fallbackMimeType` given, retries once with that instead (Drive refusing
 * the Markdown export of a Doc it can't render that way); any other error,
 * or a second failure, throws `DriveError`.
 */
async function exportBlob(
  id: string,
  mimeType: string,
  fallbackMimeType?: string,
): Promise<{ blob: Blob; mimeType: string }> {
  try {
    return { blob: await exportFile(id, mimeType), mimeType };
  } catch (err) {
    const canFallBack =
      fallbackMimeType !== undefined &&
      err instanceof DriveError &&
      (err.status === 400 || err.status === 403);
    if (!canFallBack) throw err;
    return {
      blob: await exportFile(id, fallbackMimeType),
      mimeType: fallbackMimeType,
    };
  }
}

/** `files.export`: the bytes of Google file `id` converted to `mimeType`. */
async function exportFileHttp(id: string, mimeType: string): Promise<Blob> {
  const path = `/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mimeType)}`;
  return (await driveFetch(path)).blob();
}

/**
 * Adds a picked Drive item to the inbox, converting it first when
 * `exportPlanFor` says to: a Google Doc, Sheet or Slides file is exported
 * (Markdown, CSV or PDF) and the bytes uploaded through the existing
 * `upload` path, so the queue, the size cap and its errors are the same as
 * any other upload; anything else is copied as it is with `copyIntoInbox`.
 * The original is never changed either way. Callers filter out a `skip`
 * plan (a Drawing or a Form) themselves, with their own sentence; calling
 * this for one anyway throws.
 */
export async function copyOrExportIntoInbox(
  pick: { id: string; name: string; mimeType: string },
  inboxId: string,
): Promise<DriveFile> {
  const plan = exportPlanFor(pick.mimeType);
  if (plan.action === 'copy') {
    return copyIntoInbox(pick.id, pick.name, inboxId);
  }
  if (plan.action === 'skip') {
    throw new DriveError(0, 'This file has no format to save it as.');
  }
  const { blob, mimeType } = await exportBlob(
    pick.id,
    plan.mimeType,
    plan.fallbackMimeType,
  );
  const file = new File([blob], withExtension(pick.name, plan.extension), {
    type: mimeType,
  });
  return upload(inboxId, file);
}

// --- Update and append -------------------------------------------------

export interface UpdateTextOptions {
  /** Content type of the new text. Defaults to `text/markdown`. */
  mimeType?: string;
}

/**
 * Replaces a file's content with `text` (`files.update`, media upload). A
 * non-2xx answer throws `DriveError`. Drive v3 documents no precondition
 * header for this call, so callers check freshness themselves.
 */
async function updateFileTextHttp(
  id: string,
  text: string,
  options: UpdateTextOptions = {},
): Promise<DriveFile> {
  const headers = new Headers({
    'Content-Type': options.mimeType ?? 'text/markdown',
  });
  const response = await driveFetch(
    `/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=${FILE_FIELDS}`,
    { method: 'PATCH', headers, body: text },
  );
  const body = await readJson(response);
  return parseFile(body, typeof body.name === 'string' ? body.name : '');
}

/**
 * Trashes a file (`files.update`, `trashed: true`) rather than deleting it
 * outright, so it can still be recovered from Drive's own Trash — the same
 * caution as the agent's `rclone deletefile` (`ARCHITECTURE.md`). Used to
 * remove a folder note that pinning created and unpinning leaves empty.
 */
async function deleteFileHttp(id: string): Promise<void> {
  await driveFetch(`/drive/v3/files/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

/** Notes Bower maintains itself, which the app never writes to. */
const PROTECTED_NOTES = new Set(['claude.md', 'index.md', 'log.md']);

/**
 * Whether the app must not write to a note named `name` (append or edit):
 * `CLAUDE.md`, `index.md`, `log.md` and `_*.md` folder notes belong to the
 * agent.
 */
export function isProtectedNote(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    PROTECTED_NOTES.has(lower) ||
    (lower.startsWith('_') && lower.endsWith('.md'))
  );
}

export type AppendErrorCode = 'protected' | 'empty' | 'conflict';

export class AppendError extends Error {
  readonly code: AppendErrorCode;

  constructor(code: AppendErrorCode, message: string) {
    super(message);
    this.name = 'AppendError';
    this.code = code;
  }
}

/** Attempts per append: the first one plus one retry after a conflict. */
export const APPEND_ATTEMPTS = 2;

/**
 * `current` with `addition` as its own paragraph at the end: exactly one
 * blank line before it (trailing newlines of `current` are folded into
 * that blank line, so repeated appends do not pile up empty lines), one
 * newline after.
 */
export function appendedText(current: string, addition: string): string {
  const body = current.replace(/(\r?\n)+$/, '');
  return body === '' ? `${addition}\n` : `${body}\n\n${addition}\n`;
}

/** The note a write goes to: enough to guard it and keep its content type. */
export interface NoteTarget {
  id: string;
  name: string;
  mimeType?: string;
}

export type AppendTarget = NoteTarget;

export interface AppendResult {
  /** The note's full text as saved. */
  text: string;
  /** The file's metadata after the save (fresh `modifiedTime`). */
  file: DriveFile;
}

/** A file's current `modifiedTime`, freshly read (no cache). Used to check a
 * write is not about to clobber another one, since Drive v3 documents no
 * precondition header for `files.update` (`updateFileText`). */
async function modifiedTimeOfHttp(id: string): Promise<string> {
  const body = await readJson(
    await driveFetch(
      `/drive/v3/files/${encodeURIComponent(id)}?fields=modifiedTime`,
    ),
  );
  if (typeof body.modifiedTime !== 'string') throw unexpected();
  return body.modifiedTime;
}

function conflict(): AppendError {
  return new AppendError('conflict', 'The note changed while saving.');
}

/**
 * Writes `text` over the note, keeping its content type. A 412, should
 * Drive ever answer one, becomes `onConflict()`.
 */
async function writeNote(
  target: NoteTarget,
  text: string,
  onConflict: () => Error,
): Promise<AppendResult> {
  const options: UpdateTextOptions = {};
  if (target.mimeType !== undefined && target.mimeType !== '') {
    options.mimeType = target.mimeType;
  }
  try {
    return { text, file: await updateFileText(target.id, text, options) };
  } catch (err) {
    if (err instanceof DriveError && err.status === 412) throw onConflict();
    throw err;
  }
}

/**
 * One read-append-write pass. Drive v3 has no `etag` field on files and
 * documents no `If-Match` on `files.update`, so the freshness check is
 * `modifiedTime`: taken before the read and compared again right before
 * the write. A 412, should Drive ever answer one, also counts as a conflict.
 */
async function appendOnce(
  target: AppendTarget,
  addition: string,
): Promise<AppendResult> {
  const before = await modifiedTimeOf(target.id);
  const current = await getText(target.id);
  if ((await modifiedTimeOf(target.id)) !== before) throw conflict();
  return writeNote(target, appendedText(current, addition), conflict);
}

/**
 * Appends `text` (trimmed) to the end of a note as its own paragraph. On a
 * conflict with another write it re-reads and retries once; a second
 * conflict throws `AppendError('conflict')`. Notes the agent maintains
 * (`isProtectedNote`) and empty text are rejected before any request.
 */
export async function appendToFile(
  target: AppendTarget,
  text: string,
): Promise<AppendResult> {
  if (isProtectedNote(target.name)) {
    throw new AppendError('protected', 'Bower maintains this note itself.');
  }
  const addition = text.trim();
  if (addition === '') {
    throw new AppendError('empty', 'Nothing to add.');
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await appendOnce(target, addition);
    } catch (err) {
      const retry =
        err instanceof AppendError &&
        err.code === 'conflict' &&
        attempt < APPEND_ATTEMPTS;
      if (!retry) throw err;
    }
  }
}

// --- Edit --------------------------------------------------------------

export interface NoteForEdit {
  text: string;
  /** The file's `modifiedTime` read just before `text`: the save baseline. */
  modifiedTime: string;
}

/**
 * A note's current text and the `modifiedTime` to compare against when the
 * edit is saved. `modifiedTime` is read first, so the text is never older
 * than the baseline: a write landing in between only makes the later save
 * report a conflict, it can never hide one.
 */
export async function readNoteForEdit(id: string): Promise<NoteForEdit> {
  const modifiedTime = await modifiedTimeOf(id);
  const text = await getText(id);
  return { text, modifiedTime };
}

export type SaveErrorCode = 'protected' | 'conflict';

export class SaveError extends Error {
  readonly code: SaveErrorCode;
  /**
   * For a conflict: the note's `modifiedTime` now, when known. Using it as
   * the next baseline means "I have seen that version".
   */
  readonly currentModifiedTime: string | null;

  constructor(
    code: SaveErrorCode,
    message: string,
    currentModifiedTime: string | null = null,
  ) {
    super(message);
    this.name = 'SaveError';
    this.code = code;
    this.currentModifiedTime = currentModifiedTime;
  }
}

export interface SaveOptions {
  /**
   * `modifiedTime` when the editor opened (`readNoteForEdit`), or `null`
   * when unknown (opened offline): an unknown baseline always conflicts, so
   * the user decides.
   */
  baseModifiedTime: string | null;
  /** Skips the freshness check and overwrites ("keep mine"). */
  force?: boolean;
  /**
   * Lets this one save through the protected-note guard. Only the rulebook
   * update (Settings › Advanced, `vault-store.tsx`'s `updateRules`, #197)
   * sets it, to replace `CLAUDE.md` with the template's; the freshness
   * check still applies unless `force` is set too.
   */
  forceProtected?: boolean;
}

function saveConflict(current: string | null): SaveError {
  return new SaveError(
    'conflict',
    'The note changed since editing started.',
    current,
  );
}

/**
 * Replaces a note's whole text with `text`. Unless `force` is set, it first
 * reads `modifiedTime` again and throws `SaveError('conflict')` without
 * writing when it differs from `baseModifiedTime`; a 412 from Drive is a
 * conflict too. Notes the agent maintains (`isProtectedNote`) are rejected
 * before any request, unless `forceProtected` is set (the rulebook update).
 */
export async function saveNoteText(
  target: NoteTarget,
  text: string,
  options: SaveOptions,
): Promise<AppendResult> {
  if (isProtectedNote(target.name) && options.forceProtected !== true) {
    throw new SaveError('protected', 'Bower maintains this note itself.');
  }
  if (options.force !== true) {
    const current = await modifiedTimeOf(target.id);
    if (current !== options.baseModifiedTime) throw saveConflict(current);
  }
  return writeNote(target, text, () => saveConflict(null));
}

// --- Client ------------------------------------------------------------

/**
 * The Drive calls everything else in this module is built on, as one
 * object. The exported functions below delegate to the current
 * implementation: the real one (`httpDriveClient`, over `driveFetch`) by
 * default, the in-memory one in a demo build (`VITE_DEMO=1`,
 * `demo/index.ts`). Appending, saving an edit and adding from the Picker
 * stay above, composed from these, so their checks run in the demo too.
 */
export interface DriveClient {
  listVault(folderId: string, options?: ListOptions): Promise<DriveFile[]>;
  listFolder(folderId: string): Promise<DriveFile[]>;
  searchFullText(query: string): Promise<DriveFile[]>;
  getText(id: string): Promise<string>;
  getBlob(id: string): Promise<Blob>;
  upload(
    parentId: string,
    file: File,
    onProgress?: UploadProgress,
    options?: UploadOptions,
  ): Promise<DriveFile>;
  createTextFile(
    parentId: string,
    name: string,
    content: string,
    options?: CreateTextFileOptions,
  ): Promise<DriveFile>;
  createFolder(parentId: string, name: string): Promise<DriveFile>;
  copyIntoInbox(id: string, name: string, inboxId: string): Promise<DriveFile>;
  exportFile(id: string, mimeType: string): Promise<Blob>;
  updateFileText(
    id: string,
    text: string,
    options?: UpdateTextOptions,
  ): Promise<DriveFile>;
  deleteFile(id: string): Promise<void>;
  modifiedTimeOf(id: string): Promise<string>;
}

/** The real Drive client: Google's API, with the Worker's token. */
export const httpDriveClient: DriveClient = {
  listVault: listVaultHttp,
  listFolder: listFolderHttp,
  searchFullText: searchFullTextHttp,
  getText: getTextHttp,
  getBlob: getBlobHttp,
  upload: uploadHttp,
  createTextFile: createTextFileHttp,
  createFolder: createFolderHttp,
  copyIntoInbox: copyIntoInboxHttp,
  exportFile: exportFileHttp,
  updateFileText: updateFileTextHttp,
  deleteFile: deleteFileHttp,
  modifiedTimeOf: modifiedTimeOfHttp,
};

let drive: DriveClient = httpDriveClient;

/** Swaps the Drive client. Only `demo/index.ts` and tests call it. */
export function setDriveClient(client: DriveClient): void {
  drive = client;
}

function withDrive<T>(call: (client: DriveClient) => Promise<T>): Promise<T> {
  return whenReady(() => call(drive));
}

/**
 * Every file and folder under `folderId` (not trashed), walking subfolders
 * with at most `concurrency` folder listings in flight. Each entry carries
 * its `/`-joined path relative to `folderId`; the result is sorted by path.
 */
export function listVault(
  folderId: string,
  options: ListOptions = {},
): Promise<DriveFile[]> {
  return withDrive((c) => c.listVault(folderId, options));
}

/** Direct children of `folderId` (not trashed), one level, no recursion. */
export function listFolder(folderId: string): Promise<DriveFile[]> {
  return withDrive((c) => c.listFolder(folderId));
}

/** Files anywhere in the user's Drive whose text matches `query`; see `searchFullTextHttp`. */
export function searchFullText(query: string): Promise<DriveFile[]> {
  return withDrive((c) => c.searchFullText(query));
}

/** A file's content as text. */
export function getText(id: string): Promise<string> {
  return withDrive((c) => c.getText(id));
}

/** A file's content as a `Blob`. */
export function getBlob(id: string): Promise<Blob> {
  return withDrive((c) => c.getBlob(id));
}

/**
 * Uploads `file` into `parentId`: one multipart request up to 5 MB, a
 * resumable upload in chunks above. `onProgress(sent, total)` is called
 * after each chunk (once, at the end, for a multipart upload).
 */
export function upload(
  parentId: string,
  file: File,
  onProgress?: UploadProgress,
  options: UploadOptions = {},
): Promise<DriveFile> {
  return withDrive((c) => c.upload(parentId, file, onProgress, options));
}

/** Creates a Markdown file named `name` in `parentId`. */
export function createTextFile(
  parentId: string,
  name: string,
  content: string,
  options: CreateTextFileOptions = {},
): Promise<DriveFile> {
  return withDrive((c) => c.createTextFile(parentId, name, content, options));
}

/** Creates a folder named `name` in `parentId`. */
export function createFolder(
  parentId: string,
  name: string,
): Promise<DriveFile> {
  return withDrive((c) => c.createFolder(parentId, name));
}

/** Copies Drive file `id` into the inbox as `name`; see `copyIntoInboxHttp`. */
export function copyIntoInbox(
  id: string,
  name: string,
  inboxId: string,
): Promise<DriveFile> {
  return withDrive((c) => c.copyIntoInbox(id, name, inboxId));
}

/** `files.export`: Google file `id` converted to `mimeType`. */
export function exportFile(id: string, mimeType: string): Promise<Blob> {
  return withDrive((c) => c.exportFile(id, mimeType));
}

/** Replaces a file's content with `text`; see `updateFileTextHttp`. */
export function updateFileText(
  id: string,
  text: string,
  options: UpdateTextOptions = {},
): Promise<DriveFile> {
  return withDrive((c) => c.updateFileText(id, text, options));
}

/** Moves a file to Drive's Trash; see `deleteFileHttp`. */
export function deleteFile(id: string): Promise<void> {
  return withDrive((c) => c.deleteFile(id));
}

/** A file's current `modifiedTime`, freshly read; see `modifiedTimeOfHttp`. */
export function modifiedTimeOf(id: string): Promise<string> {
  return withDrive((c) => c.modifiedTimeOf(id));
}
