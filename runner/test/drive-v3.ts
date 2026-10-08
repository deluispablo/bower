/**
 * A fake `fetch` that answers as Drive v3 and the Worker's token route do,
 * over a `FakeDrive` that holds the stored files. No network: the runner's
 * adapter talks to this in tests.
 */
import { createHash } from 'node:crypto';
import { BowerError } from '../../src/data/types';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { FakeDrive } from '../../src/data/drive/fake-drive';
import type { AdmissionManifest } from '../../src/data/spine/admission';

export const API = 'https://api.test';
export const RUN_ID = 'abc123-run1';
export const TICKET = 'test-ticket';
const FOLDER = 'application/vnd.google-apps.folder';
/** Drive pages a listing; this one pages by two so paging is exercised. */
/** Raised to Drive's own 1000 by the overhead test, whose call counts are the real ones. */
export const paging = { size: 2 };

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
  /** When set, the token and attempt routes answer this instead. */
  tokenRefusal: { status: number; error: string } | null;
  tokenCalls: number;
  /** Calls to the attempt route (`GET /runner/runs/:id/attempt`), which never hands out a token. */
  attemptCalls: number;
  now: number;
  /** The folder and the admission manifest the token route gives. */
  folderId: string;
  manifest: AdmissionManifest | null;
  /** Each status report accepted, with how many Drive requests came before it. */
  statuses: StatusPost[];
  /** When set, a `done` report is answered with this status and not taken (a lost report). */
  dropDone: number | null;
  /** When set, every `done` report is answered `stale-report` (a Worker that refuses it). */
  refuseDone: boolean;
  /** Whether a create's answer carries the checksums its `fields` ask for, as Drive's does; off, it carries none. */
  checksums: boolean;
  /**
   * Google access revoked: Drive refuses every token handed out (401), and the Worker's token route, finding the refresh
   * token refused, answers 410 `gone`; from then on the attempt route does too, as the Worker's person object does.
   */
  revoked: boolean;
}

export interface StatusPost {
  attempt: number;
  seq: number;
  phase: string;
  total?: number;
  failure?: string;
  /** Drive requests before this report. */
  after: number;
}

const RANK: Record<string, number> = { queued: 0, reading: 1, writing: 2, saving: 3, done: 4, failed: 4 };

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
    attemptCalls: 0,
    now: 1_000_000,
    folderId: 'FOLDER_ID',
    manifest: null,
    statuses: [],
    dropDone: null,
    refuseDone: false,
    revoked: false,
    checksums: true,
    fetch: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = (init.method ?? 'GET').toUpperCase();
      const auth = new Headers(init.headers).get('authorization') ?? '';
      if (url.origin === API) {
        if (url.pathname === `/runner/runs/${RUN_ID}/status` && method === 'POST') {
          if (auth !== `Bearer ${TICKET}`) return json(401, { error: { code: 'signed-out', message: 'Sign in again to keep going.' } });
          return status(wire, JSON.parse(String(init.body)) as Omit<StatusPost, 'after'>);
        }
        const route = method === 'GET' ? /^\/runner\/runs\/([^/]+)\/(token|attempt)$/.exec(url.pathname) : null;
        if (route?.[2] === 'attempt') wire.attemptCalls++;
        else wire.tokenCalls++;
        if (route?.[1] !== RUN_ID) return json(404, { error: { code: 'not-found', message: 'Not found.' } });
        if (auth !== `Bearer ${TICKET}`) return json(401, { error: { code: 'signed-out', message: 'Sign in again to keep going.' } });
        if (wire.revoked && route[2] === 'token') wire.tokenRefusal = { status: 410, error: 'gone' };
        if (wire.tokenRefusal) return json(wire.tokenRefusal.status, { error: { code: wire.tokenRefusal.error, message: 'This tidy-up was taken over.' } });
        // The attempt route answers from the person object alone: the attempt, no token.
        if (route[2] === 'attempt') return json(200, { attempt: wire.attempt });
        const accessToken = `drive-token-${++minted}`;
        live.add(accessToken);
        return json(200, { accessToken, expiresAt: wire.now + 3_600_000, folderId: wire.folderId, attempt: wire.attempt, ...(wire.manifest ? { manifest: wire.manifest } : {}) });
      }
      wire.requests.push({ method, url });
      if (url.origin !== 'https://www.googleapis.com') return json(404, driveFailure(404, 'notFound'));
      if (wire.revoked || !live.has(auth.replace(/^Bearer /, ''))) return json(401, driveFailure(401, 'authError'));
      try {
        return await answer(wire, method, url, init.body ?? null);
      } catch (e) {
        if (e instanceof BowerError && e.code === 'not-found') return json(404, driveFailure(404, 'notFound'));
        throw e;
      }
    },
  };
  return wire;
}

