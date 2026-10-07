import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { BowerError } from '../../src/data/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { RunnerDrive } from '../src/drive';
import { main } from '../src/main';
import { BASE_MS, backoff } from '../src/retry';
import { RunnerStatus } from '../src/status';
import { RunnerToken } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Settled<T> = { ok: T } | { error: unknown };
const settle = <T>(p: Promise<T>): Promise<Settled<T>> => p.then((ok) => ({ ok }), (error: unknown) => ({ error }));

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const grantBody = { accessToken: 'drive-token', expiresAt: AT + 3_600_000, folderId: 'FOLDER_ID', attempt: 1 };

/** A fetch that answers with each of `answers` in turn (a function throws, as fetch does with no network). */
function scripted(answers: Array<() => Response>): { fetch: typeof fetch; calls: () => number } {
  let n = 0;
  const fetchFn = (async () => {
    const answer = answers[Math.min(n, answers.length - 1)];
    n++;
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  }) as typeof fetch;
  return { fetch: fetchFn, calls: () => n };
}

const offline = (): Response => {
  throw new TypeError('fetch failed');
};

/** Alex's folder on a pretend Drive v3: two loose things the scripted plan files into folders it makes. */
async function wired(): Promise<{ wire: DriveV3; root: string }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
  const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
  await drive.createFolder(sys, 'changes');
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  await drive.createText(inbox, 'Payslip_Aug.pdf', '%PDF payslip', { pile: 'p-payslip' });
  await drive.createText(inbox, 'Dentist reminder.pdf', '%PDF dentist', { pile: 'p-dentist' });
  const pile = (await drive.createFolder(inbox, 'Flat photos', { pile: 'p-photos' })).id;
  await drive.createText(pile, PILE_NOTE, 'The kitchen at the viewing.\n');
  await drive.createText(pile, 'IMG_2301.jpg', 'made-up photo bytes');
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
  const wire = driveV3(drive);
  wire.folderId = root;
  wire.manifest = admitted.manifest;
  return { wire, root };
}

async function eventFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bower-runner-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: RUN_ID, attempt: 1, ticket: TICKET, scope: 'all', allow_web: false } }));
  return file;
}

function pathOf(listing: readonly DriveFile[], root: string, id: string): string | null {
  const byId = new Map(listing.map((f) => [f.id, f]));
  const parts: string[] = [];
  for (let f = byId.get(id); f; f = byId.get(f.parents[0] ?? '')) {
    parts.unshift(f.name);
    if (f.parents[0] === root) return parts.join('/');
  }
  return null;
}

/** The first move (a metadata PATCH that is not a Bin) meets `fault`; every PATCH of that file is counted. */
function onFirstMove(wire: DriveV3, fault: (next: () => Promise<Response>) => Promise<Response>): { fetch: typeof fetch; target: () => string | null; sends: () => number } {
  let target: string | null = null;
  let sends = 0;
  const fetchFn = (async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const id = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1] ?? null;
    if (method === 'PATCH' && id && !String(init.body).includes('"trashed"')) {
      if (target === null) target = id;
      if (id === target) {
        sends++;
        if (sends === 1) return fault(() => wire.fetch(input, init));
      }
    }
    return wire.fetch(input, init);
  }) as typeof fetch;
  return { fetch: fetchFn, target: () => target, sends: () => sends };
}

