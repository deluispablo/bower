import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Env } from '../src/env.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { STALE_RUN_MS, isActiveRun } from '../src/process.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { getQuota, getRun, keys, putRun, putUser } from '../src/store.js';
import type { Run, User } from '../src/types.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types`), so the
 * bindings from `wrangler.toml` and `vitest.config.ts` are asserted once.
 */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;

const API = 'https://api.example.com';
const USER_ID = 'user-1';
const DISPATCH_URL = `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`;

interface GitHubCall {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

/** A stub GitHub answering every call with `status` and recording it. */
function githubStub(status = 204): {
  calls: GitHubCall[];
  fetchImpl: FetchLike;
} {
  const calls: GitHubCall[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    calls.push({
      url: input,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body:
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as unknown)
          : undefined,
    });
    return Promise.resolve(
      new Response(status === 204 ? null : 'boom', {
        status,
        headers: { 'x-github-request-id': 'GH-REQUEST-ID' },
      }),
    );
  };
  return { calls, fetchImpl };
}

async function seedUser(extra: Partial<User> = {}): Promise<void> {
  await putUser(kv, {
    id: USER_ID,
    email: 'you@example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    encRefreshToken: 'v1.test-envelope',
    vault: {
      folderId: 'FOLDER_ID',
      inboxFolderId: 'INBOX_FOLDER_ID',
      name: 'Bower',
    },
    ...extra,
  });
}

async function sessionCookie(): Promise<string> {
  const token = await signSession({ userId: USER_ID }, env.SESSION_SECRET);
  return `${SESSION_COOKIE}=${token}`;
}

