import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { dispatchTidy } from '../src/github.js';
import { QUEUED_STALE_MS, STALE_FAILURE } from '../src/process.js';
import type { RunReply } from '../src/process.js';
import { hashTicket, personIdOf } from '../src/run-ticket.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';
import { driveFolder, withThingsIn, type DriveFolder } from './drive-v3.js';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const APP = 'https://app.example.com';
const API = 'https://api.example.com';

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

interface Sent {
  url: string;
  init: RequestInit;
  body: {
    event_type: string;
    client_payload: { run_id: string; attempt: number; ticket: string; scope: string; allow_web: boolean };
  };
}

/** A pretend GitHub: records each call and answers `status` (or fails the network when `status` is null). */
function github(status: number | null = 204) {
  const sent: Sent[] = [];
  const fetchImpl = (url: string, init: RequestInit = {}): Promise<Response> => {
    sent.push({ url, init, body: JSON.parse(String(init.body)) as Sent['body'] });
    if (status === null) return Promise.reject(new Error('network down, ticket-secret'));
    return Promise.resolve(new Response(null, { status }));
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
  bindings: Env = env,
): Promise<RunReply> {
  // Drive is the person's pretend folder; everything else goes to the pretend GitHub.
  const fetchImpl = (url: string, init?: RequestInit): Promise<Response> =>
    url.startsWith('https://www.googleapis.com/') ? who.folder.fetchImpl(url, init) : github(url, init);
  const r = await createApp({ fetchImpl }).request(
    `${APP}/process`,
    {
      method: 'POST',
      headers: { cookie: who.cookie, origin: APP, 'content-type': 'application/json', ...who.fence },
      body: JSON.stringify({ scope: 'instructions', allowWeb: true, requestId }),
    },
    bindings,
  );
  expect(r.status).toBe(200);
  return (await r.json()) as RunReply;
}

describe('dispatch on admission', () => {
  it('a new run is dispatched once with its ticket', async () => {
    const who = await holder();
    const gh = github();
    const { run } = await process(who, gh.fetchImpl, 'press-1');
    expect(gh.sent).toHaveLength(1);
    const call = gh.sent[0];
    if (call === undefined) throw new Error('nothing sent');
    expect(call.url).toBe(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`);
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-github-token');
    expect(headers.Accept).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    const payload = call.body.client_payload;
    expect(call.body.event_type).toBe('bower-tidy');
    expect(Object.keys(payload).sort()).toEqual(['allow_web', 'attempt', 'run_id', 'scope', 'ticket']);
    expect(payload).toMatchObject({ run_id: run?.id, attempt: 1, scope: 'instructions', allow_web: true });
    expect(personIdOf(payload.run_id)).toBe(env.PERSON.idFromName(who.sub).toString());
    // The ticket opens the token route, with the folder.
    const token = await createApp().request(
      `${API}/runner/runs/${payload.run_id}/token`,
      { headers: { authorization: `Bearer ${payload.ticket}` } },
      env,
    );
    expect(token.status).toBe(200);
    expect(await token.json()).toMatchObject({ folderId: who.folder.root, attempt: 1 });
  });

  it('admission timing is logged in parts', async () => {
    const who = await holder();
    const gh = github();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { run } = await process(who, gh.fetchImpl, 'press-1');
    await process(who, gh.fetchImpl, 'press-1');
    const lines = log.mock.calls.map((args) => args.map(String).join(' ')).filter((line) => line.startsWith('admission timing'));
    log.mockRestore();
    // One line per press, in milliseconds: session and lease, the would-admit check, the Drive reads, the admit, the
    // ticket and dispatch to GitHub, and the whole; a repeat reads nothing and dispatches nothing.
    const part = (name: string): string => `${name}=(\\d+)ms`;
    const shape = new RegExp(`^admission timing: ${['session', 'check', 'reads', 'admit', 'dispatch', 'total'].map(part).join(' ')}$`);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toMatch(shape);
    const [, , , readsRepeat, , dispatchRepeat] = shape.exec(lines[1] ?? '') ?? [];
    expect([readsRepeat, dispatchRepeat]).toEqual(['0', '0']);
    // Numbers only: no run id, folder or ticket.
    const ticket = gh.sent[0]?.body.client_payload.ticket ?? '';
    for (const line of lines) for (const secret of [run?.id ?? '', who.folder.root, ticket]) expect(line).not.toContain(secret);
  });

  it('a repeat or an active run dispatches nothing', async () => {
    const who = await holder();
    const gh = github();
    const first = await process(who, gh.fetchImpl, 'press-1');
    expect(await process(who, gh.fetchImpl, 'press-1')).toEqual(first);
    expect((await process(who, gh.fetchImpl, 'press-2')).run?.id).toBe(first.run?.id);
    expect(gh.sent).toHaveLength(1);
  });

  it('a failed dispatch leaves the run queued', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const status of [500, null]) {
        const who = await holder();
        const gh = github(status);
        const reply = await process(who, gh.fetchImpl, 'press-1');
        expect(gh.sent).toHaveLength(3);
        expect(reply.run?.phase).toBe('queued');
        expect(reply.revision).toBe(1);
        const lines = log.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
        expect(lines).not.toContain(gh.sent[0]?.body.client_payload.ticket ?? 'missing');
        expect(lines).not.toContain('test-github-token');
        expect(lines).not.toContain('ticket-secret');
        expect(lines).toContain(status === null ? 'network' : String(status));
      }
    } finally {
      log.mockRestore();
    }
  });

  it('no GitHub token sends nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const who = await holder();
      const gh = github();
      const bare = { ...env, GITHUB_TOKEN: undefined } as unknown as Env;
      const reply = await process(who, gh.fetchImpl, 'press-1', bare);
      expect(reply.run?.phase).toBe('queued');
      expect(gh.sent).toHaveLength(0);
      expect(log.mock.calls.map((c) => c.map(String).join(' ')).join('\n')).toContain('not configured');
    } finally {
      log.mockRestore();
    }
  });

  it('admission sets the stale alarm', async () => {
    const who = await holder();
    const gh = github();
    const { run } = await process(who, gh.fetchImpl, 'press-1');
    const p = person(who.sub);
    const alarm = await runInDurableObject(p, (_i, state) => state.storage.getAlarm());
    expect(alarm).toBe((run?.requestedAt ?? 0) + QUEUED_STALE_MS);
    // The deadline passes with no progress: the alarm looks the run up with this object's env and the
    // Workers fetch (answered here, never sent), and a failed lookup writes the stale expiry.
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const outbound = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    try {
      const failed = await runInDurableObject(p, async (instance, state) => {
        state.storage.sql.exec('UPDATE runs SET requested_at = requested_at - ?', QUEUED_STALE_MS + 1000);
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
      expect(await dispatchTidy(input, lost.fetchImpl, sleep)).toBe(false);
      expect(lost.calls).toHaveLength(3);
      expect(waits).toHaveLength(2);
      expect(waits[0]).toBeGreaterThan(0);
      expect(waits[1] ?? 0).toBeGreaterThanOrEqual(waits[0] ?? 0);
      // A blip that clears on the second try is accepted; a 5xx is retried too.
      const blip = scripted([null]);
      expect(await dispatchTidy(input, blip.fetchImpl, sleep)).toBe(true);
      expect(blip.calls).toHaveLength(2);
      const flaky = scripted([503, 502]);
      expect(await dispatchTidy(input, flaky.fetchImpl, sleep)).toBe(true);
      expect(flaky.calls).toHaveLength(3);
      // A 4xx is never retried.
      const refused = scripted([404]);
      expect(await dispatchTidy(input, refused.fetchImpl, sleep)).toBe(false);
      expect(refused.calls).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  it('a dispatch that keeps failing arms the alarm at 60 seconds', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const who = await holder();
      const gh = github(null);
      const before = Date.now();
      const { run } = await process(who, gh.fetchImpl, 'press-1');
      const after = Date.now();
      expect(gh.sent).toHaveLength(3);
      const alarm = await runInDurableObject(person(who.sub), (_i, state) => state.storage.getAlarm());
      expect(alarm).toBeGreaterThanOrEqual(before + 60_000);
      expect(alarm).toBeLessThanOrEqual(after + 60_000);
      // At that alarm the run is looked up, and attempt 1 with no job is redispatched once, as attempt 2.
      const sent: string[] = [];
      const fetchImpl = (url: string, init?: RequestInit): Promise<Response> => {
        sent.push(`${init?.method ?? 'GET'} ${url}`);
        return Promise.resolve(init?.method === 'POST' ? new Response(null, { status: 204 }) : Response.json({ workflow_runs: [] }));
      };
      await runInDurableObject(person(who.sub), async (instance) => {
        await instance.recover((alarm ?? 0) + 1, { repo: env.GITHUB_REPO, token: 'test-github-token', fetchImpl });
      });
      expect(sent.filter((c) => c.startsWith('POST'))).toHaveLength(1);
      expect((await person(who.sub).runStatus((alarm ?? 0) + 1)).run?.id).toBe(run?.id);
    } finally {
      log.mockRestore();
    }
  });
  it("a lost dispatch's early look-up leaves a run that has reported alone", async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const who = await holder();
      const gh = github(null);
      const { run } = await process(who, gh.fetchImpl, 'press-1');
      const ticket = gh.sent[0]?.body.client_payload.ticket ?? '';
      const p = person(who.sub);
      const alarm = (await runInDurableObject(p, (_i, state) => state.storage.getAlarm())) ?? 0;
      // GitHub took one of the tries after all: the runner starts and reports.
      const reported = await p.runnerReport(run?.id ?? '', await hashTicket(ticket), { attempt: 1, seq: 1, phase: 'reading', total: 2 }, alarm - 40_000);
      if (!reported.accepted) throw new Error('report refused');
      const down = vi.fn((): Promise<Response> => Promise.resolve(new Response(null, { status: 502 })));
      await runInDurableObject(p, async (instance) => {
        await instance.recover(alarm + 1, { repo: env.GITHUB_REPO, token: 'test-github-token', fetchImpl: down });
      });
      expect((await p.runStatus(alarm + 1)).run?.phase).toBe('reading');
      expect(down.mock.calls.filter(([url]) => String(url).includes('/dispatches'))).toHaveLength(0);
    } finally {
      log.mockRestore();
    }
  });

  it('an early look-up that GitHub cannot answer waits and rechecks', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const who = await holder();
      const { run } = await process(who, github(null).fetchImpl, 'press-1');
      const p = person(who.sub);
      const alarm = (await runInDurableObject(p, (_i, state) => state.storage.getAlarm())) ?? 0;
      const down = (): Promise<Response> => Promise.resolve(new Response(null, { status: 502 }));
      await runInDurableObject(p, async (instance) => {
        await instance.recover(alarm + 1, { repo: env.GITHUB_REPO, token: 'test-github-token', fetchImpl: down });
      });
      expect((await p.runStatus(alarm + 1)).run?.phase).toBe('queued');
      expect(await runInDurableObject(p, (_i, state) => state.storage.getAlarm())).toBe(alarm + 1 + 60_000);
      expect(run?.id).toBeDefined();
    } finally {
      log.mockRestore();
    }
  });

  it('a refused dispatch keeps the normal stale window', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const who = await holder();
      const gh = github(404);
      const { run } = await process(who, gh.fetchImpl, 'press-1');
      expect(gh.sent).toHaveLength(1);
      expect(await runInDurableObject(person(who.sub), (_i, state) => state.storage.getAlarm())).toBe((run?.requestedAt ?? 0) + QUEUED_STALE_MS);
    } finally {
      log.mockRestore();
    }
  });
});
