import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { QUEUED_STALE_MS, RUNNING_STALE_MS, STALE_FAILURE } from '../src/process.js';
import type { RunWire } from '../../src/data/contracts/run-wire.js';
import type { AdmitInput, RunReply } from '../src/process.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';
import { hashTicket } from '../src/run-ticket.js';
import type { Person } from '../src/person.js';
import type { AdmissionManifest } from '../../src/data/spine/admission.js';
import { MANIFEST, driveFolder, withThingsIn, type DriveFolder } from './drive-v3.js';
import { dispatchOf, pretendGitHubForFile } from './github-support.js';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const APP = 'https://app.example.com';
const EMAIL = 'you@example.com';

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

/** The GitHub every alarm of this file reaches: presses admit at the wall clock, and the runtime fires the alarm. */
const gh = pretendGitHubForFile(env);

async function someone(): Promise<{ sub: string; cookie: string }> {
  const sub = `process-sub-${crypto.randomUUID()}`;
  await kv.put(allowKey(EMAIL), '1');
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  const token = await signSession({ sub, gen: generation }, env.SESSION_SECRET);
  return { sub, cookie: `${SESSION_COOKIE}=${token}` };
}

/** A signed-in person holding the lease at `laptop`, and the headers that carry it. */
async function holder(): Promise<{ sub: string; cookie: string; fence: Record<string, string> }> {
  const who = await someone();
  const epoch = (await person(who.sub).session('laptop', 'check', 0, Date.now())).epoch;
  return { ...who, fence: { 'x-bower-place': 'laptop', 'x-bower-epoch': String(epoch) } };
}

/** The Drive the routes read: the last folder `withThings` gave someone. */
let wire: DriveFolder | null = null;

/** A holder whose folder has a thing in the inbox and one of your changes, read with a cached Drive token. */
async function withThings(): Promise<{ sub: string; cookie: string; fence: Record<string, string> }> {
  const who = await holder();
  wire = await driveFolder();
  await withThingsIn(wire);
  await person(who.sub).pointFolder((await person(who.sub).account())?.generation ?? -1, null, wire.root);
  await person(who.sub).cacheDriveToken({ accessToken: 'access-cached', expiresAt: Date.now() + 3600_000 });
  return who;
}

