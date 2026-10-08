/**
 * One Drive transport for the app, the runner and the Worker (c2-drive-transport, TL-P4-16 addendum 4). The live
 * evidence (smoke-runner-offline): one `alt=media` GET connected and never answered; the 30 s bound ended the whole
 * runner retry, which never sent the read again, and the run stopped as "You're offline" (reads = 30 900 ms).
 * Each of the note's six sites is a case here: a request whose first send never settles is sent again inside the
 * budget, and the run's errors are never worded as "offline".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BowerError } from '../types';
import { DriveHttp } from './drive-http';
import { DRIVE_MESSAGES } from './drive-api';
import { RunnerDrive } from '../../../runner/src/drive';
import { RunnerToken } from '../../../runner/src/token';
import { RunnerStatus } from '../../../runner/src/status';
import { WorkerHttp } from '../worker/worker-http';

const API = 'https://api.example.com';
const RUN = 'run-1';
const TICKET = 'TICKET';
/** The total a stalled idempotent request may take: one 30 s bound, the backoff, and one more try. */
const BUDGET_MS = 60_000;
/** Far past any bound: a request still pending then has none. */
const LONG = 600_000;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const file = { id: 'FILE_ID', name: 'Note.md', mimeType: 'text/markdown', parents: ['FOLDER_ID'], modifiedTime: '2026-10-08T10:00:00.000Z', createdTime: '2026-10-08T09:00:00.000Z', size: '5' };
const grant = { accessToken: 'drive-token', expiresAt: Date.UTC(2030, 0, 1), folderId: 'FOLDER_ID', attempt: 1 };

/** A fetch whose first send connects and never answers (it ignores the signal, as a stalled socket may); then `answer`. */
function stallsOnce(answer: () => Response): { fetch: typeof fetch; sends: () => number } {
  let n = 0;
  const f = ((): Promise<Response> => (n++ === 0 ? new Promise<Response>(() => undefined) : Promise.resolve(answer()))) as unknown as typeof fetch;
  return { fetch: f, sends: () => n };
}

