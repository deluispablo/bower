/**
 * The endpoints the GitHub Actions runner calls. Two credentials:
 *
 * - A run ticket (`run-ticket.ts`): minted for one run of one vault when
 *   the Worker dispatches it, sent in the `repository_dispatch` payload,
 *   and the only Worker credential a job that runs the agent holds. Good
 *   for `GET /runner/vaults/:id` and `POST /runner/vaults/:id/status` of
 *   that vault and that run's kind, until the run reports `done` or
 *   `failed` or the ticket expires.
 * - The operator key `BOWER_API_KEY`: only for `POST /runner/lint/dispatch`,
 *   called by the weekly lint's `dispatch` job, which never runs the agent.
 *   While `RUNNER_ACCEPT_LEGACY_KEY` is `1` (a transition flag, off by
 *   default) it is also accepted where a ticket is, and by
 *   `GET /runner/vaults`, so an instance repo with the old workflows keeps
 *   working until it is updated.
 *
 * Routes:
 *
 * - `POST /runner/lint/dispatch`: starts one lint run per vault (or for the
 *   one `vaultId` in the body), each with its own ticket, through one
 *   `repository_dispatch` (`bower-lint`) per vault.
 * - `GET /runner/vaults` (legacy flag only): the id of every user with a
 *   vault; ids only, never an email or a token.
 * - `GET /runner/vaults/:id`: what one run needs — the vault's folder ids,
 *   a 1 h Drive access token (never the refresh token), `maxTurns`, and the
 *   user's own Claude API key when they set one.
 * - `POST /runner/vaults/:id/status`: the run's progress (`running`,
 *   `done`, `failed`) and its `kind` (`ingest`, the default, or `lint`),
 *   stored as the user's `Run` of that kind: an ingest under `run:<id>`, a
 *   lint under `lintrun:<id>`, so a lint never shows up in `GET /status`
 *   or blocks `POST /process`.
 *
 * `:id` is the user id, as the dispatch sends it (`vault_id`). Nothing here
 * logs the operator key, a ticket, a token, the API key, file names or run
 * summaries.
 */

import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';

import type { AuthDeps } from './auth.js';
import { decrypt, importEncryptionKey, timingSafeEqual } from './crypto.js';
import { getAccessToken } from './drive.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import { dispatchLint } from './github.js';
import type { FetchLike } from './google.js';
import { RUN_TICKET_TTL_MS } from './process.js';
import { sendPush } from './push.js';
import type { PushPayload } from './push.js';
import { checkRunTicket, issueRunTicket } from './run-ticket.js';
import {
  deleteRunTicket,
  getRun,
  getUser,
  listVaultIds,
  putRun,
} from './store.js';
import type { DriveToken, Run, RunKind, User } from './types.js';

/**
 * Longest `summary` or `error` kept on a `Run`, and the longest any single
 * `processed`, `quarantined` or `refused` entry is cut to; longer text is
 * cut.
 */
export const MAX_TEXT_LENGTH = 2000;

/**
 * Most `processed`, `quarantined` or `refused` entries kept on a `Run`; the
 * rest are dropped.
 */
export const MAX_PROCESSED = 200;

function unauthorized(): HttpError {
  return new HttpError(401, 'unauthorized', 'Missing or invalid runner key');
}

/**
 * Requires `Authorization: Bearer <BOWER_API_KEY>`, compared with
 * `timingSafeEqual`. Missing header, wrong scheme or wrong key are all a
 * 401 `unauthorized`; the key itself is never logged.
 */
export const requireRunnerKey: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!isOperatorKey(bearer(c), c.get('env'))) {
    throw unauthorized();
  }
  await next();
};

/**
 * The credential of `Authorization: Bearer <credential>`. A missing header,
 * another scheme or an empty credential is a 401 `unauthorized`.
 */
function bearer(c: Context<AppEnv>): string {
  const header = c.req.header('authorization') ?? '';
  const [scheme, credential] = header.split(' ');
  if (scheme !== 'Bearer' || credential === undefined || credential === '') {
    throw unauthorized();
  }
  return credential;
}

/** Whether `credential` is the operator key, compared in constant time. */
function isOperatorKey(credential: string, env: Env): boolean {
  return timingSafeEqual(credential, env.BOWER_API_KEY);
}

/** Whether the transition flag lets the operator key stand in for a ticket. */
function acceptsLegacyKey(env: Env): boolean {
  return env.RUNNER_ACCEPT_LEGACY_KEY === '1';
}

/**
 * `requireRunnerKey`, and only while `RUNNER_ACCEPT_LEGACY_KEY` is `1`: for
 * `GET /runner/vaults`, which only the old lint workflow calls.
 */
