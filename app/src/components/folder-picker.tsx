/**
 * The folder choice of the Move sheet (#866, spec §6.9 R-MOVE-1 to R-MOVE-4,
 * §6.13): the "Find a folder" field and the folder tree, the body of the
 * send-to-Bower sheet's move mode. The app never moves anything itself (D1);
 * the sheet writes the request (`move-request.ts`).
 *
 * The list is a radio group: the landmarks (with their short meaning
 * lines) and their folders, each landmark expandable through its own
 * chevron button. The folder the thing sits in now is disabled, the chosen
 * one ticked. "Find a folder" swaps the tree for a flat list of matches.
 */

import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { folderMeaning } from '../folder-meanings.js';
import { currentFolderOf, findFolders } from '../move-request.js';
import type { MoveSubject } from '../move-request.js';
import { displayName, displayPath, paraKindOf } from '../navigation.js';
import type { TreeNode } from '../navigation.js';
import { ancestorsOf } from '../reveal.js';
import { FolderIcon, FolderMark } from './folder-mark.js';
import { IconCheck, IconChevronRight, IconSearch } from './icons.js';
import '../styles/folder-picker.css';

export interface FolderChoiceProps {
  subject: MoveSubject;
  /** The folders on offer, folders only (`pickerFolders`). */
  folders: readonly TreeNode[];
  /** The chosen folder's path, `''` for none yet. */
  chosen: string;
  onChoose: (destination: string) => void;
}

function topOf(path: string): string {
  const slash = path.indexOf('/');
  return slash === -1 ? path : path.slice(0, slash);
}

export function FolderChoice({
  subject,
  folders,
  chosen,
  onChoose,
}: FolderChoiceProps): JSX.Element {
  const current = currentFolderOf(subject);
  const [query, setQuery] = useState('');
  // The current folder's ancestors start open, so it is visible in place.
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(ancestorsOf(`${current}/x`)),
  );
  const matches = useMemo(() => findFolders(folders, query), [folders, query]);
  const searching = query.trim() !== '';

  function toggle(path: string): void {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function choice(node: TreeNode, depth: number, flat: boolean): JSX.Element {
    const isCurrent = node.path === current;
    const isChosen = node.path === chosen;
    const top = depth === 0;
    const kind = paraKindOf(topOf(node.path));
    const meaning = top ? folderMeaning(node.path, 'short') : undefined;
    const expandable = !flat && node.folders.length > 0;
    const expanded = open.has(node.path);
    const label = displayName(node.name);
    return (
      <div
        key={node.path}
        class={`folder-picker-row${top ? ' folder-picker-landmark' : ''}${flat ? ' folder-picker-flat' : ''}`}
        style={flat ? undefined : { paddingLeft: `${depth * 18}px` }}
      >
        {flat ? null : expandable ? (
          <button
            type="button"
            class="folder-picker-chevron"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
            aria-expanded={expanded}
            onClick={() => toggle(node.path)}
          >
            <span class={expanded ? 'folder-picker-open' : undefined}>
              <IconChevronRight />
            </span>
          </button>
        ) : (
          <span class="folder-picker-chevron-gap" aria-hidden="true" />
        )}
        <button
          type="button"
          role="radio"
          class="folder-picker-choice"
          aria-checked={isChosen}
          disabled={isCurrent}
          onClick={() => onChoose(node.path)}
        >
          {top && kind !== null ? (
            <FolderMark kind={kind} size={28} />
          ) : (
            <FolderIcon tint={kind ?? undefined} />
          )}
          <span class="folder-picker-text">
            <span class="folder-picker-name">{label}</span>
            {meaning !== undefined && (
              <span class="folder-picker-meaning">{meaning}</span>
            )}
            {flat && (
              <span class="folder-picker-meaning">
                {displayPath(node.path)}
              </span>
            )}
            {isCurrent && (
              <span class="folder-picker-meaning">Where it is now</span>
            )}
          </span>
          {isChosen && (
            <span class="folder-picker-tick">
              <IconCheck />
            </span>
          )}
        </button>
      </div>
    );
  }

  function tree(nodes: readonly TreeNode[], depth: number): JSX.Element[] {
    return nodes.flatMap((node) => [
      choice(node, depth, false),
      ...(open.has(node.path) ? tree(node.folders, depth + 1) : []),
    ]);
  }

  return (
    <div class="folder-picker-body">
      <label class="folder-picker-search">
        <IconSearch />
        <input
          type="search"
          placeholder="Find a folder"
          aria-label="Find a folder"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <div
        class="folder-picker-list"
        role="radiogroup"
        aria-label="Destination folder"
      >
        {searching
          ? matches.map((node) => choice(node, 0, true))
          : tree(folders, 0)}
        {searching && matches.length === 0 && (
          <p class="folder-picker-empty" role="status">
            No folder has that in its name.
          </p>
        )}
      </div>
    </div>
  );
}
