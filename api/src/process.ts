/**
 * `POST /process`: admitting a tidy-up (worker contract, `POST /process`; TL-P3-15).
 *
 * The route checks the caller (same origin, session, the lease's epoch) and the body, then asks the
 * person object to admit with no manifest (`Person.admit(null)`): a repeat, a run going or the day's limit answer
 * with no Drive read. Only a press that would admit a new run (`needs-manifest`) goes on: outside the object's synchronous section it reads the inbox with the person's
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
 * would-admit check, the Drive reads, the admit, and the whole, in milliseconds. A Worker's
 * clock moves only across I/O (https://developers.cloudflare.com/workers/reference/security-model/#step-1-disallow-timers-and-multi-threading),
 * which is all these parts are. The dispatch follows from the person object's alarm (TL-P4-14 stage 2), then GitHub's queue.
 *
 * An answer's run (TL-P4-08 addendum 8) is a press like any other, with the answer's own requestId and, for a thing or
 * pile asked about, its `subject`: admission then reads and takes only the pile that holds it, with your changes.
 * While a run is going, an answer (`answer: true`) is kept by the person object with no Drive read, and answered
 * `waits`; when that run ends, the object starts one run for every answer that waited (`Person.wake`, TL-P4-13
 * addendum), counted in the daily quota. With the day's tidy-ups used up, the answer is refused as any press is.
 *
 * Staleness reuses the original app's thresholds and rule (bower `api/src/process.ts`,
 * `runStaleness`/`markStale`), measured on this contract's `requestedAt` and `phaseAt`.
 */
import { Hono } from 'hono';

import { DriveHttp, type Pacing } from '../../src/data/drive/drive-http.js';
import type { AdmissionManifest } from '../../src/data/spine/admission.js';
import { ADMISSION_MANIFEST_LIMIT, NOTHING } from '../../src/data/spine/admission.js';
import { planAdmission } from '../../src/data/spine/plan.js';
import { DISPATCH_SUBREQUESTS, FolderTooBig, SUBREQUEST_BUDGET } from '../../src/data/spine/budget.js';
import { admissionRead } from '../../src/data/spine/read.js';
import { BowerError } from '../../src/data/types.js';
import { requireSession } from './auth.js';
import { accessTokenOf } from './drive-token.js';
import type { DriveTokenKeeper } from './drive-token.js';
import type { AppEnv, Env } from './env.js';
import type { FetchLike } from './google.js';
import type { RunScope, RunWire } from '../../src/data/contracts/run-wire.js';
import { HttpError } from './errors.js';
import { jsonBody, personFor, signedInSub, unreadable } from './route-helpers.js';
import { limitBody, requireJsonBody, requireSameOrigin } from './security.js';
import { requireLease } from './session-lease.js';
import type { AuthDeps } from './auth.js';

/** What `POST /process` and `GET /status` answer: the run, and the person's status revision. */
export interface RunReply {
  run: RunWire | null;
  revision: number;
  /** An answer kept for the end of the run going (`run`): the person object starts it then (TL-P4-13 addendum). */
  waits?: true;
}

/**
 * What admission decided: the run (admitted, repeated or already going), the day's limit reached, or a new run
 * that needs its manifest first (the press was asked with none, and in between it became one that admits).
 */
export type AdmitResult =
  | { admitted: true; run: RunWire; revision: number; created?: true; waits?: true }
  | { admitted: false; refused: 'rate-limited' | 'needs-manifest' | 'gone' };

export interface AdmitInput {
  scope: RunScope;
  allowWeb: boolean;
  requestId: string;
  now: number;
  /**
   * The person's account epoch when admission started (before its Drive reads): a Delete me in between moves it, and
   * admission refuses as `gone` with nothing written. A sign-out does not: runs never depend on a browser session.
   */
  accountEpoch: number;
  /** `DAILY_RUN_LIMIT`: new runs a person may start per UTC day. */
  dailyLimit: number;
  /** What a new run takes (TL-P3-21); null when none was built, because the press looked like a repeat or a run going. */
  manifest: AdmissionManifest | null;
  /** An answer's press: while a run is going it waits for that run's end, instead of being told the run going. */
  answer?: boolean;
  /** An answer's subject, kept with it while it waits. */
  subject?: string;
}

/** A queued run nobody started within this long is stale (the original's `QUEUED_STALE_MS`). */
export const QUEUED_STALE_MS = 17 * 60 * 1000;
/** A started run with no news of its phase for this long is stale (the original's `RUNNING_STALE_MS`). */
export const RUNNING_STALE_MS = 30 * 60 * 1000;
/** The failure a stale run is given (TL-P3-15; the original's "it took too long", #1000). */
export const STALE_FAILURE = 'This tidy-up took too long and stopped. Try again.';
/** The failure a run stuck in `saving` is given: its changes were made, its summary was not saved (TL-P3-22). */
export const SAVING_FAILURE = "Bower made changes but couldn't save the summary of this tidy-up.";

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
  /** An answer's press (TL-P4-13 addendum): it waits for a run going to end. */
  answer: boolean;
}

function parseBody(value: unknown): ProcessBody {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw unreadable();
  const { scope, allowWeb, requestId, subject, answer } = value as Record<string, unknown>;
  if (scope !== 'all' && scope !== 'instructions') throw unreadable();
  if (typeof allowWeb !== 'boolean') throw unreadable();
  if (requestId !== undefined && !(typeof requestId === 'string' && REQUEST_ID.test(requestId))) throw unreadable();
  if (subject !== undefined && !(scope === 'all' && typeof subject === 'string' && SUBJECT.test(subject))) throw unreadable();
  if (answer !== undefined && typeof answer !== 'boolean') throw unreadable();
  return { scope, allowWeb, requestId, subject, answer: answer === true };
}

