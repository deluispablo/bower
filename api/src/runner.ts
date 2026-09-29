/**
 * The endpoints the GitHub Actions runner calls, and the weekly lint's
 * dispatch. Two credentials:
 *
 * - A run ticket (`run-ticket.ts`): minted for one run of one vault when
 *   the Worker dispatches it, sent in the `repository_dispatch` payload,
 *   and the only Worker credential a job that runs the agent holds. Good
 *   for `GET /runner/vaults/:id` and `POST /runner/vaults/:id/status` of
 *   that vault and that run's kind, until the run reports `done` or
 *   `failed` or the ticket expires.
 * - The admin key `ADMIN_KEY`: only for `POST /runner/lint/dispatch`, the
 *   manual "lint one vault by hand" call. The weekly lint is started by the
 *   Worker's own cron trigger (`scheduled`, #292), which runs the same
 *   `dispatchLintRuns`; no job in the instance repo holds a Worker key.
 *
 * Routes:
 *
 * - `POST /runner/lint/dispatch`: starts one lint run per vault (or for the
 *   one `vaultId` in the body), each with its own ticket, through one
 *   `repository_dispatch` (`bower-lint`) per vault.
 * - `GET /runner/vaults/:id`: what one run needs — the vault's folder ids,
 *   a 1 h Drive access token (never the refresh token), `maxTurns`, the
 *   user's own Claude API key when they set one, and when the run was asked
 *   for (`requestedAt`, #491).
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
import type { Context } from 'hono';

import type { AuthDeps } from './auth.js';
import { requireAdmin } from './admin.js';
import { decrypt, importEncryptionKey } from './crypto.js';
import { mintAccessToken } from './drive.js';
import { assertEnv } from './env.js';
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
import {
  RUN_FAILURE_REASONS,
  RUN_ITEM_KINDS,
  SET_ASIDE_REASONS,
} from './types.js';
import type {
  DriveToken,
  Run,
  RunFailureReason,
  RunItem,
  RunItemKind,
  RunKind,
  SetAsideItem,
  SetAsideReason,
  User,
} from './types.js';

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

/**
 * Longest `added` clause kept on a `Run` (report v2, #598): one short
 * clause for Home's bubble; longer text is cut.
 */
export const MAX_ADDED_LENGTH = 200;

function unauthorized(): HttpError {
  return new HttpError(401, 'unauthorized', 'Missing or invalid runner key');
}

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

/**
 * What the request's credential may do for vault `id`: the kind of run
 * whose live ticket it is (an ingest's is checked first, then a lint's).
 * Anything else (no credential, a ticket for another vault, a retired or
 * expired ticket, the admin key) is a 401 `unauthorized`.
 */
async function authorizeRun(c: Context<AppEnv>, id: string): Promise<RunKind> {
  const env = c.get('env');
  const credential = bearer(c);
  const now = new Date();
  for (const kind of ['ingest', 'lint'] as const) {
    if (await checkRunTicket(env.BOWER_KV, id, kind, credential, now)) {
      return kind;
    }
  }
  throw unauthorized();
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
  /** ISO-8601; when the run this ticket belongs to was asked for. The
   * runner leaves a request note written after it for the next tidy-up
   * (#491). Absent for a run record gone. */
  requestedAt?: string;
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
  items?: RunItem[];
  setAside?: SetAsideItem[];
  added?: string;
  quarantined?: string[];
  refused?: string[];
  error?: string;
  reason?: RunFailureReason;
}

const REPORT_STATES: readonly string[] = ['running', 'done', 'failed'];
const RUN_KINDS: readonly string[] = ['ingest', 'lint'];
const REPORT_FIELDS: ReadonlySet<string> = new Set([
  'state',
  'kind',
  'runId',
  'summary',
  'processed',
  'setAside',
  'added',
  'quarantined',
  'refused',
  'error',
  'reason',
]);

/** Keys a `processed` object entry may carry (#345, report v2 #598). */
const ITEM_FIELDS: ReadonlySet<string> = new Set([
  'path',
  'kind',
  'to',
  'renamedFrom',
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
  label: string = field,
): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw badRequest(`${label} must be a string`);
  }
  return value.slice(0, MAX_TEXT_LENGTH);
}

