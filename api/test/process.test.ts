import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { QUEUED_STALE_MS, RUNNING_STALE_MS, STALE_FAILURE } from '../src/process.js';
import type { AdmitInput, RunReply, RunWire } from '../src/process.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const APP = 'https://app.example.com';
const EMAIL = 'you@example.com';

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

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

async function post(cookie: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return await createApp().request(
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

const T0 = Date.UTC(2026, 9, 7, 9, 0, 0);
const ask = (requestId: string, now: number, more: Partial<AdmitInput> = {}): AdmitInput => ({
  scope: 'all',
  allowWeb: false,
  requestId,
  now,
  dailyLimit: 100,
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
    const { cookie, fence } = await holder();
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
    const { cookie, fence } = await holder();
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

  it('process and status answer the revision', async () => {
    const { cookie, fence } = await holder();
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
      state.storage.sql.exec<{ counter: number }>('SELECT counter FROM quota WHERE window = ?', '2026-10-07').one().counter,
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
      counter: state.storage.sql.exec<{ counter: number }>('SELECT counter FROM quota WHERE window = ?', '2026-10-07').one().counter,
    }));
    expect(before.counter).toBe(2);
    expect(await person(sub).admit(ask('press-c', T0 + 4, { dailyLimit: limit }))).toEqual({ admitted: false, refused: 'rate-limited' });
    expect(await person(sub).admit(ask('press-c', T0 + 5, { dailyLimit: limit }))).toEqual({ admitted: false, refused: 'rate-limited' });
    const after = await runInDurableObject(person(sub), (_instance, state) => ({
      runs: state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM runs').one().n,
      revision: state.storage.sql.exec<{ status_revision: number }>('SELECT status_revision FROM control').one().status_revision,
      counter: state.storage.sql.exec<{ counter: number }>('SELECT counter FROM quota WHERE window = ?', '2026-10-07').one().counter,
    }));
    expect(after).toEqual(before);
    // A repeat of a counted request is still answered past the limit.
    expect((await admitted(sub, ask('press-b', T0 + 6, { dailyLimit: limit }))).run.id).toBe(b.run.id);
    // The next UTC day has its own counter.
    const tomorrow = Date.UTC(2026, 9, 8, 0, 0, 1);
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