/** The Worker's status route, as the contract's "Runner wire" has it: attempt, then seq, then a forward phase. */
function status(wire: DriveV3, body: Omit<StatusPost, 'after'>): Response {
  if (body.phase === 'done' && wire.dropDone !== null) return json(wire.dropDone, { error: { code: 'unknown', message: 'Try again.' } });
  if (body.attempt !== wire.attempt) return json(409, { error: { code: 'stale-attempt', message: 'This tidy-up was taken over.' } });
  const last = wire.statuses.at(-1);
  const same = last?.attempt === body.attempt;
  const backward = last !== undefined && (RANK[body.phase] ?? -1) < (RANK[last.phase] ?? -1);
  const refused = body.phase === 'done' && wire.refuseDone;
  if ((same && body.seq <= last.seq) || backward || last?.phase === 'done' || last?.phase === 'failed' || refused) {
    // The Worker's current seq (of this attempt) and phase, so a restarted runner can go on from there.
    const current = { seq: last && same ? last.seq : 0, phase: last?.phase ?? 'queued' };
    return json(409, { error: { code: 'stale-report', message: 'That update arrived late.' }, current });
  }
  wire.statuses.push({ ...body, after: wire.requests.length });
  return json(200, { run: { id: RUN_ID, phase: body.phase }, revision: wire.statuses.length });
}

async function answer(wire: DriveV3, method: string, url: URL, body: RequestInit["body"]): Promise<Response> {
  const drive = wire.drive;
  const path = url.pathname;
  const one = /^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(path);
  if (method === 'GET' && path === '/drive/v3/files') return list(drive, url);
  if (method === 'GET' && one) {
    const id = decodeURIComponent(one[2] ?? '');
    if (url.searchParams.get('alt') === 'media') return new Response((await drive.readBytes(id)).slice());
    const stored = await drive.evidence(id);
    if (!stored) return json(404, driveFailure(404, 'notFound'));
    // Drive keeps a stored file's SHA-256 and gives it when asked for (`sha256Checksum`).
    const sha = stored.content && (url.searchParams.get('fields') ?? '').includes('sha256Checksum') ? { sha256Checksum: stored.content.sha256 } : {};
    // Drive gives `size` in bytes (https://developers.google.com/drive/api/reference/rest/v3/files), not UTF-16 units.
    const size = stored.content && !stored.file.folder ? { size: String(stored.content.size) } : {};
    return json(200, { ...wireFile(stored.file, stored.trashed), ...size, ...sha });
  }
  if (method === 'POST' && path === '/drive/v3/files') {
    const meta = JSON.parse(await new Response(body).text()) as { name: string; mimeType?: string; parents: string[]; appProperties?: Record<string, string> };
    if (meta.mimeType !== FOLDER) return json(400, driveFailure(400, 'badRequest'));
    return json(200, wireFile(await drive.createFolder(meta.parents[0] ?? '', meta.name, meta.appProperties), false));
  }
  if (method === 'POST' && path === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'multipart') {
    const { meta, content } = await multipart(body);
    const made = await drive.createText(meta.parents[0] ?? '', meta.name, content, meta.appProperties);
    // Drive's answer to a create carries the stored content's checksums when `fields` names them
    // (https://developers.google.com/drive/api/reference/rest/v3/files: md5Checksum, sha256Checksum).
    const fields = url.searchParams.get('fields') ?? '';
    const bytes = await drive.readBytes(made.id);
    const sums = wire.checksums
      ? {
          ...(fields.includes('md5Checksum') ? { md5Checksum: createHash('md5').update(bytes).digest('hex') } : {}),
          ...(fields.includes('sha256Checksum') ? { sha256Checksum: createHash('sha256').update(bytes).digest('hex') } : {}),
        }
      : {};
    return json(200, { ...wireFile(made, false), ...sums });
  }
  if (method === 'PATCH' && one?.[1] && url.searchParams.get('uploadType') === 'multipart') {
    // Metadata and content in one files.update (the run's stamp with its write).
    const id = decodeURIComponent(one[2] ?? '');
    const { meta, content } = await multipart(body);
    const stored = await drive.get(id);
    return json(200, await withSums(wire, url, await drive.writeText(id, content, stored.modifiedTime, meta.appProperties), false));
  }
  if (method === 'PATCH' && one?.[1] && url.searchParams.get('uploadType') === 'media') {
    const id = decodeURIComponent(one[2] ?? '');
    // Drive v3 takes no precondition on a content update: it writes over whatever is there.
    const stored = await drive.get(id);
    return json(200, await withSums(wire, url, await drive.writeText(id, await new Response(body).text(), stored.modifiedTime), false));
  }
  if (method === 'PATCH' && one && !one[1]) {
    const id = decodeURIComponent(one[2] ?? '');
    const patch = JSON.parse(await new Response(body).text()) as { name?: string; appProperties?: Record<string, string>; trashed?: boolean };
    if (patch.trashed === true) {
      await drive.trash(id, patch.appProperties);
      const stored = await drive.evidence(id);
      return stored ? json(200, await withSums(wire, url, stored.file, true)) : json(404, driveFailure(404, 'notFound'));
    }
    const addParent = url.searchParams.get('addParents');
    const removeParent = url.searchParams.get('removeParents');
    const file = await drive.update(id, {
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.appProperties ? { appProperties: patch.appProperties } : {}),
      ...(addParent ? { addParent } : {}),
      ...(removeParent ? { removeParent } : {}),
    });
    return json(200, await withSums(wire, url, file, false));
  }
  return json(400, driveFailure(400, 'badRequest'));
}