const requireLegacyRunnerKey: MiddlewareHandler<AppEnv> = async (c, next) => {
  const env = c.get('env');
  if (!acceptsLegacyKey(env) || !isOperatorKey(bearer(c), env)) {
    throw unauthorized();
  }
  await next();
};

/**
 * What the request's credential may do for vault `id`: the kind of run
 * whose live ticket it is (an ingest's is checked first, then a lint's),
 * or `legacy` for the operator key while the transition flag is on.
 * Anything else (no credential, a ticket for another vault, a retired or
 * expired ticket, the operator key with the flag off) is a 401
 * `unauthorized`.
 */
async function authorizeRun(
  c: Context<AppEnv>,
  id: string,
): Promise<RunKind | 'legacy'> {
  const env = c.get('env');
  const credential = bearer(c);
  if (acceptsLegacyKey(env) && isOperatorKey(credential, env)) {
    return 'legacy';
  }
  const now = new Date();
  for (const kind of ['ingest', 'lint'] as const) {
    if (await checkRunTicket(env.BOWER_KV, id, kind, credential, now)) {
      return kind;
    }
  }
  throw unauthorized();
}

/** What `GET /runner/vaults` answers: one entry per user with a vault. */
export interface RunnerVaultList {
  vaults: { id: string }[];
}

/** What `GET /runner/vaults/:id` answers. */
export interface RunnerVault {
  folderId: string;
  inboxFolderId: string;
  driveAccessToken: string;
  /** ISO-8601; when Google stops accepting `driveAccessToken`. */
  expiresAt: string;
  maxTurns: number;
  /** The user's own Claude API key, decrypted; absent unless they set one. */
  apiKey?: string;
}

type ReportState = 'running' | 'done' | 'failed';

/** What `POST /runner/lint/dispatch` answers: how many lint runs started. */
export interface LintDispatchResult {
  dispatched: number;
}

/**
 * The optional `POST /runner/lint/dispatch` body: absent or `{}` for every
 * vault, `{ vaultId }` for one. Anything else is a 400 `bad_request`.
 */
function parseLintDispatch(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Body must be a JSON object');
  }
  const record = body as Record<string, unknown>;
  for (const field of Object.keys(record)) {
    if (field !== 'vaultId') throw badRequest(`Unknown field ${field}`);
  }
  const vaultId = record.vaultId;
  if (vaultId === undefined) return undefined;
  if (typeof vaultId !== 'string' || vaultId.length === 0) {
    throw badRequest('vaultId must be a non-empty string');
  }
  return vaultId;
}

/** A validated `POST /runner/vaults/:id/status` body. */
interface StatusReport {
  state: ReportState;
  /** `ingest` when the body has none, so older runners keep working. */
  kind: RunKind;
  runId?: string;
  summary?: string;
  processed?: string[];
  quarantined?: string[];
  refused?: string[];
  error?: string;
}

const REPORT_STATES: readonly string[] = ['running', 'done', 'failed'];
const RUN_KINDS: readonly string[] = ['ingest', 'lint'];
const REPORT_FIELDS: ReadonlySet<string> = new Set([
  'state',
  'kind',
  'runId',
  'summary',
  'processed',
  'quarantined',
  'refused',
  'error',
]);

function badRequest(message: string): HttpError {
  return new HttpError(400, 'bad_request', message);
}

function isReportState(value: unknown): value is ReportState {
  return typeof value === 'string' && REPORT_STATES.includes(value);
}

function isRunKind(value: unknown): value is RunKind {
  return typeof value === 'string' && RUN_KINDS.includes(value);
}

/** An optional string field: absent, or a string (cut to `MAX_TEXT_LENGTH`). */
function optionalText(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw badRequest(`${field} must be a string`);
  }
  return value.slice(0, MAX_TEXT_LENGTH);
}

/**
 * An optional array-of-strings field: absent, or an array of strings, cut
 * to `MAX_PROCESSED` entries with each entry cut to `MAX_TEXT_LENGTH`
 * characters. Used for `processed`, `quarantined` and `refused` alike.
 */
function optionalStringArray(
  body: Record<string, unknown>,
  field: string,
): string[] | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((entry): entry is string => typeof entry === 'string')
  ) {
    throw badRequest(`${field} must be an array of strings`);
  }
  return value
    .slice(0, MAX_PROCESSED)
    .map((entry) => entry.slice(0, MAX_TEXT_LENGTH));
}

/**
 * Validates a status report strictly: a JSON object with a known `state`,
 * an optional known `kind` (`ingest` when absent), only the known fields,
 * each of the right type. `summary` and `error` are cut to
 * `MAX_TEXT_LENGTH` characters; `processed`, `quarantined` and `refused`
 * are cut to `MAX_PROCESSED` entries, each entry to `MAX_TEXT_LENGTH`
 * characters, so a `Run` stays small in KV. A report with `quarantined`
 * and/or `refused` but no `processed` is still valid. Anything else is a
 * 400 `bad_request`.
 */
