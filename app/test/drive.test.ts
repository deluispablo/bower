import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/api.js';
import {
  appendedText,
  AppendError,
  appendToFile,
  copyIntoInbox,
  copyOrExportIntoInbox,
  createTextFile,
  INSTRUCTION_APP_PROPERTIES,
  deleteFile,
  DriveError,
  exportPlanFor,
  FOLDER_MIME,
  getBlob,
  getText,
  getToken,
  invalidateToken,
  isProtectedNote,
  listVault,
  MULTIPART_MAX_BYTES,
  readNoteForEdit,
  SaveError,
  saveNoteText,
  searchFullText,
  upload,
} from '../src/drive.js';

const HOUR_MS = 60 * 60 * 1000;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string;
}

type DriveHandler = (
  url: URL,
  init: RequestInit,
) => Response | Promise<Response>;

/**
 * Stubs `fetch`: `/drive/token` answers with `token-1`, `token-2`, … (one
 * hour each) and everything else goes to `drive`. Returns the mock and a
 * counter of token requests.
 */
function stubFetch(drive: DriveHandler): {
  fetchMock: ReturnType<typeof vi.fn>;
  tokenCalls: () => number;
  tokenUrls: () => string[];
} {
  let tokens = 0;
  const urls: string[] = [];
  const fetchMock = vi.fn((input: string, init: RequestInit = {}) => {
    if (input.includes('/drive/token')) {
      tokens++;
      urls.push(input);
      return Promise.resolve(
        jsonResponse(200, {
          accessToken: `token-${tokens}`,
          expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
          folderId: 'FOLDER_ID',
        }),
      );
    }
    return Promise.resolve(drive(new URL(input), init));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, tokenCalls: () => tokens, tokenUrls: () => urls };
}

function authHeader(init: RequestInit): string | null {
  return new Headers(init.headers).get('Authorization');
}

function folder(id: string, name: string, parent: string): RawFile {
  return { id, name, mimeType: FOLDER_MIME, parents: [parent] };
}

function note(id: string, name: string, parent: string): RawFile {
  return { id, name, mimeType: 'text/markdown', parents: [parent], size: '12' };
}

/** The parent id from a `files.list` query, with Drive's escaping undone. */
function parentFromQuery(url: URL): string {
  const q = url.searchParams.get('q') ?? '';
  const match = /^'((?:\\.|[^'\\])*)' in parents and trashed = false$/.exec(q);
  if (match?.[1] === undefined) throw new Error(`unexpected q: ${q}`);
  return match[1].replace(/\\(.)/g, '$1');
}

interface FakeDrive {
  handler: DriveHandler;
  maxInFlight: () => number;
  listCalls: () => number;
}

/** A fake `files.list` over `children` (parent id → entries). */
function fakeDrive(
  children: Record<string, RawFile[]>,
  { pageSize = 1000, delayMs = 0 } = {},
): FakeDrive {
  let inFlight = 0;
  let maxInFlight = 0;
  let listCalls = 0;
  const handler: DriveHandler = async (url) => {
    listCalls++;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    inFlight--;
    const all = children[parentFromQuery(url)] ?? [];
    const start = Number(url.searchParams.get('pageToken') ?? '0');
    const end = start + pageSize;
    return jsonResponse(200, {
      files: all.slice(start, end),
      ...(end < all.length ? { nextPageToken: String(end) } : {}),
    });
  };
  return {
    handler,
    maxInFlight: () => maxInFlight,
    listCalls: () => listCalls,
  };
}

beforeEach(() => {
  invalidateToken();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('getToken', () => {
  it('caches the token and reuses it', async () => {
    const { tokenCalls } = stubFetch(() => jsonResponse(500, {}));

    const [a, b] = await Promise.all([getToken(), getToken()]);
    const c = await getToken();

    expect(a.accessToken).toBe('token-1');
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(c.folderId).toBe('FOLDER_ID');
    expect(tokenCalls()).toBe(1);
  });

  it('refetches once the token is within 60 s of expiry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date('2026-01-01T00:00:00Z').getTime();
    vi.setSystemTime(start);
    const { tokenCalls } = stubFetch(() => jsonResponse(500, {}));

    await getToken();
    vi.setSystemTime(start + HOUR_MS - 61_000);
    expect((await getToken()).accessToken).toBe('token-1');
    vi.setSystemTime(start + HOUR_MS - 59_000);
    expect((await getToken()).accessToken).toBe('token-2');
    expect(tokenCalls()).toBe(2);
  });

  it('propagates a reauth ApiError from the Worker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: 'reauth', message: 'Google access was revoked' },
        }),
      ),
    );

    await expect(getText('FILE_ID')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'reauth',
    });
  });
});

