import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { QUEUED_STALE_MS, RUNNING_STALE_MS } from '../src/process.js';
import { issueRunTicket } from '../src/run-ticket.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { JOB_CHECK_AFTER_MS, settleFromJob } from '../src/status.js';
import {
  RUN_HISTORY_LIMIT,
  deleteUserData,
  getRun,
  getRunTicket,
  keys,
  putRun,
  putUser,
} from '../src/store.js';
import type { FetchLike } from '../src/google.js';
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

async function getStatus(
  cookie?: string,
  fetchImpl?: FetchLike,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = cookie;
  return createApp(fetchImpl === undefined ? {} : { fetchImpl }).request(
    `${API}/status`,
    { headers },
    env,
  );
}

/** A GitHub stub answering one workflow run lookup, recording the URLs. */
function jobStub(
  status: number,
  body: unknown,
): { urls: string[]; fetchImpl: FetchLike } {
  const urls: string[] = [];
  const fetchImpl: FetchLike = (input) => {
    urls.push(String(input));
    return Promise.resolve(Response.json(body, { status }));
  };
  return { urls, fetchImpl };
}

/** A run the runner said was running `ago` ms ago, as GitHub run 4242. */
function runningFor(ago: number): Run {
  const startedAt = new Date(Date.now() - ago).toISOString();
  return { state: 'running', requestedAt: startedAt, startedAt, runId: '4242' };
}

interface StatusResponseBody {
  run: Run | null;
  stale: boolean;
}

beforeEach(async () => {
  const listed = await kv.list({});
  await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
});

