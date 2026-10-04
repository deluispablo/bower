/** Small, pure helpers for the words screens show. */

const MIN = 60_000;

export function ago(ts: number, now = Date.now()): string {
  const d = now - ts;
  if (d < MIN) return 'just now';
  if (d < 60 * MIN) return `${Math.floor(d / MIN)} min ago`;
  const date = new Date(ts);
  const today = new Date(now);
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  const y = new Date(now - 86_400_000);
  if (date.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** "less than a minute", then whole minutes rounded down (as Bower says it today). */
export function elapsed(ms: number): string {
  const m = Math.floor(ms / MIN);
  if (m < 1) return 'less than a minute';
  return m === 1 ? '1 min' : `${m} min`;
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A count that may still be loading: the plain label until it is known, never a false zero. */
export const countOr = (n: number | undefined, one: string, loading: string): string => (n === undefined ? loading : plural(n, one));

/** Bower is Australian; the greeting is too. */
export function greeting(name: string): string {
  return `G'day, ${name}`;
}
