import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GOOGLE_TOKEN_URL } from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { MAX_PROCESSED, MAX_TEXT_LENGTH } from '../src/runner.js';
import type { RunnerVault, RunnerVaultList } from '../src/runner.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import {
  getRun,
  getUser,
  putDriveToken,
  putRun,
  putUser,
} from '../src/store.js';
import type { Run, User } from '../src/types.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types`), so the
 * bindings from `wrangler.toml` and `vitest.config.ts` are asserted once.
 */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;

const API = 'https://api.example.com';
const USER_ID = 'user-1';
const REFRESH_TOKEN = 'test-refresh-token';
const ACCESS_TOKEN = 'test-access-token';
const API_KEY = 'test-claude-api-key';
const RUNNER_AUTH = `Bearer ${env.BOWER_API_KEY}`;

interface Call {
  url: string;
}

/**
 * A hermetic stand-in for Google's token endpoint and GitHub's dispatch:
 * records every call; the token endpoint answers `tokenResponse()`, GitHub
 * answers 204.
 */
function stub(tokenResponse?: () => Response): {
  calls: Call[];
  fetchImpl: FetchLike;
} {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = (input) => {
    calls.push({ url: input });
    if (input === GOOGLE_TOKEN_URL && tokenResponse !== undefined) {
      return Promise.resolve(tokenResponse());
    }
    if (input.startsWith('https://api.github.com/')) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.reject(new Error(`unexpected fetch in test: ${input}`));
  };
  return { calls, fetchImpl };
}

/** Stores a user with a vault and a refresh token encrypted with the fixture key. */
async function seedUser(extra: Partial<User> = {}): Promise<void> {
  const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
  await putUser(kv, {
    id: USER_ID,
    email: 'you@example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    encRefreshToken: await encrypt(REFRESH_TOKEN, key),
    vault: {
      folderId: 'FOLDER_ID',
      inboxFolderId: 'INBOX_FOLDER_ID',
      name: 'Bower',
    },
    ...extra,
  });
}

/** Caches a Drive token, so `GET /runner/vaults/:id` needs no Google call. */
async function seedDriveToken(): Promise<string> {
  const expiresAt = new Date(Date.now() + 3000 * 1000).toISOString();
  await putDriveToken(
    kv,
    USER_ID,
    { accessToken: ACCESS_TOKEN, expiresAt },
    3000,
  );
  return expiresAt;
}

async function getVault(
  fetchImpl: FetchLike,
  authorization: string | null = RUNNER_AUTH,
  id = USER_ID,
): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}/runner/vaults/${id}`,
    {
      headers: authorization === null ? {} : { authorization },
    },
    env,
  );
}

async function postStatus(
  body: unknown,
  authorization: string | null = RUNNER_AUTH,
  id = USER_ID,
): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (authorization !== null) headers.authorization = authorization;
  return createApp({ fetchImpl: stub().fetchImpl }).request(
    `${API}/runner/vaults/${id}/status`,
    {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  );
}

async function postProcess(fetchImpl: FetchLike): Promise<Response> {
  const token = await signSession({ userId: USER_ID }, env.SESSION_SECRET);
  return createApp({ fetchImpl }).request(
    `${API}/process`,
    {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE}=${token}`,
        origin: env.APP_ORIGIN,
      },
    },
    env,
  );
}

async function getStatus(): Promise<Response> {
  const token = await signSession({ userId: USER_ID }, env.SESSION_SECRET);
  return createApp({ fetchImpl: stub().fetchImpl }).request(
    `${API}/status`,
    { headers: { cookie: `${SESSION_COOKIE}=${token}` } },
    env,
  );
}

interface RunBody {
  run: Run;
}

interface ErrorBody {
  error: { code: string; message: string };
}

beforeEach(async () => {
  const listed = await kv.list({});
  await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
});

