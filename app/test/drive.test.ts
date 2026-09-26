import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/api.js';
import {
  createTextFile,
  DriveError,
  FOLDER_MIME,
  getBlob,
  getText,
  getToken,
  invalidateToken,
  listVault,
  MULTIPART_MAX_BYTES,
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
      'nextPageToken,files(id,name,mimeType,parents,modifiedTime,size,webViewLink)',
    );
    expect(url?.searchParams.get('pageSize')).toBe('1000');
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
  });
});
