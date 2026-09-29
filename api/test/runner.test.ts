import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GOOGLE_TOKEN_URL } from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { RUN_TICKET_TTL_MS } from '../src/process.js';
import { hashTicket, issueRunTicket } from '../src/run-ticket.js';
import {
  MAX_ADDED_LENGTH,
  MAX_PROCESSED,
  MAX_TEXT_LENGTH,
  runScheduledLint,
} from '../src/runner.js';
import type { LintDispatchResult, RunnerVault } from '../src/runner.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import {
  getRun,
  getRunTicket,
  getUser,
  getDriveToken,
  listRuns,
  putDriveToken,
  putRun,
  putUser,
} from '../src/store.js';
import type { Run, RunKind, User } from '../src/types.js';

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
/** What the default Google stub mints for a run. */
const RUN_ACCESS_TOKEN = 'test-run-access-token';
const API_KEY = 'test-claude-api-key';
/** The admin key: only `POST /runner/lint/dispatch` takes it (#292). */
const ADMIN_AUTH = `Bearer ${env.ADMIN_KEY}`;

interface Call {
  url: string;
  /** The parsed JSON body of a call to GitHub. */
  body?: unknown;
}

/** What a `repository_dispatch` call sends. */
interface DispatchBody {
  event_type: string;
  client_payload: { vault_id: string; ticket: string };
}

/**
 * A hermetic stand-in for Google's token endpoint and GitHub's dispatch:
 * records every call; the token endpoint answers `tokenResponse()`, GitHub
 * answers `githubStatus` (204 by default).
 */
function stub(
  tokenResponse?: () => Response,
  githubStatus = 204,
): {
  calls: Call[];
  fetchImpl: FetchLike;
} {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    const call: Call = { url: input };
    if (
      input.startsWith('https://api.github.com/') &&
      typeof init?.body === 'string'
    ) {
      call.body = JSON.parse(init.body) as unknown;
    }
    calls.push(call);
    if (input === GOOGLE_TOKEN_URL) {
      // By default Google mints a run token (#315: every run gets its own).
      return Promise.resolve(
        tokenResponse?.() ??
          Response.json({
            access_token: RUN_ACCESS_TOKEN,
            expires_in: 3599,
            token_type: 'Bearer',
          }),
      );
    }
    if (input.startsWith('https://api.github.com/')) {
      return Promise.resolve(new Response(null, { status: githubStatus }));
    }
    return Promise.reject(new Error(`unexpected fetch in test: ${input}`));
  };
  return { calls, fetchImpl };
}

/** The dispatches `calls` sent to GitHub, in order. */
function dispatches(calls: Call[]): DispatchBody[] {
  return calls
    .filter((call) => call.url.startsWith('https://api.github.com/'))
    .map((call) => call.body as DispatchBody);
}

/**
 * `Authorization` with a fresh ticket for the run of `kind` on vault `id`,
 * as a dispatch would mint it (`now` moves it into the past).
 */
async function ticketAuth(
  id = USER_ID,
  kind: RunKind = 'ingest',
  now = new Date(),
): Promise<string> {
  return `Bearer ${await issueRunTicket(kv, id, kind, now, RUN_TICKET_TTL_MS)}`;
}

/** The kind a status body reports, as the Worker reads it. */
function reportedKind(body: unknown): RunKind {
  return typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).kind === 'lint'
    ? 'lint'
    : 'ingest';
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

/**
 * `GET /runner/vaults/:id`. `authorization` `undefined` (the default) sends
 * a fresh ingest ticket for `id`; `null` sends no header.
 */
async function getVault(
  fetchImpl: FetchLike,
  authorization?: string | null,
  id = USER_ID,
  requestEnv: Env = env,
): Promise<Response> {
  const auth =
    authorization === undefined ? await ticketAuth(id) : authorization;
  return createApp({ fetchImpl }).request(
    `${API}/runner/vaults/${id}`,
    {
      headers: auth === null ? {} : { authorization: auth },
    },
    requestEnv,
  );
}