async function post(cookie: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return await createApp(wire ? { fetchImpl: wire.fetchImpl } : {}).request(
    `${APP}/process`,
    {
      method: 'POST',
      headers: { cookie, origin: APP, 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  );
}

async function status(cookie: string): Promise<RunReply> {
  const r = await createApp().request(`${APP}/status`, { headers: { cookie } }, env);
  expect(r.status).toBe(200);
  return (await r.json()) as RunReply;
}

// Far ahead of the wall clock, so a stale alarm set from it never fires during a test.
const T0 = Date.UTC(2036, 9, 7, 9, 0, 0);
const ask = (requestId: string, now: number, more: Partial<AdmitInput> = {}): AdmitInput => ({
  scope: 'all',
  allowWeb: false,
  requestId,
  now,
  // Each test signs in a new person: the first account.
  accountEpoch: 0,
  dailyLimit: 100,
  manifest: MANIFEST,
  ...more,
});

/** Admits and expects a run back. */
async function admitted(sub: string, input: AdmitInput): Promise<{ run: RunWire; revision: number }> {
  const result = await person(sub).admit(input);
  expect(result).toMatchObject({ admitted: true });
  if (!result.admitted) throw new Error('unreachable');
  return { run: result.run, revision: result.revision };
}

/** Ends the current run as a runner report will, for the tests (no runner writes yet). */
async function finish(sub: string, runId: string): Promise<void> {
  await runInDurableObject(person(sub), (_instance, state) => {
    state.storage.sql.exec("UPDATE runs SET phase = 'done', finished_at = phase_at WHERE id = ?", runId);
  });
}

describe('POST /process', () => {
  it('process needs the session epoch', async () => {
    const { cookie, fence } = await withThings();
    const body = { scope: 'all', allowWeb: false, requestId: 'press-1' };
    // No place or epoch, a wrong epoch, another place: refused as another window.
    for (const headers of [{}, { ...fence, 'x-bower-epoch': '99' }, { ...fence, 'x-bower-place': 'phone' }]) {
      const r = await post(cookie, body, headers);
      expect(r.status).toBe(409);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe('stale-session');
    }
    // No session, or another origin.
    expect((await post('', body, fence)).status).toBe(401);
    expect((await post(cookie, body, { ...fence, origin: 'https://evil.example.com' })).status).toBe(403);
    // The holder's epoch admits.
    const ok = await post(cookie, body, fence);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as RunReply).run?.phase).toBe('queued');
  });

  it('a process body that fails validation answers 415', async () => {
    const { cookie, fence } = await withThings();
    const bad: unknown[] = [
      'not json',
      [],
      { allowWeb: false },
      { scope: 'everything', allowWeb: false },
      { scope: 'all' },
      { scope: 'all', allowWeb: 'yes' },
      { scope: 'all', allowWeb: false, requestId: '' },
      { scope: 'all', allowWeb: false, requestId: 'Upper-Case' },
      { scope: 'all', allowWeb: false, requestId: 'has space' },
      { scope: 'all', allowWeb: false, requestId: 'a'.repeat(65) },
      { scope: 'all', allowWeb: false, requestId: 7 },
    ];
    for (const body of bad) {
      const r = await post(cookie, body, fence);
      expect(r.status, JSON.stringify(body)).toBe(415);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe('unsupported-media-type');
    }
    // A missing requestId counts as new; a 64-character one fits.
    expect((await post(cookie, { scope: 'instructions', allowWeb: true }, fence)).status).toBe(200);
    expect((await post(cookie, { scope: 'all', allowWeb: false, requestId: 'a'.repeat(64) }, fence)).status).toBe(200);
  });

  it("an answer's run names its subject only with scope all, as a Drive or pile id", async () => {
    const { cookie, fence } = await withThings();
    const bad: unknown[] = [
      { scope: 'instructions', allowWeb: false, requestId: 'answer-1', subject: 'file-1' },
      { scope: 'all', allowWeb: false, requestId: 'answer-1', subject: '' },
      { scope: 'all', allowWeb: false, requestId: 'answer-1', subject: 'has space' },
      { scope: 'all', allowWeb: false, requestId: 'answer-1', subject: '../up' },
      { scope: 'all', allowWeb: false, requestId: 'answer-1', subject: 'a'.repeat(129) },
      { scope: 'all', allowWeb: false, requestId: 'answer-1', subject: 7 },
    ];
    for (const body of bad) expect((await post(cookie, body, fence)).status, JSON.stringify(body)).toBe(415);
    const ok = await post(cookie, { scope: 'all', allowWeb: false, requestId: 'answer-1', subject: 'File_ID-1' }, fence);
    expect(ok.status).toBe(200);
  });

  it("an answer's run asked twice counts once in the daily quota", async () => {
    const { sub, cookie, fence } = await withThings();
    const body = { scope: 'all', allowWeb: false, requestId: 'answer-twice', subject: 'File_ID-1' };
    const first = (await (await post(cookie, body, fence)).json()) as RunReply;
    const again = (await (await post(cookie, body, fence)).json()) as RunReply;
    expect(again.run?.id).toBe(first.run?.id);
    const quota = await runInDurableObject(person(sub), (_instance, state) => state.storage.sql.exec('SELECT counter FROM quota').toArray());
    expect(quota).toEqual([{ counter: 1 }]);
  });

  it('process and status answer the revision', async () => {
    const { cookie, fence } = await withThings();
    expect(await status(cookie)).toEqual({ run: null, revision: 0 });
    const r = await post(cookie, { scope: 'instructions', allowWeb: true, requestId: crypto.randomUUID() }, fence);
    expect(r.status).toBe(200);
    const admittedReply = (await r.json()) as RunReply;
    expect(admittedReply.revision).toBe(1);
    expect(admittedReply.run).toMatchObject({ scope: 'instructions', phase: 'queued' });
    expect(admittedReply.run?.requestedAt).toBe(admittedReply.run?.phaseAt);
    expect(Object.keys(admittedReply.run ?? {}).sort()).toEqual(['id', 'phase', 'phaseAt', 'requestedAt', 'scope']);
    // Status answers the same run and revision; nothing changed, so nothing rose.
    expect(await status(cookie)).toEqual(admittedReply);
    expect(await status(cookie)).toEqual(admittedReply);
  });
});

