import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Env } from '../src/env.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import {
  QUEUED_STALE_MS,
  RUNNING_STALE_MS,
  isActiveRun,
  markStale,
  runStaleness,
} from '../src/process.js';
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

describe('runStaleness', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  const minutesAgo = (minutes: number): string =>
    new Date(now.getTime() - minutes * 60 * 1000).toISOString();

  it('queued is active at 24 minutes, stale at 26', () => {
    expect(
      runStaleness({ state: 'queued', requestedAt: minutesAgo(24) }, now),
    ).toEqual({ active: true, stale: false });
    expect(
      runStaleness({ state: 'queued', requestedAt: minutesAgo(26) }, now),
    ).toEqual({ active: false, stale: true });
  });

  it('running is active at 29 minutes from startedAt, stale at 31', () => {
    expect(
      runStaleness(
        {
          state: 'running',
          requestedAt: minutesAgo(40),
          startedAt: minutesAgo(29),
        },
        now,
      ),
    ).toEqual({ active: true, stale: false });
    expect(
      runStaleness(
        {
          state: 'running',
          requestedAt: minutesAgo(40),
          startedAt: minutesAgo(31),
        },
        now,
      ),
    ).toEqual({ active: false, stale: true });
  });

  it('running with no startedAt falls back to requestedAt', () => {
    expect(
      runStaleness({ state: 'running', requestedAt: minutesAgo(24) }, now),
    ).toEqual({ active: true, stale: false });
    expect(
      runStaleness({ state: 'running', requestedAt: minutesAgo(31) }, now),
    ).toEqual({ active: false, stale: true });
  });

  it('done and failed are never active or stale, however old', () => {
    expect(
      runStaleness({ state: 'done', requestedAt: minutesAgo(1000) }, now),
    ).toEqual({ active: false, stale: false });
    expect(
      runStaleness({ state: 'failed', requestedAt: minutesAgo(1000) }, now),
    ).toEqual({ active: false, stale: false });
  });

  it('is neither active nor stale when there is no run', () => {
    expect(runStaleness(undefined, now)).toEqual({
      active: false,
      stale: false,
    });
  });

  it('is stale exactly at the limit, for both states', () => {
    expect(
      runStaleness(
        {
          state: 'queued',
          requestedAt: new Date(now.getTime() - QUEUED_STALE_MS).toISOString(),
        },
        now,
      ),
    ).toEqual({ active: false, stale: true });
    expect(
      runStaleness(
        {
          state: 'running',
          requestedAt: minutesAgo(60),
          startedAt: new Date(now.getTime() - RUNNING_STALE_MS).toISOString(),
        },
        now,
      ),
    ).toEqual({ active: false, stale: true });
  });
});

describe('isActiveRun', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  it('agrees with runStaleness(...).active', () => {
    const fresh: Run = { state: 'queued', requestedAt: now.toISOString() };
    const stale: Run = {
      state: 'queued',
      requestedAt: new Date(now.getTime() - QUEUED_STALE_MS).toISOString(),
    };
    expect(isActiveRun(fresh, now)).toBe(runStaleness(fresh, now).active);
    expect(isActiveRun(stale, now)).toBe(runStaleness(stale, now).active);
    expect(isActiveRun(stale, now)).toBe(false);
  });

  it('is not active when there is no run', () => {
    expect(isActiveRun(undefined, now)).toBe(false);
  });
});

describe('markStale', () => {
  it('marks failed with error stale, sets finishedAt, keeps the rest', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const run: Run = {
      state: 'running',
      requestedAt: '2026-06-01T11:00:00.000Z',
      startedAt: '2026-06-01T11:05:00.000Z',
      runId: 'r1',
    };

    expect(markStale(run, now)).toEqual({
      state: 'failed',
      requestedAt: run.requestedAt,
      startedAt: run.startedAt,
      runId: 'r1',
      error: 'stale',
      finishedAt: now.toISOString(),
    });
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

  it('records the stale run as failed before dispatching, even if the new dispatch fails', async () => {
    await seedUser();
    const stale: Run = {
      state: 'running',
      requestedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      startedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      runId: 'stale-run-id',
    };
    await putRun(kv, USER_ID, stale);
    const github = githubStub(500);

    const response = await postProcess(github.fetchImpl, await sessionCookie());

    expect(response.status).toBe(502);
    const stored = await getRun(kv, USER_ID);
    expect(stored).toMatchObject({
      state: 'failed',
      error: 'stale',
      runId: 'stale-run-id',
      requestedAt: stale.requestedAt,
      startedAt: stale.startedAt,
    });
    expect(Date.parse(stored?.finishedAt ?? '')).not.toBeNaN();
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
