/**
 * `POST /process`: admitting a tidy-up (worker contract, `POST /process`; TL-P3-15).
 *
 * The route checks the caller (same origin, session, the lease's epoch) and the body, then asks the
 * person object cheaply whether this press would admit a new run (`Person.wouldAdmit`: not a repeat, no
 * run going). Only then, outside the object's synchronous section, it reads the inbox with the person's
 * Drive token and builds the admission manifest with the shared plan (`src/data/spine/plan.ts`, TL-P3-21):
 * metadata, Bower's own files and each pile's note, read by the runner's own readiness rules so a pile it would
 * hold is not admitted (TL-P3-25 point 2), through the Worker's reader (`admissionRead` in `src/data/spine/read.ts`: a listing with checksums,
 * the files the plan reads read ahead together, TL-P4-04). A note is read transiently: the manifest keeps its id and modifiedTime,
 * never its text, and nothing here logs it. An empty one answers 409 `nothing` with its cause, before
 * any quota count. Otherwise the person object (`Person.admit`) decides in one synchronous section:
 * expiry, idempotency by `requestId` (the Idempotency-Key pattern,
 * https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/), one active run,
 * the daily quota, then admission, keeping the manifest with the run.
 *
 * Admission is timed in parts and logged as one line of numbers (`admission timing`): session and lease, the
 * would-admit check, the Drive reads, the admit, the ticket and dispatch, and the whole, in milliseconds. A Worker's
 * clock moves only across I/O (https://developers.cloudflare.com/workers/reference/security-model/#step-1-disallow-timers-and-multi-threading),
 * which is all these parts are. What follows the dispatch, until the job starts, is GitHub's queue.
 *
 * An answer's run (TL-P4-08 addendum 8) is a press like any other, with the answer's own requestId and, for a thing or
 * pile asked about, its `subject`: admission then reads and takes only the pile that holds it, with your changes.
 *
 * Staleness reuses the original app's thresholds and rule (bower `api/src/process.ts`,
 * `runStaleness`/`markStale`), measured on this contract's `requestedAt` and `phaseAt`.
 */
import { Hono } from 'hono';

import { DriveHttp } from '../../src/data/drive/drive-http.js';
import type { AdmissionManifest } from '../../src/data/spine/admission.js';
import { NOTHING } from '../../src/data/spine/admission.js';
import { planAdmission } from '../../src/data/spine/plan.js';
import { DISPATCH_SUBREQUESTS, SUBREQUEST_BUDGET } from '../../src/data/spine/budget.js';
import { admissionRead } from '../../src/data/spine/read.js';
import { BowerError } from '../../src/data/types.js';
import { requireSession } from './auth.js';
import { accessTokenFor } from './drive-token.js';
import type { AppEnv, Env } from './env.js';
import type { FetchLike } from './google.js';
import { HttpError } from './errors.js';
import { limitBody, requireJsonBody, requireSameOrigin } from './security.js';
import { requireLease } from './session-lease.js';
import type { AuthDeps } from './auth.js';
import { dispatchOutcome } from './github.js';

export type RunScope = 'all' | 'instructions';
export type RunPhase = 'queued' | 'reading' | 'writing' | 'saving' | 'done' | 'failed';

/** A run as the app receives it (worker contract, `RunWire`). */
export interface RunWire {
  id: string;
  scope: RunScope;
  phase: RunPhase;
  requestedAt: number;
  phaseAt: number;
  finishedAt?: number;
  total?: number;
  failure?: string;
}

/** What `POST /process` and `GET /status` answer: the run, and the person's status revision. */
export interface RunReply {
  run: RunWire | null;
  revision: number;
}

/**
 * What admission decided: the run (admitted, repeated or already going), the day's limit reached, or a new run
 * that needs its manifest first (the press was asked with none, and in between it became one that admits).
 */
export type AdmitResult =
  | { admitted: true; run: RunWire; revision: number; created?: true }
  | { admitted: false; refused: 'rate-limited' | 'needs-manifest' };

export interface AdmitInput {
  scope: RunScope;
  allowWeb: boolean;
  requestId: string;
  now: number;
  /** `DAILY_RUN_LIMIT`: new runs a person may start per UTC day. */
  dailyLimit: number;
  /** What a new run takes (TL-P3-21); null when none was built, because the press looked like a repeat or a run going. */
  manifest: AdmissionManifest | null;
}

/** A queued run nobody started within this long is stale (the original's `QUEUED_STALE_MS`). */
export const QUEUED_STALE_MS = 17 * 60 * 1000;
/** A started run with no news of its phase for this long is stale (the original's `RUNNING_STALE_MS`). */
export const RUNNING_STALE_MS = 30 * 60 * 1000;
/** The failure a stale run is given (TL-P3-15; the original's "it took too long", #1000). */
export const STALE_FAILURE = 'This tidy-up took too long and stopped. Try again.';
/** The failure a run stuck in `saving` is given: its changes were made, its summary was not saved (TL-P3-22). */
export const SAVING_FAILURE = "Bower made changes but couldn't save the summary of this tidy-up.";