/** An update's answer, carrying the stored content's checksums when `fields` names them, as Drive's does (`files.update`). */
async function withSums(wire: DriveV3, url: URL, file: DriveFile, trashed: boolean): Promise<Record<string, unknown>> {
  const fields = url.searchParams.get('fields') ?? '';
  if (!wire.checksums || file.folder || !(fields.includes('md5Checksum') || fields.includes('sha256Checksum'))) return wireFile(file, trashed);
  // A file in the Bin is no longer read as live bytes here; its answer then carries no checksums.
  const bytes = await wire.drive.readBytes(file.id).catch(() => null);
  if (!bytes) return wireFile(file, trashed);
  return {
    ...wireFile(file, trashed),
    size: String(bytes.byteLength),
    ...(fields.includes('md5Checksum') ? { md5Checksum: createHash('md5').update(bytes).digest('hex') } : {}),
    ...(fields.includes('sha256Checksum') ? { sha256Checksum: createHash('sha256').update(bytes).digest('hex') } : {}),
  };
}

async function list(drive: FakeDrive, url: URL): Promise<Response> {
  const q = url.searchParams.get('q') ?? '';
  const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1] ?? '');
  // A run's stamp, looked for anywhere, in the Bin or not.
  const has = /^appProperties has \{ key='([^']+)' and value='([^']+)' \}$/.exec(q);
  if (has) {
    const data = JSON.parse(await drive.snapshot()) as { files: Array<{ meta: DriveFile; trashed: boolean }> };
    const files = data.files.filter((f) => f.meta.appProperties?.[has[1] ?? ''] === has[2]);
    return json(200, { kind: 'drive#fileList', files: files.map((f) => wireFile(f.meta, f.trashed)) });
  }
  if (!parents.length || !/trashed = false/.test(q)) return json(400, driveFailure(400, 'invalidQuery'));
  const all: DriveFile[] = [];
  for (const parent of parents) all.push(...(await drive.listAll(parent)).filter((f) => f.parents[0] === parent));
  const size = Math.min(paging.size, Number(url.searchParams.get('pageSize') ?? paging.size));
  const at = Number(url.searchParams.get('pageToken') || 0);
  const page = all.slice(at, at + size);
  const next = at + size < all.length ? { nextPageToken: String(at + size) } : {};
  // Drive gives a listed file's SHA-256 when `fields` names it (`files.list` with `files(sha256Checksum)`).
  const withSha = (url.searchParams.get('fields') ?? '').includes('sha256Checksum');
  // And its MD5 when `fields` names `md5Checksum` (TL-P4-10), of the bytes it stores.
  const withMd5 = (url.searchParams.get('fields') ?? '').includes('md5Checksum');
  const files = await Promise.all(page.map(async (f) => {
    const content = withSha && !f.folder ? (await drive.evidence(f.id))?.content : null;
    const md5 = withMd5 && !f.folder ? await drive.readBytes(f.id).then((b) => createHash('md5').update(b).digest('hex'), () => null) : null;
    // `size` is in bytes, as a file's own answer gives it, and the checksum is of those bytes.
    return { ...wireFile(f, false), ...(content ? { size: String(content.size), sha256Checksum: content.sha256 } : {}), ...(md5 ? { md5Checksum: md5 } : {}) };
  }));
  return json(200, { kind: 'drive#fileList', files, ...next });
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