describe('runner key', () => {
  it.each([
    ['missing', null],
    ['wrong', 'Bearer not-the-key'],
    ['wrong scheme', `Basic ${env.BOWER_API_KEY}`],
    ['empty', 'Bearer '],
  ])('answers 401 unauthorized on GET with a %s key', async (_, auth) => {
    await seedUser();
    await seedDriveToken();

    const response = await getVault(stub().fetchImpl, auth);

    expect(response.status).toBe(401);
    expect((await response.json<ErrorBody>()).error.code).toBe('unauthorized');
  });

  it.each([
    ['missing', null],
    ['wrong', 'Bearer not-the-key'],
  ])(
    'answers 401 unauthorized on POST status with a %s key',
    async (_, auth) => {
      await seedUser();

      const response = await postStatus({ state: 'running' }, auth);

      expect(response.status).toBe(401);
      expect((await response.json<ErrorBody>()).error.code).toBe(
        'unauthorized',
      );
      expect(await getRun(kv, USER_ID)).toBeUndefined();
    },
  );

  it('does not accept the admin key', async () => {
    await seedUser();
    await seedDriveToken();

    const response = await getVault(
      stub().fetchImpl,
      `Bearer ${env.ADMIN_KEY}`,
    );

    expect(response.status).toBe(401);
  });
});

async function listVaults(
  authorization: string | null = RUNNER_AUTH,
): Promise<Response> {
  return createApp({ fetchImpl: stub().fetchImpl }).request(
    `${API}/runner/vaults`,
    { headers: authorization === null ? {} : { authorization } },
    env,
  );
}

describe('GET /runner/vaults', () => {
  it('lists the id of every user with a vault, and nothing else', async () => {
    await seedUser();
    await putUser(kv, {
      id: 'user-2',
      email: 'alex@example.com',
      createdAt: '2026-01-02T00:00:00.000Z',
      encRefreshToken: 'unused',
      vault: {
        folderId: 'FOLDER_ID',
        inboxFolderId: 'INBOX_FOLDER_ID',
        name: 'Bower',
      },
    });
    await putUser(kv, {
      id: 'user-3',
      email: 'no-vault@example.com',
      createdAt: '2026-01-03T00:00:00.000Z',
      encRefreshToken: 'unused',
    });

    const response = await listVaults();

    expect(response.status).toBe(200);
    const body = await response.json<RunnerVaultList>();
    expect(body.vaults.map((vault) => vault.id).sort()).toEqual([
      USER_ID,
      'user-2',
    ]);
    expect(body.vaults.every((vault) => Object.keys(vault).length === 1)).toBe(
      true,
    );
    expect(JSON.stringify(body)).not.toContain('@');
  });

  it('answers an empty list when nobody has a vault', async () => {
    const response = await listVaults();

    expect(response.status).toBe(200);
    expect(await response.json<RunnerVaultList>()).toEqual({ vaults: [] });
  });

  it.each([
    ['missing', null],
    ['wrong', 'Bearer not-the-key'],
    ['admin', `Bearer ${env.ADMIN_KEY}`],
  ])('answers 401 unauthorized with a %s key', async (_, auth) => {
    await seedUser();

    const response = await listVaults(auth);

    expect(response.status).toBe(401);
    expect((await response.json<ErrorBody>()).error.code).toBe('unauthorized');
  });
});

