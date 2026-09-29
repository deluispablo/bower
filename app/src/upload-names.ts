/**
 * De-duplicates a file name against the names already in a folder, the way
 * Drive Desktop and most file managers do it: append ` (2)`, ` (3)`, … right
 * before the extension.
 */

/**
 * `name` if it is not in `existing` (case-insensitive); otherwise the first
 * `name (2)`, `name (3)`, … not in `existing` either, with the number
 * inserted before the extension (`photo.jpg` → `photo (2).jpg`).
 *
 * `queued` holds the names already reserved by the upload queue
 * (`upload-queue.ts`) for the same folder: files still on their way are not
 * in the inbox listing yet, and two files with one name in `0-Inbox/` would
 * make the runner skip one (R-UPL-6).
 */
export function uniqueName(
  name: string,
  existing: Iterable<string>,
  queued: Iterable<string> = [],
): string {
  const taken = new Set([...existing, ...queued].map((n) => n.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;

  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0 && dot < name.length - 1;
  const base = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension ? name.slice(dot) : '';

  let n = 2;
  let candidate = `${base} (${n})${extension}`;
  while (taken.has(candidate.toLowerCase())) {
    n += 1;
    candidate = `${base} (${n})${extension}`;
  }
  return candidate;
}
