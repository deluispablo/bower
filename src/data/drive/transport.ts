/**
 * The one retry policy for every request the app, the runner and the Worker send to Drive, and for the runner's
 * requests to Bower's server (its token route and status reports) (c2-drive-transport, TL-P4-16 addendum 4). The
 * app's own calls to Bower's server (`WorkerHttp`) are not under it: they are sent once, bounded by `answered` alone.
 *
 * - **A bound per attempt.** Each send waits at most `waitFor(body)` (`wait.ts`: 30 s plus the body's time at a slow
 *   link's speed), so an upload is bounded by its size; an idempotent request also never waits past what is left of
 *   the budget. A fetch has no timeout of its own; past the bound the send is dropped
 *   (`AbortSignal.timeout`'s behaviour, https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
 *   and told as fetch's own `TypeError` (https://fetch.spec.whatwg.org/#fetch-method: a network error rejects with one).
 * - **Idempotent requests are sent again.** A request the caller declares idempotent (a GET, a resumable status
 *   question, a status report keyed by attempt and seq) is sent again after a network error or a stall. Writes never
 *   are: a write whose answer is lost is read back by its caller instead, and only the caller's `again` may send a
 *   write again, for an answer that says it did not land (a rate limit), never for a 5xx that may have landed.
 * - **Answers worth asking again** (the caller's `again`: 429, Google's 5xx, a 403 rate limit) wait and ask again, as
 *   Drive's "Resolve errors" guide says (https://developers.google.com/workspace/drive/api/guides/handle-errors,
 *   "Exponential backoff"), and as Google Cloud's retry strategy (https://cloud.google.com/storage/docs/retry-strategy).
 * - **Exponential backoff with full jitter** (https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/):
 *   at most `RETRIES` more sends; the n-th wait is a random share of `pacing.baseMs * 2^n` (0.5 s, 1 s, 2 s caps).
 * - **Inside a total budget** for an idempotent request, `BUDGET_MS` from the first send: one stalled send and one more
 *   try fit. A write is bounded by its sends (`RETRIES` more at most, each by its size), not by the read budget, so a
 *   large upload on a slow link is not cut short. Nothing waits without a bound; the backoff stops on the caller's abort.
 *
 * How a request with no answer is worded depends on where it ran (`noAnswer`): a browser is told it is offline; a
 * runner or the Worker never is, since its network is not the person's.
 */
import { BowerError } from '../types';
import { answered, waitFor } from '../wait';

/** At most this many more sends after the first. */
export const RETRIES = 3;
/** The first wait's cap; each next one doubles. */
export const BASE_MS = 500;
/** The longest one idempotent request may take, from its first send: one 30 s stall, the backoff and one more try. */
export const BUDGET_MS = 60_000;

/** What the transport sends with: `fetch`, or anything that takes a URL string as fetch does (the Worker's, a test's). */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Where a request runs: the person's browser, or a server (the runner, the Worker) whose network is not theirs. */
export type Context = 'browser' | 'headless';

/**
 * How a send waits between tries: the base of the backoff and the sleep itself. Each client takes them at construction
 * (`pacing`) and a test injects its own, so no global is shared (dependency injection of the clock, as in Node's and
 * Vitest's own timer seams); the default is the real backoff and a timer that stops on the caller's abort.
 */
export interface Pacing {
  baseMs: number;
  /** Waits `ms`, or rejects with the abort reason as soon as `signal` aborts. */
  sleep: (ms: number, signal: AbortSignal | null | undefined) => Promise<void>;
}

