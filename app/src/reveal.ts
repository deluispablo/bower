/**
 * Reveal (#591, spec §6.3 R-REVEAL-1/2/4): the tree follows what the person
 * opens. Pure helpers only: which folders lie above a note, file or folder,
 * how they join the folders already open (never removing one), the target of
 * the current route, the last target kept in memory for the phone's Notes
 * tab, and the link the More menu's "Show in folders" uses.
 */

import { openFoldersDrawer } from './folders-drawer.js';
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

/** The window width from which the desktop sidebar shows (`layout.tsx`). */
const DESKTOP_QUERY = '(min-width: 900px)';

/** A "reveal this" request (`revealInFolders`); `seq` tells requests apart. */
export interface RevealRequest {
  path: string;
  /** A note or file's id; not set for a folder. */
  id?: string;
  seq: number;
  /** The route it was made on: it holds until the person leaves it. */
  at: string;
}

let request: RevealRequest | null = null;
let requestSeq = 0;
const requestListeners = new Set<() => void>();

/** The latest `revealInFolders` request, or `null` before any. */
export function revealRequest(): RevealRequest | null {
  return request;
}

export function subscribeReveal(listener: () => void): () => void {
  requestListeners.add(listener);
  return () => {
    requestListeners.delete(listener);
  };
}

/**
 * Shows `path` in the explorer (#909, E-17): opens the drawer on the phone
 * or points the desktop sidebar at it, expands its ancestors, scrolls its
 * row into view, selects it and moves focus to it. `id` names a note or
 * file; leave it out for a folder. Used by ⋯ "Show in folders", the tool
 * "Show the open item" and the root crumb (#906).
 */
export function revealInFolders(path: string, id?: string): void {
  requestSeq += 1;
  const at = window.location.pathname;
  request =
    id === undefined
      ? { path, seq: requestSeq, at }
      : { path, id, seq: requestSeq, at };
  rememberTarget(
    id === undefined ? { kind: 'folder', path } : { kind: 'note', id, path },
  );
  const desktop =
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DESKTOP_QUERY).matches;
  if (!desktop) openFoldersDrawer();
  for (const listener of requestListeners) listener();
}

/**
 * The row a folder page shows in its preview column (spec R-EXP-3/4): the
 * sidebar tree gives it the selection's tint and bar too: a note or file
 * by its Drive `id`, a folder by its `path`. `null` when nothing is
 * previewed or the page has no preview column.
 */
export type PreviewedItem = { id: string } | { path: string };

function sameItem(a: PreviewedItem | null, b: PreviewedItem | null): boolean {
  if (a === null || b === null) return a === b;
  if ('id' in a) return 'id' in b && a.id === b.id;
  return 'path' in b && a.path === b.path;
}

let previewedItem: PreviewedItem | null = null;
const previewedListeners = new Set<() => void>();

export function previewed(): PreviewedItem | null {
  return previewedItem;
}

export function setPreviewed(item: PreviewedItem | null): void {
  if (sameItem(previewedItem, item)) return;
  previewedItem = item;
  for (const listener of previewedListeners) listener();
}

export function subscribePreviewed(listener: () => void): () => void {
  previewedListeners.add(listener);
  return () => {
    previewedListeners.delete(listener);
  };
}