describe('runner network retry', () => {
  it('a network error on an idempotent runner call is retried with backoff', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backoff.baseMs = BASE_MS;
    vi.useFakeTimers();
    // Full jitter takes a random share of each cap; half, here, so the waits are known.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    // The token: fails twice, then answers; each wait is longer than the one before.
    const token = scripted([offline, offline, () => json(200, grantBody)]);
    const granted = settle(new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: token.fetch }).grant());
    await vi.advanceTimersByTimeAsync(0);
    expect(token.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(token.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(token.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(token.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(token.calls()).toBe(3);
    expect(await granted).toEqual({ ok: { ...grantBody, manifest: null } });

    // A fourth failure gives up: four sends, then the offline sentence.
    const down = scripted([offline]);
    const gaveUp = settle(new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: down.fetch }).grant());
    await vi.runAllTimersAsync();
    expect(down.calls()).toBe(4);
    const end = await gaveUp;
    expect('error' in end && end.error instanceof BowerError && end.error.code).toBe('offline');

    // The status report: a 503 and a 429 are retried too.
    const report = scripted([() => json(503, {}), () => json(429, {}), () => json(200, { run: { id: RUN_ID, phase: 'writing' }, revision: 1 })]);
    const posted = settle(new RunnerStatus({ api: API, runId: RUN_ID, ticket: TICKET, attempt: 1, fetch: report.fetch }).post('writing'));
    await vi.runAllTimersAsync();
    expect(report.calls()).toBe(3);
    expect(await posted).toEqual({ ok: undefined });

    // A 4xx answer is never retried: a stale attempt, and a refused ticket.
    const stale = scripted([() => json(409, { error: { code: 'stale-attempt' } })]);
    const staleEnd = settle(new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: stale.fetch }).grant());
    await vi.runAllTimersAsync();
    expect(stale.calls()).toBe(1);
    expect('error' in (await staleEnd)).toBe(true);
    const signedOut = scripted([() => json(401, { error: { code: 'signed-out' } })]);
    const signedOutEnd = settle(new RunnerStatus({ api: API, runId: RUN_ID, ticket: TICKET, attempt: 1, fetch: signedOut.fetch }).post('writing'));
    await vi.runAllTimersAsync();
    expect(signedOut.calls()).toBe(1);
    expect('error' in (await signedOutEnd)).toBe(true);

    // DriveHttp bounds each request at 30 s (src/data/wait.ts), so a read is given the retries' own waits (7 s at most),
    // never `runAllTimersAsync`, which would also run that bound out before the first failure is even retried.
    const RETRY_WAITS_MS = 10_000;
    // Drive reads: a listing, a file's metadata and its bytes, each failing twice on the network first.
    const drive = fixedDrive();
    const folder = await drive.createFolder('root', 'Bower');
    const note = await drive.createText(folder.id, 'Note.md', 'First words.');
    const wire = driveV3(drive);
    let failures = 0;
    const flaky = (async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://www.googleapis.com') && failures++ % 3 < 2) throw new TypeError('fetch failed');
      return wire.fetch(input, init);
    }) as typeof fetch;
    const adapter = new RunnerDrive({ token: new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch }), attempt: 1, fetch: flaky });
    const listed = settle(adapter.list(folder.id));
    await vi.advanceTimersByTimeAsync(RETRY_WAITS_MS);
    expect(await listed).toEqual({ ok: [expect.objectContaining({ id: note.id })] });
    const got = settle(adapter.get(note.id));
    await vi.advanceTimersByTimeAsync(RETRY_WAITS_MS);
    expect(await got).toEqual({ ok: expect.objectContaining({ id: note.id }) });
    const text = settle(adapter.readText(note.id));
    await vi.advanceTimersByTimeAsync(RETRY_WAITS_MS);
    expect(await text).toEqual({ ok: 'First words.' });
    expect(failures).toBe(9);
  });

  it('a network error on a Drive write is reconciled by read-back, never retried blindly', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = async (fault: (next: () => Promise<Response>) => Promise<Response>) => {
      const { wire, root } = await wired();
      const hooked = onFirstMove(wire, fault);
      const code = await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile() }, { fetch: hooked.fetch });
      const id = hooked.target() ?? '';
      return { code, wire, path: pathOf(await wire.drive.listAll(root), root, id), sends: hooked.sends(), id };
    };

    // The move landed and its answer was lost: read back, it counts as done.
    const landed = await run(async (next) => {
      await next();
      throw new TypeError('fetch failed');
    });
    expect(landed.id).not.toBe('');
    expect(landed.sends).toBe(1);
    expect(landed.code).toBe(0);
    expect(landed.wire.statuses.at(-1)?.phase).toBe('done');
    expect(landed.path?.startsWith('Inbox/')).toBe(false);

    // The move never reached Drive: read back, it is not done, and the thing stays where it was.
    const lost = await run(async () => {
      throw new TypeError('fetch failed');
    });
    expect(lost.sends).toBe(1);
    expect(lost.code).toBe(0);
    expect(lost.wire.statuses.at(-1)?.phase).toBe('done');
    expect(lost.path?.startsWith('Inbox/')).toBe(true);

    // A 5xx answer to a write may still have landed: read back too, never sent again.
    const failedOnGoogle = await run(async (next) => {
      await next();
      return json(503, { error: { code: 503, message: 'Backend error', errors: [{ reason: 'backendError' }] } });
    });
    expect(failedOnGoogle.sends).toBe(1);
    expect(failedOnGoogle.code).toBe(0);
    expect(failedOnGoogle.wire.statuses.at(-1)?.phase).toBe('done');
    expect(failedOnGoogle.path?.startsWith('Inbox/')).toBe(false);
  });

  it('an attempt that ends without a terminal report exits non-zero', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { wire } = await wired();
    // A write Drive refuses for a reason nobody can read back: the run stops in saving, for a redispatch to finish.
    const hooked = onFirstMove(wire, async () => json(400, { error: { code: 400, message: 'Bad request', errors: [{ reason: 'badRequest' }] } }));
    const code = await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile() }, { fetch: hooked.fetch });
    expect(wire.statuses.map((s) => s.phase)).not.toContain('done');
    expect(wire.statuses.map((s) => s.phase)).not.toContain('failed');
    expect(code).not.toBe(0);
  });
});
