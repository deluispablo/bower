/**
 * Reveal (#591, spec §6.3 R-REVEAL-1/2/4): the tree follows what the person
 * opens. Pure helpers only: which folders lie above a note, file or folder,
 * how they join the folders already open (never removing one), the target of
 * the current route, the last target kept in memory for the phone's Notes
 * tab, and the link the More menu's "Show in folders" uses.
 */

import type { VaultIndex } from './vault-index.js';

export type RevealKind = 'note' | 'file' | 'folder';

export interface RevealTarget {
  kind: RevealKind;
  /** The note or file's Drive id; not set for a folder. */
  id?: string;
  /** The row's vault path (a folder's own path for a folder). */
  path: string;
}

/**
 * The folders above `path`, top first: `a/b/c.md` gives `['a', 'a/b']`.
 * A top-level path has none. The target itself is never included.
 */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/').filter((part) => part !== '');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    out.push(parts.slice(0, i).join('/'));
  }
  return out;
}

/**
 * `expanded` plus `add`. Nothing is ever removed, and the same set comes
 * back when nothing was new, so a caller can skip the state update.
 */
export function mergeExpanded(
  expanded: ReadonlySet<string>,
  add: readonly string[],
): ReadonlySet<string> {
  if (add.every((path) => expanded.has(path))) return expanded;
  const next = new Set(expanded);
  for (const path of add) next.add(path);
  return next;
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * What a route opens: `/note/:id` and `/file/:id` (found in the index, so a
 * note the index does not know yet gives `null`) and `/folder/:path`. Any
 * other route gives `null`.
 */
export function targetFromRoute(
  pathname: string,
  index: VaultIndex | null,
): RevealTarget | null {
  const match = /^\/(note|file|folder)\/(.+)$/.exec(pathname);
  if (match === null) return null;
  const kind = match[1] as RevealKind;
  const rest = (match[2] ?? '').replace(/\/+$/, '');
  if (rest === '') return null;
  if (kind === 'folder') {
    return { kind, path: rest.split('/').map(safeDecode).join('/') };
  }
  const id = safeDecode(rest);
  const file = index?.byId.get(id);
  if (file === undefined) return null;
  return { kind, id, path: file.path };
}

let last: RevealTarget | null = null;

/** Keeps the last opened target, for the Notes tab opened later. */
export function rememberTarget(target: RevealTarget | null): void {
  if (target !== null) last = target;
}

/** The last note, file or folder opened, or `null` before any. */
export function lastTarget(): RevealTarget | null {
  return last;
}

/**
 * The link "Show in folders" follows (#608): the Notes tab, told which
 * target to reveal. Read back with `targetFromReveal`.
 */
export function revealHref(target: RevealTarget): string {
  const value =
    target.kind === 'folder'
      ? `folder/${target.path.split('/').map(encodeURIComponent).join('/')}`
      : `${target.kind}/${encodeURIComponent(target.id ?? '')}`;
  return `/notes?reveal=${encodeURIComponent(value)}`;
}

/** The target a `?reveal=` query value names, or `null`. */
export function targetFromReveal(
  value: string | undefined,
  index: VaultIndex | null,
): RevealTarget | null {
  if (value === undefined || value === '') return null;
  return targetFromRoute(`/${value}`, index);
}