function parseStatusReport(body: unknown): StatusReport {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Body must be a JSON object');
  }
  const record = body as Record<string, unknown>;
  for (const field of Object.keys(record)) {
    if (!REPORT_FIELDS.has(field)) {
      throw badRequest(`Unknown field ${field}`);
    }
  }
  const state = record.state;
  if (!isReportState(state)) {
    throw badRequest('state must be running, done or failed');
  }
  const kind = record.kind ?? 'ingest';
  if (!isRunKind(kind)) {
    throw badRequest('kind must be ingest or lint');
  }
  const report: StatusReport = { state, kind };

  const runId = record.runId;
  if (runId !== undefined) {
    if (typeof runId !== 'string' || runId.length === 0) {
      throw badRequest('runId must be a non-empty string');
    }
    report.runId = runId;
  }

  const summary = optionalText(record, 'summary');
  if (summary !== undefined) report.summary = summary;
  const error = optionalText(record, 'error');
  if (error !== undefined) report.error = error;

  const processed = optionalStringArray(record, 'processed');
  if (processed !== undefined) report.processed = processed;
  const quarantined = optionalStringArray(record, 'quarantined');
  if (quarantined !== undefined) report.quarantined = quarantined;
  const refused = optionalStringArray(record, 'refused');
  if (refused !== undefined) report.refused = refused;
  return report;
}

/**
 * The run after `report`, at `now` (ISO-8601). Without a stored run, one is
 * started with `requestedAt = now`. The report's `runId` wins over the
 * stored one, and the run takes the report's `kind`.
 *
 * - `running`: `startedAt = now`, unless the run was already running (then
 *   its `startedAt` is kept). Any outcome of an earlier attempt
 *   (`finishedAt`, `summary`, `processed`, `quarantined`, `refused`,
 *   `error`) is dropped.
 * - `done` / `failed`: `finishedAt = now`; `summary`, `processed`,
 *   `quarantined`, `refused` and `error` are exactly the report's (absent
 *   when the report has none).
 */
function applyReport(
  current: Run | undefined,
  report: StatusReport,
  now: string,
): Run {
  const base: Run = current ?? { state: 'queued', requestedAt: now };
  const run: Run = {
    state: report.state,
    kind: report.kind,
    requestedAt: base.requestedAt,
  };
  const runId = report.runId ?? base.runId;
  if (runId !== undefined) run.runId = runId;

  if (report.state === 'running') {
    run.startedAt =
      base.state === 'running' && base.startedAt !== undefined
        ? base.startedAt
        : now;
    return run;
  }

  if (base.startedAt !== undefined) run.startedAt = base.startedAt;
  run.finishedAt = now;
  if (report.summary !== undefined) run.summary = report.summary;
  if (report.processed !== undefined) run.processed = report.processed;
  if (report.quarantined !== undefined) run.quarantined = report.quarantined;
  if (report.refused !== undefined) run.refused = report.refused;
  if (report.error !== undefined) run.error = report.error;
  return run;
}

/**
 * The notification for a finished run. An ingest (or a run without `kind`)
 * says how many files were tidied up (`done`), that there was nothing to
 * do (`done` with none), or that the run failed, and opens `/`; a `done`
 * body gets a short " · n set aside" suffix when the run quarantined
 * anything. A lint says the health check is ready or failed, and opens
 * `/health`. Never a file name or the summary.
 */
export function runPushPayload(run: Run): PushPayload {
  if (run.kind === 'lint') {
    return {
      title: 'Bower',
      body:
        run.state === 'failed' ? 'Health check failed' : 'Health check ready',
      url: '/health',
    };
  }
  let body: string;
  if (run.state === 'failed') {
    body = 'Something went wrong';
  } else {
    const count = run.processed?.length ?? 0;
    body =
      count === 0
        ? 'Nothing new to tidy up'
        : `${count} ${count === 1 ? 'file' : 'files'} tidied up`;
    const quarantined = run.quarantined?.length ?? 0;
    if (quarantined > 0) body += ` · ${quarantined} set aside`;
  }
  return { title: 'Bower', body, url: '/' };
}

type VaultUser = User & { vault: NonNullable<User['vault']> };

function hasVault(user: User | undefined): user is VaultUser {
  return user?.vault !== undefined;
}