export const ACTIVE_PHASES: readonly RunPhase[] = ['queued', 'reading', 'writing', 'saving'];

/** Whether `run` is still going but past its window at `now`: queued from `requestedAt`, a started phase from `phaseAt`. */
export function isStale(run: Pick<RunWire, 'phase' | 'requestedAt' | 'phaseAt'>, now: number): boolean {
  if (!ACTIVE_PHASES.includes(run.phase)) return false;
  return run.phase === 'queued' ? now - run.requestedAt >= QUEUED_STALE_MS : now - run.phaseAt >= RUNNING_STALE_MS;
}

/** The quota window for `now`: its UTC date. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

const REQUEST_ID = /^[a-z0-9-]{1,64}$/;
/** A thing's Drive file id or a pile's id, as an answer's run names its subject (TL-P4-08 addendum 8). */
const SUBJECT = /^[A-Za-z0-9_-]{1,128}$/;

interface ProcessBody {
  scope: RunScope;
  allowWeb: boolean;
  /** Absent when the app sent none: the Worker makes one, so it counts as new. */
  requestId: string | undefined;
  /** An answer's run: the one thing or pile of the inbox it takes (scope `all` only); absent for a press of Tidy up. */
  subject: string | undefined;
}

/** A body that fails validation is refused as the JSON guard refuses one: 415, no other code. */
function unreadable(): HttpError {
  return new HttpError(415, 'unsupported-media-type');
}

function parseBody(value: unknown): ProcessBody {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw unreadable();
  const { scope, allowWeb, requestId, subject } = value as Record<string, unknown>;
  if (scope !== 'all' && scope !== 'instructions') throw unreadable();
  if (typeof allowWeb !== 'boolean') throw unreadable();
  if (requestId !== undefined && !(typeof requestId === 'string' && REQUEST_ID.test(requestId))) throw unreadable();
  if (subject !== undefined && !(scope === 'all' && typeof subject === 'string' && SUBJECT.test(subject))) throw unreadable();
  return { scope, allowWeb, requestId, subject };
}

export function personFor(env: Env, sub: string) {
  return env.PERSON.get(env.PERSON.idFromName(sub));
}

/** Calls the person object; any failure on the way is `internal` with no cause, logged here only (TL-P3-04). */
export async function reach<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    // Version skew: a newer version reached an old person object (Cloudflare Durable Objects gradual deployment)
    // The RPC call fails with a TypeError about an unimplemented method.
    if (err instanceof TypeError && /^The RPC receiver does not implement the method/.test(err.message)) {
      console.error(`person object: ${what} failed (version skew)`, err);
      throw new HttpError(503, 'internal');
    }
    console.error(`person object: ${what} failed`, err);
    throw new HttpError(500, 'internal');
  }
}

export function signedInSub(sub: string | undefined): string {
  if (sub === undefined) throw new HttpError(500, 'internal');
  return sub;
}

/**
 * Sends a new run to GitHub with attempt 1's ticket. A failure never changes the answer: the run stays
 * `queued` and the alarm recovers it. Nothing here logs the ticket.
 */
async function dispatchNew(env: Env, sub: string, run: RunWire, allowWeb: boolean, now: number, fetchImpl: FetchLike): Promise<void> {
  if (env.GITHUB_TOKEN === undefined) {
    console.error('tidy dispatch is not configured: no GitHub token');
    return;
  }
  const ticket = await reach('mint ticket', async () => await personFor(env, sub).mintTicket(run.id, 1, now));
  if (ticket === null) return;
  const outcome = await dispatchOutcome(
    { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN, runId: run.id, attempt: 1, ticket, scope: run.scope, allowWeb },
    fetchImpl,
  );
  // Lost to the network or a 5xx after its retries: the alarm looks at the run in a minute. A 4xx would fail again, so it keeps the normal window.
  if (outcome === 'lost') {
    await personFor(env, sub)
      .dispatchLost(run.id, Date.now())
      .catch((err: unknown) => console.error('tidy dispatch: the retry alarm was not armed', err));
  }
}

/**
 * The admission manifest for the person's folder, read now with their Drive token. Drive trouble answers as the
 * contract's codes with no cause: a refused token is `signed-out`, anything else `internal` (logged only).
 */
