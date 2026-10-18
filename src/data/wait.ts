/**
 * A bounded wait for every request the app sends to Drive or the Worker (TL-P3-28 point 4). A `fetch` has no
 * timeout of its own: a stalled connection (a phone changing network, a tab woken from sleep) leaves it pending
 * for ever, and the person sees "Saving…" with no request, no error and no outcome (C16). Past the bound the
 * request is dropped and told as a `TypeError`, which both clients already word as "offline"; for a write that
 * may have landed, the vault then looks for it by its stamp (`spine/write-once.ts`: an ambiguous outcome is read, not
 * assumed) and says "saved" or "not sure it saved".
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

/** A body failed after headers arrived: unlike a fetch failure, this must not replay the request. */
export class BodyReadError extends Error {
  constructor(cause: unknown) {
    super('The response body could not be read', { cause });
  }
}

/**
 * `fetchFn(url, init)`, given up on after `ms` (by default `waitFor(init.body)`) if no answer has arrived. The caller's own
 * `signal` still stops it on purpose and keeps its `AbortError`. A body failure wraps its cause to prevent replay.
 * The bound includes consuming the body; the returned Response holds the completed bytes.
 */
export async function answered(fetchFn: (url: string, init: RequestInit) => Promise<Response>, url: string, init: RequestInit = {}, ms = waitFor(init.body)): Promise<Response> {
  const own = init.signal ?? undefined;
  const control = new AbortController();
  let rejectStop: (reason: unknown) => void = () => undefined;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
  const stop = (): void => {
    control.abort(own?.reason);
    rejectStop(own?.reason);
  };
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
    const response = await Promise.race([fetchFn(url, { ...init, signal: control.signal }), tooLate, stopped]);
    try {
      const bytes = await Promise.race([response.arrayBuffer(), tooLate, stopped]);
      return new Response([204, 205, 304].includes(response.status) ? null : bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (e) {
      if (own?.aborted) throw own.reason;
      // An unreadable error page does not erase the HTTP status used by retry/auth policy.
      if (!response.ok) return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
      throw new BodyReadError(late ? new TypeError('No answer in time', { cause: e }) : e);
    }
  } catch (e) {
    if (late && !(e instanceof BodyReadError)) throw new TypeError('No answer in time', { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
    own?.removeEventListener('abort', stop);
  }
}
