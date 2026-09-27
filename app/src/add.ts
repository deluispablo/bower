/**
 * Pure helpers for the Add screen (spec §6, the Add row). No Preact here, so
 * this is unit-tested on its own; `routes/add.tsx` only calls it.
 */

/**
 * The name of the note created when a link is pasted into Add:
 * `Link - <host> <YYYY-MM-DD HHMM>.md`, `now`'s local date and time (no
 * seconds), with a leading `www.` dropped from the host so it reads the way
 * a person would say the site's name.
 *
 * `url` must parse as an `http:`/`https:` URL; anything else — an empty
 * field, a bare word, a `mailto:` or `javascript:` link — returns `null`
 * rather than throwing. This runs on every "Save" click as input
 * validation, not as a failure to recover from, so the caller turns a
 * `null` into one sentence next to the field and leaves it untouched.
 */
export function linkNoteName(url: string, now: Date): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.replace(/^www\./i, '');
  if (host === '') return null;

  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `Link - ${host} ${date} ${time}.md`;
}
