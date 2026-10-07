/**
 * A fake `fetch` that answers as Drive v3 and the Worker's token route do,
 * over a `FakeDrive` that holds the stored files. No network: the runner's
 * adapter talks to this in tests.
 */
import { BowerError } from '../../src/data/types';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { FakeDrive } from '../../src/data/drive/fake-drive';

export const API = 'https://api.test';
export const RUN_ID = 'abc123-run1';
export const TICKET = 'test-ticket';
const FOLDER = 'application/vnd.google-apps.folder';
/** Drive pages a listing; this one pages by two so paging is exercised. */
const PAGE = 2;

export interface WireRequest {
  method: string;
  url: URL;
}

export interface DriveV3 {
  drive: FakeDrive;
  fetch: typeof fetch;
  requests: WireRequest[];
  /** The attempt the token route reports as current. */
  attempt: number;
  /** When set, the token route answers this instead of a token. */
  tokenRefusal: { status: number; error: string } | null;
  tokenCalls: number;
  now: number;
}

/** A Drive with fixed times, so two of them made the same way stay identical. */
export const fixedDrive = (): FakeDrive => new FakeDrive({ clock: () => 0 });

export function driveV3(drive: FakeDrive = fixedDrive(), attempt = 1): DriveV3 {
  let minted = 0;
  const live = new Set<string>();
  const wire: DriveV3 = {
    drive,
    requests: [],
    attempt,
    tokenRefusal: null,
    tokenCalls: 0,
    now: 1_000_000,
    fetch: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = (init.method ?? 'GET').toUpperCase();
      const auth = new Headers(init.headers).get('authorization') ?? '';
      if (url.origin === API) {
        wire.tokenCalls++;
        if (url.pathname !== `/runner/runs/${RUN_ID}/token` || method !== 'GET') return json(404, { error: 'not-found' });
        if (auth !== `Bearer ${TICKET}`) return json(401, { error: 'signed-out', message: 'Sign in again to keep going.' });
        if (wire.tokenRefusal) return json(wire.tokenRefusal.status, { error: wire.tokenRefusal.error, message: 'This tidy-up was taken over.' });
        const accessToken = `drive-token-${++minted}`;
        live.add(accessToken);
        return json(200, { accessToken, expiresAt: wire.now + 3_600_000, folderId: 'FOLDER_ID', attempt: wire.attempt });
      }
      wire.requests.push({ method, url });
      if (url.origin !== 'https://www.googleapis.com') return json(404, driveFailure(404, 'notFound'));
      if (!live.has(auth.replace(/^Bearer /, ''))) return json(401, driveFailure(401, 'authError'));
      try {
        return await answer(drive, method, url, init.body ?? null);
      } catch (e) {
        if (e instanceof BowerError && e.code === 'not-found') return json(404, driveFailure(404, 'notFound'));
        throw e;
      }
    },
  };
  return wire;
}

async function answer(drive: FakeDrive, method: string, url: URL, body: RequestInit["body"]): Promise<Response> {
  const path = url.pathname;
  const one = /^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(path);
  if (method === 'GET' && path === '/drive/v3/files') return list(drive, url);
  if (method === 'GET' && one) {
    const id = decodeURIComponent(one[2] ?? '');
    if (url.searchParams.get('alt') === 'media') return new Response(await drive.readBytes(id));
    const stored = await drive.evidence(id);
    return stored ? json(200, wireFile(stored.file, stored.trashed)) : json(404, driveFailure(404, 'notFound'));
  }
  if (method === 'POST' && path === '/drive/v3/files') {
    const meta = JSON.parse(await new Response(body).text()) as { name: string; mimeType?: string; parents: string[]; appProperties?: Record<string, string> };
    if (meta.mimeType !== FOLDER) return json(400, driveFailure(400, 'badRequest'));
    return json(200, wireFile(await drive.createFolder(meta.parents[0] ?? '', meta.name, meta.appProperties), false));
  }
  if (method === 'POST' && path === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'multipart') {
    const { meta, content } = await multipart(body);
    return json(200, wireFile(await drive.createText(meta.parents[0] ?? '', meta.name, content, meta.appProperties), false));
  }
  if (method === 'PATCH' && one?.[1] && url.searchParams.get('uploadType') === 'media') {
    const id = decodeURIComponent(one[2] ?? '');
    // Drive v3 takes no precondition on a content update: it writes over whatever is there.
    const stored = await drive.get(id);
    return json(200, wireFile(await drive.writeText(id, await new Response(body).text(), stored.modifiedTime), false));
  }
  if (method === 'PATCH' && one && !one[1]) {
    const id = decodeURIComponent(one[2] ?? '');
    const patch = JSON.parse(await new Response(body).text()) as { name?: string; appProperties?: Record<string, string | null>; trashed?: boolean };
    if (patch.trashed === true) {
      await drive.trash(id);
      const stored = await drive.evidence(id);
      return stored ? json(200, wireFile(stored.file, true)) : json(404, driveFailure(404, 'notFound'));
    }
    const addParent = url.searchParams.get('addParents');
    const removeParent = url.searchParams.get('removeParents');
    const file = await drive.update(id, {
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.appProperties ? { appProperties: patch.appProperties } : {}),
      ...(addParent ? { addParent } : {}),
      ...(removeParent ? { removeParent } : {}),
    });
    return json(200, wireFile(file, false));
  }
  return json(400, driveFailure(400, 'badRequest'));
}

async function list(drive: FakeDrive, url: URL): Promise<Response> {
  const q = url.searchParams.get('q') ?? '';
  const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1] ?? '');
  if (!parents.length || !/trashed = false/.test(q)) return json(400, driveFailure(400, 'invalidQuery'));
  const all: DriveFile[] = [];
  for (const parent of parents) all.push(...(await drive.listAll(parent)).filter((f) => f.parents[0] === parent));
  const size = Math.min(PAGE, Number(url.searchParams.get('pageSize') ?? PAGE));
  const at = Number(url.searchParams.get('pageToken') || 0);
  const page = all.slice(at, at + size);
  const next = at + size < all.length ? { nextPageToken: String(at + size) } : {};
  return json(200, { kind: 'drive#fileList', files: page.map((f) => wireFile(f, false)), ...next });
}

async function multipart(body: RequestInit["body"]): Promise<{ meta: { name: string; parents: string[]; appProperties?: Record<string, string> }; content: string }> {
  const text = await new Response(body).text();
  const boundary = /^--([^\r\n]+)\r\n/.exec(text)?.[1] ?? '';
  const parts = text.split(`--${boundary}`).slice(1, -1).map((p) => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
  return { meta: JSON.parse(parts[0] ?? '{}') as { name: string; parents: string[] }, content: parts[1] ?? '' };
}

function wireFile(f: DriveFile, trashed: boolean): Record<string, unknown> {
  return {
    kind: 'drive#file',
    id: f.id,
    name: f.name,
    mimeType: f.folder ? FOLDER : f.name.endsWith('.md') ? 'text/markdown' : 'text/plain',
    parents: f.parents,
    modifiedTime: f.modifiedTime,
    createdTime: f.createdTime,
    ...(f.size !== undefined && !f.folder ? { size: String(f.size) } : {}),
    ...(f.appProperties ? { appProperties: f.appProperties } : {}),
    trashed,
  };
}

const driveFailure = (code: number, reason: string): Record<string, unknown> => ({ error: { code, message: reason, errors: [{ domain: 'global', reason, message: reason }] } });

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } });
