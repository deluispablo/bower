/**
 * Both sides of the Web Share Target handoff: the service worker (`sw.ts`)
 * stores shared files in Cache Storage because a share navigation cannot
 * carry a `FormData` across to the app; the app then reads them back on
 * `/add?shared=1` and clears the cache.
 *
 * Kept out of `sw.ts` so the logic is testable without a real service
 * worker: only the global `caches` object is needed, stubbed in tests.
 */

export const SHARE_CACHE_NAME = 'bower-share';
export const SHARE_INDEX_KEY = '/share/index';

export interface ShareIndex {
  names: string[];
}

function shareKey(index: number): string {
  return `/share/${index}`;
}

/**
 * The `File`s from a `POST /add` share (field `files`), in their original
 * order. Non-file fields are ignored.
 */
export function filesFromFormData(formData: FormData): File[] {
  return formData
    .getAll('files')
    .filter((value): value is File => value instanceof File);
}

/**
 * Stores `files` in the `bower-share` cache: one `Response` per file under
 * `/share/<n>`, plus a `/share/index` JSON response listing their names in
 * order. Called from the service worker's `fetch` handler for `POST /add`.
 */
export async function storeSharedFiles(files: File[]): Promise<void> {
  const cache = await caches.open(SHARE_CACHE_NAME);
  const names = files.map((file) => file.name);
  await Promise.all(
    files.map((file, index) =>
      cache.put(
        shareKey(index),
        new Response(file, {
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        }),
      ),
    ),
  );
  const index: ShareIndex = { names };
  await cache.put(
    SHARE_INDEX_KEY,
    new Response(JSON.stringify(index), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

/**
 * Reads back whatever `storeSharedFiles` stored, as `File`s in their
 * original order, then deletes the `bower-share` cache. Returns an empty
 * array when there is nothing shared (no cache, or no index) — the cache is
 * still deleted in that case, in case a partial write was left behind.
 */
export async function takeSharedFiles(): Promise<File[]> {
  const cache = await caches.open(SHARE_CACHE_NAME);
  try {
    const indexResponse = await cache.match(SHARE_INDEX_KEY);
    if (indexResponse === undefined) return [];

    const index = (await indexResponse.json()) as ShareIndex;
    const files: File[] = [];
    for (let i = 0; i < index.names.length; i++) {
      const response = await cache.match(shareKey(i));
      if (response === undefined) continue;
      const blob = await response.blob();
      const name = index.names[i] ?? `file-${i}`;
      files.push(new File([blob], name, { type: blob.type }));
    }
    return files;
  } finally {
    await caches.delete(SHARE_CACHE_NAME);
  }
}
