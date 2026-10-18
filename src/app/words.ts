/** Small, pure helpers for the words screens show. */
import { shortDay } from '@/data/dates';

export { shortDay };

/** What both searches (panel and palette) say when a finished search found nothing (design spec d-v2-21). */
export const nothingFound = (q: string): string => `Nothing called "${q.trim()}" in your notes or their names. Try fewer letters.`;

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
  return shortDay(ts);
}

/** `ago` inside a sentence ("Changed today, 10:00", "Changed 28 Sep"). */
export function agoInSentence(ts: number, now = Date.now()): string {
  return ago(ts, now).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase());
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

export function greeting(name?: string): string {
  return name ? `Hello, ${name}` : 'Hello';
}

/** What goes to the Bin with a folder. `nested`: it has folders, so the count is everything inside, not what its row shows. */
export const goWithIt = (n: number, nested = false): string =>
  nested
    ? n === 1
      ? 'Everything inside goes with it: 1 thing, in one of its folders. You can get it back with Undo, or from the Bin of your Drive.'
      : `Everything inside goes with it: ${plural(n, 'thing')}, counting what is in its folders. You can get them back with Undo, or from the Bin of your Drive.`
    : n === 1
    ? 'The thing inside goes with it. You can get it back with Undo, or from the Bin of your Drive.'
    : `The ${plural(n, 'thing')} inside go with it. You can get them back with Undo, or from the Bin of your Drive.`;
