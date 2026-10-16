import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { backoffPace, dispatchOutcome } from '../src/github.js';
import type { Person } from '../src/person.js';
import { QUEUED_STALE_MS, STALE_FAILURE } from '../src/process.js';
import type { RunReply } from '../src/process.js';
import { hashTicket, personIdOf } from '../src/run-ticket.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';
import { MANIFEST, driveFolder, withThingsIn, type DriveFolder } from './drive-v3.js';
import { WAIT, dispatchOf, pretendGitHubForFile } from './github-support.js';
import type { PretendGitHub } from './github-support.js';
import { farAhead } from './time.js';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const APP = 'https://app.example.com';
const API = 'https://api.example.com';

/** The GitHub every alarm of this file reaches: presses admit at the wall clock, and the runtime fires the alarm. */
const gh = pretendGitHubForFile(env);

// The 200 and 400 ms waits between tries are pinned through dispatchOutcome's own `sleep`; here they take no time.
beforeEach(() => { backoffPace.scale = 0; });
afterEach(() => { backoffPace.scale = 1; });
beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
  gh.script = {};
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

/** What the press itself reaches besides Drive: it must never be GitHub. */
function pressSide() {
  const sent: string[] = [];
  const fetchImpl = (url: string): Promise<Response> => {
    sent.push(url);
    return Promise.reject(new Error('the press called GitHub'));
  };
  return { sent, fetchImpl };
}

async function holder(): Promise<{ sub: string; cookie: string; fence: Record<string, string>; folder: DriveFolder }> {
  const sub = `dispatch-sub-${crypto.randomUUID()}`;
  await kv.put(allowKey('you@example.com'), '1');
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: enc });
  const folder = await driveFolder();
  await withThingsIn(folder);
  await person(sub).setFolderId(folder.root);
  await person(sub).cacheDriveToken({ accessToken: 'access-cached', expiresAt: Date.now() + 3600_000 });
  const epoch = (await person(sub).session('laptop', 'check', 0, Date.now())).epoch;
  const token = await signSession({ sub, gen: generation }, env.SESSION_SECRET);
  return {
    sub,
    cookie: `${SESSION_COOKIE}=${token}`,
    fence: { 'x-bower-place': 'laptop', 'x-bower-epoch': String(epoch) },
    folder,
  };
}

async function process(
  who: { cookie: string; fence: Record<string, string>; folder: DriveFolder },
  github: (url: string, init?: RequestInit) => Promise<Response>,
  requestId: string,
): Promise<RunReply> {
  // Drive is the person's pretend folder; everything else goes to `github`.
  const fetchImpl = (url: string, init?: RequestInit): Promise<Response> =>
    url.startsWith('https://www.googleapis.com/') ? who.folder.fetchImpl(url, init) : github(url, init);
  const r = await createApp({ fetchImpl }).request(
    `${APP}/process`,
    {
      method: 'POST',
      headers: { cookie: who.cookie, origin: APP, 'content-type': 'application/json', ...who.fence },
      body: JSON.stringify({ scope: 'instructions', allowWeb: true, requestId }),
    },
    env,
  );
  expect(r.status).toBe(200);
  return (await r.json()) as RunReply;
}

/** The dispatches GitHub received for `runId`, each try counted. */
const triesOf = (g: PretendGitHub, runId: string | undefined): number => g.dispatched.filter((d) => d.run_id === runId).length;

async function alarmOf(sub: string): Promise<number | null> {
  return await runInDurableObject(person(sub), (_i, state) => state.storage.getAlarm());
}

/** Waits until the dispatch of the run admitted for `sub` gave up (lost): the alarm is set for the early look. */
async function lostArmed(sub: string, after: number): Promise<number> {
  return await vi.waitFor(async () => {
    const alarm = (await alarmOf(sub)) ?? 0;
    // Claimed, the alarm is at the stale deadline first; lost, a minute after the last try.
    if (alarm < after + 60_000 || alarm > Date.now() + 60_000) throw new Error('not armed yet');
    return alarm;
  }, WAIT);
}

