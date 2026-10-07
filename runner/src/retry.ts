/**
 * Retries for the runner's idempotent calls (TL-P3-28 point 2): the token route, the status report and Drive reads.
 * Google Cloud's retry strategy (https://cloud.google.com/storage/docs/retry-strategy): retry only a call that is
 * safe to repeat, on a network error, a 429 or a 5xx, with exponential backoff and full jitter
 * (https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/).
 *
 * - At most `RETRIES` (3) more sends after the first; the n-th wait is a random share of `BASE_MS * 2^n`, so the
 *   waits are at most 1 s, 2 s and 4 s: 7 s at most for one call, 3.5 s on average.
 * - Any other answer, a 4xx such as 401 `signed-out` or 409 `stale-attempt`, is given back at once, never repeated.
 * - Drive writes never come here: a write that may have landed is read back instead (`effects.ts`).
 */

export const RETRIES = 3;
export const BASE_MS = 1000;
/** The base of the waits: `BASE_MS`, set to 0 by the runner's tests (`test/setup.ts`) but the retry test's own. */
export const backoff = { baseMs: BASE_MS };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Whether an answer is worth sending again: rate limited, or Google's side failed. */
export const retryable = (res: Response): boolean => res.status === 429 || res.status >= 500;

/**
 * Sends an idempotent request, and sends it again after a network error (fetch's `TypeError`), and when `answers`
 * after a 429 or 5xx too. The last error is thrown, or the last answer given back, once the retries are used up.
 */
export async function retried(send: () => Promise<Response>, answers = true): Promise<Response> {
  for (let n = 0; ; n++) {
    try {
      const res = await send();
      if (!answers || !retryable(res) || n >= RETRIES) return res;
      console.error(`Answered ${res.status}; sending again (${n + 1} of ${RETRIES})`);
    } catch (e) {
      if (!(e instanceof TypeError) || n >= RETRIES) throw e;
      console.error(e);
    }
    await sleep(Math.random() * backoff.baseMs * 2 ** n);
  }
}