/** A fetch that never answers anything. */
const silent = ((): Promise<Response> => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
/** A fetch that fails at once, as with no network. */
const down = ((): Promise<Response> => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;

type Outcome<T> = { state: 'pending' } | { state: 'ok'; value: T } | { state: 'rejected'; error: unknown };

async function after<T>(p: Promise<T>, ms: number): Promise<Outcome<T>> {
  let out: Outcome<T> = { state: 'pending' };
  p.then(
    (value) => { out = { state: 'ok', value }; },
    (error: unknown) => { out = { state: 'rejected', error }; },
  );
  await vi.advanceTimersByTimeAsync(ms);
  return out;
}

const runnerToken = (fetchFn: typeof fetch = (async () => json(grant)) as typeof fetch): RunnerToken => new RunnerToken({ api: API, runId: RUN, ticket: TICKET, fetch: fetchFn });
const runnerDrive = (fetchFn: typeof fetch): RunnerDrive => new RunnerDrive({ token: runnerToken(), attempt: 1, fetch: fetchFn });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The note's six sites, each as a request that stalls once and then answers. */
const SITES: Array<{ site: string; answer: () => Response; run: (f: typeof fetch) => Promise<unknown>; expected: unknown }> = [
  { site: 'drive-http.ts call (a browser GET)', answer: () => new Response('First words.'), run: (f) => new DriveHttp({ token: async () => 'TOKEN', fetch: f }).readText('FILE_ID'), expected: 'First words.' },
  {
    site: 'drive-http.ts raw (a resumable status)',
    answer: () => new Response('', { status: 308, headers: { range: 'bytes=0-262143' } }),
    run: (f) => new DriveHttp({ token: async () => 'TOKEN', fetch: f }).sessionStatus('https://www.googleapis.com/upload/drive/v3/files?upload_id=SESSION', 1_000_000),
    expected: { kind: 'partial', confirmed: 262144 },
  },
  { site: 'runner drive.ts hooked (a content read)', answer: () => new Response('{"v":1}'), run: (f) => runnerDrive(f).readText('FILE_ID'), expected: '{"v":1}' },
  { site: 'runner drive.ts read (a listing)', answer: () => json({ files: [file] }), run: (f) => runnerDrive(f).list('FOLDER_ID'), expected: [expect.objectContaining({ id: 'FILE_ID' })] },
  { site: 'runner token.ts (the token route)', answer: () => json(grant), run: (f) => runnerToken(f).grant(), expected: expect.objectContaining({ accessToken: 'drive-token' }) },
  { site: 'runner status.ts (a status report)', answer: () => json({ ok: true }), run: (f) => new RunnerStatus({ api: API, runId: RUN, ticket: TICKET, attempt: 1, fetch: f }).post('writing'), expected: undefined },
];

describe('the Drive transport', () => {
  it('one Drive transport retries a stalled read inside its budget', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const { site, answer, run, expected } of SITES) {
      vi.useFakeTimers();
      const net = stallsOnce(answer);
      const outcome = await after(run(net.fetch), BUDGET_MS);
      expect(outcome, site).toEqual({ state: 'ok', value: expected });
      expect(net.sends(), site).toBe(2);
      vi.useRealTimers();
    }
  });

  it('a runner Drive error is never called offline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cases: Array<{ site: string; run: () => Promise<unknown> }> = [
      { site: 'a content read that never answers', run: () => runnerDrive(silent).readText('FILE_ID') },
      { site: 'a listing with no network', run: () => runnerDrive(down).list('FOLDER_ID') },
      { site: 'a listing that never answers', run: () => runnerDrive(silent).list('FOLDER_ID') },
      { site: 'the token route with no network', run: () => runnerToken(down).grant() },
      { site: 'a status report that never answers', run: () => new RunnerStatus({ api: API, runId: RUN, ticket: TICKET, attempt: 1, fetch: silent }).post('writing') },
    ];
    for (const { site, run } of cases) {
      vi.useFakeTimers();
      const outcome = await after(run(), LONG);
      expect(outcome.state, site).toBe('rejected');
      const error = (outcome as { error: unknown }).error;
      expect(error, site).toBeInstanceOf(BowerError);
      expect((error as BowerError).code, site).not.toBe('offline');
      expect((error as BowerError).message, site).not.toBe(DRIVE_MESSAGES.offline);
      vi.useRealTimers();
    }
  });

  it('a stalled write or chunk is sent once; the write is unconfirmed, the chunk offline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();
    const sends: string[] = [];
    const stalls = ((_: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      sends.push(init?.method ?? 'GET');
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;
    const drive = new DriveHttp({ token: async () => 'TOKEN', fetch: stalls });
    const moved = await after(drive.update('FILE_ID', { name: 'Lemon cake.md' }), LONG);
    expect(moved).toMatchObject({ state: 'rejected', error: { code: 'unknown', message: "Bower couldn't confirm that change. Refresh to check." } });
    expect(sends).toEqual(['PATCH']);
    sends.length = 0;
    const chunk = await after(drive.putChunk('https://www.googleapis.com/upload/drive/v3/files?upload_id=SESSION', 0, new Blob(['x']), 1), LONG);
    expect(chunk).toMatchObject({ state: 'rejected', error: { code: 'offline' } });
    expect(sends).toEqual(['PUT']);
  });

  it('a 4 MiB upload on a slow link is not cut at 60 s', async () => {
    // P4-25: a photo whose answer comes after 90 s (about 47 KB/s) once landed; a 60 s read budget must not drop it.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();
    let sends = 0;
    const slow = ((): Promise<Response> => {
      sends += 1;
      return new Promise<Response>((resolve) => setTimeout(() => resolve(json({ ...file, id: 'F1', name: 'Photo.jpg' })), 90_000));
    }) as unknown as typeof fetch;
    const drive = new DriveHttp({ token: async () => 'TOKEN', fetch: slow });
    const outcome = await after(drive.upload('FOLDER_ID', 'Photo.jpg', new Blob([new Uint8Array(4 * 1024 * 1024)])), 100_000);
    expect(outcome).toMatchObject({ state: 'ok', value: { id: 'F1' } });
    expect(sends).toBe(1);
  });

  it('a stalled Worker call in the browser stays offline and is sent once', async () => {
    vi.useFakeTimers();
    let sends = 0;
    const stalls = ((): Promise<Response> => (sends++, new Promise<Response>(() => undefined))) as unknown as typeof fetch;
    const outcome = await after(new WorkerHttp(API, stalls).process('all'), LONG);
    expect(outcome).toMatchObject({ state: 'rejected', error: { code: 'offline' } });
    expect(sends).toBe(1);
  });
});