describe('GET /runner/vaults/:id', () => {
  it('returns the folder ids, the cached Drive token and maxTurns, without apiKey', async () => {
    await seedUser();
    const expiresAt = await seedDriveToken();
    const google = stub();

    const response = await getVault(google.fetchImpl);

    expect(response.status).toBe(200);
    const body = await response.json<RunnerVault>();
    expect(body).toEqual({
      folderId: 'FOLDER_ID',
      inboxFolderId: 'INBOX_FOLDER_ID',
      driveAccessToken: ACCESS_TOKEN,
      expiresAt,
      maxTurns: Number(env.DEFAULT_MAX_TURNS),
    });
    expect('apiKey' in body).toBe(false);
    expect(google.calls).toHaveLength(0);
  });

  it('returns the decrypted apiKey when the user set one', async () => {
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    await seedUser({ encApiKey: await encrypt(API_KEY, key) });
    await seedDriveToken();

    const response = await getVault(stub().fetchImpl);

    expect(response.status).toBe(200);
    expect((await response.json<RunnerVault>()).apiKey).toBe(API_KEY);
  });

  it('mints a Drive token when none is cached', async () => {
    await seedUser();
    const google = stub(() =>
      Response.json({
        access_token: ACCESS_TOKEN,
        expires_in: 3599,
        token_type: 'Bearer',
      }),
    );

    const response = await getVault(google.fetchImpl);

    expect(response.status).toBe(200);
    expect((await response.json<RunnerVault>()).driveAccessToken).toBe(
      ACCESS_TOKEN,
    );
    expect(google.calls.map((call) => call.url)).toEqual([GOOGLE_TOKEN_URL]);
  });

  it('answers 409 reauth and flags the user when Google answers invalid_grant', async () => {
    await seedUser();
    const google = stub(() =>
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
    );

    const response = await getVault(google.fetchImpl);

    expect(response.status).toBe(409);
    expect((await response.json<ErrorBody>()).error.code).toBe('reauth');
    expect((await getUser(kv, USER_ID))?.needsReauth).toBe(true);
  });

  it('answers 404 not_found for an unknown id', async () => {
    const response = await getVault(stub().fetchImpl, RUNNER_AUTH, 'nobody');

    expect(response.status).toBe(404);
    expect((await response.json<ErrorBody>()).error.code).toBe('not_found');
  });

  it('answers 404 not_found for a user without a vault', async () => {
    await seedUser({ vault: undefined });
    await seedDriveToken();

    const response = await getVault(stub().fetchImpl);

    expect(response.status).toBe(404);
    expect((await response.json<ErrorBody>()).error.code).toBe('not_found');
  });
});