export interface SendOptions {
  /** Safe to send again after a network error or a stall: a read, or a request keyed so a repeat changes nothing. */
  idempotent: boolean;
  /** Whether this answer is worth asking again after a wait (rate limited, or failing on the server's side). */
  again?: (res: Response) => boolean | Promise<boolean>;
  /** The waits between tries; the real ones when absent. */
  pacing?: Partial<Pacing> | undefined;
  /** The caller's abort, for a request whose `init` carries none: it ends the request and the backoff. */
  signal?: AbortSignal;
  /**
   * The browser said it had no network before this was sent (`navigator.onLine` is false: no connection,
   * https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine). A network error then cannot succeed and is
   * not sent again; the person's connection coming back is what flushes their queue.
   */
  knownOffline?: boolean;
}

/** Waits `ms`, or rejects with the caller's abort reason as soon as `signal` aborts (as `fetch` does). */
export function sleep(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const stop = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

/** Waits before the next send and says yes, or says no when the retries or the budget are used up. */
async function pause(n: number, started: number, budget: number, signal: AbortSignal | null | undefined, pacing: Partial<Pacing> | undefined): Promise<boolean> {
  if (n >= RETRIES) return false;
  const wait = Math.random() * (pacing?.baseMs ?? BASE_MS) * 2 ** n;
  if (Date.now() - started + wait >= budget) return false;
  await (pacing?.sleep ?? sleep)(wait, signal);
  return true;
}

/**
 * Sends `init` to `url` under the policy. Resolves with the last answer (the caller reads its status); rejects with
 * fetch's `TypeError` when no answer came (a network error or the bound), or with the caller's own `AbortError`.
 */
export async function send(fetchFn: Fetch, url: string, given: RequestInit, opts: SendOptions): Promise<Response> {
  const init = opts.signal && !given.signal ? { ...given, signal: opts.signal } : given;
  const started = Date.now();
  // The read budget bounds idempotent requests only; a write's sends are each bounded by its size.
  const budget = opts.idempotent ? BUDGET_MS : Infinity;
  for (let n = 0; ; n++) {
    const left = budget - (Date.now() - started);
    let res: Response;
    try {
      res = await answered(fetchFn, url, init, Math.min(waitFor(init.body), Math.max(left, 0)));
    } catch (e) {
      if (!(e instanceof TypeError) || !opts.idempotent || opts.knownOffline || init.signal?.aborted) throw e;
      console.error(e);
      if (!(await pause(n, started, budget, init.signal, opts.pacing))) throw e;
      continue;
    }
    if (!opts.again || !(await opts.again(res))) return res;
    console.error(`Answered ${res.status}; sending again (${n + 1} of ${RETRIES})`);
    if (!(await pause(n, started, budget, init.signal, opts.pacing))) return res;
  }
}

/** The marker on a headless request that got no answer (`BowerError` cause): its caller may read a write back. */
export const NO_ANSWER = 'no-answer';

/**
 * A request with no answer, worded for where it ran: in a browser, `offline` with the given sentence; elsewhere
 * `unknown` with the other one, marked `NO_ANSWER` so a caller can still tell a lost answer from a refusal.
 */
export function noAnswer(context: Context, words: { offline: string; elsewhere: string }): BowerError {
  return context === 'browser' ? new BowerError('offline', words.offline) : new BowerError('unknown', words.elsewhere, undefined, { cause: NO_ANSWER });
}

/** A request that may have been sent and got no answer, in any context: a lost answer, to be read back. */
export const isNoAnswer = (e: unknown): boolean => e instanceof BowerError && (e.code === 'offline' || e.cause === NO_ANSWER);

/** The marker on a write that got a 5xx: it may have landed, so nobody is told to try again (`BowerError` cause). */
export const UNCONFIRMED_WRITE = 'unconfirmed-write';

/**
 * A 5xx on a non-idempotent request may have been applied before the server failed (RFC 9110 9.2.2: only idempotent
 * methods may be repeated automatically); Drive's "Resolve errors" guide lists 5xx as retry-with-backoff for reads.
 * Nothing here reads it back or sends it again; the caller says what it could not confirm.
 */
export const isUnconfirmedWrite = (e: unknown): boolean => e instanceof BowerError && e.cause === UNCONFIRMED_WRITE;
