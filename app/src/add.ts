/**
 * Pure helpers for the Add screen (spec §6, the Add row). No Preact here, so
 * this is unit-tested on its own; `routes/add.tsx` only calls it.
 */

import { instructionFileName, instructionNote } from './tell.js';

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
 * What a link's row in the queue reads (#508, C.11: titles, not file
 * names): the host and path with a leading `www.` dropped, never the
 * `Link - host date time.md` name the note is saved under. Bower does not
 * fetch the page for its own title, so this is the best a person can read
 * at a glance before the run files it; `url` is assumed already valid
 * (`onSaveLink` only ever queues a link `linkNoteName` accepted).
 */
export function linkDisplayTitle(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.replace(/^www\./i, '');
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  return `${host}${path}`;
}

/**
 * The reverse of `linkNoteName` (#557): the host it embedded in a filed
 * link's own generated file name, for a caller with only the name and no
 * cached text to read the URL from (the working sheet's rows,
 * `run-progress.ts#rowTitle`) — host only, not the full host and path
 * `linkDisplayTitle` reads from the URL itself, but still a title, never
 * the generated file name. `null` for any other file name.
 */
export function linkTitleFromFileName(name: string): string | null {
  const match = /^Link - (.+) \d{4}-\d{2}-\d{2} \d{4}\.md$/.exec(name);
  return match?.[1] ?? null;
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

/**
 * The demo's own rest of the hint sentence (#489, `Demo-Add` board): a
 * recorded run, not a real tidy-up, so nothing costs anything. The bold
 * lead (`addHintLead`) is unchanged — the board uses the same "n things
 * waiting." for both. `routes/add.tsx` picks this over `ADD_HINT_TEXT`
 * with `isDemo()`.
 */
export const DEMO_ADD_HINT_TEXT =
  'Tap Tidy up and watch a recorded run: in the demo the bird does not really think, so nothing costs anything.';

/**
 * The "What is this?" box's placeholder (#335, `Phone-Add` board; #508:
 * shortened to one example, board copy agreed with the lead — the
 * board's own two-example text overflowed the three-line box at 375 px,
 * cut off mid-sentence).
 */
export const CONTEXT_PLACEHOLDER =
  'Just filing is fine. Or tell Bower what to do: "Job offers: pull out salary and deadline".';

/**
 * The name of the context note Add's "What is this?" box writes (#335,
 * handover D.2): `Bower - YYYY-MM-DD HHmm Context.md`, `now`'s local date
 * and time, the same shape as the Bower tab's notes.
 */
export function contextNoteName(now: Date): string {
  return instructionFileName('', 'Context', now);
}

/**
 * The context note's Markdown (#335, handover D.2): the instruction
 * frontmatter (`tags: [instruction]`, `date`, `via: app`, `kind:
 * context`), the person's text as written, then the names of the files
 * it applies to, one bullet each, as they are in the inbox. A line break
 * inside a name would split its bullet, so it becomes a space.
 */
export function contextNote(
  text: string,
  fileNames: readonly string[],
  now: Date,
): string {
  const list = fileNames
    .map((name) => `- ${name.replace(/[\r\n]+/g, ' ')}`)
    .join('\n');
  return `${instructionNote(text, now, 'context')}\n## Applies to\n\n${list}\n`;
}
