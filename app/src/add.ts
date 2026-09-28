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

/**
 * The hint's bold lead on Add (#336, `Phone-Add` board, handover C.6):
 * "3 things waiting." — `count` is the inbox's pending files, the same
 * count Home's Inbox card and the "Is that everything?" sheet show. The
 * caller hides the hint at zero, so this never says "0 things".
 */
export function addHintLead(count: number): string {
  return `${count} ${count === 1 ? 'thing' : 'things'} waiting.`;
}

/** The rest of the hint's sentence, word for word from the board. */
export const ADD_HINT_TEXT =
  'Add the whole pile first: a tidy-up takes a few minutes and uses one run of your plan, so once is better than five times.';