describe('dispatch from the alarm (TL-P4-14 stage 2)', () => {
  it('only the alarm dispatches', async () => {
    const who = await holder();
    const press = pressSide();
    const { run } = await process(who, press.fetchImpl, 'press-1');
    // The press admits and schedules the dispatch for now: it sends nothing to GitHub itself.
    expect(press.sent).toHaveLength(0);
    expect(run?.phase).toBe('queued');
    // Three alarms at once, with the runtime's own: the run row is compared and set, so one dispatch.
    const p = person(who.sub);
    await runInDurableObject(p, async (instance: Person) => {
      const now = Date.now();
      await Promise.all([instance.wake(now, gh.access), instance.wake(now, gh.access), instance.wake(now, gh.access)]);
    });
    const sent = await dispatchOf(gh, run?.id ?? '');
    // A repeat, a second press and another alarm while it goes: nothing more is sent, by the press or the alarm.
    await process(who, press.fetchImpl, 'press-1');
    await process(who, press.fetchImpl, 'press-2');
    await runInDurableObject(p, async (instance: Person) => {
      await instance.wake(Date.now(), gh.access);
    });
    expect(press.sent).toHaveLength(0);
    expect(triesOf(gh, run?.id)).toBe(1);
    expect(sent).toMatchObject({ run_id: run?.id, attempt: 1, scope: 'instructions', allow_web: true });
    const row = await runInDurableObject(p, (_i, state) => state.storage.sql.exec<{ deadline_at: number | null; version: number }>('SELECT deadline_at, version FROM runs').one());
    expect(row).toEqual({ deadline_at: null, version: 1 });
    // The ticket the alarm minted opens the token route; the stale deadline is set as before.
    const token = await createApp().request(`${API}/runner/runs/${run?.id ?? ''}/token`, { headers: { authorization: `Bearer ${sent.ticket}` } }, env);
    expect(token.status).toBe(200);
    expect(await alarmOf(who.sub)).toBe((run?.requestedAt ?? 0) + QUEUED_STALE_MS);
  });

  it('a new run is dispatched once with its ticket', async () => {
    const who = await holder();
    const { run } = await process(who, pressSide().fetchImpl, 'press-1');
    const payload = await dispatchOf(gh, run?.id ?? '');
    const call = gh.requests[gh.dispatched.indexOf(payload)];
    expect(call?.url).toBe(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`);
    expect(call?.method).toBe('POST');
    expect(call?.headers.Authorization).toBe('Bearer test-github-token');
    expect(call?.headers.Accept).toBe('application/vnd.github+json');
    expect(call?.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(Object.keys(payload).sort()).toEqual(['allow_web', 'attempt', 'run_id', 'scope', 'ticket']);
    expect(personIdOf(payload.run_id)).toBe(env.PERSON.idFromName(who.sub).toString());
    // The ticket opens the token route, with the folder.
    const token = await createApp().request(`${API}/runner/runs/${payload.run_id}/token`, { headers: { authorization: `Bearer ${payload.ticket}` } }, env);
    expect(token.status).toBe(200);
    expect(await token.json()).toMatchObject({ folderId: who.folder.root, attempt: 1 });
  });

  it('admission timing is logged in parts', async () => {
    const who = await holder();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { run } = await process(who, pressSide().fetchImpl, 'press-1');
    await process(who, pressSide().fetchImpl, 'press-1');
    const lines = log.mock.calls.map((args) => args.map(String).join(' ')).filter((line) => line.startsWith('admission timing'));
    log.mockRestore();
    // One line per press, in milliseconds: session and lease, the would-admit check, the Drive reads, the admit, and
    // the whole; a repeat reads nothing.
    const part = (name: string): string => `${name}=(\\d+)ms`;
    const shape = new RegExp(`^admission timing: ${['session', 'check', 'reads', 'admit', 'total'].map(part).join(' ')}$`);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toMatch(shape);
    expect(shape.exec(lines[1] ?? '')?.[3]).toBe('0');
    // Numbers only: no run id, folder or ticket.
    const { ticket } = await dispatchOf(gh, run?.id ?? '');
    for (const line of lines) for (const secret of [run?.id ?? '', who.folder.root, ticket]) expect(line).not.toContain(secret);
  });

  it('a repeat or an active run dispatches nothing', async () => {
    const who = await holder();
    const first = await process(who, pressSide().fetchImpl, 'press-1');
    await dispatchOf(gh, first.run?.id ?? '');
    expect(await process(who, pressSide().fetchImpl, 'press-1')).toEqual(first);
    expect((await process(who, pressSide().fetchImpl, 'press-2')).run?.id).toBe(first.run?.id);
    await runInDurableObject(person(who.sub), async (instance: Person) => {
      await instance.wake(Date.now(), gh.access);
    });
    expect(triesOf(gh, first.run?.id)).toBe(1);
  });

  it('a failed dispatch leaves the run queued', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const status of [500, null]) {
        gh.script = { dispatch: status };
        const who = await holder();
        const before = Date.now();
        const reply = await process(who, pressSide().fetchImpl, 'press-1');
        await lostArmed(who.sub, before);
        expect(triesOf(gh, reply.run?.id)).toBe(3);
        expect(reply.run?.phase).toBe('queued');
        expect(reply.revision).toBe(1);
        expect((await person(who.sub).runStatus(Date.now())).run?.phase).toBe('queued');
        const lines = log.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
        expect(lines).not.toContain((await dispatchOf(gh, reply.run?.id ?? '')).ticket);
        expect(lines).not.toContain('test-github-token');
        expect(lines).toContain(status === null ? 'network' : String(status));
      }
    } finally {
      log.mockRestore();
    }
  });

  it('no GitHub token sends nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const sub = `dispatch-sub-${crypto.randomUUID()}`;
      const p = person(sub);
      await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
      const t0 = farAhead();
      const admitted = await p.admit({ accountEpoch: (await p.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-1', now: t0, dailyLimit: 100, manifest: MANIFEST });
      if (!admitted.admitted) throw new Error('not admitted');
      await runInDurableObject(p, async (instance: Person) => {
        await instance.wake(t0, { ...gh.access, token: undefined });
      });
      expect(triesOf(gh, admitted.run.id)).toBe(0);
      expect((await p.runStatus(t0)).run?.phase).toBe('queued');
      expect(log.mock.calls.map((c) => c.map(String).join(' ')).join('\n')).toContain('not configured');
    } finally {
      log.mockRestore();
    }
  });

  it('a press during a recovery look-up is dispatched at once', async () => {
    const sub = `dispatch-sub-${crypto.randomUUID()}`;
    const p = person(sub);
    await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    const t0 = farAhead();
    const first = await p.admit({ accountEpoch: (await p.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-1', now: t0, dailyLimit: 100, manifest: MANIFEST });
    if (!first.admitted) throw new Error('not admitted');
    await runInDurableObject(p, async (instance: Person) => {
      await instance.wake(t0, gh.access);
    });
    const { ticket } = await dispatchOf(gh, first.run.id);
    // R0's stale deadline: the alarm looks it up on GitHub, and the look-up is held there.
    const t1 = t0 + QUEUED_STALE_MS;
    let release = (): void => undefined;
    const held = new Promise<void>((r) => (release = r));
    let asked = (): void => undefined;
    const looking = new Promise<void>((r) => (asked = r));
    const lookup: typeof gh.access.fetchImpl = async (input, init) => {
      if ((init?.method ?? 'GET') === 'GET' && input.includes('/actions/runs?')) {
        asked();
        await held;
      }
      return await gh.access.fetchImpl(input, init);
    };
    const second = await runInDurableObject(p, async (instance: Person) => {
      const woken = instance.wake(t1, { ...gh.access, fetchImpl: lookup });
      await looking;
      // Meanwhile R0 reports done, and a press admits R1, its dispatch due now.
      expect(instance.runnerReport(first.run.id, await hashTicket(ticket), { attempt: 1, seq: 1, phase: 'done' }, t1)).toMatchObject({ accepted: true });
      const admitted = instance.admit({ accountEpoch: instance.account()?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-2', now: t1, dailyLimit: 100, manifest: MANIFEST });
      release();
      await woken;
      return admitted;
    });
    if (!second.admitted) throw new Error('not admitted');
    // R0's look-up moves no deadline it did not own: R1's dispatch is still due now.
    expect(await alarmOf(sub)).toBeLessThanOrEqual(t1);
    // The alarm the runtime fires next sends R1 once, and sets its stale deadline; nothing is sent again.
    await runInDurableObject(p, async (instance: Person) => {
      await instance.wake(t1, gh.access);
    });
    expect(triesOf(gh, second.run.id)).toBe(1);
    expect(await alarmOf(sub)).toBe(second.run.requestedAt + QUEUED_STALE_MS);
    expect(triesOf(gh, first.run.id)).toBe(1);
  });

  it('admission sets the stale alarm', async () => {
    const who = await holder();
    const { run } = await process(who, pressSide().fetchImpl, 'press-1');
    await dispatchOf(gh, run?.id ?? '');
    const p = person(who.sub);
    expect(await alarmOf(who.sub)).toBe((run?.requestedAt ?? 0) + QUEUED_STALE_MS);
    // The deadline passes with no progress: the alarm looks the run up with this object's env and the
    // Workers fetch (answered here, never sent), and a failed lookup writes the stale expiry.
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const outbound = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    try {
      const failed = await runInDurableObject(p, async (instance, state) => {
        state.storage.sql.exec('UPDATE runs SET requested_at = requested_at - ?', QUEUED_STALE_MS + 1000);
        // The run's deadline (TL-P4-14) moves back with it, so the alarm finds it due.
        state.storage.sql.exec(`UPDATE deadlines SET at = at - ? WHERE kind = 'run'`, QUEUED_STALE_MS + 1000);
        await instance.alarm();
        return state.storage.sql.exec<{ phase: string; failure: string }>('SELECT phase, failure FROM runs').one();
      });
      expect(failed).toEqual({ phase: 'failed', failure: STALE_FAILURE });
      expect(outbound).toHaveBeenCalledTimes(1);
      expect(String(outbound.mock.calls[0]?.[0])).toContain(`/repos/${env.GITHUB_REPO}/actions/runs?event=repository_dispatch`);
    } finally {
      outbound.mockRestore();
      log.mockRestore();
    }
  });
});

describe('dispatch retries', () => {
  const input = { repo: 'owner/name', token: 'test-github-token', runId: 'run-1', attempt: 1, ticket: 't', scope: 'instructions' as const, allowWeb: true };
  /** A pretend GitHub that answers each call from `script` (null: the network fails), then 204. */
  function scripted(script: (number | null)[]) {
    const calls: number[] = [];
    const fetchImpl = (): Promise<Response> => {
      const next = script[calls.length];
      calls.push(calls.length);
      if (next === null) return Promise.reject(new Error('network down'));
      return Promise.resolve(new Response(null, { status: next ?? 204 }));
    };
    return { calls, fetchImpl };
  }

  it('a dispatch network error is retried twice with backoff', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const waits: number[] = [];
      const sleep = (ms: number): Promise<void> => {
        waits.push(ms);
        return Promise.resolve();
      };
      const lost = scripted([null, null, null]);
      expect(await dispatchOutcome(input, lost.fetchImpl, sleep)).toBe('lost');
      expect(lost.calls).toHaveLength(3);
      expect(waits).toHaveLength(2);
      expect(waits[0]).toBeGreaterThan(0);
      expect(waits[1] ?? 0).toBeGreaterThanOrEqual(waits[0] ?? 0);
      // A blip that clears on the second try is accepted; a 5xx is retried too.
      const blip = scripted([null]);
      expect(await dispatchOutcome(input, blip.fetchImpl, sleep)).toBe('sent');
      expect(blip.calls).toHaveLength(2);
      const flaky = scripted([503, 502]);
      expect(await dispatchOutcome(input, flaky.fetchImpl, sleep)).toBe('sent');
      expect(flaky.calls).toHaveLength(3);
      // A 4xx is never retried.
      const refused = scripted([404]);
      expect(await dispatchOutcome(input, refused.fetchImpl, sleep)).toBe('refused');
      expect(refused.calls).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  it('a dispatch that keeps failing arms the alarm at 60 seconds', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      gh.script = { dispatch: null };
      const who = await holder();
      const before = Date.now();
      const { run } = await process(who, pressSide().fetchImpl, 'press-1');
      const alarm = await lostArmed(who.sub, before);
      expect(alarm).toBeLessThanOrEqual(Date.now() + 60_000);
      expect(triesOf(gh, run?.id)).toBe(3);
      // At that alarm the run is looked up, and attempt 1 with no job is redispatched once, as attempt 2.
      gh.script = {};
      await runInDurableObject(person(who.sub), async (instance: Person) => {
        await instance.recover(alarm + 1, gh.access);
      });
      expect((await dispatchOf(gh, run?.id ?? '', 2)).attempt).toBe(2);
      expect(triesOf(gh, run?.id)).toBe(4);
      expect((await person(who.sub).runStatus(alarm + 1)).run?.id).toBe(run?.id);
    } finally {
      log.mockRestore();
    }
  });

  it("a lost dispatch's early look-up leaves a run that has reported alone", async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      gh.script = { dispatch: null };
      const who = await holder();
      const before = Date.now();
      const { run } = await process(who, pressSide().fetchImpl, 'press-1');
      const alarm = await lostArmed(who.sub, before);
      const { ticket } = await dispatchOf(gh, run?.id ?? '');
      const p = person(who.sub);
      // GitHub took one of the tries after all: the runner starts and reports.
      const reported = await p.runnerReport(run?.id ?? '', await hashTicket(ticket), { attempt: 1, seq: 1, phase: 'reading', total: 2 }, alarm - 40_000);
      if (!reported.accepted) throw new Error('report refused');
      const down = vi.fn((): Promise<Response> => Promise.resolve(new Response(null, { status: 502 })));
      await runInDurableObject(p, async (instance: Person) => {
        await instance.recover(alarm + 1, { repo: env.GITHUB_REPO, token: 'test-github-token', fetchImpl: down });
      });
      expect((await p.runStatus(alarm + 1)).run?.phase).toBe('reading');
      expect(down).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('an early look-up that GitHub cannot answer waits and rechecks', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      gh.script = { dispatch: null };
      const who = await holder();
      const before = Date.now();
      const { run } = await process(who, pressSide().fetchImpl, 'press-1');
      const alarm = await lostArmed(who.sub, before);
      const p = person(who.sub);
      const down = (): Promise<Response> => Promise.resolve(new Response(null, { status: 502 }));
      await runInDurableObject(p, async (instance: Person) => {
        await instance.recover(alarm + 1, { repo: env.GITHUB_REPO, token: 'test-github-token', fetchImpl: down });
      });
      expect((await p.runStatus(alarm + 1)).run?.phase).toBe('queued');
      expect(await alarmOf(who.sub)).toBe(alarm + 1 + 60_000);
      expect(run?.id).toBeDefined();
    } finally {
      log.mockRestore();
    }
  });

  it('a refused dispatch keeps the normal stale window', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      gh.script = { dispatch: 404 };
      const who = await holder();
      const { run } = await process(who, pressSide().fetchImpl, 'press-1');
      await dispatchOf(gh, run?.id ?? '');
      await vi.waitFor(async () => expect(await alarmOf(who.sub)).toBe((run?.requestedAt ?? 0) + QUEUED_STALE_MS), WAIT);
      expect(triesOf(gh, run?.id)).toBe(1);
    } finally {
      log.mockRestore();
    }
  });
});
