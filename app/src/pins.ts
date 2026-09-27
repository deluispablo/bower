/**
 * Pins (issue #215, spec §14): a note is pinned when its frontmatter has
 * `pinned: <ISO 8601 time>` — the time it was pinned; a folder is pinned the
 * same way through its folder note (`_<Folder>.md`, already hidden from the
 * tree by `vault-index.ts`'s `isHidden`). Pure text and string operations
 * only: writing to Drive, and deciding whether a folder note should be
 * created or deleted, is `vault-store.tsx`'s job, with the conflict-checked
 * save.
 */

import {
  findKeyLine,
  parseFrontmatter,
  splitFrontmatter,
} from './markdown/frontmatter.js';

const PINNED_KEY = 'pinned';

/**
 * Sets (or replaces) `pinned` in `text`'s frontmatter to `iso`. Every other
 * key, and the body, are kept exactly as they were — this only ever adds or
 * rewrites the one `pinned:` line. A note with no frontmatter at all gains a
 * minimal block holding just `pinned`.
 */
export function setPinned(text: string, iso: string): string {
  const { lines, body } = splitFrontmatter(text);
  if (lines === null) return `---\n${PINNED_KEY}: ${iso}\n---\n${text}`;

  const at = findKeyLine(lines, PINNED_KEY);
  const next = [...lines];
  if (at >= 0) next[at] = `${PINNED_KEY}: ${iso}`;
  else next.push(`${PINNED_KEY}: ${iso}`);
  return `---\n${next.join('\n')}\n---\n${body}`;
}

/**
 * Removes `pinned` from `text`'s frontmatter. Strips the whole frontmatter
 * block when `pinned` was its only content — the block `setPinned` adds to a
 * note with none, so this exactly undoes it — otherwise every other key and
 * the body are kept exactly as they were. A note with no `pinned` key is
 * returned unchanged.
 */
export function clearPinned(text: string): string {
  const { lines, body } = splitFrontmatter(text);
  if (lines === null) return text;

  const at = findKeyLine(lines, PINNED_KEY);
  if (at < 0) return text;

  const next = [...lines.slice(0, at), ...lines.slice(at + 1)];
  if (next.every((line) => line.trim() === '')) return body;
  return `---\n${next.join('\n')}\n---\n${body}`;
}

/** The note's `pinned` timestamp, or `null` when absent or not a string. */
export function pinnedOf(text: string): string | null {
  const value = parseFrontmatter(text).data[PINNED_KEY];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * `items`, newest pin first. ISO 8601 timestamps compare correctly as plain
 * strings as long as they share the same offset — `vault-store` always
 * writes `new Date().toISOString()` (UTC), so this holds for everything the
 * app itself pins.
 */
export function sortPinned<T extends { pinnedAt: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) =>
    a.pinnedAt < b.pinnedAt ? 1 : a.pinnedAt > b.pinnedAt ? -1 : 0,
  );
}

/** The folder's own name: the last `/`-separated segment of its path. */
function folderName(folderPath: string): string {
  return folderPath.slice(folderPath.lastIndexOf('/') + 1);
}

/** The name of a folder's own note (`_<Folder>.md`), which lives inside it. */
export function folderNoteName(folderPath: string): string {
  return `_${folderName(folderPath)}.md`;
}

/** The path of a folder's own note, relative to the Bower folder. */
export function folderNotePath(folderPath: string): string {
  return `${folderPath}/${folderNoteName(folderPath)}`;
}