describe('POST /runner/vaults/:id/status', () => {
  it('moves the run from queued to running to done, and /process follows', async () => {
    await seedUser();
    const github = stub();

    const queued = await (await postProcess(github.fetchImpl)).json<RunBody>();
    expect(queued.run.state).toBe('queued');

    const runningResponse = await postStatus({ state: 'running' });
    expect(runningResponse.status).toBe(200);
    const running = (await runningResponse.json<RunBody>()).run;
    expect(running.state).toBe('running');
    expect(running.runId).toBe(queued.run.runId);
    expect(running.requestedAt).toBe(queued.run.requestedAt);
    expect(Date.parse(running.startedAt ?? '')).not.toBeNaN();
    expect(running.finishedAt).toBeUndefined();
    expect(await getRun(kv, USER_ID)).toEqual(running);

    // While running, a press returns the running run and dispatches nothing.
    const whileRunning = await postProcess(github.fetchImpl);
    expect(whileRunning.status).toBe(202);
    expect((await whileRunning.json<RunBody>()).run).toEqual(running);
    expect(github.calls).toHaveLength(1);

    // A second `running` report keeps the original startedAt.
    const again = (
      await (await postStatus({ state: 'running' })).json<RunBody>()
    ).run;
    expect(again.startedAt).toBe(running.startedAt);

    const doneResponse = await postStatus({
      state: 'done',
      summary: 'Filed two notes.',
      processed: ['a.md', 'b.md'],
    });
    expect(doneResponse.status).toBe(200);
    const done = (await doneResponse.json<RunBody>()).run;
    expect(done).toMatchObject({
      state: 'done',
      runId: queued.run.runId,
      requestedAt: queued.run.requestedAt,
      startedAt: running.startedAt,
      summary: 'Filed two notes.',
      processed: ['a.md', 'b.md'],
    });
    expect(Date.parse(done.finishedAt ?? '')).not.toBeNaN();
    expect(done.error).toBeUndefined();
    expect(await getRun(kv, USER_ID)).toEqual(done);

    // After done, a press starts a new run.
    const next = await postProcess(github.fetchImpl);
    expect(next.status).toBe(202);
    const nextRun = (await next.json<RunBody>()).run;
    expect(nextRun.state).toBe('queued');
    expect(nextRun.runId).not.toBe(queued.run.runId);
    expect(github.calls).toHaveLength(2);
  });

  it('stores failed with the error and the runId from the body', async () => {
    await seedUser();
    await putRun(kv, USER_ID, {
      state: 'running',
      requestedAt: '2026-06-01T12:00:00.000Z',
      startedAt: '2026-06-01T12:01:00.000Z',
      runId: 'stored-run-id',
    });

    const response = await postStatus({
      state: 'failed',
      runId: 'reported-run-id',
      error: 'rclone sync failed',
    });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run).toMatchObject({
      state: 'failed',
      runId: 'reported-run-id',
      requestedAt: '2026-06-01T12:00:00.000Z',
      startedAt: '2026-06-01T12:01:00.000Z',
      error: 'rclone sync failed',
    });
    expect(Date.parse(run.finishedAt ?? '')).not.toBeNaN();
    expect(await getRun(kv, USER_ID)).toEqual(run);
  });

  it('creates a run when none is stored', async () => {
    await seedUser();

    const response = await postStatus({ state: 'running', runId: 'run-1' });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run.state).toBe('running');
    expect(run.kind).toBe('ingest');
    expect(run.runId).toBe('run-1');
    expect(run.startedAt).toBe(run.requestedAt);
    expect(await getRun(kv, USER_ID)).toEqual(run);
    expect(await getRun(kv, USER_ID, 'lint')).toBeUndefined();
  });

  it('stores an explicit ingest report under the ingest run', async () => {
    await seedUser();

    const response = await postStatus({
      state: 'done',
      kind: 'ingest',
      processed: ['a.md'],
    });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run).toMatchObject({
      state: 'done',
      kind: 'ingest',
      processed: ['a.md'],
    });
    expect(await getRun(kv, USER_ID)).toEqual(run);
    expect(await getRun(kv, USER_ID, 'lint')).toBeUndefined();
  });

  it('keeps a lint apart: the ingest run, GET /status and /process are untouched', async () => {
    await seedUser();
    const ingest: Run = {
      state: 'done',
      kind: 'ingest',
      requestedAt: '2026-06-01T12:00:00.000Z',
      startedAt: '2026-06-01T12:01:00.000Z',
      finishedAt: '2026-06-01T12:05:00.000Z',
      processed: ['a.md'],
      runId: 'ingest-run-id',
    };
    await putRun(kv, USER_ID, ingest);

    const runningResponse = await postStatus({
      state: 'running',
      kind: 'lint',
      runId: 'lint-run-id',
    });
    expect(runningResponse.status).toBe(200);
    const running = (await runningResponse.json<RunBody>()).run;
    expect(running).toMatchObject({
      state: 'running',
      kind: 'lint',
      runId: 'lint-run-id',
    });
    expect(await getRun(kv, USER_ID, 'lint')).toEqual(running);
    expect(await getRun(kv, USER_ID)).toEqual(ingest);

    // The app sees the last ingest, not the lint in progress.
    const status = await getStatus();
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ run: ingest, stale: false });

    // A press while the lint runs starts an ingest instead of waiting on it.
    const github = stub();
    const pressed = await postProcess(github.fetchImpl);
    expect(pressed.status).toBe(202);
    expect((await pressed.json<RunBody>()).run.state).toBe('queued');
    expect(github.calls).toHaveLength(1);
    const queued = await getRun(kv, USER_ID);

    const done = (
      await (
        await postStatus({
          state: 'done',
          kind: 'lint',
          summary: 'Two broken links.',
        })
      ).json<RunBody>()
    ).run;
    expect(done).toMatchObject({
      state: 'done',
      kind: 'lint',
      runId: 'lint-run-id',
      startedAt: running.startedAt,
      summary: 'Two broken links.',
    });
    expect(await getRun(kv, USER_ID, 'lint')).toEqual(done);
    expect(await getRun(kv, USER_ID)).toEqual(queued);
  });

  it('caps summary, error, processed, quarantined and refused counts', async () => {
    await seedUser();

    const response = await postStatus({
      state: 'failed',
      summary: 's'.repeat(MAX_TEXT_LENGTH + 10),
      error: 'e'.repeat(MAX_TEXT_LENGTH + 10),
      processed: Array.from({ length: MAX_PROCESSED + 5 }, (_, i) => `${i}.md`),
      quarantined: Array.from({ length: MAX_PROCESSED + 5 }, (_, i) => `q${i}`),
      refused: Array.from({ length: MAX_PROCESSED + 5 }, (_, i) => `r${i}`),
    });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run.summary).toHaveLength(MAX_TEXT_LENGTH);
    expect(run.error).toHaveLength(MAX_TEXT_LENGTH);
    expect(run.processed).toHaveLength(MAX_PROCESSED);
    expect(run.quarantined).toHaveLength(MAX_PROCESSED);
    expect(run.refused).toHaveLength(MAX_PROCESSED);
  });

  it('cuts each quarantined and refused entry to MAX_TEXT_LENGTH', async () => {
    await seedUser();

    const response = await postStatus({
      state: 'done',
      quarantined: ['p'.repeat(MAX_TEXT_LENGTH + 10)],
      refused: ['p'.repeat(MAX_TEXT_LENGTH + 10)],
    });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run.quarantined?.[0]).toHaveLength(MAX_TEXT_LENGTH);
    expect(run.refused?.[0]).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('accepts quarantined and refused with no processed at all', async () => {
    await seedUser();

    const response = await postStatus({
      state: 'done',
      quarantined: ['0-Inbox/Quarantine/a.md'],
      refused: ['CLAUDE.md'],
    });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run).toMatchObject({
      state: 'done',
      quarantined: ['0-Inbox/Quarantine/a.md'],
      refused: ['CLAUDE.md'],
    });
    expect(run.processed).toBeUndefined();
    expect(await getRun(kv, USER_ID)).toEqual(run);
  });

  it.each([
    ['not JSON', '{'],
    ['not an object', ['running']],
    ['an unknown state', { state: 'queued' }],
    ['an unknown kind', { state: 'done', kind: 'backup' }],
    ['a non-string kind', { state: 'done', kind: 1 }],
    ['a missing state', { summary: 'x' }],
    ['an unknown field', { state: 'done', extra: 1 }],
    ['a non-string summary', { state: 'done', summary: 1 }],
    ['a non-string error', { state: 'failed', error: {} }],
    ['an empty runId', { state: 'running', runId: '' }],
    [
      'a processed entry that is not a string',
      { state: 'done', processed: [1] },
    ],
    ['processed not an array', { state: 'done', processed: 'a.md' }],
    [
      'a quarantined entry that is not a string',
      { state: 'done', quarantined: [1] },
    ],
    ['quarantined not an array', { state: 'done', quarantined: 'a.md' }],
    ['a refused entry that is not a string', { state: 'done', refused: [1] }],
    ['refused not an array', { state: 'done', refused: 'a.md' }],
  ])('answers 400 bad_request for %s', async (_, body) => {
    await seedUser();

    const response = await postStatus(body);

    expect(response.status).toBe(400);
    expect((await response.json<ErrorBody>()).error.code).toBe('bad_request');
    expect(await getRun(kv, USER_ID)).toBeUndefined();
    expect(await getRun(kv, USER_ID, 'lint')).toBeUndefined();
  });

  it('answers 404 not_found for an unknown id', async () => {
    const response = await postStatus(
      { state: 'running' },
      RUNNER_AUTH,
      'nobody',
    );

    expect(response.status).toBe(404);
    expect((await response.json<ErrorBody>()).error.code).toBe('not_found');
    expect(await getRun(kv, 'nobody')).toBeUndefined();
  });
});