describe('GET /status: the job-conclusion fallback (#315)', () => {
  it('settles a silent running run as done when its job succeeded, retiring the ticket', async () => {
    await seedUser();
    await putRun(kv, USER_ID, runningFor(JOB_CHECK_AFTER_MS + 1000));
    await issueRunTicket(kv, USER_ID, 'ingest', new Date(), 60 * 60 * 1000);
    const github = jobStub(200, { status: 'completed', conclusion: 'success' });

    const response = await getStatus(await sessionCookie(), github.fetchImpl);

    expect(response.status).toBe(200);
    const body = await response.json<StatusResponseBody>();
    expect(body.stale).toBe(false);
    expect(body.run?.state).toBe('done');
    expect(Date.parse(body.run?.finishedAt ?? '')).not.toBeNaN();
    expect(github.urls).toEqual([
      'https://api.github.com/repos/OWNER/bower-home/actions/runs/4242',
    ]);
    expect(await getRun(kv, USER_ID)).toEqual(body.run);
    expect(await getRunTicket(kv, USER_ID, 'ingest')).toBeUndefined();
  });

  it('settles it as failed with the conclusion when the job did not succeed', async () => {
    await seedUser();
    await putRun(kv, USER_ID, runningFor(JOB_CHECK_AFTER_MS + 1000));
    const github = jobStub(200, {
      status: 'completed',
      conclusion: 'timed_out',
    });

    const body = await (
      await getStatus(await sessionCookie(), github.fetchImpl)
    ).json<StatusResponseBody>();

    expect(body.run?.state).toBe('failed');
    expect(body.run?.error).toBe('job timed_out');
    expect(body.run?.reason).toBe('timeout');
  });

  it('gives a settled failure a reason for people (#1000)', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const run: Run = {
      state: 'running',
      requestedAt: '2026-06-01T11:00:00.000Z',
      runId: '42',
      jobCheckedAt: '2026-06-01T11:59:00.000Z',
    };
    expect(settleFromJob(run, 'cancelled', now)).toEqual({
      state: 'failed',
      requestedAt: run.requestedAt,
      runId: '42',
      error: 'job cancelled',
      reason: 'unknown',
      finishedAt: now.toISOString(),
    });
    expect(settleFromJob(run, 'failure', now).reason).toBe('unknown');
    expect(settleFromJob(run, 'timed_out', now).reason).toBe('timeout');
    const done = settleFromJob(run, 'success', now);
    expect(done.state).toBe('done');
    expect(done.reason).toBeUndefined();
    expect(done.jobCheckedAt).toBeUndefined();
  });

  it('leaves a job still going running, and asks again only after a minute', async () => {
    await seedUser();
    await putRun(kv, USER_ID, runningFor(JOB_CHECK_AFTER_MS + 1000));
    const github = jobStub(200, { status: 'in_progress', conclusion: null });

    const first = await (
      await getStatus(await sessionCookie(), github.fetchImpl)
    ).json<StatusResponseBody>();
    await getStatus(await sessionCookie(), github.fetchImpl);

    expect(first.run?.state).toBe('running');
    expect(github.urls).toHaveLength(1);
    expect((await getRun(kv, USER_ID))?.jobCheckedAt).toBeDefined();
  });

  it('does not ask GitHub for a young run, or one without a GitHub run id', async () => {
    await seedUser();
    const github = jobStub(200, { status: 'completed', conclusion: 'success' });
    await putRun(kv, USER_ID, runningFor(60 * 1000));
    await getStatus(await sessionCookie(), github.fetchImpl);
    await putRun(kv, USER_ID, {
      ...runningFor(JOB_CHECK_AFTER_MS + 1000),
      runId: 'c0ffee00-0000-4000-8000-000000000000',
    });
    await getStatus(await sessionCookie(), github.fetchImpl);

    expect(github.urls).toHaveLength(0);
  });

  it('keeps the run as it is when GitHub will not say (a token without Actions access)', async () => {
    await seedUser();
    const run = runningFor(JOB_CHECK_AFTER_MS + 1000);
    await putRun(kv, USER_ID, run);
    const github = jobStub(403, { message: 'Resource not accessible' });

    const body = await (
      await getStatus(await sessionCookie(), github.fetchImpl)
    ).json<StatusResponseBody>();

    expect(body.run?.state).toBe('running');
  });
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

  it('returns a failed run with its reason for people (#375)', async () => {
    await seedUser();
    const run: Run = {
      state: 'failed',
      requestedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      finishedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      error: 'agent run: exit 124',
      reason: 'timeout',
      runId: 'run-1',
    };
    await putRun(kv, USER_ID, run);

    const response = await getStatus(await sessionCookie());

    expect(response.status).toBe(200);
    const body = await response.json<StatusResponseBody>();
    expect(body.run?.reason).toBe('timeout');
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

  it('keeps a queued run active at 16 minutes', async () => {
    await seedUser();
    const run: Run = {
      state: 'queued',
      requestedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      runId: 'run-1',
    };
    await putRun(kv, USER_ID, run);

    const response = await getStatus(await sessionCookie());

    const body = await response.json<StatusResponseBody>();
    expect(body.stale).toBe(false);
    expect(body.run).toEqual(run);
  });

  it('marks a queued run failed with error stale at 17 minutes', async () => {
    await seedUser();
    const stale: Run = {
      state: 'queued',
      requestedAt: new Date(Date.now() - 17 * 60 * 1000).toISOString(),
      runId: 'run-1',
    };
    await putRun(kv, USER_ID, stale);

    const response = await getStatus(await sessionCookie());

    const body = await response.json<StatusResponseBody>();
    expect(body.stale).toBe(true);
    expect(body.run?.state).toBe('failed');
    expect(body.run?.error).toBe('stale');
    expect(body.run?.reason).toBe('timeout');
    expect(await getRun(kv, USER_ID)).toEqual(body.run);
  });

  it('gives a running run its startedAt, as the demo does (R-API-4, #922)', async () => {
    await seedUser();
    const run = runningFor(60 * 1000);
    await putRun(kv, USER_ID, run);

    const response = await getStatus(await sessionCookie());

    expect(response.status).toBe(200);
    const body = await response.json<StatusResponseBody>();
    expect(body.stale).toBe(false);
    expect(body.run?.state).toBe('running');
    // The same ISO string the runner's first report stored, never rewritten.
    expect(body.run?.startedAt).toBe(run.startedAt);
    expect(Number.isNaN(Date.parse(body.run?.startedAt ?? ''))).toBe(false);
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

describe('GET /runs (#345)', () => {
  async function getRuns(cookie?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (cookie !== undefined) headers.cookie = cookie;
    return createApp().request(`${API}/runs`, { headers }, env);
  }

  /** A finished ingest requested `minutes` after a fixed start. */
  function finished(minutes: number, state: 'done' | 'failed' = 'done'): Run {
    const at = Date.parse('2026-09-27T08:00:00.000Z') + minutes * 60_000;
    return {
      state,
      requestedAt: new Date(at).toISOString(),
      finishedAt: new Date(at + 180_000).toISOString(),
      processed: [`0-Inbox/${minutes}.md`],
      items: [{ path: `0-Inbox/${minutes}.md`, kind: 'file' }],
    };
  }

  it('answers 401 without a session', async () => {
    const response = await getRuns();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'unauthenticated' },
    });
  });

  it('lists finished tidy-ups newest first, the same run once, never a queued one or a lint', async () => {
    await seedUser();
    const first = finished(0);
    const second = finished(60, 'failed');
    await putRun(kv, USER_ID, {
      state: 'queued',
      requestedAt: first.requestedAt,
    });
    await putRun(kv, USER_ID, first);
    // The same run settled again (a late report): replaced, not repeated.
    await putRun(kv, USER_ID, { ...first, summary: 'Filed one note.' });
    await putRun(kv, USER_ID, finished(30), 'lint');
    await putRun(kv, USER_ID, second);

    const response = await getRuns(await sessionCookie());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      runs: [second, { ...first, summary: 'Filed one note.' }],
    });
  });

  it('keeps the last RUN_HISTORY_LIMIT runs and drops the older records', async () => {
    await seedUser();
    for (let i = 0; i <= RUN_HISTORY_LIMIT; i += 1) {
      await putRun(kv, USER_ID, finished(i));
    }

    const response = await getRuns(await sessionCookie());
    const { runs } = await response.json<{ runs: Run[] }>();

    expect(runs).toHaveLength(RUN_HISTORY_LIMIT);
    expect(runs[0]).toEqual(finished(RUN_HISTORY_LIMIT));
    expect(runs.at(-1)).toEqual(finished(1));
    const records = await kv.list({ prefix: keys.runRecordPrefix(USER_ID) });
    expect(records.keys).toHaveLength(RUN_HISTORY_LIMIT);
  });

  it('a stale run settled by GET /status shows up as failed', async () => {
    await seedUser();
    const requestedAt = new Date(
      Date.now() - QUEUED_STALE_MS - 1000,
    ).toISOString();
    await putRun(kv, USER_ID, { state: 'queued', requestedAt });
    await getStatus(await sessionCookie());

    const { runs } = await (
      await getRuns(await sessionCookie())
    ).json<{ runs: Run[] }>();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ state: 'failed', error: 'stale' });
  });

  it('deleting the account deletes the history', async () => {
    await seedUser();
    await putRun(kv, USER_ID, finished(0));
    await deleteUserData(kv, USER_ID);
    expect(await kv.get(keys.runIndex(USER_ID))).toBeNull();
    const records = await kv.list({ prefix: keys.runRecordPrefix(USER_ID) });
    expect(records.keys).toHaveLength(0);
  });
});
