/**
 * A thin typed client over the Google Drive v3 REST API, just what vault
 * provisioning needs: list a folder, read one file's metadata, create a
 * folder, upload a text file. Every call takes an injectable `fetch` and a
 * bearer access token (from `drive.ts`), so tests fake Drive entirely.
 *
 * Nothing here logs, and no error message ever contains a file name, a
 * file's content or a token: only the operation and the HTTP status.
 */

import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';

export const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v3/files';
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

const FILE_FIELDS = 'id,name,mimeType';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** Only `getFile` asks for it. */
  trashed?: boolean;
}

export interface DriveApi {
  /**
   * The non-trashed children of `parentId` (`'root'` for My Drive), every
   * page; only those called `name` when it is given.
   */
  listChildren(parentId: string, name?: string): Promise<DriveFile[]>;
  /** The file's metadata, or `undefined` when Drive answers 404. */
  getFile(id: string): Promise<DriveFile | undefined>;
  createFolder(name: string, parentId: string): Promise<DriveFile>;
  /** Uploads a new file; never replaces an existing one. */
  uploadText(
    name: string,
    parentId: string,
    content: string,
    mimeType?: string,
  ): Promise<DriveFile>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Quotes `value` as a string literal of a Drive `q` query. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function invalidJson(op: string, cause?: unknown): HttpError {
  return new HttpError(
    502,
    'drive_error',
    `Drive ${op} returned invalid JSON`,
    cause === undefined ? undefined : { cause },
  );
}

function toDriveFile(op: string, value: unknown): DriveFile {
  if (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.mimeType === 'string'
  ) {
    const file: DriveFile = {
      id: value.id,
      name: value.name,
      mimeType: value.mimeType,
    };
    if (typeof value.trashed === 'boolean') file.trashed = value.trashed;
    return file;
  }
  throw invalidJson(op);
}

/** Reads a 2xx answer's JSON object body; anything else is a 502. */
async function readJson(
  op: string,
  response: Response,
): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new HttpError(
      502,
      'drive_error',
      `Drive ${op} returned ${response.status}`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw invalidJson(op, err);
  }
  if (!isRecord(body)) throw invalidJson(op);
  return body;
}

/** Builds the Drive client for one access token. */
export function createDriveApi(
  accessToken: string,
  fetchImpl: FetchLike,
): DriveApi {
  /**
   * Sends one request with the bearer token. A network failure is a 502
   * `drive_error`; a 401 (token expired or revoked) is `HttpError(401,
   * 'reauth')`. Any other status is the caller's to judge.
   */
  async function send(
    op: string,
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${accessToken}`);
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, headers });
    } catch (err) {
      throw new HttpError(502, 'drive_error', `Drive ${op} unreachable`, {
        cause: err,
      });
    }
    if (response.status === 401) {
      throw new HttpError(
        401,
        'reauth',
        'Google access expired, sign in again',
      );
    }
    return response;
  }

  async function request(
    op: string,
    url: string,
    init?: RequestInit,
  ): Promise<Record<string, unknown>> {
    return readJson(op, await send(op, url, init));
  }

  return {
    async listChildren(parentId, name) {
      let q = `${quote(parentId)} in parents and trashed = false`;
      if (name !== undefined) q += ` and name = ${quote(name)}`;
      const files: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q,
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          pageSize: '1000',
        });
        if (pageToken !== undefined) params.set('pageToken', pageToken);
        const body = await request(
          'list',
          `${DRIVE_FILES_URL}?${params.toString()}`,
        );
        if (!Array.isArray(body.files)) throw invalidJson('list');
        for (const file of body.files) files.push(toDriveFile('list', file));
        pageToken =
          typeof body.nextPageToken === 'string'
            ? body.nextPageToken
            : undefined;
      } while (pageToken !== undefined);
      return files;
    },

    async getFile(id) {
      const params = new URLSearchParams({ fields: `${FILE_FIELDS},trashed` });
      const response = await send(
        'get',
        `${DRIVE_FILES_URL}/${encodeURIComponent(id)}?${params.toString()}`,
      );
      if (response.status === 404) return undefined;
      return toDriveFile('get', await readJson('get', response));
    },

    async createFolder(name, parentId) {
      const params = new URLSearchParams({ fields: FILE_FIELDS });
      const body = await request(
        'create folder',
        `${DRIVE_FILES_URL}?${params.toString()}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({
            name,
            mimeType: FOLDER_MIME_TYPE,
            parents: [parentId],
          }),
        },
      );
      return toDriveFile('create folder', body);
    },

    async uploadText(name, parentId, content, mimeType = 'text/markdown') {
      // 122 random bits: the boundary cannot occur in the content.
      const boundary = `bower-${crypto.randomUUID()}`;
      const metadata = JSON.stringify({ name, mimeType, parents: [parentId] });
      const body =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;
      const params = new URLSearchParams({
        uploadType: 'multipart',
        fields: FILE_FIELDS,
      });
      const result = await request(
        'upload',
        `${DRIVE_UPLOAD_URL}?${params.toString()}`,
        {
          method: 'POST',
          headers: {
            'content-type': `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      return toDriveFile('upload', result);
    },
  };
}
