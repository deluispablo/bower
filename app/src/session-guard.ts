/**
 * Keeps every tab of one browser in step with the session (#994).
 *
 * Signing out in one tab must not leave another tab of the same browser
 * holding a Drive access token that still works for up to an hour. Three
 * things end a tab's session without a reload:
 *
 * - **The sign-out message.** The tab that signs out (Sign out, Sign out
 *   everywhere, Delete account) calls `announceSignOut()`, which posts on a
 *   `BroadcastChannel` and, as a fallback for browsers without one, writes a
 *   `localStorage` key whose `storage` event every other tab sees.
 *   `listenForSignOut` hears either.
 * - **A 401.** `apiFetch` (`api.ts`) calls `reportUnauthorized()` whenever
 *   the Worker answers 401, `GET /drive/token` included, which is what a
 *   Drive 401 leads to (`drive.ts` asks for a fresh token).
 * - **A session check.** `recheckSession` asks the Worker `GET /me` when the
 *   last check is older than `SESSION_RECHECK_MS`: before the tab asks for a
 *   new Drive token, and when the tab is visible again (`watchVisibility`).
 *
 * This module only signals; `session.tsx` decides what ending the session
 * does (drop the token, clear the device, go to `/login`). It imports
 * nothing from `api.ts`, which imports it.
 */

/** The `BroadcastChannel` every tab of this origin listens on. */
export const SESSION_CHANNEL = 'bower:session';

/** The `localStorage` key whose `storage` event is the fallback message. */
export const SIGNED_OUT_KEY = 'bower:signed-out';

/** A session check younger than this is trusted; an older one is redone. */
export const SESSION_RECHECK_MS = 60_000;

/** The one message on the channel. */
export interface SignedOutMessage {
  type: 'signed-out';
}

/** Whether a channel message says the session ended in another tab. Pure. */
export function isSignedOutMessage(data: unknown): data is SignedOutMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'signed-out'
  );
}

function openChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel !== 'function') return null;
  try {
    return new BroadcastChannel(SESSION_CHANNEL);
  } catch (err) {
    console.error(err);
    return null;
  }
}

/**
 * Tells every other tab of this origin that the session ended here. The
 * sending tab's own listener may hear the channel message too (a channel
 * delivers to every other channel object, in this tab as well); by then it
 * is signing out or signed out, and `session.tsx` ignores it.
 */
export function announceSignOut(): void {
  const channel = openChannel();
  if (channel !== null) {
    const message: SignedOutMessage = { type: 'signed-out' };
    channel.postMessage(message);
    channel.close();
  }
  try {
    // A new value every time, so a second sign-out fires the event again;
    // removed at once so nothing about the session stays on the device.
    localStorage.setItem(SIGNED_OUT_KEY, String(Date.now()));
    localStorage.removeItem(SIGNED_OUT_KEY);
  } catch (err) {
    console.error(err);
  }
}

/**
 * Calls `onSignedOut` when another tab announces a sign-out, by channel or
 * by `storage` event. Both may arrive for one sign-out; the handler must not
 * mind being called twice. Returns the function that stops listening.
 */
export function listenForSignOut(
  onSignedOut: () => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const channel = openChannel();
  const onMessage = (event: MessageEvent): void => {
    if (isSignedOutMessage(event.data)) onSignedOut();
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key === SIGNED_OUT_KEY && event.newValue !== null) onSignedOut();
  };
  channel?.addEventListener('message', onMessage);
  target.addEventListener('storage', onStorage);
  return () => {
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    target.removeEventListener('storage', onStorage);
  };
}

// --- 401 -------------------------------------------------------------------

let unauthorizedHandler: (() => void) | null = null;

/** Registers what a 401 from the Worker does (`session.tsx`); `null` stops. */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

/** Called by `apiFetch` on every 401 the Worker answers. */
export function reportUnauthorized(): void {
  unauthorizedHandler?.();
}

// --- Session check ---------------------------------------------------------

let lastSessionCheck = 0;

/** Records that the Worker just answered about the session. */
export function markSessionChecked(at: number = Date.now()): void {
  lastSessionCheck = at;
}

/** Whether the last session check is older than `SESSION_RECHECK_MS`. */
export function sessionCheckDue(at: number = Date.now()): boolean {
  return at - lastSessionCheck > SESSION_RECHECK_MS;
}

function isUnauthorized(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { status?: unknown }).status === 401
  );
}

/**
 * Asks the Worker about the session (`askMe`, `GET /me`) unless the last
 * check is younger than `SESSION_RECHECK_MS`. A 401 rejects (and `apiFetch`
 * has already reported it); any other failure goes to `console.error` and
 * lets the caller carry on, since only the Worker saying "signed out" ends
 * the session.
 */
export async function recheckSession(
  askMe: () => Promise<unknown>,
): Promise<void> {
  if (!sessionCheckDue()) return;
  markSessionChecked();
  try {
    await askMe();
  } catch (err) {
    if (isUnauthorized(err)) throw err;
    console.error(err);
  }
}

/**
 * Calls `onVisible` each time the document becomes visible again. Returns
 * the function that stops watching.
 */
export function watchVisibility(
  doc: Pick<
    Document,
    'addEventListener' | 'removeEventListener' | 'visibilityState'
  >,
  onVisible: () => void,
): () => void {
  const onChange = (): void => {
    if (doc.visibilityState === 'visible') onVisible();
  };
  doc.addEventListener('visibilitychange', onChange);
  return () => {
    doc.removeEventListener('visibilitychange', onChange);
  };
}
