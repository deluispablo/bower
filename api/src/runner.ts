/**
 * The routes the GitHub Actions runner calls (worker contract, "Runner wire"; TL-P3-18), adapted from the
 * original app's `api/src/runner.ts` (a per-run ticket as the bearer credential, a Drive token from the
 * refresh token, phase reports) to the per-person object:
 *
 * - `GET /runner/runs/:id/token` answers `{ accessToken, expiresAt, folderId, attempt }`;
 * - `POST /runner/runs/:id/status` takes `{ attempt, seq, phase, total?, failure? }` and answers
 *   `{ run, revision }`.
 *
 * `:id` is the run id, `<person object id hex>-<random>` (run-ticket.ts): the route reaches the person
 * object with `idFromString` and no lookup. The ticket in `Authorization: Bearer` (RFC 6750) is the only
 * credential: no cookie, no same-origin check. A missing, wrong or expired ticket (a superseded one answers 409 `stale-attempt`), or a malformed run id,
 * answers 401 `signed-out`. The ticket is hashed here, and the person object decides in one synchronous
 * section (`Person.runnerAccess`, `Person.runnerReport`).
 *
 * Nothing here logs a ticket, its hash or a token.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';

import type { AuthDeps } from './auth.js';
import { accessTokenOf } from './drive-token.js';
import type { DriveTokenOptions } from './drive-token.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import type { Person } from './person.js';
import type { RunPhase, RunReply } from './process.js';
import { reach } from './process.js';
import { PHASE_RANK, hashTicket, personIdOf } from './run-ticket.js';
import type { RunnerAccess, RunnerRefusal, RunnerReport, RunnerReportResult } from './run-ticket.js';
import { limitBody, requireJsonBody } from './security.js';

/** What `GET /runner/runs/:id/token` answers. */
export interface RunnerToken {
  accessToken: string;
  expiresAt: number;
  folderId: string;
  attempt: number;
}

/** Longest `failure` sentence kept on a run. */
export const MAX_FAILURE_LENGTH = 500;

function signedOut(): HttpError {
  return new HttpError(401, 'signed-out');
}

function refusal(refused: RunnerRefusal): HttpError {
  if (refused === 'stale-attempt') return new HttpError(409, 'stale-attempt', 'This tidy-up was taken over.');
  if (refused === 'stale-report') return new HttpError(409, 'stale-report', 'That update arrived late.');
  return signedOut();
}

/** The ticket of `Authorization: Bearer <ticket>` (the scheme in any case, RFC 7235); anything else is signed out. */
function bearer(c: Context<AppEnv>): string {
  const match = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(c.req.header('authorization') ?? '');
  if (match?.[1] === undefined) throw signedOut();
  return match[1];
}

/** The person object that run `runId` belongs to; a malformed id, or one not of this namespace, is signed out. */
function personOfRun(env: Env, runId: string): DurableObjectStub<Person> {
  const hex = personIdOf(runId);
  if (hex === null) throw signedOut();
  let id: DurableObjectId;
  try {
    id = env.PERSON.idFromString(hex);
  } catch {
    throw signedOut();
  }
  return env.PERSON.get(id);
}

/** A body that fails validation is refused as the JSON guard refuses one: 415, no other code. */
function unreadable(): HttpError {
  return new HttpError(415, 'unsupported-media-type');
}

const wholeFrom = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;

function parseReport(value: unknown): RunnerReport {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw unreadable();
  const { attempt, seq, phase, total, failure } = value as Record<string, unknown>;
  if (!wholeFrom(attempt, 1) || !wholeFrom(seq, 1)) throw unreadable();
  if (typeof phase !== 'string' || !Object.hasOwn(PHASE_RANK, phase)) throw unreadable();
  if (total !== undefined && !wholeFrom(total, 0)) throw unreadable();
  if (failure !== undefined) {
    const sentence = typeof failure === 'string' && failure.trim() !== '' && failure.length <= MAX_FAILURE_LENGTH;
    if (!sentence || phase !== 'failed') throw unreadable();
  }
  return {
    attempt,
    seq,
    phase: phase as RunPhase,
    ...(total === undefined ? {} : { total }),
    ...(failure === undefined ? {} : { failure }),
  };
}

/** `GET /runner/runs/:id/token` and `POST /runner/runs/:id/status`, mounted at `/` by `index.ts`. */
export function createRunnerRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const runner = new Hono<AppEnv>();

  runner.get('/runner/runs/:id/token', async (c) => {
    const env = c.get('env');
    const runId = c.req.param('id');
    const ticket = bearer(c);
    const person = personOfRun(env, runId);
    const hash = await hashTicket(ticket);
    const access = await reach(
      'runner access',
      async (): Promise<RunnerAccess | 'stale-attempt' | null> => await person.runnerAccess(runId, hash, Date.now()),
    );
    if (access === 'stale-attempt') throw refusal('stale-attempt');
    if (access?.folderId == null) throw signedOut();
    const options: DriveTokenOptions = {};
    if (deps.fetchImpl !== undefined) options.fetchImpl = deps.fetchImpl;
    const { accessToken, expiresAt } = await accessTokenOf(env, person, options);
    const reply: RunnerToken = { accessToken, expiresAt, folderId: access.folderId, attempt: access.attempt };
    return c.json(reply);
  });

  runner.post('/runner/runs/:id/status', limitBody, requireJsonBody, async (c) => {
    const env = c.get('env');
    const runId = c.req.param('id');
    const ticket = bearer(c);
    const person = personOfRun(env, runId);
    let value: unknown;
    try {
      value = await c.req.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw unreadable();
    }
    const report = parseReport(value);
    const hash = await hashTicket(ticket);
    const result = await reach(
      'runner report',
      async (): Promise<RunnerReportResult> => await person.runnerReport(runId, hash, report, Date.now()),
    );
    if (!result.accepted) throw refusal(result.refused);
    const reply: RunReply = result.reply;
    return c.json(reply);
  });

  return runner;
}