/**
 * An optional array-of-strings field: absent, or an array of strings, cut
 * to `MAX_PROCESSED` entries with each entry cut to `MAX_TEXT_LENGTH`
 * characters. Used for `quarantined` and `refused` (`processed` may also
 * carry kinds: `optionalProcessed`).
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

function isSetAsideReason(value: unknown): value is SetAsideReason {
  return SET_ASIDE_REASONS.some((known) => known === value);
}

/**
 * The `setAside` field (report v2, #598): absent, or an array of
 * `{ path, reason }` with a known reason and no other key. Cut to
 * `MAX_PROCESSED` entries, each path to `MAX_TEXT_LENGTH` characters.
 */
function optionalSetAside(
  body: Record<string, unknown>,
): SetAsideItem[] | undefined {
  const value = body.setAside;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw badRequest('setAside must be an array');
  }
  const items: SetAsideItem[] = [];
  for (const entry of value.slice(0, MAX_PROCESSED) as unknown[]) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw badRequest('setAside entries must be { path, reason }');
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.path !== 'string' ||
      !isSetAsideReason(record.reason) ||
      Object.keys(record).some((key) => key !== 'path' && key !== 'reason')
    ) {
      throw badRequest(
        `setAside entries must be { path, reason } with reason one of ${SET_ASIDE_REASONS.join(', ')}`,
      );
    }
    items.push({
      path: record.path.slice(0, MAX_TEXT_LENGTH),
      reason: record.reason,
    });
  }
  return items;
}

function isRunItemKind(value: unknown): value is RunItemKind {
  return RUN_ITEM_KINDS.some((known) => known === value);
}

/**
 * The `processed` field (#345): absent, or an array whose entries are each
 * a path (runners before #345) or `{ path, kind }` with a known kind. Cut
 * like `optionalStringArray`. Returns the paths, and the entries that
 * carried a kind as `items` (absent when none did).
 */
function optionalProcessed(
  body: Record<string, unknown>,
): { paths: string[]; items?: RunItem[] } | undefined {
  const value = body.processed;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw badRequest('processed must be an array');
  }
  const paths: string[] = [];
  const items: RunItem[] = [];
  for (const entry of value.slice(0, MAX_PROCESSED) as unknown[]) {
    if (typeof entry === 'string') {
      paths.push(entry.slice(0, MAX_TEXT_LENGTH));
      continue;
    }
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw badRequest('processed entries must be paths or { path, kind }');
    }
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record);
    if (
      typeof record.path !== 'string' ||
      !isRunItemKind(record.kind) ||
      keys.some((key) => !ITEM_FIELDS.has(key))
    ) {
      throw badRequest(
        `processed entries must be { path, kind, to?, renamedFrom? } with kind one of ${RUN_ITEM_KINDS.join(', ')}`,
      );
    }
    const path = record.path.slice(0, MAX_TEXT_LENGTH);
    paths.push(path);
    const item: RunItem = { path, kind: record.kind };
    const to = optionalText(record, 'to', 'processed[].to');
    if (to !== undefined) item.to = to;
    const renamedFrom = optionalText(
      record,
      'renamedFrom',
      'processed[].renamedFrom',
    );
    if (renamedFrom !== undefined) item.renamedFrom = renamedFrom;
    items.push(item);
  }
  return items.length > 0 ? { paths, items } : { paths };
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
  const reason = record.reason;
  if (reason !== undefined) {
    if (!RUN_FAILURE_REASONS.some((known) => known === reason)) {
      throw badRequest(
        `reason must be one of ${RUN_FAILURE_REASONS.join(', ')}`,
      );
    }
    report.reason = reason as RunFailureReason;
  }

  const processed = optionalProcessed(record);
  if (processed !== undefined) {
    report.processed = processed.paths;
    if (processed.items !== undefined) report.items = processed.items;
  }
  const setAside = optionalSetAside(record);
  if (setAside !== undefined) report.setAside = setAside;
  const added = optionalText(record, 'added');
  if (added !== undefined) report.added = added.slice(0, MAX_ADDED_LENGTH);
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
  if (report.items !== undefined) run.items = report.items;
  if (report.setAside !== undefined) run.setAside = report.setAside;
  if (report.added !== undefined) run.added = report.added;
  if (report.quarantined !== undefined) run.quarantined = report.quarantined;
  if (report.refused !== undefined) run.refused = report.refused;
  if (report.error !== undefined) run.error = report.error;
  // A reason explains a failure only; a done run never carries one.
  if (report.state === 'failed' && report.reason !== undefined) {
    run.reason = report.reason;
  }
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