describe('driveFetch retries', () => {
  it('refetches the token once on a 401 and retries the call', async () => {
    const seen: Array<string | null> = [];
    const { tokenCalls, tokenUrls } = stubFetch((_url, init) => {
      seen.push(authHeader(init));
      return seen.length === 1
        ? jsonResponse(401, { error: { code: 401, message: 'Invalid' } })
        : new Response('# Hello');
    });

    await expect(getText('FILE_ID')).resolves.toBe('# Hello');
    expect(seen).toEqual(['Bearer token-1', 'Bearer token-2']);
    expect(tokenCalls()).toBe(2);
    // Only the retry, after Drive's 401, asks the Worker for a fresh token.
    const [first, second] = tokenUrls();
    expect(first).not.toContain('fresh=1');
    expect(second).toContain('fresh=1');
  });

  it('turns a second 401 into an ApiError with code reauth', async () => {
    let driveCalls = 0;
    const { tokenCalls } = stubFetch(() => {
      driveCalls++;
      return jsonResponse(401, { error: { code: 401, message: 'Invalid' } });
    });

    const err: unknown = await getText('FILE_ID').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: 'reauth' });
    expect(driveCalls).toBe(2);
    expect(tokenCalls()).toBe(2);
  });

  it('throws a DriveError with the status and Drive message on non-2xx', async () => {
    stubFetch(() =>
      jsonResponse(404, { error: { code: 404, message: 'File not found' } }),
    );

    const err: unknown = await getBlob('FILE_ID').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DriveError);
    expect(err).toMatchObject({ status: 404, message: 'File not found' });
  });

  it('throws DriveError(0, "network") when the request fails', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });

    await expect(getText('FILE_ID')).rejects.toMatchObject({
      name: 'DriveError',
      status: 0,
      message: 'network',
    });
  });
});

describe('getText and getBlob', () => {
  it('fetch alt=media with the bearer token', async () => {
    const urls: string[] = [];
    stubFetch((url, init) => {
      urls.push(url.toString());
      expect(authHeader(init)).toBe('Bearer token-1');
      return new Response('content', {
        headers: { 'content-type': 'text/plain' },
      });
    });

    expect(await getText('FILE_ID')).toBe('content');
    const blob = await getBlob('FILE_ID');
    expect(await blob.text()).toBe('content');
    expect(urls).toEqual([
      'https://www.googleapis.com/drive/v3/files/FILE_ID?alt=media',
      'https://www.googleapis.com/drive/v3/files/FILE_ID?alt=media',
    ]);
  });
});

