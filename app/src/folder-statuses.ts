/**
 * A folder's own status list (#916, decision E-7: statuses are contextual).
 *
 * Bower chooses the statuses for each comparable folder and writes them in
 * the folder's hub note (`<Folder>/<Folder>.md`, the hub note convention of
 * `vault-template/CLAUDE.md`) as a frontmatter list:
 *
 *     statuses: [new, to view, viewed, applied, not for me]
 *
 * The app reads it here. A missing, empty or malformed list falls back to the
 * kind's own `statuses` (`kinds.ts`). Never throws.
 */

import type { Kind } from './kinds.js';
import { parseFrontmatter } from './markdown/frontmatter.js';

/** The longest status a list may hold, in characters. */
export const MAX_STATUS_LENGTH = 32;

/** The hub note of the folder at `folderPath`: "a/Moonee Ponds" gives
 * "a/Moonee Ponds/Moonee Ponds.md". */
export function hubNotePath(folderPath: string): string {
  const trimmed = folderPath.replace(/\/+$/, '');
  const name = trimmed.split('/').pop() ?? trimmed;
  return `${trimmed}/${name}.md`;
}

/** Why a `statuses:` value is not a usable list, or `null` when it is. */
function problemWith(value: unknown): string | null {
  if (!Array.isArray(value)) return 'it is not a list';
  if (value.length === 0) return 'it is empty';
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') return 'an entry is not text';
    const status = item.trim();
    if (status === '') return 'an entry is blank';
    if (status.length > MAX_STATUS_LENGTH) return 'an entry is too long';
    if (status !== status.toLowerCase()) return 'an entry is not lower case';
    if (seen.has(status)) return `"${status}" is there twice`;
    seen.add(status);
  }
  return null;
}

/**
 * The statuses the folder's hub note lists (`hubText`, the note's whole
 * text), or the kind's own list when the note is missing, has no
 * `statuses:`, or its list is not a non-empty list of short lower-case
 * words without duplicates. A malformed list is logged to the console.
 */
export function folderStatuses(
  hubText: string | null | undefined,
  kind: Pick<Kind, 'statuses'>,
): string[] {
  if (hubText === null || hubText === undefined) return [...kind.statuses];
  let value: unknown;
  try {
    value = parseFrontmatter(hubText).data.statuses;
  } catch (error: unknown) {
    console.error('Reading the folder statuses failed', error);
    return [...kind.statuses];
  }
  if (value === undefined) return [...kind.statuses];
  const problem = problemWith(value);
  if (problem !== null) {
    console.error(
      `The folder's statuses list is not usable (${problem}); using the kind's list.`,
    );
    return [...kind.statuses];
  }
  return (value as string[]).map((status) => status.trim());
}

/**
 * The options a status select offers: the folder's `statuses`, plus the
 * note's `current` value at the end when it is not one of them (an older
 * value such as "declined" stays choosable until it is changed).
 */
export function statusOptions(
  statuses: readonly string[],
  current: string,
): string[] {
  return current === '' || statuses.includes(current)
    ? [...statuses]
    : [...statuses, current];
}