describe('admission in the person object', () => {
  it('admission is idempotent by requestId', async () => {
    const { sub } = await someone();
    const first = await admitted(sub, ask('press-1', T0, { scope: 'instructions', allowWeb: true }));
    expect(first.run).toMatchObject({ scope: 'instructions', phase: 'queued', requestedAt: T0, phaseAt: T0 });
    expect(first.revision).toBe(1);
    // The same requestId again: the same run, the first scope kept, nothing counted or raised.
    const again = await admitted(sub, ask('press-1', T0 + 1_000, { scope: 'all', allowWeb: false }));
    expect(again).toEqual(first);
    const stored = await runInDurableObject(person(sub), (_instance, state) =>
      state.storage.sql.exec<{ allow_web: number; scope: string }>('SELECT allow_web, scope FROM runs').toArray(),
    );
    expect(stored).toEqual([{ allow_web: 1, scope: 'instructions' }]);
    // After it ended and another run began, the first requestId still answers its own run.
    await finish(sub, first.run.id);
    const second = await admitted(sub, ask('press-2', T0 + 2_000));
    expect(second.run.id).not.toBe(first.run.id);
    const late = await admitted(sub, ask('press-1', T0 + 3_000));
    expect(late.run.id).toBe(first.run.id);
    expect(late.run.phase).toBe('done');
    expect(late.revision).toBe(second.revision);
    const counted = await runInDurableObject(person(sub), (_instance, state) =>
      state.storage.sql.exec<{ counter: number }>('SELECT counter FROM quota WHERE window = ?', '2036-10-07').one().counter,
    );
    expect(counted).toBe(2);
  });

  it('one active run per person', async () => {
    const { sub } = await someone();
    const first = await admitted(sub, ask('press-1', T0));
    // A new press while it is going returns the run going, with no count and no change.
    const other = await admitted(sub, ask('press-2', T0 + 60_000, { scope: 'instructions' }));
    expect(other).toEqual(first);
    // Also once it is reading.
    await runInDurableObject(person(sub), (_instance, state) => {
      state.storage.sql.exec("UPDATE runs SET phase = 'reading', phase_at = ? WHERE id = ?", T0 + 1_000, first.run.id);
    });
    const reading = await admitted(sub, ask('press-3', T0 + 120_000));
    expect(reading.run).toMatchObject({ id: first.run.id, phase: 'reading' });
    const rows = await runInDurableObject(person(sub), (_instance, state) => ({
      runs: state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM runs').one().n,
      counter: state.storage.sql.exec<{ counter: number }>('SELECT counter FROM quota').one().counter,
    }));
    expect(rows).toEqual({ runs: 1, counter: 1 });
    // Once it ended, a new press is a new run; the refused presses were never bound, so press-2 can start one.
    await finish(sub, first.run.id);
    const next = await admitted(sub, ask('press-2', T0 + 180_000));
    expect(next.run.id).not.toBe(first.run.id);
    expect(next.run.phase).toBe('queued');
  });

  it('the daily quota refuses past the limit and counts only new runs', async () => {
    const { sub } = await someone();
    const limit = 2;
    const a = await admitted(sub, ask('press-a', T0, { dailyLimit: limit }));
    // Repeats and the active run do not count.
    await admitted(sub, ask('press-a', T0 + 1, { dailyLimit: limit }));
    await admitted(sub, ask('press-x', T0 + 2, { dailyLimit: limit }));
    await finish(sub, a.run.id);
    const b = await admitted(sub, ask('press-b', T0 + 3, { dailyLimit: limit }));
    await finish(sub, b.run.id);
    // The third new run of the day is refused, with nothing written.
    const before = await runInDurableObject(person(sub), (_instance, state) => ({
      runs: state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM runs').one().n,
      revision: state.storage.sql.exec<{ status_revision: number }>('SELECT status_revision FROM control').one().status_revision,
      counter: state.storage.sql.exec<{ counter: number }>('SELECT counter FROM quota WHERE window = ?', '2036-10-07').one().counter,
    }));
    expect(before.counter).toBe(2);
    expect(await person(sub).admit(ask('press-c', T0 + 4, { dailyLimit: limit }))).toEqual({ admitted: false, refused: 'rate-limited' });
    expect(await person(sub).admit(ask('press-c', T0 + 5, { dailyLimit: limit }))).toEqual({ admitted: false, refused: 'rate-limited' });
    const after = await runInDurableObject(person(sub), (_instance, state) => ({
      runs: state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM runs').one().n,
      revision: state.storage.sql.exec<{ status_revision: number }>('SELECT status_revision FROM control').one().status_revision,
      counter: state.storage.sql.exec<{ counter: number }>('SELECT counter FROM quota WHERE window = ?', '2036-10-07').one().counter,
    }));
    expect(after).toEqual(before);
    // A repeat of a counted request is still answered past the limit.
    expect((await admitted(sub, ask('press-b', T0 + 6, { dailyLimit: limit }))).run.id).toBe(b.run.id);
    // The next UTC day has its own counter.
    const tomorrow = Date.UTC(2036, 9, 8, 0, 0, 1);
    expect((await admitted(sub, ask('press-c', tomorrow, { dailyLimit: limit }))).run.phase).toBe('queued');
  });

  it('a stale run is marked failed once and raises the revision', async () => {
    const { sub } = await someone();
    const p = person(sub);
    // With no GitHub token there is no recovery to wait for: the reads expire the run at its deadline.
    await runInDurableObject(p, (instance) => {
      const own = instance as unknown as { env: Env };
      own.env = { ...own.env, GITHUB_TOKEN: undefined };
    });
    const { run, revision } = await admitted(sub, ask('press-1', T0));
    // Within its window it stays queued.
    expect(await p.runStatus(T0 + QUEUED_STALE_MS - 1)).toEqual({ run, revision });
    // Past 17 minutes queued: two status calls, one write and one raise.
    const late = T0 + QUEUED_STALE_MS;
    const expired = await p.runStatus(late);
    expect(expired).toEqual({
      run: { ...run, phase: 'failed', phaseAt: late, finishedAt: late, failure: STALE_FAILURE },
      revision: revision + 1,
    });
    expect(await p.runStatus(late + 60_000)).toEqual(expired);
    // The next press is admitted, as a new run.
    const next = await admitted(sub, ask('press-2', late + 120_000));
    expect(next.run.id).not.toBe(run.id);
    expect(next.revision).toBe(revision + 2);
    // A started phase is measured from phaseAt against 30 minutes, and /process writes the expiry too.
    await runInDurableObject(p, (_instance, state) => {
      state.storage.sql.exec("UPDATE runs SET phase = 'writing', phase_at = ? WHERE id = ?", late + 200_000, next.run.id);
    });
    const going = await admitted(sub, ask('press-3', late + 200_000 + RUNNING_STALE_MS - 1));
    expect(going.run).toMatchObject({ id: next.run.id, phase: 'writing' });
    const stop = late + 200_000 + RUNNING_STALE_MS;
    const third = await admitted(sub, ask('press-4', stop));
    expect(third.run.id).not.toBe(next.run.id);
    expect(third.revision).toBe(revision + 4);
    expect(await admitted(sub, ask('press-1', stop + 1))).toEqual({ run: expired.run, revision: revision + 4 });
    const ended = await admitted(sub, ask('press-2', stop + 2));
    expect(ended.run).toMatchObject({ id: next.run.id, phase: 'failed', finishedAt: stop, failure: STALE_FAILURE });
  });

  it('a new run is admitted only with its manifest', async () => {
    const { sub } = await someone();
    // A press that would admit reads the inbox first; with no manifest, nothing is written or counted.
    expect(await person(sub).admit(ask('press-1', T0, { manifest: null }))).toEqual({ admitted: false, refused: 'needs-manifest' });
    const empty = await runInDurableObject(person(sub), (_instance, state) => ({
      runs: state.storage.sql.exec('SELECT id FROM runs').toArray(),
      quota: state.storage.sql.exec('SELECT * FROM quota').toArray(),
    }));
    expect(empty).toEqual({ runs: [], quota: [] });
    const first = await admitted(sub, ask('press-1', T0));
    // A repeat, or a press while it is going, needs no manifest and reads nothing.
    expect(await admitted(sub, ask('press-1', T0 + 2, { manifest: null }))).toEqual(first);
    expect(await admitted(sub, ask('press-2', T0 + 3, { manifest: null }))).toEqual(first);
    await finish(sub, first.run.id);
    expect(await person(sub).admit(ask('press-2', T0 + 4, { manifest: null }))).toEqual({ admitted: false, refused: 'needs-manifest' });
  });

  it('the run history is bounded and keeps the newest runs', async () => {
    const { sub } = await someone();
    let last = '';
    for (let i = 0; i < 25; i += 1) {
      const { run } = await admitted(sub, ask(`press-${i}`, T0 + i * 1_000));
      await finish(sub, run.id);
      last = run.id;
    }
    const kept = await runInDurableObject(person(sub), (_instance, state) =>
      state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM runs').one().n,
    );
    expect(kept).toBe(20);
    expect((await person(sub).runStatus(T0 + 30_000)).run?.id).toBe(last);
  });
});