describe('listVault', () => {
  it('parses thumbnail and media metadata, leaving them off when absent', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        files: [
          {
            id: 'p1',
            name: 'a.jpg',
            mimeType: 'image/jpeg',
            thumbnailLink: 'https://lh3.googleusercontent.com/x=s220',
            imageMediaMetadata: {
              time: '2024:05:01 10:00:00',
              width: 40,
              height: '30',
            },
          },
          {
            id: 'v1',
            name: 'b.mp4',
            mimeType: 'video/mp4',
            videoMediaMetadata: { durationMillis: '61000' },
          },
          {
            id: 'n1',
            name: 'c.md',
            mimeType: 'text/markdown',
            imageMediaMetadata: {},
          },
        ],
      }),
    );

    const files = await listVault('ROOT');

    expect(files[0]).toMatchObject({
      thumbnailLink: 'https://lh3.googleusercontent.com/x=s220',
      imageMediaMetadata: {
        time: '2024:05:01 10:00:00',
        width: 40,
        height: 30,
      },
    });
    expect(files[1]?.videoMediaMetadata).toEqual({ durationMillis: 61000 });
    expect(files[2]).not.toHaveProperty('imageMediaMetadata');
    expect(files[2]).not.toHaveProperty('thumbnailLink');
  });

  it('joins every page of a folder listing', async () => {
    const root = Array.from({ length: 5 }, (_, i) =>
      note(`n${i}`, `Note ${i}.md`, 'ROOT'),
    );
    const drive = fakeDrive({ ROOT: root }, { pageSize: 3 });
    stubFetch(drive.handler);

    const files = await listVault('ROOT');

    expect(files.map((f) => f.path)).toEqual(root.map((f) => f.name));
    expect(drive.listCalls()).toBe(2);
    expect(files[0]).toMatchObject({ id: 'n0', size: 12, parents: ['ROOT'] });
  });

  it('asks for the right fields and escapes quotes in the folder id', async () => {
    const urls: URL[] = [];
    stubFetch((url) => {
      urls.push(url);
      return jsonResponse(200, { files: [] });
    });

    await listVault("it's");

    const url = urls[0];
    expect(url?.searchParams.get('q')).toBe(
      "'it\\'s' in parents and trashed = false",
    );
    expect(url?.searchParams.get('fields')).toBe(
      'nextPageToken,files(id,name,mimeType,parents,modifiedTime,size,webViewLink,appProperties,thumbnailLink,imageMediaMetadata(time,width,height),videoMediaMetadata(durationMillis))',
    );
    expect(url?.searchParams.get('pageSize')).toBe('1000');
  });

  it("keeps a file's string app properties and drops anything else", async () => {
    stubFetch(() =>
      jsonResponse(200, {
        files: [
          {
            id: 'p1',
            name: 'Lease.pdf',
            mimeType: 'application/pdf',
            parents: ['ROOT'],
            appProperties: { bowerOrigin: 'filed', count: 3 },
          },
          {
            id: 'p2',
            name: 'Plain.pdf',
            mimeType: 'application/pdf',
            parents: ['ROOT'],
            appProperties: { count: 3 },
          },
        ],
      }),
    );

    const files = await listVault('ROOT');

    expect(files[0]?.appProperties).toEqual({ bowerOrigin: 'filed' });
    expect(files[1]?.appProperties).toBeUndefined();
  });

  it('walks subfolders and builds relative paths', async () => {
    const drive = fakeDrive({
      ROOT: [folder('f1', 'Projects', 'ROOT'), note('n1', 'index.md', 'ROOT')],
      f1: [folder('f2', 'Garden', 'f1'), note('n2', 'Plan.md', 'f1')],
      f2: [note('n3', 'Seeds.md', 'f2')],
    });
    stubFetch(drive.handler);

    const files = await listVault('ROOT');

    expect(files.map((f) => f.path)).toEqual([
      'Projects',
      'Projects/Garden',
      'Projects/Garden/Seeds.md',
      'Projects/Plan.md',
      'index.md',
    ]);
  });

  it('never has more than the concurrency cap of folder listings in flight', async () => {
    const children: Record<string, RawFile[]> = { ROOT: [] };
    for (let i = 0; i < 12; i++) {
      children.ROOT?.push(folder(`f${i}`, `Folder ${i}`, 'ROOT'));
      children[`f${i}`] = [
        folder(`f${i}s`, 'Sub', `f${i}`),
        note(`n${i}`, 'a.md', `f${i}`),
      ];
      children[`f${i}s`] = [note(`n${i}s`, 'b.md', `f${i}s`)];
    }
    const drive = fakeDrive(children, { delayMs: 1 });
    stubFetch(drive.handler);

    const files = await listVault('ROOT');

    expect(files).toHaveLength(48);
    expect(drive.listCalls()).toBe(25);
    expect(drive.maxInFlight()).toBe(4);
  });

  it('honours a custom concurrency', async () => {
    const children: Record<string, RawFile[]> = {
      ROOT: Array.from({ length: 6 }, (_, i) =>
        folder(`f${i}`, `F${i}`, 'ROOT'),
      ),
    };
    const drive = fakeDrive(children, { delayMs: 1 });
    stubFetch(drive.handler);

    await listVault('ROOT', { concurrency: 2 });

    expect(drive.maxInFlight()).toBe(2);
  });

  it('lists a generated 500-entry vault across 40 folders quickly', async () => {
    // 8 top-level folders × 4 subfolders = 40 folders, plus 460 files.
    const children: Record<string, RawFile[]> = { ROOT: [] };
    const leaves: string[] = [];
    for (let i = 0; i < 8; i++) {
      children.ROOT?.push(folder(`t${i}`, `Area ${i}`, 'ROOT'));
      children[`t${i}`] = [];
      for (let j = 0; j < 4; j++) {
        const id = `t${i}s${j}`;
        children[`t${i}`]?.push(folder(id, `Topic ${j}`, `t${i}`));
        children[id] = [];
        leaves.push(id);
      }
    }
    for (let k = 0; k < 460; k++) {
      const parent = leaves[k % leaves.length] ?? 'ROOT';
      children[parent]?.push(note(`n${k}`, `Note ${k}.md`, parent));
    }
    const drive = fakeDrive(children);
    stubFetch(drive.handler);

    const started = performance.now();
    const files = await listVault('ROOT');
    const elapsed = performance.now() - started;

    expect(files).toHaveLength(500);
    expect(files.filter((f) => f.mimeType === FOLDER_MIME)).toHaveLength(40);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe('searchFullText', () => {
  it('sends the right q, fields and pageSize, and escapes quotes', async () => {
    const urls: URL[] = [];
    stubFetch((url) => {
      urls.push(url);
      return jsonResponse(200, { files: [] });
    });

    await searchFullText("it's a plan");

    const url = urls[0];
    expect(url?.pathname).toBe('/drive/v3/files');
    expect(url?.searchParams.get('q')).toBe(
      "fullText contains 'it\\'s a plan' and trashed = false",
    );
    expect(url?.searchParams.get('fields')).toBe(
      'files(id,name,mimeType,modifiedTime)',
    );
    expect(url?.searchParams.get('pageSize')).toBe('50');
  });

  it('returns the matching files', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        files: [
          note('n1', 'Plan.md', 'PARENT'),
          note('n2', 'Garden.md', 'PARENT'),
        ],
      }),
    );

    const files = await searchFullText('plan');

    expect(files.map((f) => ({ id: f.id, path: f.path }))).toEqual([
      { id: 'n1', path: 'Plan.md' },
      { id: 'n2', path: 'Garden.md' },
    ]);
  });
});

/** The parts of a multipart/related body, split on its boundary. */
async function multipartParts(init: RequestInit): Promise<string[]> {
  const type = new Headers(init.headers).get('Content-Type') ?? '';
  const boundary = /^multipart\/related; boundary=(.+)$/.exec(type)?.[1];
  expect(boundary).toBeDefined();
  const body = await (init.body as Blob).text();
  expect(body.endsWith(`\r\n--${boundary}--`)).toBe(true);
  return body
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((part) => part.replace(/^\r\n/, '').replace(/\r\n$/, ''));
}

