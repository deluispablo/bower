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

const PINNED_FILES_KEY = 'pinned_files';
const FILE_ID_LINE = /^[ \t]+([A-Za-z0-9_-]+):[ \t]*(\S+)[ \t]*$/;

/** The `pinned_files:` block in `lines`: the key line and the end of the
 * indented lines that follow it. `null` when the key is absent. */
function filesBlock(lines: string[]): { at: number; end: number } | null {
  const at = findKeyLine(lines, PINNED_FILES_KEY);
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && /^[ \t]+\S/.test(lines[end] ?? '')) end++;
  return { at, end };
}

/**
 * The files pinned through a folder note (issue #688): `pinned_files:`, a
 * block map of Drive file id to the ISO time it was pinned, kept in the
 * frontmatter of the note of the folder the file sits in. Ids survive
 * Bower's moves, and a pin whose file left the folder is dropped by the
 * reader (`vault-store.tsx`), not here. Anything unreadable is skipped.
 */
export function pinnedFilesOf(text: string): Map<string, string> {
  const result = new Map<string, string>();
  const { lines } = splitFrontmatter(text);
  if (lines === null) return result;
  const block = filesBlock(lines);
  if (block === null) return result;
  for (const line of lines.slice(block.at + 1, block.end)) {
    const match = FILE_ID_LINE.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      result.set(match[1], match[2]);
    }
  }
  return result;
}

function writeFilePins(text: string, pins: Map<string, string>): string {
  const { lines, body } = splitFrontmatter(text);
  const rows = [...pins].map(([id, iso]) => `  ${id}: ${iso}`);
  const block = rows.length === 0 ? [] : [`${PINNED_FILES_KEY}:`, ...rows];
  if (lines === null) {
    if (block.length === 0) return text;
    return `---\n${block.join('\n')}\n---\n${text}`;
  }
  const at = filesBlock(lines);
  const next =
    at === null
      ? [...lines, ...block]
      : [...lines.slice(0, at.at), ...block, ...lines.slice(at.end)];
  if (next.every((line) => line.trim() === '')) return body;
  return `---\n${next.join('\n')}\n---\n${body}`;
}

/** Adds (or refreshes) file `id` in `pinned_files`; every other key and the
 * body are kept exactly. */
export function setFilePinned(text: string, id: string, iso: string): string {
  const pins = pinnedFilesOf(text);
  pins.set(id, iso);
  return writeFilePins(text, pins);
}

/** Removes file `id` from `pinned_files`; the whole key goes with its last
 * entry, and the frontmatter block with its last key. Unchanged when the id
 * is not pinned. */
export function clearFilePinned(text: string, id: string): string {
  const pins = pinnedFilesOf(text);
  if (!pins.delete(id)) return text;
  return writeFilePins(text, pins);
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
