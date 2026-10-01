/**
 * Tells listeners that a note's frontmatter was cached (`cache.ts`
 * `saveNoteMetaEntry`). The sidebar tree uses it to give a Bower-written
 * note the bird once a folder screen has read that folder's notes, with no
 * Drive read of its own (#920).
 */

const listeners = new Set<() => void>();

export function noteMetaCached(): void {
  for (const listener of listeners) listener();
}

export function subscribeNoteMetaCached(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