describe('the admission manifest', () => {
  /** A person holding the lease, whose folder is a pretend Drive the Worker reads with a cached token. */
  async function withFolder(): Promise<{ sub: string; cookie: string; fence: Record<string, string>; folder: DriveFolder }> {
    const who = await holder();
    const folder = await driveFolder();
    await person(who.sub).pointFolder((await person(who.sub).account())?.generation ?? -1, null, folder.root);
    await person(who.sub).cacheDriveToken({ accessToken: 'access-cached', expiresAt: Date.now() + 3600_000 });
    return { ...who, folder };
  }

  async function press(who: { cookie: string; fence: Record<string, string>; folder: DriveFolder }, body: Record<string, unknown>): Promise<Response> {
    return await createApp({ fetchImpl: who.folder.fetchImpl }).request(
      `${APP}/process`,
      { method: 'POST', headers: { cookie: who.cookie, origin: APP, 'content-type': 'application/json', ...who.fence }, body: JSON.stringify(body) },
      env,
    );
  }

  const stored = async (sub: string) =>
    await runInDurableObject(person(sub), (_instance, state) => ({
      runs: state.storage.sql.exec('SELECT * FROM runs').toArray(),
      quota: state.storage.sql.exec('SELECT * FROM quota').toArray(),
    }));

  it('an empty manifest answers nothing before the quota', async () => {
    const who = await withFolder();
    const nothing = async (body: Record<string, unknown>, message: string): Promise<void> => {
      const r = await press(who, body);
      expect(r.status, message).toBe(409);
      expect(await r.json()).toEqual({ error: { code: 'nothing', message } });
    };
    // An empty inbox, and an instructions run with none of your changes.
    await nothing({ scope: 'all', allowWeb: false, requestId: 'press-1' }, 'Nothing is waiting in the inbox.');
    await nothing({ scope: 'instructions', allowWeb: false, requestId: 'press-2' }, 'There is nothing new for Bower to read.');
    // Only a held pile: its list of what is in it cannot be read.
    const { drive, root, inbox, bower } = who.folder;
    const piles = await drive.createFolder(bower, 'piles');
    await drive.createText(piles.id, `declaration-d1-${'0'.repeat(64)}.json`, 'not a declaration');
    const held = await drive.createFolder(inbox, 'Papers', { pile: 'p-held', bowerDeclaration: 'd1' });
    await drive.createText(held.id, 'scan.pdf', '%PDF scan', { bowerItem: 'k1', bowerDeclaration: 'd1' });
    await nothing({ scope: 'all', allowWeb: false, requestId: 'press-3' }, 'Nothing in the inbox is ready yet.');
    // Nothing was admitted or counted, and no note was read: Drive saw reads of metadata and Bower's own files.
    expect(await stored(who.sub)).toEqual({ runs: [], quota: [] });
    expect(who.folder.sent.every((s) => s.startsWith('GET '))).toBe(true);
    expect(root).not.toBe('');
  });

  it('a press over the daily limit reads nothing from Drive', async () => {
    const who = await withFolder();
    await who.folder.drive.createText(who.folder.inbox, 'receipt.pdf', '%PDF receipt', { pile: 'p-receipt' });
    const day = new Date().toISOString().slice(0, 10);
    await runInDurableObject(person(who.sub), (_instance, state) => {
      state.storage.sql.exec('INSERT INTO quota (window, counter) VALUES (?, ?)', day, Number(env.DAILY_RUN_LIMIT));
    });
    who.folder.sent.length = 0;
    const r = await press(who, { scope: 'all', allowWeb: false, requestId: 'press-over' });
    expect(r.status).toBe(429);
    expect(who.folder.sent).toEqual([]);
    expect(await stored(who.sub)).toMatchObject({ runs: [] });
  });

  /** A pile folder in the inbox with its note's text and, when given, one thing. */
  async function pileWithNote(folder: DriveFolder, name: string, pileId: string, note: string, thing?: string) {
    const made = await folder.drive.createFolder(folder.inbox, name, { pile: pileId });
    const noteFile = await folder.drive.createText(made.id, 'Pile note.md', note);
    const thingFile = thing ? await folder.drive.createText(made.id, thing, `%PDF ${thing}`) : null;
    return { folder: made, note: noteFile, thing: thingFile };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('admission holds a pile whose note is not ready', async () => {
    const who = await withFolder();
    // A note in a newer format, a damaged one, and one of whitespace only with nothing else: the runner holds each.
    await pileWithNote(who.folder, 'Trip', 'p-newer', '---\nbower_format: ownership/3\n---\nTrain times\n', 'ticket.pdf');
    await pileWithNote(who.folder, 'Flat', 'p-damaged', '---\nbower_format:  ownership/2\n---\nRent\n', 'lease.pdf');
    await pileWithNote(who.folder, 'Blank', 'p-blank', '  \n\t\n');
    const held = await press(who, { scope: 'all', allowWeb: false, requestId: 'press-1' });
    expect(held.status).toBe(409);
    expect(await held.json()).toEqual({ error: { code: 'nothing', message: 'Nothing in the inbox is ready yet.' } });
    expect(await stored(who.sub)).toEqual({ runs: [], quota: [] });
    // With a ready pile beside them, only it is admitted.
    const ready = await pileWithNote(who.folder, 'Receipts', 'p-ready', 'For the tax return', 'receipt.pdf');
    const r = await press(who, { scope: 'all', allowWeb: false, requestId: 'press-2' });
    expect(r.status).toBe(200);
    const row = (await stored(who.sub)).runs[0] as Record<string, unknown> | undefined;
    const manifest = JSON.parse(String(row?.manifest)) as AdmissionManifest;
    expect(manifest.piles.map((p) => p.pileId)).toEqual(['p-ready']);
    expect(manifest.piles[0]?.items.map((i) => i.fileId).sort()).toEqual([ready.note.id, ready.thing?.id ?? ''].sort());
  });

  it('admission stores no note text', async () => {
    const who = await withFolder();
    const errors = vi.spyOn(console, 'error');
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info'), vi.spyOn(console, 'debug'), errors];
    // Words only the notes hold: a ready pile's, and a damaged note's that is logged when it is held.
    const ready = await pileWithNote(who.folder, 'Trip', 'p-trip', 'Words only Alex wrote: quiet-heron-41', 'ticket.pdf');
    await pileWithNote(who.folder, 'Flat', 'p-damaged', '---\nbower_format:  ownership/2\n---\nWords only Alex wrote: still-otter-73\n', 'lease.pdf');
    const r = await press(who, { scope: 'all', allowWeb: false, requestId: 'press-1' });
    expect(r.status).toBe(200);
    const { runs } = await stored(who.sub);
    const row = runs[0] as Record<string, unknown> | undefined;
    const manifest = JSON.parse(String(row?.manifest)) as AdmissionManifest;
    // The note is kept by id and version only, and the damaged one's pile is held.
    expect(manifest.piles.map((p) => p.pileId)).toEqual(['p-trip']);
    expect(manifest.piles[0]?.items).toContainEqual({ fileId: ready.note.id, name: 'Pile note.md', parents: [ready.folder.id], modifiedTime: ready.note.modifiedTime });
    const words = ['quiet-heron', 'still-otter', 'Words only Alex wrote'];
    const rowText = JSON.stringify(runs);
    for (const w of words) expect(rowText).not.toContain(w);
    // The held note was read and its refusal logged, with none of its words.
    expect(errors).toHaveBeenCalled();
    const logged = logs.flatMap((spy) => spy.mock.calls.map((args) => args.map((a) => deepText(a)).join(' ')));
    for (const line of logged) for (const w of words) expect(line).not.toContain(w);
  });

  it('the run row keeps its manifest and the token route returns it', async () => {
    const who = await withFolder();
    const { drive, inbox } = who.folder;
    const receipt = await drive.createText(inbox, 'receipt.pdf', '%PDF receipt', { pile: 'p-receipt' });
    const r = await press(who, { scope: 'all', allowWeb: false, requestId: 'press-1' });
    expect(r.status).toBe(200);
    const { run } = (await r.json()) as RunReply;
    const row = (await stored(who.sub)).runs[0] as Record<string, unknown> | undefined;
    expect(typeof row?.manifest).toBe('string');
    const manifest = JSON.parse(String(row?.manifest)) as AdmissionManifest;
    expect(manifest).toMatchObject({ v: 1, rootId: who.folder.root, scope: 'all' });
    expect(manifest.piles).toEqual([
      { pileId: 'p-receipt', anchor: null, declaration: null, items: [{ fileId: receipt.id, name: 'receipt.pdf', parents: [inbox], modifiedTime: receipt.modifiedTime }] },
    ]);
    // A repeat of the press answers the same run and reads nothing again.
    const sent = who.folder.sent.length;
    expect((await press(who, { scope: 'all', allowWeb: false, requestId: 'press-1' })).status).toBe(200);
    expect(who.folder.sent.length).toBe(sent);
    // The runner's token route hands it the same manifest, with the ticket the alarm dispatched.
    const runId = run?.id ?? '';
    expect(runId.startsWith(`${env.PERSON.idFromName(who.sub).toString()}-`)).toBe(true);
    const { ticket } = await dispatchOf(gh, runId);
    const token = await createApp().request(`https://api.example.com/runner/runs/${runId}/token`, { headers: { authorization: `Bearer ${ticket}` } }, env);
    expect(token.status).toBe(200);
    expect(((await token.json()) as { manifest?: unknown }).manifest).toEqual(manifest);
  });
});

/** Everything a logged value can show: an error's message, stack and cause, an object's fields. */
function deepText(value: unknown, seen = new Set<unknown>()): string {
  if (value === null || typeof value !== 'object') return String(value);
  if (seen.has(value)) return '';
  seen.add(value);
  if (value instanceof Error) return [value.message, value.stack ?? '', deepText(value.cause, seen), deepText({ ...value }, seen)].join(' ');
  return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${deepText(v, seen)}`).join(' ');
}

describe('answers that wait for the run going (TL-P4-13 addendum)', () => {
  type Reply = RunReply & { waits?: true };
  const answer = (requestId: string, subject: string): Record<string, unknown> => ({ scope: 'all', allowWeb: false, requestId, subject, answer: true });
  const quota = async (sub: string): Promise<unknown[]> =>
    await runInDurableObject(person(sub), (_i, state) => state.storage.sql.exec('SELECT counter FROM quota').toArray());

  it('an answer during a run starts its scoped run when the run ends', async () => {
    const { sub, cookie, fence } = await withThings();
    const folder = wire;
    if (folder === null) throw new Error('no folder');
    await folder.drive.createText(folder.inbox, 'photo.jpg', 'jpg bytes', { pile: 'p-photo' });
    await folder.drive.createText(folder.inbox, 'other.pdf', '%PDF other', { pile: 'p-other' });
    // The run's clock is T0, far ahead of the wall clock, so the runtime never fires the alarm itself in this test.
    await person(sub).cacheDriveToken({ accessToken: 'access-cached', expiresAt: T0 + 3600_000 });
    // A tidy-up is going, pressed before the answers.
    const { run: going } = await admitted(sub, ask('press-1', T0, { scope: 'instructions' }));
    // Two answers on two subjects, the first sent twice (a retry): each is told it waits; none starts a run now.
    for (const body of [answer('answer-a', 'p-receipt'), answer('answer-a', 'p-receipt'), answer('answer-b', 'p-photo')]) {
      const r = await post(cookie, body, fence);
      expect(r.status).toBe(200);
      const reply = (await r.json()) as Reply;
      expect(reply.run?.id).toBe(going.id);
      expect(reply.waits).toBe(true);
    }
    expect(await quota(sub)).toEqual([{ counter: 1 }]);
    // The run ends: the person object sets its alarm for then, to wake with no press.
    await runInDurableObject(person(sub), async (instance: Person) => {
      await instance.wake(T0, gh.access);
    });
    const { ticket } = await dispatchOf(gh, going.id);
    const ended = await person(sub).runnerReport(going.id, await hashTicket(ticket), { attempt: 1, seq: 1, phase: 'done' }, T0 + 1000);
    expect(ended).toMatchObject({ accepted: true });
    expect(await runInDurableObject(person(sub), (_i, state) => state.storage.getAlarm())).toBe(T0 + 1000);
    // Woken twice (a retried alarm, a second end): one run, dispatched once.
    const sent: string[] = [];
    const github = { repo: env.GITHUB_REPO, apiOrigin: env.API_ORIGIN, token: env.GITHUB_TOKEN, fetchImpl: async (input: string, init?: RequestInit) => {
      sent.push(`${init?.method ?? 'GET'} ${new URL(input).pathname}`);
      return await folder.fetchImpl(input, init);
    } };
    await runInDurableObject(person(sub), async (instance: Person) => {
      await instance.wake(T0 + 1000, github);
      await instance.wake(T0 + 2000, github);
    });
    expect(sent.filter((r) => r.endsWith('/dispatches'))).toHaveLength(1);
    const next = await status(cookie);
    expect(next.run?.id).not.toBe(going.id);
    expect(next.run).toMatchObject({ scope: 'all', phase: 'queued' });
    // Scoped to the answers' subjects: the two piles answered about, never the other one, with your changes; counted once.
    const manifest = await runInDurableObject(person(sub), (_i, state) =>
      JSON.parse(state.storage.sql.exec<{ manifest: string }>('SELECT manifest FROM runs ORDER BY seq DESC LIMIT 1').one().manifest) as AdmissionManifest);
    expect(manifest.piles.map((p) => p.pileId).sort()).toEqual(['p-photo', 'p-receipt']);
    expect(manifest.journal).toHaveLength(1);
    expect(await quota(sub)).toEqual([{ counter: 2 }]);
    // A retry of an answer taken answers that run, and keeps nothing waiting.
    const again = (await (await post(cookie, answer('answer-b', 'p-photo'), fence)).json()) as Reply;
    expect(again.run?.id).toBe(next.run?.id);
    expect(again.waits).toBeUndefined();
    expect(await quota(sub)).toEqual([{ counter: 2 }]);
  });

  it('a failed run-end start says so, and a retry does not claim it waits', async () => {
    const { sub, cookie, fence } = await withThings();
    await person(sub).cacheDriveToken({ accessToken: 'access-cached', expiresAt: T0 + 3600_000 });
    const { run: going } = await admitted(sub, ask('press-1', T0, { scope: 'instructions' }));
    const waits = (await (await post(cookie, answer('answer-a', 'p-receipt'), fence)).json()) as Reply;
    expect(waits.waits).toBe(true);
    // The folder is unpointed while the run goes; the run ends, and the start of the answer's run fails for good.
    await runInDurableObject(person(sub), (_instance, state) => { state.storage.sql.exec('UPDATE account SET folder_id = NULL, folder_complete = 0 WHERE id = 1'); });
    const late = T0 + 10 * 3600_000;
    expect((await person(sub).runStatus(late)).run).toMatchObject({ id: going.id, phase: 'failed' });
    await runInDurableObject(person(sub), async (instance: Person) => {
      await instance.wake(late, { repo: env.GITHUB_REPO, apiOrigin: env.API_ORIGIN, token: env.GITHUB_TOKEN, fetchImpl: () => Promise.reject(new Error('not asked')) });
    });
    // Nothing will start it now: a retry is a press like any other and hears why it cannot start.
    expect(await person(sub).admit({ ...ask('answer-a', late, { manifest: null }), answer: true, subject: 'p-receipt' })).toEqual({ admitted: false, refused: 'needs-manifest' });
    const retry = await post(cookie, answer('answer-a', 'p-receipt'), fence);
    expect(retry.status).toBe(409);
    expect(((await retry.json()) as { error: { code: string } }).error.code).toBe('no-folder');
  });

  it("a Delete me during the alarm's admission reads admits no run", async () => {
    const { sub, cookie, fence } = await withThings();
    const folder = wire;
    if (folder === null) throw new Error('no folder');
    await person(sub).cacheDriveToken({ accessToken: 'access-cached', expiresAt: T0 + 3600_000 });
    const { run: going } = await admitted(sub, ask('press-1', T0, { scope: 'instructions' }));
    expect(((await (await post(cookie, answer('answer-a', 'p-receipt'), fence)).json()) as Reply).waits).toBe(true);
    await runInDurableObject(person(sub), async (instance: Person) => {
      await instance.wake(T0, gh.access);
    });
    const { ticket } = await dispatchOf(gh, going.id);
    expect(await person(sub).runnerReport(going.id, await hashTicket(ticket), { attempt: 1, seq: 1, phase: 'done' }, T0 + 1000)).toMatchObject({ accepted: true });
    // The run end's alarm reads Drive for the answers' run; Delete me lands during those reads.
    const sent: string[] = [];
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await runInDurableObject(person(sub), async (instance: Person, state) => {
        let forgotten = false;
        const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
          sent.push(`${init?.method ?? 'GET'} ${new URL(input).pathname}`);
          if (!forgotten && input.startsWith('https://www.googleapis.com/')) {
            forgotten = true;
            instance.forget();
          }
          return await folder.fetchImpl(input, init);
        };
        await instance.wake(T0 + 1000, { repo: env.GITHUB_REPO, apiOrigin: env.API_ORIGIN, token: env.GITHUB_TOKEN, fetchImpl });
        // No run row, no quota counted, no manifest kept, nothing armed to dispatch.
        expect(state.storage.sql.exec('SELECT id FROM runs').toArray()).toEqual([]);
        expect(state.storage.sql.exec('SELECT counter FROM quota').toArray()).toEqual([]);
        expect(state.storage.sql.exec(`SELECT key FROM deadlines WHERE kind <> 'gone'`).toArray()).toEqual([]);
      });
      expect(sent.some((r) => r.startsWith('GET /drive/'))).toBe(true);
      expect(sent.filter((r) => r.endsWith('/dispatches'))).toEqual([]);
      // The answers' run was refused as gone, and says so in the log.
      expect(log.mock.calls.map((c) => c.map(String).join(' ')).join('\n')).toContain('gone');
    } finally {
      log.mockRestore();
    }
  });

  it("a Delete me during a press's admission reads admits no run", async () => {
    const { sub, cookie, fence } = await withThings();
    const folder = wire;
    if (folder === null) throw new Error('no folder');
    let forgotten = false;
    const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
      if (!forgotten && input.startsWith('https://www.googleapis.com/drive/')) {
        forgotten = true;
        await person(sub).forget();
      }
      return await folder.fetchImpl(input, init);
    };
    const before = gh.dispatched.length;
    const r = await createApp({ fetchImpl }).request(
      `${APP}/process`,
      {
        method: 'POST',
        headers: { cookie, origin: APP, 'content-type': 'application/json', ...fence },
        body: JSON.stringify({ scope: 'all', allowWeb: false, requestId: 'press-1' }),
      },
      env,
    );
    expect(forgotten).toBe(true);
    // The account is gone: the press is answered as signed out, and nothing was admitted.
    expect(r.status).toBe(401);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('signed-out');
    const left = await runInDurableObject(person(sub), (_i, state) => ({
      runs: state.storage.sql.exec('SELECT id FROM runs').toArray(),
      quota: state.storage.sql.exec('SELECT counter FROM quota').toArray(),
      deadlines: state.storage.sql.exec(`SELECT key FROM deadlines WHERE kind <> 'gone'`).toArray(),
    }));
    expect(left).toEqual({ runs: [], quota: [], deadlines: [] });
    expect(gh.dispatched.length).toBe(before);
  });

  /**
   * An answer waits for the run going; the run ends and the alarm reads Drive for the answers' run, and `during` lands
   * on the person in the first of those reads. Returns what the person's object holds afterwards, and the log.
   */
  async function alarmAdmissionWith(during: (instance: Person) => void): Promise<{ runs: unknown[]; quota: unknown[]; log: string; dispatches: number }> {
    const { sub, cookie, fence } = await withThings();
    const folder = wire;
    if (folder === null) throw new Error('no folder');
    await person(sub).cacheDriveToken({ accessToken: 'access-cached', expiresAt: T0 + 3600_000 });
    const { run: going } = await admitted(sub, ask('press-1', T0, { scope: 'instructions' }));
    expect(((await (await post(cookie, answer('answer-a', 'p-receipt'), fence)).json()) as Reply).waits).toBe(true);
    await runInDurableObject(person(sub), async (instance: Person) => {
      await instance.wake(T0, gh.access);
    });
    const { ticket } = await dispatchOf(gh, going.id);
    expect(await person(sub).runnerReport(going.id, await hashTicket(ticket), { attempt: 1, seq: 1, phase: 'done' }, T0 + 1000)).toMatchObject({ accepted: true });
    const sent: string[] = [];
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const held = await runInDurableObject(person(sub), async (instance: Person, state) => {
        let landed = false;
        const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
          sent.push(`${init?.method ?? 'GET'} ${new URL(input).pathname}`);
          if (!landed && input.startsWith('https://www.googleapis.com/')) {
            landed = true;
            during(instance);
          }
          return await folder.fetchImpl(input, init);
        };
        await instance.wake(T0 + 1000, { repo: env.GITHUB_REPO, apiOrigin: env.API_ORIGIN, token: env.GITHUB_TOKEN, fetchImpl });
        expect(landed).toBe(true);
        return { runs: state.storage.sql.exec('SELECT id FROM runs').toArray(), quota: state.storage.sql.exec('SELECT counter FROM quota').toArray() };
      });
      return { ...held, log: log.mock.calls.map((c) => c.map(String).join(' ')).join('\n'), dispatches: sent.filter((r) => r.endsWith('/dispatches')).length };
    } finally {
      log.mockRestore();
    }
  }

  it('a sign-out during admission still admits the waiting answers', async () => {
    // Runs never depend on a browser session: signing out moves the session generation, not the account.
    const out = await alarmAdmissionWith((instance) => {
      expect(instance.retireSessions()).not.toBeNull();
    });
    expect(out.runs).toHaveLength(2);
    expect(out.quota).toEqual([{ counter: 2 }]);
    expect(out.log).not.toContain('the account is gone');
    expect(out.dispatches).toBe(1);
  });

  it('a Delete me during admission still refuses', async () => {
    // The alarm path: Delete me, then the same person signs in again, during the reads (a new account: still refused).
    const alarm = await alarmAdmissionWith((instance) => {
      instance.forget();
      instance.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: null });
    });
    expect(alarm.runs).toEqual([]);
    expect(alarm.quota).toEqual([]);
    expect(alarm.log).toContain('the account is gone');
    expect(alarm.dispatches).toBe(0);
    // The press path: Delete me, then a sign-in again, during the press's reads.
    const { sub, cookie, fence } = await withThings();
    const folder = wire;
    if (folder === null) throw new Error('no folder');
    let landed = false;
    const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
      if (!landed && input.startsWith('https://www.googleapis.com/drive/')) {
        landed = true;
        await person(sub).forget();
        await person(sub).signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: null });
      }
      return await folder.fetchImpl(input, init);
    };
    const r = await createApp({ fetchImpl }).request(
      `${APP}/process`,
      { method: 'POST', headers: { cookie, origin: APP, 'content-type': 'application/json', ...fence }, body: JSON.stringify({ scope: 'all', allowWeb: false, requestId: 'press-1' }) },
      env,
    );
    expect(landed).toBe(true);
    expect(r.status).not.toBe(200);
    const left = await runInDurableObject(person(sub), (_i, state) => ({ runs: state.storage.sql.exec('SELECT id FROM runs').toArray(), quota: state.storage.sql.exec('SELECT counter FROM quota').toArray() }));
    expect(left).toEqual({ runs: [], quota: [] });
  });

  it('an answer during a run with the day used up is refused, so the app says so', async () => {
    const { sub } = await holder();
    const day = T0;
    await admitted(sub, ask('press-1', day, { dailyLimit: 1 }));
    const refused = await person(sub).admit({ ...ask('answer-a', day, { dailyLimit: 1, manifest: null }), answer: true, subject: 'p-receipt' } as AdmitInput);
    expect(refused).toEqual({ admitted: false, refused: 'rate-limited' });
  });
});