/** The runner routes as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createRunnerRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const runner = new Hono<AppEnv>();

  /** The user behind `:id`, with a vault; a 404 `not_found` otherwise. */
  async function loadVaultUser(
    kv: KVNamespace,
    id: string,
  ): Promise<VaultUser> {
    const user = await getUser(kv, id);
    if (!hasVault(user)) {
      throw new HttpError(404, 'not_found', 'No such vault');
    }
    return user;
  }

  runner.post('/runner/lint/dispatch', requireRunnerKey, async (c) => {
    const env = c.get('env');
    const kv = env.BOWER_KV;
    const text = await c.req.text();
    let body: unknown;
    if (text.trim() !== '') {
      try {
        body = JSON.parse(text);
      } catch {
        throw badRequest('Body must be a JSON object');
      }
    }
    const only = parseLintDispatch(body);
    const ids =
      only === undefined
        ? await listVaultIds(kv)
        : [(await loadVaultUser(kv, only)).id];

    // One vault's failed dispatch does not stop the others; the answer is
    // a 502 when any failed, so the calling job shows it.
    let dispatched = 0;
    for (const id of ids) {
      const now = new Date();
      // Stored before the dispatch, so the runner never asks before it
      // exists; retired again when the dispatch fails.
      const ticket = await issueRunTicket(
        kv,
        id,
        'lint',
        now,
        RUN_TICKET_TTL_MS,
      );
      try {
        await dispatchLint(
          {
            repo: env.GITHUB_REPO,
            token: env.GITHUB_TOKEN,
            vaultId: id,
            ticket,
          },
          fetchImpl,
        );
      } catch (err) {
        await deleteRunTicket(kv, id, 'lint');
        // `dispatchLint` has logged GitHub's status; anything but its own
        // 502 is unexpected and ends the request.
        if (!(err instanceof HttpError)) throw err;
        continue;
      }
      const run: Run = {
        state: 'queued',
        kind: 'lint',
        requestedAt: now.toISOString(),
        runId: crypto.randomUUID(),
      };
      await putRun(kv, id, run, 'lint');
      dispatched += 1;
    }
    if (dispatched < ids.length) {
      throw new HttpError(
        502,
        'dispatch',
        `Could not start ${ids.length - dispatched} of ${ids.length} health checks`,
      );
    }
    const result: LintDispatchResult = { dispatched };
    return c.json(result);
  });

  runner.get('/runner/vaults', requireLegacyRunnerKey, async (c) => {
    const ids = await listVaultIds(c.get('env').BOWER_KV);
    const body: RunnerVaultList = { vaults: ids.map((id) => ({ id })) };
    return c.json(body);
  });

  runner.get('/runner/vaults/:id', async (c) => {
    const env = c.get('env');
    const id = c.req.param('id');
    await authorizeRun(c, id);
    const user = await loadVaultUser(env.BOWER_KV, id);

    let token: DriveToken;
    try {
      token = await getAccessToken(env, user, fetchImpl);
    } catch (err) {
      // `getAccessToken` has already flagged the user (`needsReauth`). For
      // the runner this is not an auth failure of its own request: a 409
      // lets it report `failed` with a clear reason instead of retrying.
      if (err instanceof HttpError && err.code === 'reauth') {
        throw new HttpError(
          409,
          'reauth',
          'Google access was revoked; the user must sign in again',
          { cause: err },
        );
      }
      throw err;
    }

    const vault: RunnerVault = {
      folderId: user.vault.folderId,
      inboxFolderId: user.vault.inboxFolderId,
      driveAccessToken: token.accessToken,
      expiresAt: token.expiresAt,
      maxTurns: Number(env.DEFAULT_MAX_TURNS),
    };
    if (user.encApiKey !== undefined) {
      const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
      vault.apiKey = await decrypt(user.encApiKey, key);
    }
    return c.json(vault);
  });

  runner.post('/runner/vaults/:id/status', async (c) => {
    const env = c.get('env');
    const kv = env.BOWER_KV;
    const id = c.req.param('id');
    const allowed = await authorizeRun(c, id);
    const user = await loadVaultUser(kv, id);
    const body: unknown = await c.req.json().catch(() => undefined);
    const report = parseStatusReport(body);
    // A ticket reports on its own run only: an ingest's ticket cannot
    // write the lint run, nor the other way round.
    if (allowed !== 'legacy' && allowed !== report.kind) {
      throw unauthorized();
    }

    // Each kind has its own key: a lint report never reads or writes the
    // ingest run that `GET /status` and `POST /process` look at.
    const current = await getRun(kv, user.id, report.kind);
    const run = applyReport(current, report, new Date().toISOString());
    await putRun(kv, user.id, run, report.kind);

    if (run.state === 'done' || run.state === 'failed') {
      // The run is over: its ticket is retired, so nothing can fetch a
      // Drive token or report again with it.
      if (allowed !== 'legacy') {
        await deleteRunTicket(kv, user.id, allowed);
      }
      await sendPush(env, user.id, runPushPayload(run), fetchImpl);
    }
    return c.json({ run });
  });

  return runner;
}
