import { useEffect, useRef } from 'preact/hooks';

import { loadBlob, saveBlob } from '../cache.js';
import { getBlob } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { blobCacheKey } from '../markdown/embeds.js';
import { hydrateEmbeds } from '../markdown/hydrate-embeds.js';
import { renderNote } from '../markdown/render.js';
import { useVault } from '../vault-store.js';

/** An image's bytes: from the on-device cache, else from Drive (then cached).
 * Also a file screen's inline image (#350). */
export async function loadImage(file: DriveFile): Promise<Blob> {
  const key = blobCacheKey(file);
  try {
    const cached = await loadBlob(key);
    if (cached !== undefined) return cached;
  } catch (err) {
    console.error(err);
  }
  let blob = await getBlob(file.id);
  // An SVG needs its type to show in an <img>; Drive knows it.
  if (blob.type === '' && file.mimeType !== '') {
    blob = new Blob([blob], { type: file.mimeType });
  }
  try {
    await saveBlob(key, blob);
  } catch (err) {
    // Showing the image matters more than caching it.
    console.error(err);
  }
  return blob;
}

interface NoteBodyProps {
  /** Sanitized HTML from `renderNote`. */
  html: string;
}

/**
 * The rendered body of a note. After each render it loads embedded images
 * and transcluded notes into the placeholders `renderNote` left, and revokes
 * the images' object URLs when the note changes or the view unmounts.
 */
export function NoteBody({ html }: NoteBodyProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { index, getNoteText } = useVault();
  // Read through a ref: a refreshed index re-renders the same HTML, which
  // Preact leaves in place, so the embeds must not be loaded again.
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    const root = ref.current;
    const currentIndex = indexRef.current;
    if (root === null || currentIndex === null) return;
    return hydrateEmbeds(root, {
      index: currentIndex,
      loadImage,
      loadNoteText: getNoteText,
      renderEmbeddedNote: (text, file, transclude) =>
        renderNote(text, currentIndex, { path: file.path, transclude }).html,
    });
  }, [html, getNoteText]);

  return (
    <div
      ref={ref}
      class="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