describe('upload', () => {
  it('sends a small file as one multipart request', async () => {
    const requests: Array<{ url: URL; init: RequestInit }> = [];
    stubFetch((url, init) => {
      requests.push({ url, init });
      return jsonResponse(200, {
        id: 'NEW_ID',
        name: 'photo.png',
        mimeType: 'image/png',
        parents: ['INBOX_ID'],
        size: '5',
      });
    });
    const progress: Array<[number, number]> = [];
    const file = new File(['hello'], 'photo.png', { type: 'image/png' });

    const created = await upload('INBOX_ID', file, (sent, total) =>
      progress.push([sent, total]),
    );

    expect(created).toMatchObject({ id: 'NEW_ID', path: 'photo.png', size: 5 });
    expect(requests).toHaveLength(1);
    const { url, init } = requests[0] ?? { url: new URL('x:'), init: {} };
    expect(init.method).toBe('POST');
    expect(url.pathname).toBe('/upload/drive/v3/files');
    expect(url.searchParams.get('uploadType')).toBe('multipart');
    const [meta, content] = await multipartParts(init);
    expect(meta).toBe(
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify({
          name: 'photo.png',
          parents: ['INBOX_ID'],
          mimeType: 'image/png',
        }),
    );
    expect(content).toBe('Content-Type: image/png\r\n\r\nhello');
    expect(progress).toEqual([[5, 5]]);
  });

  it('uses a resumable upload above 5 MB and reports progress per chunk', async () => {
    const chunk = 2 * 1024 * 1024;
    const total = MULTIPART_MAX_BYTES + 1;
    const session =
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=SESSION';
    const puts: Array<{ range: string | null; bytes: number }> = [];
    let initiated: RequestInit | undefined;
    stubFetch(async (url, init) => {
      if (init.method === 'POST') {
        initiated = init;
        expect(url.searchParams.get('uploadType')).toBe('resumable');
        return new Response(null, {
          status: 200,
          headers: { Location: session },
        });
      }
      expect(url.toString()).toBe(session);
      const range = new Headers(init.headers).get('Content-Range');
      const bytes = (init.body as Blob).size;
      puts.push({ range, bytes });
      const received = puts.reduce((sum, p) => sum + p.bytes, 0);
      if (received < total) {
        return new Response(null, {
          status: 308,
          headers: { Range: `bytes=0-${received - 1}` },
        });
      }
      await Promise.resolve();
      return jsonResponse(200, {
        id: 'BIG_ID',
        name: 'video.mp4',
        mimeType: 'video/mp4',
        parents: ['INBOX_ID'],
        size: String(total),
      });
    });
    const progress: Array<[number, number]> = [];
    const file = new File([new Uint8Array(total)], 'video.mp4', {
      type: 'video/mp4',
    });

    const created = await upload(
      'INBOX_ID',
      file,
      (sent, all) => progress.push([sent, all]),
      { chunkSize: chunk },
    );

    expect(created).toMatchObject({ id: 'BIG_ID', size: total });
    const headers = new Headers(initiated?.headers);
    expect(headers.get('X-Upload-Content-Type')).toBe('video/mp4');
    expect(headers.get('X-Upload-Content-Length')).toBe(String(total));
    expect(JSON.parse(initiated?.body as string)).toEqual({
      name: 'video.mp4',
      parents: ['INBOX_ID'],
      mimeType: 'video/mp4',
    });
    expect(puts).toEqual([
      { range: `bytes 0-${chunk - 1}/${total}`, bytes: chunk },
      { range: `bytes ${chunk}-${2 * chunk - 1}/${total}`, bytes: chunk },
      {
        range: `bytes ${2 * chunk}-${total - 1}/${total}`,
        bytes: total - 2 * chunk,
      },
    ]);
    expect(progress).toEqual([
      [chunk, total],
      [2 * chunk, total],
      [total, total],
    ]);
  });
});

describe('createTextFile', () => {
  it('uploads Markdown content as text/markdown', async () => {
    let init: RequestInit = {};
    stubFetch((_url, i) => {
      init = i;
      return jsonResponse(200, {
        id: 'MD_ID',
        name: 'Bower - tidy up.md',
        mimeType: 'text/markdown',
        parents: ['INBOX_ID'],
      });
    });

    const created = await createTextFile(
      'INBOX_ID',
      'Bower - tidy up.md',
      '# Tidy up\n',
    );

    expect(created.id).toBe('MD_ID');
    const [meta, content] = await multipartParts(init);
    expect(meta).toContain(
      JSON.stringify({
        name: 'Bower - tidy up.md',
        parents: ['INBOX_ID'],
        mimeType: 'text/markdown',
      }),
    );
    expect(content).toBe('Content-Type: text/markdown\r\n\r\n# Tidy up\n');
    expect(meta).not.toContain('appProperties');
  });

  it('sets appProperties on files.create only when given', async () => {
    let init: RequestInit = {};
    stubFetch((_url, i) => {
      init = i;
      return jsonResponse(200, {
        id: 'MD_ID',
        name: 'Bower - tidy up.md',
        mimeType: 'text/markdown',
        parents: ['INBOX_ID'],
      });
    });

    await createTextFile('INBOX_ID', 'Bower - tidy up.md', '# Tidy up\n', {
      appProperties: INSTRUCTION_APP_PROPERTIES,
    });

    const [meta] = await multipartParts(init);
    expect(meta).toContain(
      JSON.stringify({
        name: 'Bower - tidy up.md',
        parents: ['INBOX_ID'],
        mimeType: 'text/markdown',
        appProperties: { bower: 'instruction' },
      }),
    );
  });
});

