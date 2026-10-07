/**
 * The runner-side failure cases on the real adapters (P3-18): the runner's `main` against the Worker's app run
 * in-process, both over a replayed Drive v3 and GitHub (`real-world.ts`). The press is the app's wire call
 * (`POST /session`, then `POST /process` with the place and epoch), and every run ends as an uninterrupted one does:
 * `done`, with the same files where they belong, each once.
 */
import { describe, expect, it, vi } from 'vitest';
import { ORIGIN, realWorld } from './real-world';
import type { RealWorld } from './real-world-types';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));

interface RunReply {
  run: { id: string; phase: string } | null;
  revision: number;
}

const json = { 'content-type': 'application/json' };

/** One press of Tidy up, as the app sends it from the place that holds the lease. */
async function press(w: RealWorld, requestId = crypto.randomUUID()): Promise<RunReply> {
  const lease = (await (await w.api.browser(`${ORIGIN}/session`, { method: 'POST', headers: json, body: JSON.stringify({ place: 'tab-1', action: 'check', gen: 0 }) })).json()) as { epoch: number };
  const res = await w.api.browser(`${ORIGIN}/process`, {
    method: 'POST',
    headers: { ...json, 'x-bower-place': 'tab-1', 'x-bower-epoch': String(lease.epoch) },
    body: JSON.stringify({ scope: 'all', allowWeb: false, requestId }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as RunReply;
}

async function status(w: RealWorld): Promise<RunReply> {
  return (await (await w.api.browser(`${ORIGIN}/status`)).json()) as RunReply;
}

/** What an uninterrupted run leaves in a fresh world: the effects every case must end with, once each. */
async function straight(): Promise<string[]> {
  const w = await realWorld();
  const before = await w.paths();
  await press(w);
  expect(await w.runJob(0)).toBe(0);
  expect((await status(w)).run?.phase).toBe('done');
  const after = await w.paths();
  expect(after).not.toEqual(before);
  return after;
}

/** Fires the alarm until GitHub has `n` dispatches; each fire that finds the run not yet stale only sets it again. */
async function alarmsUntil(w: RealWorld, n: number): Promise<void> {
  for (let i = 0; i < 3 && w.dispatched.length < n; i++) expect(await w.api.fireAlarm()).toBe(true);
  expect(w.dispatched).toHaveLength(n);
}

const isStatus = (url: URL): boolean => url.pathname.endsWith('/status');
const phaseOf = (init: RequestInit): string => (JSON.parse(String(init.body)) as { phase: string }).phase;

describe('real adapters: failure cases in the runner', () => {
  it('duplicate dispatch: a second job of the same attempt after the first ended changes nothing', async () => {
    const want = await straight();
    const w = await realWorld();
    await press(w);
    expect(await w.runJob(0)).toBe(0);
    const writes = w.driveWrites().length;
    const done = await status(w);
    // GitHub runs the same dispatch again (R3: same-run duplicates both start, one after the other).
    expect(await w.runJob(0)).toBe(1);
    expect(w.driveWrites()).toHaveLength(writes);
    expect(await status(w)).toEqual(done);
    expect(await w.paths()).toEqual(want);
  });

  it('duplicate dispatch: a second job of the same attempt finishes a first one cut mid-run, with one set of effects', async () => {
    const want = await straight();
    const w = await realWorld();
    await press(w);
    let cut = false;
    expect(
      await w.runJob(0, async (url, init, next) => {
        if (cut) throw new TypeError('The job was cancelled.');
        const res = await next();
        if (isStatus(url) && phaseOf(init) === 'saving') cut = true;
        return res;
      }),
      // Left in saving with no terminal report, the job fails (TL-P3-28); the redispatch finishes the run.
    ).toBe(1);
    expect((await status(w)).run?.phase).toBe('saving');
    expect(await w.runJob(0)).toBe(0);
    expect((await status(w)).run?.phase).toBe('done');
    expect(await w.paths()).toEqual(want);
  });

  it('expired attempt: a superseded attempt writes nothing', async () => {
    const want = await straight();
    const w = await realWorld();
    await press(w);
    // Attempt 1's job never started (its runner was lost), so the alarm hands the run to attempt 2.
    w.killJob(0);
    await alarmsUntil(w, 2);
    expect(w.dispatched.map((d) => d.attempt)).toEqual([1, 2]);
    // Attempt 1's job runs late after all: the Worker refuses its ticket, and it neither writes nor reports.
    const writes = w.driveWrites().length;
    const before = await status(w);
    const late = await w.runJob(0);
    expect(w.driveWrites().slice(writes)).toEqual([]);
    expect(await status(w)).toEqual(before);
    expect(late).toBe(1);
    expect(await w.runJob(1)).toBe(0);
    expect((await status(w)).run?.phase).toBe('done');
    expect(await w.paths()).toEqual(want);
  });

  it('lost callback: a status reply is lost, and the resend is idempotent', async () => {
    const want = await straight();
    const w = await realWorld();
    await press(w);
    const replies: RunReply[] = [];
    expect(
      await w.runJob(0, async (url, init, next) => {
        if (!(isStatus(url) && phaseOf(init) === 'saving')) return await next();
        // The Worker takes the report; its reply is lost on the way, and the same report is sent again.
        replies.push((await (await next()).json()) as RunReply);
        const again = await next();
        replies.push((await again.clone().json()) as RunReply);
        return again;
      }),
    ).toBe(0);
    expect(replies).toHaveLength(2);
    expect(replies[1]).toEqual(replies[0]);
    expect((await status(w)).run?.phase).toBe('done');
    expect(await w.paths()).toEqual(want);
  });

  it('lost callback: a lost reply to done fails the job visibly, and the run stays done with its effects once', async () => {
    const want = await straight();
    const w = await realWorld();
    await press(w);
    const code = await w.runJob(0, async (url, init, next) => {
      const res = await next();
      if (isStatus(url) && phaseOf(init) === 'done') throw new TypeError('The reply was lost.');
      return res;
    });
    // The runner cannot tell the Worker took it, so the job fails rather than say it was done.
    expect(code).toBe(1);
    expect((await status(w)).run?.phase).toBe('done');
    // The alarm then finds the run ended: it sends nothing.
    await w.api.fireAlarm();
    expect(w.dispatched).toHaveLength(1);
    expect(await w.paths()).toEqual(want);
  });

  it('recovery: a dead job is redispatched and reaches done', async () => {
    const want = await straight();
    const w = await realWorld();
    await press(w);
    // Attempt 1's job ended with no report at all (cancelled before its first step).
    w.killJob(0);
    expect((await status(w)).run?.phase).toBe('queued');
    await alarmsUntil(w, 2);
    expect(w.dispatched.map((d) => d.attempt)).toEqual([1, 2]);
    expect(await w.runJob(1)).toBe(0);
    expect((await status(w)).run?.phase).toBe('done');
    expect(await w.paths()).toEqual(want);
  });
});
