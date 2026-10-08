/**
 * A bounded wait for every request the app sends to Drive or the Worker (TL-P3-28 point 4). A `fetch` has no
 * timeout of its own: a stalled connection (a phone changing network, a tab woken from sleep) leaves it pending
 * for ever, and the person sees "Saving…" with no request, no error and no outcome (C16). Past the bound the
 * request is dropped and told as a `TypeError`, which both clients already word as "offline"; for a write that
 * may have landed, the vault then reads it back (`settle`, Google Cloud retry strategy: an ambiguous outcome is
 * read, not assumed) and says "saved" or "not sure it saved".
 * Cancelling is the same as the web platform's `AbortSignal.timeout`, done with our own timer so that tests with
 * faked timers control it and so a transport that ignores the signal is still cut off.
 */

/** Wait for an answer before giving up: long enough for a slow mobile connection and Drive's own slow moments (a few seconds), short enough that nobody stares at "Saving…" for a minute. */
export const ANSWER_WAIT_MS = 30_000;

/** What a slow connection still moves: 50 KB a second (about 400 kbit/s), so a big upload body gets its time on top of `ANSWER_WAIT_MS`. A 8 MiB chunk waits about 3 minutes. */
const SLOWEST_BYTES_PER_SECOND = 50 * 1024;

/** The longest wait for a request that carries `body`. */
export function waitFor(body: unknown): number {
  const size = body instanceof Blob ? body.size : typeof body === 'string' ? body.length : 0;
  return ANSWER_WAIT_MS + Math.ceil((size / SLOWEST_BYTES_PER_SECOND) * 1000);
}

/**
 * `fetchFn(url, init)`, given up on after `ms` (by default `waitFor(init.body)`) if no answer has arrived. The caller's own
 * `signal` still stops it on purpose and keeps its `AbortError`; only the bound ends as a `TypeError`.
 * The bound covers the wait for the answer to start, not the reading of its body.
 */
export async function answered(fetchFn: (url: string, init: RequestInit) => Promise<Response>, url: string, init: RequestInit = {}, ms = waitFor(init.body)): Promise<Response> {
  const own = init.signal ?? undefined;
  const control = new AbortController();
  const stop = (): void => control.abort(own?.reason);
  if (own?.aborted) stop();
  else own?.addEventListener('abort', stop, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let late = false;
  const tooLate = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      late = true;
      control.abort();
      reject(new TypeError('No answer in time'));
    }, ms);
  });
  try {
    return await Promise.race([fetchFn(url, { ...init, signal: control.signal }), tooLate]);
  } catch (e) {
    if (late) throw new TypeError('No answer in time', { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
    own?.removeEventListener('abort', stop);
  }
}
