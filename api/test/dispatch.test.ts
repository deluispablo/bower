import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { QUEUED_STALE_MS, STALE_FAILURE } from '../src/process.js';
import type { RunReply } from '../src/process.js';
import { personIdOf } from '../src/run-ticket.js';
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
        expect(gh.sent).toHaveLength(1);
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