/**
 * `POST /runner/vaults/:id/status`. `authorization` `undefined` (the
 * default) sends a fresh ticket for `id` and the kind `body` reports;
 * `null` sends no header.
 */
async function postStatus(
  body: unknown,
  authorization?: string | null,
  id = USER_ID,
  requestEnv: Env = env,
): Promise<Response> {
  const auth =
    authorization === undefined
      ? await ticketAuth(id, reportedKind(body))
      : authorization;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (auth !== null) headers.authorization = auth;
  return createApp({ fetchImpl: stub().fetchImpl }).request(
    `${API}/runner/vaults/${id}/status`,
    {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    requestEnv,
  );
}

/** `POST /runner/lint/dispatch` with `body` (none when `undefined`). */
async function postLintDispatch(
  fetchImpl: FetchLike,
  body?: unknown,
  authorization: string | null = ADMIN_AUTH,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (authorization !== null) headers.authorization = authorization;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return createApp({ fetchImpl }).request(
    `${API}/runner/lint/dispatch`,
    {
      method: 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
    ['wrong scheme', `Basic ${env.ADMIN_KEY}`],
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

describe('run tickets', () => {
  it('refuses a ticket for vault A on vault B, on GET and on POST status', async () => {
    await seedUser();
    await seedDriveToken();
    const ticketForOther = await ticketAuth('user-2');

    const vault = await getVault(stub().fetchImpl, ticketForOther);
    const status = await postStatus({ state: 'running' }, ticketForOther);

    expect(vault.status).toBe(401);
    expect((await vault.json<ErrorBody>()).error.code).toBe('unauthorized');
    expect(status.status).toBe(401);
    expect(await getRun(kv, USER_ID)).toBeUndefined();
  });

  it('refuses a ticket once its run reported done, on GET and on POST status', async () => {
    await seedUser();
    await seedDriveToken();
    const auth = await ticketAuth();

    expect((await getVault(stub().fetchImpl, auth)).status).toBe(200);
    expect((await postStatus({ state: 'running' }, auth)).status).toBe(200);
    // Still good while the run is under way.
    expect((await getVault(stub().fetchImpl, auth)).status).toBe(200);
    expect((await postStatus({ state: 'done' }, auth)).status).toBe(200);

    expect((await getVault(stub().fetchImpl, auth)).status).toBe(401);
    expect((await postStatus({ state: 'failed' }, auth)).status).toBe(401);
    expect((await getRun(kv, USER_ID))?.state).toBe('done');
    expect(await getRunTicket(kv, USER_ID, 'ingest')).toBeUndefined();
  });

  it('refuses a ticket once its run reported failed', async () => {
    await seedUser();
    await seedDriveToken();
    const auth = await ticketAuth();

    expect((await postStatus({ state: 'failed' }, auth)).status).toBe(200);

    expect((await getVault(stub().fetchImpl, auth)).status).toBe(401);
  });

  it('refuses an expired ticket', async () => {
    await seedUser();
    await seedDriveToken();
    const auth = await ticketAuth(
      USER_ID,
      'ingest',
      new Date(Date.now() - RUN_TICKET_TTL_MS - 1000),
    );

    expect((await getVault(stub().fetchImpl, auth)).status).toBe(401);
    expect((await postStatus({ state: 'running' }, auth)).status).toBe(401);
    expect(await getRun(kv, USER_ID)).toBeUndefined();
  });

  it("refuses an older run's ticket once a newer run has one", async () => {
    await seedUser();
    await seedDriveToken();
    const older = await ticketAuth();
    const newer = await ticketAuth();

    expect((await getVault(stub().fetchImpl, older)).status).toBe(401);
    expect((await getVault(stub().fetchImpl, newer)).status).toBe(200);
  });

  it('a late report from an older run cannot overwrite the newer run (#135)', async () => {
    await seedUser();
    const older = await ticketAuth();
    const newer = await ticketAuth();
    const newerRun: Run = {
      state: 'queued',
      kind: 'ingest',
      requestedAt: new Date().toISOString(),
      runId: 'newer-run',
    };
    await putRun(kv, USER_ID, newerRun);

    const late = await postStatus(
      { state: 'done', runId: 'older-run', summary: 'late' },
      older,
    );

    expect(late.status).toBe(401);
    expect(await getRun(kv, USER_ID)).toEqual(newerRun);
    expect((await postStatus({ state: 'running' }, newer)).status).toBe(200);
  });

  it("keeps an ingest's ticket and a lint's ticket to their own run", async () => {
    await seedUser();
    const ingest = await ticketAuth(USER_ID, 'ingest');
    const lint = await ticketAuth(USER_ID, 'lint');

    const crossed = [
      await postStatus({ state: 'running', kind: 'lint' }, ingest),
      await postStatus({ state: 'running', kind: 'ingest' }, lint),
    ];

    expect(crossed.map((response) => response.status)).toEqual([401, 401]);
    expect(await getRun(kv, USER_ID)).toBeUndefined();
    expect(await getRun(kv, USER_ID, 'lint')).toBeUndefined();
    // Retiring one leaves the other alone.
    expect((await postStatus({ state: 'done' }, ingest)).status).toBe(200);
    expect(
      (await postStatus({ state: 'done', kind: 'lint' }, lint)).status,
    ).toBe(200);
  });

  it('refuses the admin key on GET and POST status', async () => {
    await seedUser();
    await seedDriveToken();

    const vault = await getVault(stub().fetchImpl, ADMIN_AUTH);
    const status = await postStatus({ state: 'running' }, ADMIN_AUTH);

    expect(vault.status).toBe(401);
    expect(status.status).toBe(401);
    expect(await getRun(kv, USER_ID)).toBeUndefined();
  });

  it('stores only the hash of a ticket', async () => {
    const ticket = await issueRunTicket(
      kv,
      USER_ID,
      'ingest',
      new Date(),
      RUN_TICKET_TTL_MS,
    );

    const stored = await getRunTicket(kv, USER_ID, 'ingest');
    expect(stored?.hash).toBe(await hashTicket(ticket));
    const listed = await kv.list({});
    for (const entry of listed.keys) {
      expect(entry.name).not.toContain(ticket);
      expect(await kv.get(entry.name)).not.toContain(ticket);
    }
  });
});

describe('POST /runner/lint/dispatch', () => {
  async function seedSecondVault(): Promise<void> {
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
  }

  it('dispatches one ticketed bower-lint per vault, each ticket good for its own vault only', async () => {
    await seedUser();
    await seedDriveToken();
    await seedSecondVault();
    await putUser(kv, {
      id: 'user-3',
      email: 'no-vault@example.com',
      createdAt: '2026-01-03T00:00:00.000Z',
      encRefreshToken: 'unused',
    });
    const github = stub();

    const response = await postLintDispatch(github.fetchImpl);

    expect(response.status).toBe(200);
    expect(await response.json<LintDispatchResult>()).toEqual({
      dispatched: 2,
    });
    const sent = dispatches(github.calls);
    expect(sent.map((body) => body.event_type)).toEqual([
      'bower-lint',
      'bower-lint',
    ]);
    expect(sent.map((body) => body.client_payload.vault_id).sort()).toEqual([
      USER_ID,
      'user-2',
    ]);
    const [first, second] = sent;
    expect(first?.client_payload.ticket).not.toBe(
      second?.client_payload.ticket,
    );
    expect((await getRun(kv, USER_ID, 'lint'))?.state).toBe('queued');
    expect(await getRun(kv, USER_ID)).toBeUndefined();

    const mine = sent.find((body) => body.client_payload.vault_id === USER_ID);
    const theirs = sent.find(
      (body) => body.client_payload.vault_id === 'user-2',
    );
    const mineAuth = `Bearer ${mine?.client_payload.ticket ?? ''}`;
    const theirsAuth = `Bearer ${theirs?.client_payload.ticket ?? ''}`;
    expect((await getVault(stub().fetchImpl, mineAuth)).status).toBe(200);
    expect((await getVault(stub().fetchImpl, theirsAuth)).status).toBe(401);
    const report = await postStatus({ state: 'done', kind: 'lint' }, mineAuth);
    expect(report.status).toBe(200);
    expect((await report.json<RunBody>()).run.kind).toBe('lint');
  });

  it('dispatches for the one vaultId in the body', async () => {
    await seedUser();
    await seedSecondVault();
    const github = stub();

    const response = await postLintDispatch(github.fetchImpl, {
      vaultId: 'user-2',
    });

    expect(response.status).toBe(200);
    expect(
      dispatches(github.calls).map((body) => body.client_payload.vault_id),
    ).toEqual(['user-2']);
  });

  it('answers 404 not_found for a vaultId without a vault', async () => {
    const github = stub();

    const response = await postLintDispatch(github.fetchImpl, {
      vaultId: 'nobody',
    });

    expect(response.status).toBe(404);
    expect(github.calls).toEqual([]);
  });

  it('answers 400 bad_request for an unknown field', async () => {
    const response = await postLintDispatch(stub().fetchImpl, { all: true });

    expect(response.status).toBe(400);
  });

  it.each([
    ['missing', null],
    ['wrong', 'Bearer not-the-key'],
    ['old operator key', 'Bearer test-bower-api-key'],
  ])('answers 401 unauthorized with a %s key', async (_, auth) => {
    await seedUser();
    const github = stub();

    const response = await postLintDispatch(github.fetchImpl, undefined, auth);

    expect(response.status).toBe(401);
    expect(github.calls).toEqual([]);
  });

  it('answers 401 unauthorized with a run ticket', async () => {
    await seedUser();
    const github = stub();

    const response = await postLintDispatch(
      github.fetchImpl,
      undefined,
      await ticketAuth(USER_ID, 'lint'),
    );

    expect(response.status).toBe(401);
    expect(github.calls).toEqual([]);
  });

  it('answers 502 dispatch and retires the ticket when GitHub refuses', async () => {
    await seedUser();

    const response = await postLintDispatch(stub(undefined, 500).fetchImpl);

    expect(response.status).toBe(502);
    expect((await response.json<ErrorBody>()).error.code).toBe('dispatch');
    expect(await getRunTicket(kv, USER_ID, 'lint')).toBeUndefined();
    expect(await getRun(kv, USER_ID, 'lint')).toBeUndefined();
  });
});

describe('weekly lint cron (#292)', () => {
  it('dispatches the same ticketed runs the endpoint does, for every vault', async () => {
    await seedUser();
    await seedDriveToken();
    const hub = stub();

    await runScheduledLint(env, hub.fetchImpl);

    const sent = dispatches(hub.calls);
    expect(sent.map((body) => body.event_type)).toEqual(['bower-lint']);
    expect(sent[0]?.client_payload.vault_id).toBe(USER_ID);
    expect((await getRun(kv, USER_ID, 'lint'))?.state).toBe('queued');
    const auth = `Bearer ${sent[0]?.client_payload.ticket ?? ''}`;
    expect((await getVault(stub().fetchImpl, auth)).status).toBe(200);
  });

  it('logs a dispatch failure with its code, retires the ticket and rethrows', async () => {
    await seedUser();
    const logged: string[] = [];
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });

    try {
      await expect(
        runScheduledLint(env, stub(undefined, 500).fetchImpl),
      ).rejects.toMatchObject({ code: 'dispatch' });
    } finally {
      spy.mockRestore();
    }

    expect(logged).toContain('Weekly lint failed: dispatch');
    expect(await getRunTicket(kv, USER_ID, 'lint')).toBeUndefined();
    expect(await getRun(kv, USER_ID, 'lint')).toBeUndefined();
  });
});

describe('GET /runner/vaults (removed, #291)', () => {
  it('is gone: not even the operator key lists the vaults', async () => {
    await seedUser();

    const response = await createApp({ fetchImpl: stub().fetchImpl }).request(
      `${API}/runner/vaults`,
      { headers: { authorization: ADMIN_AUTH } },
      env,
    );

    expect(response.status).toBe(404);
  });
});

describe('GET /runner/vaults/:id', () => {
  it("returns the folder ids, a Drive token minted for the run (never the session's) and maxTurns, without apiKey (#315)", async () => {
    await seedUser();
    const sessionExpiresAt = await seedDriveToken();
    const google = stub();

    const response = await getVault(google.fetchImpl);

    expect(response.status).toBe(200);
    const body = await response.json<RunnerVault>();
    expect(body).toMatchObject({
      folderId: 'FOLDER_ID',
      inboxFolderId: 'INBOX_FOLDER_ID',
      driveAccessToken: RUN_ACCESS_TOKEN,
      maxTurns: Number(env.DEFAULT_MAX_TURNS),
    });
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
    expect('apiKey' in body).toBe(false);
    expect(google.calls.map((call) => call.url)).toEqual([GOOGLE_TOKEN_URL]);
    // The session's own cached token is left exactly as it was.
    expect(await getDriveToken(kv, USER_ID)).toEqual({
      accessToken: ACCESS_TOKEN,
      expiresAt: sessionExpiresAt,
    });
  });

  it('returns the decrypted apiKey when the user set one', async () => {
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    await seedUser({ encApiKey: await encrypt(API_KEY, key) });
    await seedDriveToken();

    const response = await getVault(stub().fetchImpl);

    expect(response.status).toBe(200);
    expect((await response.json<RunnerVault>()).apiKey).toBe(API_KEY);
  });

  // #491: the runner leaves a request note written after this for the next
  // tidy-up.
  it("returns when the ticket's run was asked for", async () => {
    await seedUser();
    await seedDriveToken();
    const github = stub();
    const queued = await (await postProcess(github.fetchImpl)).json<RunBody>();
    const [dispatch] = dispatches(github.calls);

    const response = await getVault(
      stub().fetchImpl,
      `Bearer ${dispatch?.client_payload.ticket ?? ''}`,
    );

    expect(response.status).toBe(200);
    expect((await response.json<RunnerVault>()).requestedAt).toBe(
      queued.run.requestedAt,
    );
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
    const response = await getVault(stub().fetchImpl, undefined, 'nobody');

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
    // The runner reports with the ticket the dispatch carried, nothing else.
    const [dispatch] = dispatches(github.calls);
    expect(dispatch?.client_payload.vault_id).toBe(USER_ID);
    const auth = `Bearer ${dispatch?.client_payload.ticket ?? ''}`;

    const runningResponse = await postStatus({ state: 'running' }, auth);
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
      await (await postStatus({ state: 'running' }, auth)).json<RunBody>()
    ).run;
    expect(again.startedAt).toBe(running.startedAt);

    const doneResponse = await postStatus(
      {
        state: 'done',
        summary: 'Filed two notes.',
        processed: ['a.md', 'b.md'],
      },
      auth,
    );
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
    // The run is over, and so is its ticket.
    expect((await getVault(stub().fetchImpl, auth)).status).toBe(401);

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

  it('stores the reason of a failed run, and GET /status returns it (#375)', async () => {
    await seedUser();

    const response = await postStatus({
      state: 'failed',
      error: 'sync up: copy failed',
      reason: 'drive_unavailable',
    });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run.reason).toBe('drive_unavailable');
    expect((await getRun(kv, USER_ID))?.reason).toBe('drive_unavailable');
  });

  it('keeps no reason on a done run (#375)', async () => {
    await seedUser();

    const response = await postStatus({ state: 'done', reason: 'unknown' });

    expect(response.status).toBe(200);
    expect((await getRun(kv, USER_ID))?.reason).toBeUndefined();
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

  it("keeps each processed item's kind (#345) and the paths as before", async () => {
    await seedUser();

    const response = await postStatus({
      state: 'done',
      processed: [
        { path: '0-Inbox/IMG_4471.jpg', kind: 'file' },
        { path: '0-Inbox/Bower - 2026-09-28 1850 Context.md', kind: 'context' },
        'Clippings/old-runner.md',
      ],
    });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run.processed).toEqual([
      '0-Inbox/IMG_4471.jpg',
      '0-Inbox/Bower - 2026-09-28 1850 Context.md',
      'Clippings/old-runner.md',
    ]);
    expect(run.items).toEqual([
      { path: '0-Inbox/IMG_4471.jpg', kind: 'file' },
      { path: '0-Inbox/Bower - 2026-09-28 1850 Context.md', kind: 'context' },
    ]);
    // A finished ingest also lands in the run history `GET /runs` reads.
    expect(await listRuns(kv, USER_ID)).toEqual([run]);
  });

  it('answers 400 for a processed item with an unknown kind (#345)', async () => {
    await seedUser();

    const response = await postStatus({
      state: 'done',
      processed: [{ path: '0-Inbox/a.md', kind: 'summary' }],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'bad_request' },
    });
    expect(await getRun(kv, USER_ID)).toBeUndefined();
  });

  it('keeps report v2 fields: to, renamedFrom, setAside, added (#598)', async () => {
    await seedUser();

    const response = await postStatus({
      state: 'done',
      processed: [
        {
          path: '0-Inbox/IMG_4471.jpg',
          kind: 'file',
          to: '2-Areas/Home/2026-09-28 Boiler receipt.jpg',
          renamedFrom: 'IMG_4471.jpg',
        },
        { path: '0-Inbox/a.md', kind: 'question' },
      ],
      setAside: [
        { path: '0-Inbox/clip.mp4', reason: 'kept-not-read' },
        { path: '0-Inbox/Quarantine/b.md', reason: 'quarantined' },
      ],
      added: 'I added bike times to the flats',
      quarantined: ['0-Inbox/Quarantine/b.md'],
    });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run.items).toEqual([
      {
        path: '0-Inbox/IMG_4471.jpg',
        kind: 'file',
        to: '2-Areas/Home/2026-09-28 Boiler receipt.jpg',
        renamedFrom: 'IMG_4471.jpg',
      },
      { path: '0-Inbox/a.md', kind: 'question' },
    ]);
    expect(run.setAside).toEqual([
      { path: '0-Inbox/clip.mp4', reason: 'kept-not-read' },
      { path: '0-Inbox/Quarantine/b.md', reason: 'quarantined' },
    ]);
    expect(run.added).toBe('I added bike times to the flats');
    expect(await getRun(kv, USER_ID)).toEqual(run);
    // `GET /runs` reads the history: the new fields come back unchanged.
    expect(await listRuns(kv, USER_ID)).toEqual([run]);
  });

  it('cuts added to MAX_ADDED_LENGTH', async () => {
    await seedUser();

    const response = await postStatus({
      state: 'done',
      added: 'a'.repeat(MAX_ADDED_LENGTH + 10),
    });

    expect(response.status).toBe(200);
    const { run } = await response.json<RunBody>();
    expect(run.added).toHaveLength(MAX_ADDED_LENGTH);
  });

  it.each([
    ['a non-string to', { processed: [{ path: 'a', kind: 'file', to: 1 }] }],
    [
      'a non-string renamedFrom',
      { processed: [{ path: 'a', kind: 'file', renamedFrom: ['x'] }] },
    ],
    [
      'an unknown item key',
      { processed: [{ path: 'a', kind: 'file', from: 'x' }] },
    ],
    ['a non-array setAside', { setAside: 'a' }],
    ['a setAside string entry', { setAside: ['a'] }],
    [
      'an unknown setAside reason',
      { setAside: [{ path: 'a', reason: 'big' }] },
    ],
    ['a setAside entry without path', { setAside: [{ reason: 'too-large' }] }],
    [
      'an unknown setAside key',
      { setAside: [{ path: 'a', reason: 'too-large', size: 1 }] },
    ],
    ['a non-string added', { added: 3 }],
  ])('answers 400 for %s (#598)', async (_label, fields) => {
    await seedUser();

    const response = await postStatus({ state: 'done', ...fields });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'bad_request' },
    });
    expect(await getRun(kv, USER_ID)).toBeUndefined();
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
    ['an unknown reason', { state: 'failed', reason: 'drive_gone' }],
    ['a non-string reason', { state: 'failed', reason: 1 }],
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
      undefined,
      'nobody',
    );

    expect(response.status).toBe(404);
    expect((await response.json<ErrorBody>()).error.code).toBe('not_found');
    expect(await getRun(kv, 'nobody')).toBeUndefined();
  });
});