async function admission(env: Env, sub: string, scope: RunScope, subject: string | undefined, now: number, fetchImpl: FetchLike, spent: () => number): Promise<AdmissionManifest> {
  const folderId = await reach('folder', async () => await personFor(env, sub).folderId());
  if (folderId === null) throw new HttpError(409, 'no-folder', 'Choose a folder for Bower first.');
  // The token is asked of the person object once per press, not once per Drive call; a 401 asks for a fresh one.
  let token: Promise<string> | null = null;
  const drive = new DriveHttp({
    token: async (fresh) => {
      if (fresh || token === null) {
        const asked = accessTokenFor(env, sub, { fresh, fetchImpl }).then((t) => t.accessToken);
        token = asked;
        asked.catch(() => {
          if (token === asked) token = null;
        });
      }
      return await token;
    },
    fetch: async (input, init) => await fetchImpl(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init),
  });
  let planned;
  try {
    planned = await planAdmission(admissionRead(drive, scope, { limit: SUBREQUEST_BUDGET, reserve: DISPATCH_SUBREQUESTS, used: spent }), folderId, { scope, ...(subject !== undefined ? { subject } : {}), clock: () => now, newId: () => crypto.randomUUID() });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof BowerError && err.code === 'auth') throw new HttpError(401, 'signed-out', undefined, { cause: err });
    throw new HttpError(500, 'internal', undefined, { cause: err });
  }
  if (planned.kind === 'nothing') throw new HttpError(409, 'nothing', NOTHING[planned.cause]);
  return planned.manifest;
}

/** The parts of an admission, in the order they happen; each one's milliseconds are added up. */
const PARTS = ['session', 'check', 'reads', 'admit', 'dispatch'] as const;
type Part = (typeof PARTS)[number];

/** Times the parts of one admission and logs them as one line of numbers. */
class AdmissionTiming {
  private readonly start = Date.now();
  private at = this.start;
  private readonly ms: Record<Part, number> = { session: 0, check: 0, reads: 0, admit: 0, dispatch: 0 };

  /** Ends `part` now: the time since the last part ended is its. */
  lap(part: Part): void {
    const now = Date.now();
    this.ms[part] += now - this.at;
    this.at = now;
  }

  async time<T>(part: Part, work: () => Promise<T>): Promise<T> {
    this.at = Date.now();
    try {
      return await work();
    } finally {
      this.lap(part);
    }
  }

  log(): void {
    console.log(`admission timing: ${PARTS.map((p) => `${p}=${this.ms[p]}ms`).join(' ')} total=${Date.now() - this.start}ms`);
  }
}

/** `POST /process`, mounted at `/` by `index.ts`. */
export function createProcessRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const routes = new Hono<AppEnv>();
  const timings = new WeakMap<Request, AdmissionTiming>();

  routes.post('/process', async (c, next) => {
    timings.set(c.req.raw, new AdmissionTiming());
    await next();
  }, requireSameOrigin, requireSession, requireLease, limitBody, requireJsonBody, async (c) => {
    const timing = timings.get(c.req.raw) ?? new AdmissionTiming();
    timing.lap('session');
    const sub = signedInSub(c.get('userId'));
    let value: unknown;
    try {
      value = await c.req.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw unreadable();
    }
    const body = parseBody(value);
    const env = c.get('env');
    const now = Date.now();
    // Every fetch this press makes counts against a Worker invocation's subrequests: 50 on the free plan
    // (https://developers.cloudflare.com/workers/platform/limits/#subrequests), of which admission keeps to 35.
    let fetches = 0;
    const counted: FetchLike = (input, init) => {
      fetches += 1;
      return fetchImpl(input, init);
    };
    const requestId = body.requestId ?? crypto.randomUUID();
    const person = personFor(env, sub);
    // Drive is read only for a press that would admit a new run; a repeat or a run going answers from the object.
    const fresh = await timing.time('check', () => reach('would admit', async (): Promise<boolean> => await person.wouldAdmit(requestId, now)));
    let manifest = fresh ? await timing.time('reads', () => admission(env, sub, body.scope, body.subject, now, counted, () => fetches)) : null;
    const input = (): AdmitInput => ({
      scope: body.scope,
      allowWeb: body.allowWeb,
      requestId,
      now,
      dailyLimit: Number(env.DAILY_RUN_LIMIT),
      manifest,
    });
    const admit = (): Promise<AdmitResult> => timing.time('admit', () => reach('admit', async (): Promise<AdmitResult> => await person.admit(input())));
    let result = await admit();
    // The run it looked like ended in between: this press is new after all, so it reads the inbox once.
    if (!result.admitted && result.refused === 'needs-manifest' && manifest === null) {
      manifest = await timing.time('reads', () => admission(env, sub, body.scope, body.subject, now, counted, () => fetches));
      result = await admit();
    }
    if (!result.admitted && result.refused === 'needs-manifest') throw new HttpError(500, 'internal', undefined, { cause: new Error('admitted with no manifest') });
    if (!result.admitted) throw new HttpError(429, 'rate-limited');
    if (result.created === true) {
      const run = result.run;
      await timing.time('dispatch', () => dispatchNew(env, sub, run, body.allowWeb, now, counted));
    }
    timing.log();
    const reply: RunReply = { run: result.run, revision: result.revision };
    return c.json(reply);
  });

  return routes;
}
