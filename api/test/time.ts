/**
 * Time in api tests: the one place for it. A workerd test runs on the wall clock, and the object's real alarm fires
 * when a deadline is due, between two calls of the test. So a test reads "now" once, arms deadlines far ahead of it
 * (a real alarm then never fires), and asserts a window that the real clock and a due alarm both stay inside.
 * There is no fake clock in the person object: its `now` parameters are the one way to set time.
 */
export const MINUTE = 60_000;
export const HOUR = 3_600_000;

/** One clock read, an hour ahead: a time base for a test whose deadlines must not be due while it runs. */
export function farAhead(): number {
  return Date.now() + HOUR;
}

/** Asserts `at` lies in [low, high], with the bounds in the failure. A number read from a racy state needs a window. */
export function inWindow(at: number | undefined, low: number, high: number): void {
  if (at === undefined || at < low || at > high) throw new Error(`${String(at)} is outside [${low}, ${high}]`);
}