/**
 * What admission asks of the person object: the route's stub, or the object itself when it starts the run its waiting
 * answers asked for (`Person.wake`). It never dispatches: only the object's alarm does (TL-P4-14 stage 2).
 */
export interface PersonHandle extends DriveTokenKeeper {
  folderId(): string | null | Promise<string | null>;
}

/** What an admission reads: its scope, and for answers' runs the subjects whose piles it takes. */
export interface AdmissionAsk {
  scope: RunScope;
  subjects: readonly string[];
  now: number;
}

/**
 * The admission manifest for the person's folder, read now with their Drive token. Drive trouble answers as the
 * contract's codes with no cause: a refused token is `signed-out`, anything else `internal` (logged only). A press past
 * its size limit (a listing past the budget, a manifest past `ADMISSION_MANIFEST_LIMIT`) is `payload-too-large`.
 */
export async function admission(env: Env, person: PersonHandle, ask: AdmissionAsk, fetchImpl: FetchLike, spent: () => number, pacing?: Partial<Pacing>): Promise<AdmissionManifest> {
  const { scope, subjects, now } = ask;
  const folderId = await person.folderId();
  if (folderId === null) throw new HttpError(409, 'no-folder', 'Choose a folder for Bower first.');
  // The token is asked of the person object once per press, not once per Drive call; a 401 asks for a fresh one.
  let token: Promise<string> | null = null;
  const drive = new DriveHttp({
    token: async (fresh) => {
      if (fresh || token === null) {
        const asked = accessTokenOf(env, person, { fresh, fetchImpl }).then((t) => t.accessToken);
        token = asked;
        asked.catch(() => {
          if (token === asked) token = null;
        });
      }
      return await token;
    },
    fetch: fetchImpl,
    context: 'headless',
    ...(pacing ? { pacing } : {}),
  });
  let planned;
  try {
    planned = await planAdmission(admissionRead(drive, scope, { limit: SUBREQUEST_BUDGET, reserve: DISPATCH_SUBREQUESTS, used: spent }), folderId, { scope, subjects, clock: () => now, newId: () => crypto.randomUUID() });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof BowerError && err.code === 'auth') throw new HttpError(401, 'signed-out', undefined, { cause: err });
    if (err instanceof FolderTooBig) throw new HttpError(413, 'payload-too-large', undefined, { cause: err });
    throw new HttpError(500, 'internal', undefined, { cause: err });
  }
  if (planned.kind === 'nothing') throw new HttpError(409, 'nothing', NOTHING[planned.cause]);
  // Stored whole in the run's row: past the limit it is refused before anything is kept or counted.
  if (new TextEncoder().encode(JSON.stringify(planned.manifest)).byteLength > ADMISSION_MANIFEST_LIMIT) {
    throw new HttpError(413, 'payload-too-large', undefined, { cause: new Error('the admission manifest is past its limit') });
  }
  return planned.manifest;
}

/** The parts of an admission, in the order they happen; each one's milliseconds are added up. */
const PARTS = ['session', 'check', 'reads', 'admit'] as const;
type Part = (typeof PARTS)[number];

/** Times the parts of one admission and logs them as one line of numbers. */
class AdmissionTiming {
  private readonly start = Date.now();
  private at = this.start;
  private readonly ms: Record<Part, number> = { session: 0, check: 0, reads: 0, admit: 0 };

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
    const body = await jsonBody(c, parseBody);
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
    // The account the session was checked for: a Delete me during the reads below moves it, and admission refuses.
    const accountEpoch = c.get('account')?.accountEpoch;
    if (accountEpoch === undefined) throw new HttpError(401, 'signed-out');
    const person = personFor(env, sub);
    const ask: AdmissionAsk = { scope: body.scope, subjects: body.subject !== undefined ? [body.subject] : [], now };
    let manifest: AdmissionManifest | null = null;
    const input = (): AdmitInput => ({
      scope: body.scope,
      allowWeb: body.allowWeb,
      requestId,
      now,
      accountEpoch,
      dailyLimit: Number(env.DAILY_RUN_LIMIT),
      manifest,
      ...(body.answer ? { answer: true } : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
    });
    const admit = (label: 'check' | 'admit'): Promise<AdmitResult> => timing.time(label, async () => await person.admit(input()));
    // The object decides first, with no manifest: a repeat, a run going, an answer that waits or the day's limit answer
    // with no Drive read. Only a press that would admit a new run (`needs-manifest`) reads the inbox, once.
    let result = await admit('check');
    if (!result.admitted && result.refused === 'needs-manifest') {
      manifest = await timing.time('reads', () => admission(env, person, ask, counted, () => fetches));
      result = await admit('admit');
    }
    if (!result.admitted && result.refused === 'needs-manifest') throw new HttpError(500, 'internal', undefined, { cause: new Error('admitted with no manifest') });
    // The account went during the reads (Delete me): nothing was admitted, and the person signs in again.
    if (!result.admitted && result.refused === 'gone') throw new HttpError(401, 'signed-out');
    if (!result.admitted) throw new HttpError(429, 'rate-limited');
    // A new run's dispatch is due now: the person object's alarm sends it (`Person.dispatchDue`), never the press.
    timing.log();
    const reply: RunReply = { run: result.run, revision: result.revision, ...(result.waits === true ? { waits: true } : {}) };
    return c.json(reply);
  });

  return routes;
}
