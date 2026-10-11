/**
 * The routes the GitHub Actions runner calls (worker contract, "Runner wire"; TL-P3-18), adapted from the
 * original app's `api/src/runner.ts` (a per-run ticket as the bearer credential, a Drive token from the
 * refresh token, phase reports) to the per-person object:
 *
 * - `GET /runner/runs/:id/token` answers `{ accessToken, expiresAt, folderId, attempt, manifest }`, the
 *   manifest being what the run was admitted to take (TL-P3-21);
 * - `GET /runner/runs/:id/attempt` answers `{ attempt }` from the person object alone, with no Google call: the
 *   runner's check before each fenced write (TL-P4-04);
 * - `POST /runner/runs/:id/status` takes `{ attempt, seq, phase, total?, failure? }` and answers
 *   `{ run, revision }`; or `{ attempt, ended: true }`, an attempt that ended with no terminal report
 *   (`attempt-ended.ts`, TL-P4-16 addendum 4), which has the alarm look at the run within a minute.
 *
 * `:id` is the run id, `<person object id hex>-<random>` (run-ticket.ts): the route reaches the person
 * object with `idFromString` and no lookup. The ticket in `Authorization: Bearer` (RFC 6750) is the only
 * credential: no cookie, no same-origin check. A missing, wrong or expired ticket (a superseded one answers 409 `stale-attempt`), or a malformed run id,
 * answers 401 `signed-out`; once the person is gone (Delete me, or Google access revoked or unreadable) the token and
 * attempt routes answer 410 `gone`, while a plain sign-out leaves them answering. The ticket is hashed here, and the person object decides in one synchronous
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
import type { AdmissionManifest } from '../../src/data/spine/admission.js';
import type { Person, RunnerGrant } from './person.js';
import { isAttemptEnded } from '../../src/data/contracts/attempt-ended.js';
import type { AttemptEnded } from '../../src/data/contracts/attempt-ended.js';
import { isRunPhase } from '../../src/data/contracts/run-phases.js';
import { isQuestionSnapshot } from '../../src/data/contracts/questions.js';
import type { RunReply } from './process.js';
import { hashTicket, personIdOf } from './run-ticket.js';
import type { RunnerRefusal, RunnerReport, RunnerReportResult } from './run-ticket.js';
import { jsonBody, personById, unreadable } from './route-helpers.js';
import { limitBody, requireJsonBody } from './security.js';

/** What `GET /runner/runs/:id/token` answers: with what the run was admitted to take (TL-P3-21). */
export interface RunnerToken {
  accessToken: string;
  expiresAt: number;
  folderId: string;
  attempt: number;
  manifest: AdmissionManifest | null;
}

/** What `GET /runner/runs/:id/attempt` answers: the run's current attempt, from the person object alone (TL-P4-04). */
export interface RunnerAttempt {
  attempt: number;
}

/** Longest `failure` sentence kept on a run. */
export const MAX_FAILURE_LENGTH = 500;

function signedOut(): HttpError {
  return new HttpError(401, 'signed-out');
}

/**
 * The person is gone (Delete me, or Google access revoked or unreadable): 410, since the ticket will never
 * open anything again (RFC 9110, 15.5.11). The runner drops the Drive token it keeps and writes nothing more.
 */
function gone(): HttpError {
  return new HttpError(410, 'gone', 'This tidy-up is no longer allowed to change your folder.');
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
  return personById(env, id);
}

const wholeFrom = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;

function parseReport(value: unknown): RunnerReport {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw unreadable();
  const { attempt, seq, phase, total, failure, answersStayed, questions } = value as Record<string, unknown>;
  if (!wholeFrom(attempt, 1) || !wholeFrom(seq, 1)) throw unreadable();
  if (!isRunPhase(phase)) throw unreadable();
  if (total !== undefined && !wholeFrom(total, 0)) throw unreadable();
  if (failure !== undefined) {
    const sentence = typeof failure === 'string' && failure.trim() !== '' && failure.length <= MAX_FAILURE_LENGTH;
    if (!sentence || phase !== 'failed') throw unreadable();
  }
  // An answer that stayed is said only at done, and only as true (TL-P4-19 addendum 15).
  if (answersStayed !== undefined && (answersStayed !== true || phase !== 'done')) throw unreadable();
  if (questions !== undefined && !isQuestionSnapshot(questions)) throw unreadable();
  return {
    attempt,
    seq,
    phase,
    ...(total === undefined ? {} : { total }),
    ...(failure === undefined ? {} : { failure }),
    ...(answersStayed === true ? { answersStayed } : {}),
    ...(questions === undefined ? {} : { questions }),
  };
}