async function postProcess(
  fetchImpl: FetchLike,
  cookie?: string,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = cookie;
  return createApp({ fetchImpl }).request(
    `${API}/process`,
    { method: 'POST', headers },
    env,
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RunBody {
  run: Run;
}

interface ErrorBody {
  error: { code: string; message: string };
  retryAfter?: number;
}

beforeEach(async () => {
  const listed = await kv.list({});
  await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
});

describe('isActiveRun', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  const minutesAgo = (minutes: number): string =>
    new Date(now.getTime() - minutes * 60 * 1000).toISOString();

  it('is active for a fresh queued run', () => {
    expect(
      isActiveRun({ state: 'queued', requestedAt: minutesAgo(1) }, now),
    ).toBe(true);
  });

  it('is active for a running run started recently, even if requested long ago', () => {
    expect(
      isActiveRun(
        {
          state: 'running',
          requestedAt: minutesAgo(40),
          startedAt: minutesAgo(5),
        },
        now,
      ),
    ).toBe(true);
  });

  it('is not active once done or failed', () => {
    expect(
      isActiveRun({ state: 'done', requestedAt: minutesAgo(1) }, now),
    ).toBe(false);
    expect(
      isActiveRun({ state: 'failed', requestedAt: minutesAgo(1) }, now),
    ).toBe(false);
  });

  it('is not active when stale (25 minutes or more without news)', () => {
    expect(
      isActiveRun({ state: 'queued', requestedAt: minutesAgo(30) }, now),
    ).toBe(false);
    expect(
      isActiveRun(
        {
          state: 'running',
          requestedAt: minutesAgo(40),
          startedAt: minutesAgo(26),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isActiveRun(
        {
          state: 'queued',
          requestedAt: new Date(now.getTime() - STALE_RUN_MS).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });

  it('is not active when there is no run', () => {
    expect(isActiveRun(undefined, now)).toBe(false);
  });
});

describe('POST /process', () => {
  it('dispatches ingest, stores a queued run and counts one', async () => {
    await seedUser();
    const github = githubStub();

    const response = await postProcess(github.fetchImpl, await sessionCookie());

    expect(response.status).toBe(202);
    const { run } = await response.json<RunBody>();
    expect(run.state).toBe('queued');
    expect(typeof run.runId).toBe('string');
    expect(Date.parse(run.requestedAt)).not.toBeNaN();

    expect(github.calls).toHaveLength(1);
    const [call] = github.calls;
    expect(call?.url).toBe(DISPATCH_URL);
    expect(call?.method).toBe('POST');
    expect(call?.headers.get('authorization')).toMatch(/^Bearer \S+$/);
    expect(call?.headers.get('accept')).toBe('application/vnd.github+json');
    expect(call?.headers.get('x-github-api-version')).toBe('2022-11-28');
    expect(call?.headers.get('user-agent')).toBe('bower-api');
    expect(call?.body).toEqual({
      event_type: 'ingest',
      client_payload: { vault_id: USER_ID },
    });

    expect(await getRun(kv, USER_ID)).toEqual(run);
    expect(await getQuota(kv, USER_ID, today())).toBe(1);
  });

  it('returns the active run on a second press without dispatching again', async () => {
    await seedUser();
    const github = githubStub();
    const cookie = await sessionCookie();

    const first = await (
      await postProcess(github.fetchImpl, cookie)
    ).json<RunBody>();
    const second = await postProcess(github.fetchImpl, cookie);

    expect(second.status).toBe(202);
    const { run } = await second.json<RunBody>();
    expect(run.runId).toBe(first.run.runId);
    expect(github.calls).toHaveLength(1);
    expect(await getQuota(kv, USER_ID, today())).toBe(1);
  });

  it('replaces a stale run with a new dispatch', async () => {
    await seedUser();
    const stale: Run = {
      state: 'queued',
      requestedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      runId: 'stale-run-id',
    };
    await putRun(kv, USER_ID, stale);
    const github = githubStub();

    const response = await postProcess(github.fetchImpl, await sessionCookie());

    expect(response.status).toBe(202);
    const { run } = await response.json<RunBody>();
    expect(run.runId).not.toBe('stale-run-id');
    expect(run.state).toBe('queued');
    expect(github.calls).toHaveLength(1);
    expect(await getRun(kv, USER_ID)).toEqual(run);
  });

  it('answers 429 quota with retryAfter once the daily limit is reached', async () => {
    await seedUser();
    await kv.put(keys.quota(USER_ID, today()), env.DAILY_RUN_LIMIT);
    const github = githubStub();

    const response = await postProcess(github.fetchImpl, await sessionCookie());

    expect(response.status).toBe(429);
    const body = await response.json<ErrorBody>();
    expect(body.error.code).toBe('quota');
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
    expect(body.retryAfter).toBeLessThanOrEqual(86400);
    expect(response.headers.get('retry-after')).toBe(String(body.retryAfter));
    expect(github.calls).toHaveLength(0);
    expect(await getRun(kv, USER_ID)).toBeUndefined();
  });

  it.each([404, 500])(
    'answers 502 dispatch when GitHub answers %i, storing and counting nothing',
    async (status) => {
      await seedUser();
      const github = githubStub(status);

      const response = await postProcess(
        github.fetchImpl,
        await sessionCookie(),
      );

      expect(response.status).toBe(502);
      const body = await response.json<ErrorBody>();
      expect(body.error.code).toBe('dispatch');
      expect(github.calls).toHaveLength(1);
      expect(await getRun(kv, USER_ID)).toBeUndefined();
      expect(await getQuota(kv, USER_ID, today())).toBe(0);
    },
  );

  it('answers 409 no_vault when the user has no vault yet', async () => {
    await seedUser({ vault: undefined });
    const github = githubStub();

    const response = await postProcess(github.fetchImpl, await sessionCookie());

    expect(response.status).toBe(409);
    expect((await response.json<ErrorBody>()).error.code).toBe('no_vault');
    expect(github.calls).toHaveLength(0);
  });

  it('answers 401 without a session', async () => {
    const github = githubStub();

    const response = await postProcess(github.fetchImpl);

    expect(response.status).toBe(401);
    expect(github.calls).toHaveLength(0);
  });
});