describe('deleteFile', () => {
  it('trashes the file with files.update rather than deleting it outright', async () => {
    let url = new URL('https://www.googleapis.com');
    let init: RequestInit = {};
    stubFetch((u, i) => {
      url = u;
      init = i;
      return jsonResponse(200, { id: 'FILE_ID', trashed: true });
    });

    await deleteFile('FILE_ID');

    expect(init.method).toBe('PATCH');
    expect(url.pathname).toBe('/drive/v3/files/FILE_ID');
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json',
    );
    expect(JSON.parse(init.body as string)).toEqual({ trashed: true });
  });

  it('throws a DriveError when Drive refuses it', async () => {
    stubFetch(() => jsonResponse(404, { error: { message: 'Not found.' } }));

    await expect(deleteFile('FILE_ID')).rejects.toMatchObject({
      name: 'DriveError',
      status: 404,
    });
  });
});

describe('copyIntoInbox', () => {
  it('copies the file into the inbox with files.copy under the given name', async () => {
    let url = new URL('https://www.googleapis.com');
    let init: RequestInit = {};
    stubFetch((u, i) => {
      url = u;
      init = i;
      return jsonResponse(200, {
        id: 'COPY_ID',
        name: 'Lease agreement.pdf',
        mimeType: 'application/pdf',
        parents: ['INBOX_ID'],
      });
    });

    const copied = await copyIntoInbox(
      'FILE_ID',
      'Lease agreement.pdf',
      'INBOX_ID',
    );

    expect(init.method).toBe('POST');
    expect(url.pathname).toBe('/drive/v3/files/FILE_ID/copy');
    expect(url.searchParams.get('fields')).toContain('parents');
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json',
    );
    // The copy never keeps its source's instruction-note property.
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Lease agreement.pdf',
      parents: ['INBOX_ID'],
      appProperties: { bower: null },
    });
    expect(authHeader(init)).toBe('Bearer token-1');
    expect(copied).toMatchObject({ id: 'COPY_ID', parents: ['INBOX_ID'] });
  });

  it('throws a DriveError when Drive refuses the copy', async () => {
    stubFetch(() =>
      jsonResponse(403, { error: { message: 'Copying is disabled.' } }),
    );

    await expect(
      copyIntoInbox('FILE_ID', 'a.pdf', 'INBOX_ID'),
    ).rejects.toMatchObject({ name: 'DriveError', status: 403 });
  });
});

describe('exportPlanFor', () => {
  it('exports a Google Doc as Markdown, falling back to plain text', () => {
    expect(exportPlanFor('application/vnd.google-apps.document')).toEqual({
      action: 'export',
      mimeType: 'text/markdown',
      fallbackMimeType: 'text/plain',
      extension: '.md',
    });
  });

  it('exports a Google Sheet as CSV', () => {
    expect(exportPlanFor('application/vnd.google-apps.spreadsheet')).toEqual({
      action: 'export',
      mimeType: 'text/csv',
      extension: '.csv',
    });
  });

  it('exports Google Slides as a PDF', () => {
    expect(exportPlanFor('application/vnd.google-apps.presentation')).toEqual({
      action: 'export',
      mimeType: 'application/pdf',
      extension: '.pdf',
    });
  });

  it('skips a Google Drawing', () => {
    expect(exportPlanFor('application/vnd.google-apps.drawing')).toEqual({
      action: 'skip',
    });
  });

  it('skips a Google Form', () => {
    expect(exportPlanFor('application/vnd.google-apps.form')).toEqual({
      action: 'skip',
    });
  });

  it('copies anything else, e.g. a PDF, as it is', () => {
    expect(exportPlanFor('application/pdf')).toEqual({ action: 'copy' });
  });
});

