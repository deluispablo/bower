/**
 * Add's "What is this?" box (#335, handover C.6 and D.2): what the person
 * typed about the batch, and the one writer that turns it into a context
 * note in the inbox. Kept outside `routes/add.tsx`, next to the queue
 * (`add-queue-store.ts`), for the same reason: it survives leaving Add and
 * coming back within the session. Same plain pub/sub pattern.
 *
 * The note is written at most once per batch, at whichever comes first:
 * the tidy-up starting (`run-store.tsx`, before the run) or the person
 * leaving Add (`routes/add.tsx`). Either way the box is cleared and the
 * files it named are remembered, so a later note only names what was
 * added after it.
 *
 * A sentence in the box that starts "From now on", "Always", "Never" or
 * "Every time" (#435) also goes to `Rules.md` through the Bower tab's rule
 * write path (`keepRule`, #343), just before the note is written, so it is
 * a rule before the tidy-up starts; the note keeps the whole text.
 */

import { useEffect, useState } from 'preact/hooks';

import { contextNote, contextNoteName } from './add.js';
import { getQueue } from './add-queue-store.js';
import { ruleSentences } from './bower-tab.js';
import { createTextFile, INSTRUCTION_APP_PROPERTIES } from './drive.js';
import { flushPiles } from './pile-store.js';
import { showToast } from './toast-store.js';

/** Said once when a pile's note could not be brought up to date before a
 * tidy-up, so the tidy-up does not start (R-PILE-7). */
export const PILE_FLUSH_FAILED =
  'Could not save your piles in the inbox, so the tidy-up did not start. Try again.';

let text = '';
const listeners = new Set<(text: string) => void>();
/** Queue ids already named in a context note written this session. */
const covered = new Set<string>();

export function getContextText(): string {
  return text;
}

export function setContextText(next: string): void {
  text = next;
  for (const listener of listeners) listener(text);
}

/** The box's text; re-renders the subscriber when it changes. */
export function useContextText(): string {
  const [value, setValue] = useState(text);
  useEffect(() => {
    listeners.add(setValue);
    setValue(text);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** Forgets the box and the files already named. Tests only. */
export function resetContext(): void {
  covered.clear();
  setContextText('');
}

/** The vault's `keepRule` (#343): one rule sentence into `Rules.md`. */
export type KeepRule = (sentence: string) => Promise<unknown>;

/**
 * Writes the context note for the current batch — the queue's rows now in
 * the inbox and not yet named in a note — when the box has text and there
 * is such a row; otherwise does nothing. Resolves `true` when a note was
 * written. Never rejects: a failed write is logged, the text goes back in
 * the box, and the person gets one sentence, so a tidy-up waiting on this
 * still starts. With `keepRule`, each rule sentence in the text is kept
 * first (`ruleSentences`); a rule that cannot be kept is logged and said
 * once, and the note is written anyway (it still carries the sentence).
 */
export async function writeContextNote(
  inboxFolderId: string | null,
  keepRule?: KeepRule,
  now: Date = new Date(),
): Promise<boolean> {
  // Every pile's note is brought up to date first, awaited (R-PILE-7); a
  // failure is logged by the pile store. `tidyUpWhenFlushed` is the path
  // that also keeps the tidy-up from starting on such a failure.
  await flushPiles(keepRule);
  return writeBatchNote(inboxFolderId, keepRule, now);
}

/**
 * R-PILE-7: "Yes, tidy up". Closes and flushes every open pile (each final
 * `## Applies to`, awaited) and writes the batch note, then calls `process`.
 * When a pile's note could not be written, `process` is not called and the
 * person gets one sentence. Resolves whether `process` was called.
 */
export async function tidyUpWhenFlushed(
  process: () => unknown,
  inboxFolderId: string | null,
  keepRule?: KeepRule,
  now: Date = new Date(),
): Promise<boolean> {
  if (!(await flushPiles(keepRule))) {
    showToast(PILE_FLUSH_FAILED);
    return false;
  }
  await writeBatchNote(inboxFolderId, keepRule, now);
  process();
  return true;
}

async function writeBatchNote(
  inboxFolderId: string | null,
  keepRule: KeepRule | undefined,
  now: Date,
): Promise<boolean> {
  const trimmed = text.trim();
  if (inboxFolderId === null || trimmed === '') return false;
  // A row that joined a pile is named in that pile's own note.
  const batch = getQueue().filter(
    (item) =>
      item.status === 'done' &&
      item.pileId === undefined &&
      !covered.has(item.id),
  );
  if (batch.length === 0) return false;

  // Claimed before the write, synchronously, so the other trigger (the
  // tidy-up starting while Add unmounts) never writes the same note twice.
  for (const item of batch) covered.add(item.id);
  setContextText('');
  if (keepRule !== undefined) {
    for (const sentence of ruleSentences(trimmed)) {
      try {
        await keepRule(sentence);
      } catch (err) {
        console.error(err);
        showToast('Could not add your rule yet. Bower still reads it.');
      }
    }
  }
  try {
    await createTextFile(
      inboxFolderId,
      contextNoteName(now),
      contextNote(
        trimmed,
        batch.map((item) => item.name),
        now,
      ),
      { appProperties: INSTRUCTION_APP_PROPERTIES },
    );
    return true;
  } catch (err) {
    console.error(err);
    for (const item of batch) covered.delete(item.id);
    if (text.trim() === '') setContextText(trimmed);
    showToast('Could not save what you wrote about these. Try again.');
    return false;
  }
}
