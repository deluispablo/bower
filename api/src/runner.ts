/**
 * The endpoints the GitHub Actions runner calls, authenticated with the
 * single operator key `BOWER_API_KEY` (never a per-user secret):
 *
 * - `GET /runner/vaults/:id`: what one run needs — the vault's folder ids,
 *   a 1 h Drive access token (never the refresh token), `maxTurns`, and the
 *   user's own Claude API key when they set one.
 * - `POST /runner/vaults/:id/status`: the run's progress (`running`,
 *   `done`, `failed`), stored as the user's `Run`.
 *
 * `:id` is the user id, as `POST /process` dispatches it (`vault_id`).
 * Nothing here logs the operator key, a token, the API key, file names or
 * run summaries.
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import type { AuthDeps } from './auth.js';
import { decrypt, importEncryptionKey, timingSafeEqual } from './crypto.js';
import { getAccessToken } from './drive.js';
import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';
import { sendPush } from './push.js';
import { getRun, getUser, putRun } from './store.js';
import type { DriveToken, Run, User } from './types.js';

/** Longest `summary` or `error` kept on a `Run`; longer text is cut. */
export const MAX_TEXT_LENGTH = 2000;

/** Most `processed` entries kept on a `Run`; the rest are dropped. */
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
  const header = c.req.header('authorization') ?? '';
  const [scheme, key] = header.split(' ');
  if (scheme !== 'Bearer' || key === undefined || key === '') {
    throw unauthorized();
  }
  if (!timingSafeEqual(key, c.get('env').BOWER_API_KEY)) {
    throw unauthorized();
  }
  await next();
};

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

/** A validated `POST /runner/vaults/:id/status` body. */
interface StatusReport {
  state: ReportState;
  runId?: string;
  summary?: string;
  processed?: string[];
  error?: string;
}

const REPORT_STATES: readonly string[] = ['running', 'done', 'failed'];
const REPORT_FIELDS: ReadonlySet<string> = new Set([
  'state',
  'runId',
  'summary',
  'processed',
  'error',
]);

function badRequest(message: string): HttpError {
  return new HttpError(400, 'bad_request', message);
}

function isReportState(value: unknown): value is ReportState {
  return typeof value === 'string' && REPORT_STATES.includes(value);
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
 * Validates a status report strictly: a JSON object with a known `state`,
 * only the known fields, each of the right type. `summary` and `error` are
 * cut to `MAX_TEXT_LENGTH` characters and `processed` to `MAX_PROCESSED`
 * entries, so a `Run` stays small in KV. Anything else is a 400
 * `bad_request`.
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
  const report: StatusReport = { state };

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

  const processed = record.processed;
  if (processed !== undefined) {
    if (
      !Array.isArray(processed) ||
      !processed.every((entry): entry is string => typeof entry === 'string')
    ) {
      throw badRequest('processed must be an array of strings');
    }
    report.processed = processed.slice(0, MAX_PROCESSED);
  }
  return report;
}

/**
 * The run after `report`, at `now` (ISO-8601). Without a stored run, one is
 * started with `requestedAt = now`. The report's `runId` wins over the
 * stored one.
 *
 * - `running`: `startedAt = now`, unless the run was already running (then
 *   its `startedAt` is kept). Any outcome of an earlier attempt
 *   (`finishedAt`, `summary`, `processed`, `error`) is dropped.
 * - `done` / `failed`: `finishedAt = now`; `summary`, `processed` and
 *   `error` are exactly the report's (absent when the report has none).
 */
function applyReport(
  current: Run | undefined,
  report: StatusReport,
  now: string,
): Run {
  const base: Run = current ?? { state: 'queued', requestedAt: now };
  const run: Run = { state: report.state, requestedAt: base.requestedAt };
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
  if (report.error !== undefined) run.error = report.error;
  return run;
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

  runner.use('/runner/*', requireRunnerKey);

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

  runner.get('/runner/vaults/:id', async (c) => {
    const env = c.get('env');
    const user = await loadVaultUser(env.BOWER_KV, c.req.param('id'));

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
    const user = await loadVaultUser(kv, c.req.param('id'));
    const body: unknown = await c.req.json().catch(() => undefined);
    const report = parseStatusReport(body);

    const current = await getRun(kv, user.id);
    const run = applyReport(current, report, new Date().toISOString());
    await putRun(kv, user.id, run);

    if (run.state === 'done' || run.state === 'failed') {
      await sendPush(env, user.id, run);
    }
    return c.json({ run });
  });

  return runner;
}
