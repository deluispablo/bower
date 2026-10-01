/**
 * Demo-only switches for the loading and error states (#950), so the design
 * gate can see them on the local demo. Set in the browser's session storage
 * before opening a page:
 *
 * - `bower:demo:slow` (any value): every listing and note read waits about
 *   1.5 s, so the skeletons show.
 * - `bower:demo:fail` (any value): the next listing or note read fails once
 *   and the switch clears itself, so the error line shows and "Try again"
 *   succeeds.
 *
 * Only `demo/drive.ts` reads these; the demo client is part of the demo
 * build alone.
 */

export const DEMO_SLOW_KEY = 'bower:demo:slow';
export const DEMO_FAIL_KEY = 'bower:demo:fail';

/** How long a slow read waits. */
export const DEMO_SLOW_MS = 1500;

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** The wait before a read answers: `DEMO_SLOW_MS` while slow is on, else 0. */
export function demoSlowMs(): number {
  try {
    return session()?.getItem(DEMO_SLOW_KEY) == null ? 0 : DEMO_SLOW_MS;
  } catch {
    return 0;
  }
}

/** True once when fail is on: the switch clears itself, so a retry works. */
export function takeDemoFail(): boolean {
  try {
    const store = session();
    if (store?.getItem(DEMO_FAIL_KEY) == null) return false;
    store.removeItem(DEMO_FAIL_KEY);
    return true;
  } catch {
    return false;
  }
}