/**
 * Starts one lint run for each vault in `ids`, each with its own ticket,
 * through one `repository_dispatch` (`bower-lint`) per vault. The one
 * implementation behind both `POST /runner/lint/dispatch` and the Worker's
 * weekly cron (`scheduled`, #292).
 *
 * One vault's failed dispatch does not stop the others: its ticket is
 * retired, `dispatchLint` has logged GitHub's status, and it is counted in
 * `failed`. Anything but a `dispatch` `HttpError` is unexpected and thrown.
 */
export async function dispatchLintRuns(
  env: Env,
  ids: readonly string[],
  fetchImpl: FetchLike,
): Promise<{ dispatched: number; failed: number }> {
  const kv = env.BOWER_KV;
  let dispatched = 0;
  for (const id of ids) {
    const now = new Date();
    // Stored before the dispatch, so the runner never asks before it
    // exists; retired again when the dispatch fails.
    const ticket = await issueRunTicket(kv, id, 'lint', now, RUN_TICKET_TTL_MS);
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
  return { dispatched, failed: ids.length - dispatched };
}

/**
 * The Worker's weekly cron (`[triggers] crons` in `wrangler.toml`): starts a
 * lint run for every vault, exactly as `POST /runner/lint/dispatch` does
 * with no body. A failure is logged with its code (never a token or a
 * ticket) and rethrown, so Cloudflare records the invocation as failed.
 */
export async function runScheduledLint(
  rawEnv: unknown,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<void> {
  try {
    const env = assertEnv(rawEnv);
    const ids = await listVaultIds(env.BOWER_KV);
    const { failed } = await dispatchLintRuns(env, ids, fetchImpl);
    if (failed > 0) {
      throw new HttpError(
        502,
        'dispatch',
        `Could not start ${failed} of ${ids.length} health checks`,
      );
    }
  } catch (err) {
    const code = err instanceof HttpError ? err.code : 'internal';
    console.error(`Weekly lint failed: ${code}`);
    throw err;
  }
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

  runner.post('/runner/lint/dispatch', requireAdmin, async (c) => {
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

    const { dispatched, failed } = await dispatchLintRuns(env, ids, fetchImpl);
    // The answer is a 502 when any failed, so the caller sees it.
    if (failed > 0) {
      throw new HttpError(
        502,
        'dispatch',
        `Could not start ${failed} of ${ids.length} health checks`,
      );
    }
    const result: LintDispatchResult = { dispatched };
    return c.json(result);
  });

  runner.get('/runner/vaults/:id', async (c) => {
    const env = c.get('env');
    const id = c.req.param('id');
    const kind = await authorizeRun(c, id);
    const user = await loadVaultUser(env.BOWER_KV, id);

    let token: DriveToken;
    try {
      // Minted for this run, never the session's cached token (#315): a
      // sign-in, a re-consent or the app dropping its own token cannot
      // touch the one a run is using.
      ({ token } = await mintAccessToken(env, user, fetchImpl));
    } catch (err) {
      // `mintAccessToken` has already flagged the user (`needsReauth`). For
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
    const run = await getRun(env.BOWER_KV, user.id, kind);
    if (run !== undefined) vault.requestedAt = run.requestedAt;
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
    if (allowed !== report.kind) {
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
      await deleteRunTicket(kv, user.id, allowed);
      await sendPush(env, user.id, runPushPayload(run), fetchImpl);
    }
    return c.json({ run });
  });

  return runner;
}
