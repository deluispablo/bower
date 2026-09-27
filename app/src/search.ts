/**
 * Pure helpers behind the quick switcher's Notes search
 * (`components/switcher.tsx`, #142): narrowing a Drive full-text search to
 * the vault, pulling a snippet out of cached note text, and a small
 * localStorage-backed list of recent searches (same style as `prefs.ts`:
 * never throws, falls back to empty).
 */

import type { DriveFile } from './drive.js';
import { isAppFile } from './vault-index.js';
import type { VaultIndex } from './vault-index.js';

/**
 * `results` (Drive's full-text search, not scoped to any folder) narrowed to
 * the files that are actually in the vault index — order preserved. Bower's
 * own files are left out unless `showAppFiles` is on, checked against the
 * indexed file's real path (a bare search result carries no folder
 * nesting), same rule as the tree and Recent.
 */
export function filterToIndex(
  results: DriveFile[],
  index: VaultIndex,
  showAppFiles = false,
): DriveFile[] {
  return results.filter((file) => {
    const indexed = index.byId.get(file.id);
    if (indexed === undefined) return false;
    return showAppFiles || !isAppFile(indexed.path, indexed.name);
  });
}

/**
 * The text around the first case-insensitive match of `query` in `text`,
 * padded `radius` characters either side and marked with `…` where the
 * snippet was cut short of the note's start or end. `null` when `query`
 * does not occur in `text` (or is empty).
 */
export function snippet(
  text: string,
  query: string,
  radius = 60,
): string | null {
  if (query === '') return null;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1) return null;

  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + query.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

// --- Recent searches ---------------------------------------------------

const RECENT_KEY = 'bower.search.recent';
const RECENT_MAX = 8;

/** Most recent searches, most recent first. Never throws. */
export function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    // Storage blocked or the value is corrupt: treat it as an empty list.
    return [];
  }
}

/**
 * Records `query` as the most recent search: moved to the front, deduped
 * case-insensitively against earlier entries, capped at `RECENT_MAX`. A
 * blank query is ignored. Never throws.
 */
export function saveRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (trimmed === '') return;
  try {
    const lower = trimmed.toLowerCase();
    const rest = loadRecentSearches().filter(
      (entry) => entry.toLowerCase() !== lower,
    );
    const updated = [trimmed, ...rest].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // Storage full or blocked: recent searches just don't stick.
  }
}

/**
 * Drops the local recent-searches list. Per-user, so `forget.ts` calls this
 * on sign-out and account deletion. Never throws.
 */
export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Storage blocked: nothing to remove.
  }
}