/** A status body: a phase report, or the ended report (additive: a phase report is read as before). */
function parseStatusBody(value: unknown): RunnerReport | AttemptEnded {
  return isAttemptEnded(value) ? value : parseReport(value);
}

/** `GET /runner/runs/:id/token`, `GET /runner/runs/:id/attempt` and `POST /runner/runs/:id/status`, mounted at `/` by `index.ts`. */
export function createRunnerRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const runner = new Hono<AppEnv>();

  /** The run's grant for this ticket from the person object alone; a superseded ticket is 409, anything else unknown 401. */
  async function granted(c: Context<AppEnv>): Promise<{ person: DurableObjectStub<Person>; access: RunnerGrant & { folderId: string } }> {
    const env = c.get('env');
    const runId = c.req.param('id') ?? '';
    const ticket = bearer(c);
    const person = personOfRun(env, runId);
    const hash = await hashTicket(ticket);
    const access: RunnerGrant | 'stale-attempt' | 'gone' | null = await person.runnerAccess(runId, hash, Date.now());
    if (access === 'stale-attempt') throw refusal('stale-attempt');
    if (access === 'gone') throw gone();
    if (access?.folderId == null) throw signedOut();
    return { person, access: { ...access, folderId: access.folderId } };
  }

  // The runner's check before each fenced write (TL-P4-04): the current attempt, with no Google call.
  runner.get('/runner/runs/:id/attempt', async (c) => {
    const { access } = await granted(c);
    const reply: RunnerAttempt = { attempt: access.attempt };
    return c.json(reply);
  });

  runner.get('/runner/runs/:id/token', async (c) => {
    const env = c.get('env');
    const { person, access } = await granted(c);
    const options: DriveTokenOptions = {};
    if (deps.fetchImpl !== undefined) options.fetchImpl = deps.fetchImpl;
    let minted: { accessToken: string; expiresAt: number };
    try {
      minted = await accessTokenOf(env, person, options);
    } catch (err) {
      // This very request found the refresh token refused or unreadable, and access was forgotten: asked again, the
      // person object says gone (410), so the runner ends the run failed now rather than waiting for the alarm.
      if (err instanceof HttpError && err.code === 'signed-out') {
        console.error(err);
        await granted(c);
      }
      throw err;
    }
    const { accessToken, expiresAt } = minted;
    const reply: RunnerToken = { accessToken, expiresAt, folderId: access.folderId, attempt: access.attempt, manifest: access.manifest };
    return c.json(reply);
  });

  runner.post('/runner/runs/:id/status', limitBody, requireJsonBody, async (c) => {
    const env = c.get('env');
    const runId = c.req.param('id');
    const ticket = bearer(c);
    const person = personOfRun(env, runId);
    const report = await jsonBody(c, parseStatusBody);
    const hash = await hashTicket(ticket);
    const result: RunnerReportResult = isAttemptEnded(report)
      ? await person.runnerEnded(runId, hash, report.attempt, Date.now())
      : await person.runnerReport(runId, hash, report, Date.now());
    if (!result.accepted && result.refused === 'stale-report') {
      // The contract's error shape, with where the Worker is, so a restarted runner goes on from `seq + 1`.
      const late = refusal('stale-report');
      console.error(`[${c.get('requestId')}] ${late.code}: ${late.message}`);
      c.header('x-request-id', c.get('requestId'));
      return c.json({ error: { code: late.code, message: late.message }, current: result.current }, 409);
    }
    if (!result.accepted) throw refusal(result.refused);
    const reply: RunReply = result.reply;
    return c.json(reply);
  });

  return runner;
}
