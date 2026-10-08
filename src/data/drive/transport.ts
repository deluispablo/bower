/**
 * The one retry policy for every request the app, the runner and the Worker send to Drive or to Bower's server
 * (c2-drive-transport, TL-P4-16 addendum 4):
 *
 * - **A bound per attempt.** Each send waits at most `waitFor(body)` (`wait.ts`: 30 s plus the body's time), and never
 *   past what is left of the budget. A fetch has no timeout of its own; past the bound the send is dropped
 *   (`AbortSignal.timeout`'s behaviour, https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
 *   and told as fetch's own `TypeError` (https://fetch.spec.whatwg.org/#fetch-method: a network error rejects with one).
 * - **Idempotent requests are sent again.** A request the caller declares idempotent (a GET, a resumable status
 *   question, a status report keyed by attempt and seq) is sent again after a network error or a stall. Writes never
 *   are: a write whose answer is lost is read back by its caller instead.
 * - **Answers worth asking again** (the caller's `again`: 429, Google's 5xx, a 403 rate limit) wait and ask again, as
 *   Drive's "Resolve errors" guide says (https://developers.google.com/workspace/drive/api/guides/handle-errors,
 *   "Exponential backoff"), and as Google Cloud's retry strategy (https://cloud.google.com/storage/docs/retry-strategy).
 * - **Exponential backoff with full jitter** (https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/):
 *   at most `RETRIES` more sends; the n-th wait is a random share of `backoff.baseMs * 2^n` (0.5 s, 1 s, 2 s caps).
 * - **Inside a total budget**, `BUDGET_MS` from the first send: one stalled send and one more try fit; nothing waits
 *   without a bound.
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
/** The base of the waits: `BASE_MS`, set to 0 by the runner's tests (`runner/test/setup.ts`) but the retry test's own. */
export const backoff = { baseMs: BASE_MS };
/** The longest one idempotent request may take, from its first send: one 30 s stall, the backoff and one more try. */
export const BUDGET_MS = 60_000;

/** What the transport sends with: `fetch`, or anything that takes a URL string as fetch does (the Worker's, a test's). */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Where a request runs: the person's browser, or a server (the runner, the Worker) whose network is not theirs. */
export type Context = 'browser' | 'headless';

export interface SendOptions {
  /** Safe to send again after a network error or a stall: a read, or a request keyed so a repeat changes nothing. */
  idempotent: boolean;
  /** Whether this answer is worth asking again after a wait (rate limited, or failing on the server's side). */
  again?: (res: Response) => boolean | Promise<boolean>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Waits before the next send and says yes, or says no when the retries or the budget are used up. */
async function pause(n: number, started: number): Promise<boolean> {
  if (n >= RETRIES) return false;
  const wait = Math.random() * backoff.baseMs * 2 ** n;
  if (Date.now() - started + wait >= BUDGET_MS) return false;
  await sleep(wait);
  return true;
}

/**
 * Sends `init` to `url` under the policy. Resolves with the last answer (the caller reads its status); rejects with
 * fetch's `TypeError` when no answer came (a network error or the bound), or with the caller's own `AbortError`.
 */
export async function send(fetchFn: Fetch, url: string, init: RequestInit, opts: SendOptions): Promise<Response> {
  const started = Date.now();
  for (let n = 0; ; n++) {
    const left = BUDGET_MS - (Date.now() - started);
    let res: Response;
    try {
      res = await answered(fetchFn, url, init, Math.min(waitFor(init.body), Math.max(left, 0)));
    } catch (e) {
      if (!(e instanceof TypeError) || !opts.idempotent || init.signal?.aborted) throw e;
      console.error(e);
      if (!(await pause(n, started))) throw e;
      continue;
    }
    if (!opts.again || !(await opts.again(res))) return res;
    console.error(`Answered ${res.status}; sending again (${n + 1} of ${RETRIES})`);
    if (!(await pause(n, started))) return res;
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
