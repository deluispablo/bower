/**
 * The Move to… folder picker (#608, spec §6.9 R-MOVE-1 to R-MOVE-4, board
 * Phone-Move-Picker): a bottom sheet under 900 px, a centred dialog from
 * 900 px up. The app never moves anything itself (D1): choosing a folder
 * and pressing "Move it now" or "With the next tidy-up" writes a request
 * for Bower (`move-request.ts`).
 *
 * `FolderPicker` is the view: it gets the folders and reports the choice.
 * `MoveFlow` wires it to the vault, the session and the run store, so the
 * More menu opens one component and the picker stays testable on its own.
 *
 * The list is a radio group: the landmarks (with their short meaning
 * lines) and their folders, each landmark expandable through its own
 * chevron button. The folder the thing sits in now is disabled, the chosen
 * one ticked. "Find a folder" swaps the tree for a flat list of matches.
 */

import { useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { createTextFile } from '../drive.js';
import { folderMeaning } from '../folder-meanings.js';
import {
  currentFolderOf,
  findFolders,
  moveRequestText,
  pickerFolders,
  sendMoveRequest,
} from '../move-request.js';
import type { MoveSubject } from '../move-request.js';
import {
  buildTree,
  displayName,
  displayPath,
  paraKindOf,
} from '../navigation.js';
import type { TreeNode } from '../navigation.js';
import { ancestorsOf } from '../reveal.js';
import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import { showToast } from '../toast-store.js';
import { useVault } from '../vault-store.js';
import { FolderIcon, FolderMark } from './folder-mark.js';
import { IconCheck, IconChevronRight, IconSearch } from './icons.js';
import { useFocusTrap } from './use-focus-trap.js';
import '../styles/folder-picker.css';

export type MoveWhen = 'now' | 'later';

export interface FolderPickerProps {
  /** The name in the title: `Move “<name>” to…`. */
  name: string;
  subject: MoveSubject;
  /** The folders on offer, folders only (`pickerFolders`). */
  folders: readonly TreeNode[];
  /** Set while the request is being written: both buttons wait. */
  busy?: boolean;
  /** One short sentence when the last try did not go through. */
  error?: string | null;
  onChoose: (destination: string, when: MoveWhen) => void;
  onClose: () => void;
}

const FOOTER =
  'Bower moves it and keeps its lists straight. Now takes a minute; otherwise it goes with the next tidy-up.';

function topOf(path: string): string {
  const slash = path.indexOf('/');
  return slash === -1 ? path : path.slice(0, slash);
}

export function FolderPicker({
  name,
  subject,
  folders,
  busy = false,
  error = null,
  onChoose,
  onClose,
}: FolderPickerProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  const current = currentFolderOf(subject);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
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
          onClick={() => setChosen(node.path)}
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
    <div class="folder-picker">
      <div
        class="folder-picker-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        class="folder-picker-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Move to"
        tabIndex={-1}
      >
        <h2 class="folder-picker-title">Move “{name}” to…</h2>
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
        {error !== null && (
          <p class="folder-picker-error" role="alert">
            {error}
          </p>
        )}
        <p class="folder-picker-note">{FOOTER}</p>
        <div class="folder-picker-actions">
          <button
            type="button"
            class="button folder-picker-primary"
            disabled={chosen === null || busy}
            onClick={() => chosen !== null && onChoose(chosen, 'now')}
          >
            Move it now
          </button>
          <button
            type="button"
            class="folder-picker-secondary"
            disabled={chosen === null || busy}
            onClick={() => chosen !== null && onChoose(chosen, 'later')}
          >
            With the next tidy-up
          </button>
        </div>
      </div>
    </div>
  );
}

export interface MoveFlowProps {
  /** The note, file or folder being moved: its title and vault path. */
  name: string;
  path: string;
  isFolder: boolean;
  onClose: () => void;
}

/**
 * The picker wired to the app: the tree from the vault index, the request
 * written through Drive into the inbox, and `Move it now` starting an
 * instructions-only run through the run store (`POST /process`).
 */
export function MoveFlow({
  name,
  path,
  isFolder,
  onClose,
}: MoveFlowProps): JSX.Element {
  const { index, refresh } = useVault();
  const { me } = useSession();
  const { process } = useRun();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subject: MoveSubject = { path, isFolder };
  const folders = useMemo(
    () => (index === null ? [] : pickerFolders(buildTree(index), subject)),
    [index, path, isFolder],
  );
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;

  async function choose(destination: string, when: MoveWhen): Promise<void> {
    if (inboxFolderId === null) {
      setError('Could not send that. Try again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendMoveRequest(
        { createTextFile, startRun: process },
        {
          inboxFolderId,
          text: moveRequestText(name, path, destination),
          when,
          now: new Date(),
        },
      );
    } catch (err) {
      console.error(err);
      setBusy(false);
      setError('Could not send that. Try again.');
      return;
    }
    // The listing catches up now, so Requests and Home's counts show it.
    void refresh();
    showToast(
      when === 'now'
        ? 'Asked Bower to move it now.'
        : 'Asked Bower to move it with the next tidy-up.',
    );
    onClose();
  }

  return (
    <FolderPicker
      name={name}
      subject={subject}
      folders={folders}
      busy={busy}
      error={error}
      onChoose={(destination, when) => void choose(destination, when)}
      onClose={onClose}
    />
  );
}
