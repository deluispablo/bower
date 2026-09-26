import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { QUEUED_STALE_MS, RUNNING_STALE_MS } from '../src/process.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { getRun, putRun, putUser } from '../src/store.js';
import type { Run, User } from '../src/types.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types`), so the
 * bindings from `wrangler.toml` and `vitest.config.ts` are asserted once.
 */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;

const API = 'https://api.example.com';
const USER_ID = 'user-1';

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

async function getStatus(cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = cookie;
  return createApp().request(`${API}/status`, { headers }, env);
}

interface StatusResponseBody {
  run: Run | null;
  stale: boolean;
}

beforeEach(async () => {
  const listed = await kv.list({});
  await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
});

describe('GET /status', () => {
  it('answers 401 without a session', async () => {
    const response = await getStatus();
    expect(response.status).toBe(401);
  });

  it('returns run: null, stale: false when there is no run', async () => {
    await seedUser();

    const response = await getStatus(await sessionCookie());

    expect(response.status).toBe(200);
    expect(await response.json<StatusResponseBody>()).toEqual({
      run: null,
      stale: false,
    });
  });

  it('returns a fresh queued run unchanged, stale: false', async () => {
    await seedUser();
    const run: Run = {
      state: 'queued',
      requestedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      runId: 'run-1',
    };
    await putRun(kv, USER_ID, run);

    const response = await getStatus(await sessionCookie());

    expect(response.status).toBe(200);
    expect(await response.json<StatusResponseBody>()).toEqual({
      run,
      stale: false,
    });
    expect(await getRun(kv, USER_ID)).toEqual(run);
  });

  it('marks a stale running run failed, stores it, and reports stale: true', async () => {
    await seedUser();
    const stale: Run = {
      state: 'running',
      requestedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      startedAt: new Date(Date.now() - RUNNING_STALE_MS - 1000).toISOString(),
      runId: 'run-1',
    };
    await putRun(kv, USER_ID, stale);

    const response = await getStatus(await sessionCookie());

    expect(response.status).toBe(200);
    const body = await response.json<StatusResponseBody>();
    expect(body.stale).toBe(true);
    expect(body.run).toMatchObject({
      state: 'failed',
      error: 'stale',
      runId: 'run-1',
      requestedAt: stale.requestedAt,
      startedAt: stale.startedAt,
    });
    expect(Date.parse(body.run?.finishedAt ?? '')).not.toBeNaN();
    expect(await getRun(kv, USER_ID)).toEqual(body.run);
  });

  it('marks a stale queued run failed too', async () => {
    await seedUser();
    const stale: Run = {
      state: 'queued',
      requestedAt: new Date(Date.now() - QUEUED_STALE_MS - 1000).toISOString(),
      runId: 'run-1',
    };
    await putRun(kv, USER_ID, stale);

    const response = await getStatus(await sessionCookie());

    const body = await response.json<StatusResponseBody>();
    expect(body.stale).toBe(true);
    expect(body.run?.state).toBe('failed');
    expect(body.run?.error).toBe('stale');
    expect(await getRun(kv, USER_ID)).toEqual(body.run);
  });

  it('shows done with processed and summary once the runner reports it', async () => {
    await seedUser();
    const run: Run = {
      state: 'done',
      requestedAt: '2026-06-01T12:00:00.000Z',
      startedAt: '2026-06-01T12:01:00.000Z',
      finishedAt: '2026-06-01T12:05:00.000Z',
      runId: 'run-1',
      summary: 'Filed two notes.',
      processed: ['a.md', 'b.md'],
    };
    await putRun(kv, USER_ID, run);

    const response = await getStatus(await sessionCookie());

    expect(response.status).toBe(200);
    expect(await response.json<StatusResponseBody>()).toEqual({
      run,
      stale: false,
    });
  });
});
