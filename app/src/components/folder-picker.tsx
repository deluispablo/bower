/**
 * Move to… (#909, spec §3.36, R-EDITS-2; boards PF-Move-375/1280): the
 * explorer's tree, folders only, as a choice of destination. The app never
 * moves anything itself (D1): "Move here" writes a request note into the
 * inbox (`move-request.ts`) and confirms by a toast with Undo.
 *
 * `FolderChoice` is the tree alone (same rows, guides, chevrons and icons as
 * `tree.tsx`; the folder the thing sits in now is muted and not on offer;
 * the chosen one is selected). `MoveToSheet` / `openMoveTo` is the whole
 * sheet: "Move to…", the line "Pick a folder for <name>. Bower moves it at
 * the next tidy-up.", the tree, "Moving to <folder>" and "Move here".
 */

import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { createTextFile, deleteFile } from '../drive.js';
import { FOLDER_MIME } from '../drive.js';
import {
  currentFolderOf,
  moveRequestText,
  pickerFolders,
  undoRequestNote,
  writeRequestNote,
} from '../move-request.js';
import type { MoveSubject } from '../move-request.js';
import { buildTree, displayName, paraKindOf } from '../navigation.js';
import type { TreeNode } from '../navigation.js';
import { close, open, OVERLAY_PRIORITY } from '../overlay-queue.js';
import { ancestorsOf } from '../reveal.js';
import { useSession } from '../session.js';
import { showToast } from '../toast-store.js';
import { useVault } from '../vault-store.js';
import { FileIcon } from './file-icon.js';
import { FolderMark } from './folder-mark.js';
import { IconChevronRight, IconClose } from './icons.js';
import { Overlay } from './overlay.js';
import { TREE_INDENT } from './tree.js';

import '../styles/tree.css';
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
  // The current folder's ancestors start open, so it is visible in place.
  const [openPaths, setOpenPaths] = useState<ReadonlySet<string>>(
    () => new Set(ancestorsOf(`${current}/x`)),
  );

  function toggle(path: string): void {
    setOpenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function choice(node: TreeNode, depth: number): JSX.Element {
    const isCurrent = node.path === current;
    const isChosen = node.path === chosen;
    const root = paraKindOf(topOf(node.path));
    const expandable = node.folders.length > 0;
    const expanded = openPaths.has(node.path);
    const label = displayName(node.name);
    return (
      <div
        key={node.path}
        class={[
          'tree-row',
          'folder-picker-row',
          depth === 0 && 'tree-root',
          isChosen && 'tree-row-selected',
          isCurrent && 'folder-picker-current',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: `${depth * TREE_INDENT + 4}px` }}
      >
        {Array.from({ length: depth }, (_, k) => (
          <span
            key={k}
            class="tree-guide"
            aria-hidden="true"
            style={{ left: `${10 + k * TREE_INDENT}px` }}
          />
        ))}
        {expandable ? (
          <button
            type="button"
            class={`tree-chevron${expanded ? ' tree-chevron-open' : ''}`}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
            aria-expanded={expanded}
            onClick={() => toggle(node.path)}
          >
            <IconChevronRight />
          </button>
        ) : (
          <span class="tree-spacer" aria-hidden="true" />
        )}
        <button
          type="button"
          role="radio"
          class="tree-link folder-picker-choice"
          aria-checked={isChosen}
          disabled={isCurrent}
          title={label}
          onClick={() => onChoose(node.path)}
        >
          {depth === 0 && root !== null ? (
            <FolderMark kind={root} size={18} />
          ) : (
            <FileIcon
              item={{ name: node.name, mimeType: FOLDER_MIME, path: node.path }}
              size={16}
            />
          )}
          <span class="tree-name">{label}</span>
          {isCurrent && <span class="tree-sr"> (where it is now)</span>}
        </button>
      </div>
    );
  }

  function tree(nodes: readonly TreeNode[], depth: number): JSX.Element[] {
    return nodes.flatMap((node) => [
      choice(node, depth),
      ...(openPaths.has(node.path) ? tree(node.folders, depth + 1) : []),
    ]);
  }

  return (
    <div class="folder-picker-body tree-wrap tree-host-drawer">
      <div
        class="folder-picker-list"
        role="radiogroup"
        aria-label="Destination folder"
      >
        {tree(folders, 0)}
      </div>
    </div>
  );
}

export interface MoveToProps {
  subject: MoveSubject;
  /** What is being moved, as the person reads it ("Moonee Ponds"). */
  name: string;
  onClose: () => void;
}

/** The whole Move to… sheet (phone) / panel (desktop). */
export function MoveToSheet({
  subject,
  name,
  onClose,
}: MoveToProps): JSX.Element {
  const { me } = useSession();
  const { index, refresh } = useVault();
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folders = useMemo(
    () => (index === null ? [] : pickerFolders(buildTree(index), subject)),
    [index, subject.path, subject.isFolder],
  );
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;

  async function undo(id: string): Promise<void> {
    const result = await undoRequestNote(deleteFile, id);
    if (result === 'failed') {
      showToast("Couldn't take that back. It is still in your inbox.");
      return;
    }
    void refresh();
    showToast('Taken out of your inbox.');
  }

  async function moveHere(): Promise<void> {
    if (chosen === '') return;
    if (inboxFolderId === null) {
      setError('Could not send that. Try again.');
      return;
    }
    setBusy(true);
    setError(null);
    let id: string | null;
    try {
      id = await writeRequestNote(
        { createTextFile },
        {
          inboxFolderId,
          text: moveRequestText(name, subject.path, chosen),
          now: new Date(),
        },
      );
    } catch (err) {
      console.error(err);
      setBusy(false);
      setError('Could not send that. Try again.');
      return;
    }
    void refresh();
    showToast(
      'In your inbox. Bower moves it at the next tidy-up.',
      undefined,
      id === null ? undefined : { label: 'Undo', run: () => void undo(id) },
    );
    onClose();
  }

  const destination =
    chosen === '' ? '' : displayName(chosen.slice(chosen.lastIndexOf('/') + 1));

  return (
    <Overlay kind="sheet" labelledBy="move-to-title" onClose={onClose}>
      <div class="move-to">
        <header class="move-to-head">
          <div>
            <h2 id="move-to-title" class="move-to-title">
              Move to…
            </h2>
            <p class="move-to-sub">
              Pick a folder for {name}. Bower moves it at the next tidy-up.
            </p>
          </div>
          <button
            type="button"
            class="icon-button move-to-close"
            aria-label="Close Move to"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>
        <FolderChoice
          subject={subject}
          folders={folders}
          chosen={chosen}
          onChoose={(path) => {
            setError(null);
            setChosen(path);
          }}
        />
        <div class="move-to-foot">
          {destination !== '' && (
            <p class="move-to-line" aria-live="polite">
              Moving to {destination}
            </p>
          )}
          {error !== null && (
            <p class="move-to-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            class="button move-to-primary"
            disabled={busy || chosen === ''}
            onClick={() => void moveHere()}
          >
            Move here
          </button>
        </div>
      </div>
    </Overlay>
  );
}

const MOVE_TO_ID = 'move-to';

/** Opens Move to… on the overlay queue (⋯ "Move to…", #907). */
export function openMoveTo(props: Omit<MoveToProps, 'onClose'>): void {
  open({
    id: MOVE_TO_ID,
    priority: OVERLAY_PRIORITY.own,
    render: () => <MoveToSheet {...props} onClose={() => close(MOVE_TO_ID)} />,
  });
}
