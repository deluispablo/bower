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
