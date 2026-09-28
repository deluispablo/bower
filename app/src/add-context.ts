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
 */

import { useEffect, useState } from 'preact/hooks';

import { contextNote, contextNoteName } from './add.js';
import { getQueue } from './add-queue-store.js';
import { createTextFile, INSTRUCTION_APP_PROPERTIES } from './drive.js';
import { showToast } from './toast-store.js';

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

/**
 * Writes the context note for the current batch — the queue's rows now in
 * the inbox and not yet named in a note — when the box has text and there
 * is such a row; otherwise does nothing. Resolves `true` when a note was
 * written. Never rejects: a failed write is logged, the text goes back in
 * the box, and the person gets one sentence, so a tidy-up waiting on this
 * still starts.
 */
export async function writeContextNote(
  inboxFolderId: string | null,
  now: Date = new Date(),
): Promise<boolean> {
  const trimmed = text.trim();
  if (inboxFolderId === null || trimmed === '') return false;
  const batch = getQueue().filter(
    (item) => item.status === 'done' && !covered.has(item.id),
  );
  if (batch.length === 0) return false;

  // Claimed before the write, synchronously, so the other trigger (the
  // tidy-up starting while Add unmounts) never writes the same note twice.
  for (const item of batch) covered.add(item.id);
  setContextText('');
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