describe('copyOrExportIntoInbox', () => {
  it('copies a non-Workspace pick with files.copy', async () => {
    let url = new URL('https://www.googleapis.com');
    stubFetch((u) => {
      url = u;
      return jsonResponse(200, {
        id: 'COPY_ID',
        name: 'a.pdf',
        mimeType: 'application/pdf',
        parents: ['INBOX_ID'],
      });
    });

    const result = await copyOrExportIntoInbox(
      { id: 'FILE_ID', name: 'a.pdf', mimeType: 'application/pdf' },
      'INBOX_ID',
    );

    expect(url.pathname).toBe('/drive/v3/files/FILE_ID/copy');
    expect(result).toMatchObject({ id: 'COPY_ID' });
  });

  it('exports a Google Doc as Markdown and uploads it', async () => {
    const requests: URL[] = [];
    stubFetch((url) => {
      requests.push(url);
      if (url.pathname === '/drive/v3/files/DOC_ID/export') {
        expect(url.searchParams.get('mimeType')).toBe('text/markdown');
        return new Response('# Notes', {
          headers: { 'content-type': 'text/markdown' },
        });
      }
      expect(url.pathname).toBe('/upload/drive/v3/files');
      return jsonResponse(200, {
        id: 'MD_ID',
        name: 'Notes.md',
        mimeType: 'text/markdown',
        parents: ['INBOX_ID'],
      });
    });

    const result = await copyOrExportIntoInbox(
      {
        id: 'DOC_ID',
        name: 'Notes',
        mimeType: 'application/vnd.google-apps.document',
      },
      'INBOX_ID',
    );

    expect(result).toMatchObject({ id: 'MD_ID', path: 'Notes.md' });
    expect(
      requests.some((u) => u.pathname === '/drive/v3/files/DOC_ID/export'),
    ).toBe(true);
  });

  it('retries the Markdown export once as plain text on a 400', async () => {
    let tries = 0;
    stubFetch((url) => {
      if (url.pathname === '/drive/v3/files/DOC_ID/export') {
        tries++;
        if (url.searchParams.get('mimeType') === 'text/markdown') {
          return jsonResponse(400, { error: { message: 'No Markdown.' } });
        }
        expect(url.searchParams.get('mimeType')).toBe('text/plain');
        return new Response('Notes', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      return jsonResponse(200, {
        id: 'TXT_ID',
        name: 'Notes.md',
        mimeType: 'text/plain',
        parents: ['INBOX_ID'],
      });
    });

    const result = await copyOrExportIntoInbox(
      {
        id: 'DOC_ID',
        name: 'Notes',
        mimeType: 'application/vnd.google-apps.document',
      },
      'INBOX_ID',
    );

    expect(tries).toBe(2);
    expect(result).toMatchObject({ id: 'TXT_ID' });
  });

  it('exports a Sheet as CSV named <name>.csv', async () => {
    stubFetch((url) => {
      if (url.pathname === '/drive/v3/files/SHEET_ID/export') {
        expect(url.searchParams.get('mimeType')).toBe('text/csv');
        return new Response('a,b\n1,2', {
          headers: { 'content-type': 'text/csv' },
        });
      }
      return jsonResponse(200, {
        id: 'CSV_ID',
        name: 'Budget.csv',
        mimeType: 'text/csv',
        parents: ['INBOX_ID'],
      });
    });

    const result = await copyOrExportIntoInbox(
      {
        id: 'SHEET_ID',
        name: 'Budget',
        mimeType: 'application/vnd.google-apps.spreadsheet',
      },
      'INBOX_ID',
    );

    expect(result).toMatchObject({ path: 'Budget.csv' });
  });

  it('throws without a request for a Drawing or a Form', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      copyOrExportIntoInbox(
        {
          id: 'DRAW_ID',
          name: 'Sketch',
          mimeType: 'application/vnd.google-apps.drawing',
        },
        'INBOX_ID',
      ),
    ).rejects.toMatchObject({ name: 'DriveError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

interface FakeNote {
  text: string;
  modifiedTime: string;
}

interface Patch {
  body: string;
  contentType: string | null;
}

interface FakeNoteOptions {
  /** PATCH answers in order; 200 once the list runs out. */
  patchStatuses?: number[];
  /** Runs right before the nth `modifiedTime` read (1-based). */
  beforeMeta?: Record<number, () => void>;
}

/**
 * A fake Drive holding one note, `FILE_ID`: `fields=modifiedTime`, the
 * `alt=media` download and the media `PATCH`, which bumps `modifiedTime`
 * like Drive would.
 */
function fakeNote(
  note: FakeNote,
  { patchStatuses = [], beforeMeta = {} }: FakeNoteOptions = {},
): { handler: DriveHandler; requests: string[]; patches: Patch[] } {
  const requests: string[] = [];
  const patches: Patch[] = [];
  let metaReads = 0;
  let version = 1;
  const handler: DriveHandler = (url, init) => {
    const method = init.method ?? 'GET';
    requests.push(`${method} ${url.pathname}${url.search}`);
    const body = typeof init.body === 'string' ? init.body : '';
    if (method === 'PATCH') {
      const headers = new Headers(init.headers);
      patches.push({ body, contentType: headers.get('Content-Type') });
      const status = patchStatuses.shift() ?? 200;
      if (status !== 200) {
        return jsonResponse(status, { error: { message: 'Drive said no.' } });
      }
      version++;
      note.text = body;
      note.modifiedTime = `2026-01-01T00:00:0${version}.000Z`;
      return jsonResponse(200, {
        id: 'FILE_ID',
        name: 'Ideas.md',
        mimeType: 'text/markdown',
        parents: ['FOLDER_ID'],
        modifiedTime: note.modifiedTime,
      });
    }
    if (url.searchParams.get('alt') === 'media') {
      return new Response(note.text, {
        headers: { 'content-type': 'text/markdown' },
      });
    }
    if (url.searchParams.get('fields') === 'modifiedTime') {
      metaReads++;
      beforeMeta[metaReads]?.();
      return jsonResponse(200, { modifiedTime: note.modifiedTime });
    }
    return jsonResponse(404, {});
  };
  return { handler, requests, patches };
}

const TARGET = { id: 'FILE_ID', name: 'Ideas.md', mimeType: 'text/markdown' };

describe('isProtectedNote', () => {
  it('guards the notes the agent maintains, whatever the case', () => {
    for (const name of [
      'CLAUDE.md',
      'index.md',
      'log.md',
      'Log.MD',
      '_Projects.md',
    ]) {
      expect(isProtectedNote(name)).toBe(true);
    }
  });

  it('lets ordinary notes through', () => {
    for (const name of ['Ideas.md', 'my_index.md', 'catalog.md', 'log.txt']) {
      expect(isProtectedNote(name)).toBe(false);
    }
  });
});

describe('appendedText', () => {
  it('adds the text as its own paragraph with one blank line before', () => {
    expect(appendedText('First.', 'Second.')).toBe('First.\n\nSecond.\n');
    expect(appendedText('First.\n', 'Second.')).toBe('First.\n\nSecond.\n');
    expect(appendedText('First.\r\n\r\n', 'Second.')).toBe(
      'First.\n\nSecond.\n',
    );
  });

  it('does not start an empty note with blank lines', () => {
    expect(appendedText('', 'First.')).toBe('First.\n');
  });
});

describe('appendToFile', () => {
  it('reads the note, checks it is unchanged, then PATCHes the new paragraph', async () => {
    const note: FakeNote = {
      text: '# Ideas\n\nFirst.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note);
    stubFetch(drive.handler);

    const result = await appendToFile(TARGET, '  Second.\n');

    expect(result.text).toBe('# Ideas\n\nFirst.\n\nSecond.\n');
    expect(result.file.modifiedTime).toBe('2026-01-01T00:00:02.000Z');
    expect(note.text).toBe(result.text);
    expect(drive.requests).toEqual([
      'GET /drive/v3/files/FILE_ID?fields=modifiedTime',
      'GET /drive/v3/files/FILE_ID?alt=media',
      'GET /drive/v3/files/FILE_ID?fields=modifiedTime',
      'PATCH /upload/drive/v3/files/FILE_ID?uploadType=media&fields=id,name,mimeType,parents,modifiedTime,size,webViewLink',
    ]);
    expect(drive.patches).toEqual([
      { body: result.text, contentType: 'text/markdown' },
    ]);
  });

  it('re-reads and retries once after a 412', async () => {
    const note: FakeNote = {
      text: 'First.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note, { patchStatuses: [412] });
    stubFetch(drive.handler);

    const result = await appendToFile(TARGET, 'Second.');

    expect(result.text).toBe('First.\n\nSecond.\n');
    expect(drive.patches).toHaveLength(2);
    expect(drive.requests.filter((r) => r.includes('alt=media'))).toHaveLength(
      2,
    );
  });

  it('gives up with a conflict after a second 412', async () => {
    const note: FakeNote = {
      text: 'First.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note, { patchStatuses: [412, 412] });
    stubFetch(drive.handler);

    const error = await appendToFile(TARGET, 'Second.').catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(AppendError);
    expect((error as AppendError).code).toBe('conflict');
    expect(drive.patches).toHaveLength(2);
    expect(note.text).toBe('First.');
  });

  it('keeps a write another device made mid-append', async () => {
    const note: FakeNote = {
      text: 'First.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note, {
      beforeMeta: {
        // Another device saves between this device's read and its write.
        2: () => {
          note.text = 'First.\n\nFrom the other device.\n';
          note.modifiedTime = '2026-01-01T00:00:09.000Z';
        },
      },
    });
    stubFetch(drive.handler);

    const result = await appendToFile(TARGET, 'From this device.');

    expect(result.text).toBe(
      'First.\n\nFrom the other device.\n\nFrom this device.\n',
    );
    expect(drive.patches).toHaveLength(1);
  });

  it('gives up with a conflict when the note changes during both attempts', async () => {
    const note: FakeNote = {
      text: 'First.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const touch = (second: number) => (): void => {
      note.modifiedTime = `2026-01-01T00:00:${second}.000Z`;
    };
    const drive = fakeNote(note, {
      beforeMeta: { 2: touch(11), 4: touch(12) },
    });
    stubFetch(drive.handler);

    const error = await appendToFile(TARGET, 'Second.').catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(AppendError);
    expect((error as AppendError).code).toBe('conflict');
    expect(drive.patches).toHaveLength(0);
  });

  it('rejects the notes the agent maintains without any request', async () => {
    const { fetchMock } = stubFetch(() => jsonResponse(500, {}));

    for (const name of ['CLAUDE.md', 'index.md', 'log.md', '_Projects.md']) {
      const error = await appendToFile({ id: 'FILE_ID', name }, 'Hi.').catch(
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(AppendError);
      expect((error as AppendError).code).toBe('protected');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects blank text without any request', async () => {
    const { fetchMock } = stubFetch(() => jsonResponse(500, {}));

    const error = await appendToFile(TARGET, ' \n ').catch(
      (err: unknown) => err,
    );

    expect((error as AppendError).code).toBe('empty');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes any other Drive failure through', async () => {
    const note: FakeNote = {
      text: 'First.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note, { patchStatuses: [500] });
    stubFetch(drive.handler);

    const error = await appendToFile(TARGET, 'Second.').catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(DriveError);
    expect((error as DriveError).status).toBe(500);
    expect(drive.patches).toHaveLength(1);
  });
});

const PATCH_REQUEST =
  'PATCH /upload/drive/v3/files/FILE_ID?uploadType=media&fields=id,name,mimeType,parents,modifiedTime,size,webViewLink';

describe('readNoteForEdit', () => {
  it('reads modifiedTime before the text, as the save baseline', async () => {
    const note: FakeNote = {
      text: '# Ideas\n',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note);
    stubFetch(drive.handler);

    const opened = await readNoteForEdit('FILE_ID');

    expect(opened).toEqual({
      text: '# Ideas\n',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    });
    expect(drive.requests).toEqual([
      'GET /drive/v3/files/FILE_ID?fields=modifiedTime',
      'GET /drive/v3/files/FILE_ID?alt=media',
    ]);
  });
});

describe('saveNoteText', () => {
  it('checks modifiedTime is unchanged, then PATCHes the whole text', async () => {
    const note: FakeNote = {
      text: 'Old.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note);
    stubFetch(drive.handler);

    const result = await saveNoteText(TARGET, 'New.\n', {
      baseModifiedTime: '2026-01-01T00:00:01.000Z',
    });

    expect(result.text).toBe('New.\n');
    expect(result.file.modifiedTime).toBe('2026-01-01T00:00:02.000Z');
    expect(note.text).toBe('New.\n');
    expect(drive.requests).toEqual([
      'GET /drive/v3/files/FILE_ID?fields=modifiedTime',
      PATCH_REQUEST,
    ]);
    expect(drive.patches).toEqual([
      { body: 'New.\n', contentType: 'text/markdown' },
    ]);
  });

  it('reports a conflict without writing when the note changed since opening', async () => {
    const note: FakeNote = {
      text: 'Changed elsewhere.',
      modifiedTime: '2026-01-01T00:00:09.000Z',
    };
    const drive = fakeNote(note);
    stubFetch(drive.handler);

    const error = await saveNoteText(TARGET, 'Mine.', {
      baseModifiedTime: '2026-01-01T00:00:01.000Z',
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SaveError);
    expect((error as SaveError).code).toBe('conflict');
    expect((error as SaveError).currentModifiedTime).toBe(
      '2026-01-01T00:00:09.000Z',
    );
    expect(drive.patches).toHaveLength(0);
    expect(note.text).toBe('Changed elsewhere.');
  });

  it('treats an unknown baseline as a conflict', async () => {
    const note: FakeNote = {
      text: 'Old.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note);
    stubFetch(drive.handler);

    const error = await saveNoteText(TARGET, 'Mine.', {
      baseModifiedTime: null,
    }).catch((err: unknown) => err);

    expect((error as SaveError).code).toBe('conflict');
    expect(drive.patches).toHaveLength(0);
  });

  it('maps a 412 from Drive to a conflict', async () => {
    const note: FakeNote = {
      text: 'Old.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note, { patchStatuses: [412] });
    stubFetch(drive.handler);

    const error = await saveNoteText(TARGET, 'Mine.', {
      baseModifiedTime: '2026-01-01T00:00:01.000Z',
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SaveError);
    expect((error as SaveError).code).toBe('conflict');
    expect((error as SaveError).currentModifiedTime).toBeNull();
    expect(drive.patches).toHaveLength(1);
    expect(note.text).toBe('Old.');
  });

  it('overwrites without checking when forced ("keep mine")', async () => {
    const note: FakeNote = {
      text: 'Changed elsewhere.',
      modifiedTime: '2026-01-01T00:00:09.000Z',
    };
    const drive = fakeNote(note);
    stubFetch(drive.handler);

    const result = await saveNoteText(TARGET, 'Mine.', {
      baseModifiedTime: '2026-01-01T00:00:01.000Z',
      force: true,
    });

    expect(result.text).toBe('Mine.');
    expect(drive.requests).toEqual([PATCH_REQUEST]);
    expect(note.text).toBe('Mine.');
  });

  it('rejects the notes the agent maintains without any request', async () => {
    const { fetchMock } = stubFetch(() => jsonResponse(500, {}));

    for (const name of ['CLAUDE.md', 'index.md', 'log.md', '_Projects.md']) {
      const error = await saveNoteText({ id: 'FILE_ID', name }, 'Hi.', {
        baseModifiedTime: '2026-01-01T00:00:01.000Z',
        force: true,
      }).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(SaveError);
      expect((error as SaveError).code).toBe('protected');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets the rulebook update through with forceProtected, still checking freshness', async () => {
    const note: FakeNote = {
      text: 'Old rulebook.',
      modifiedTime: '2026-01-01T00:00:01.000Z',
    };
    const drive = fakeNote(note);
    stubFetch(drive.handler);
    const rulebook = { id: 'FILE_ID', name: 'CLAUDE.md' };

    const stale = await saveNoteText(rulebook, 'New.', {
      baseModifiedTime: '2026-01-01T00:00:00.000Z',
      forceProtected: true,
    }).catch((err: unknown) => err);
    expect((stale as SaveError).code).toBe('conflict');
    expect(note.text).toBe('Old rulebook.');

    await saveNoteText(rulebook, 'New rulebook.', {
      baseModifiedTime: '2026-01-01T00:00:01.000Z',
      forceProtected: true,
    });
    expect(note.text).toBe('New rulebook.');
  });
});
