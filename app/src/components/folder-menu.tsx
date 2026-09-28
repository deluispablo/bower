/**
 * The folder menu (#319, Phone-Drawer board): the phone's top-bar menu
 * button opens it from any tab. A modal dialog 320 px wide, sliding in from
 * the left over the dimmed page: "Your folders" and Close; a search row
 * that opens the quick switcher; Pinned (the pinned notes and folders);
 * Folders (the six top-level folders with their meaning line and count,
 * `folder-meanings.ts`, each able to show its subfolders); and a footer
 * line. No sort, no filter: the Notes tab keeps the full tree with search.
 *
 * Tapping a row opens it (a folder's screen, or the note). Holding a row
 * (`use-long-press.ts`, or a right-click / the Menu key) opens the same pin
 * sheet the tree uses (`pin-sheet.tsx`): Pin to Home or Unpin, and the rest.
 * Focus is trapped inside while it is open (`use-focus-trap.ts`); Escape,
 * Close and a tap on the dimmed page close it, and focus goes back to the
 * menu button. `layout.tsx` makes the page behind inert meanwhile.
 */

import type { JSX } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';

import type { DriveFile } from '../drive.js';
import { menuRoots, pinnedDetail } from '../folder-menu.js';
import type { MenuFolder } from '../folder-menu.js';
import { driveViewUrl } from '../markdown/embeds.js';
import {
  driveFolderUrl,
  folderCounts,
  folderHref,
  folderOf,
} from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { openSwitcher } from '../switcher-store.js';
import { pinned, useVault } from '../vault-store.js';
import type { PinnedItem } from '../vault-store.js';
import {
  IconChevronRight,
  IconClose,
  IconFolder,
  IconNote,
  IconPin,
  IconSearch,
} from './icons.js';
import { PinSheet } from './pin-sheet.js';
import { useFocusTrap } from './use-focus-trap.js';
import { useLongPress } from './use-long-press.js';
import { useNoteTitles } from './use-note-titles.js';
import '../styles/folder-menu.css';

/** Same cap as the desktop sidebar's Pinned group (`pinned-sidebar.tsx`):
 * Home lists every pin; the menu is a shortcut. */
const PINNED_LIMIT = 5;

/** The folder a new menu opens with its subfolders showing (the board). */
const OPEN_AT_START = '1-Projects';

/** The row a long press is holding: a note by id, or a folder by path. */
type Held = { kind: 'note'; id: string } | { kind: 'folder'; path: string };

export interface FolderMenuProps {
  onClose: () => void;
}

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function FolderMenu({ onClose }: FolderMenuProps): JSX.Element {
  const { index, pinNote, unpinNote, pinFolder, unpinFolder } = useVault();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set([OPEN_AT_START]),
  );
  const [held, setHeld] = useState<Held | null>(null);

  // #425: files and notes together, the same total the folder screen
  // itself lists ("n files · n notes").
  const counts = useMemo(
    () =>
      index === null ? new Map<string, number>() : folderCounts(index, true),
    [index],
  );
  const roots = useMemo(
    () => (index === null ? [] : menuRoots(index, counts)),
    [index, counts],
  );
  const pins = useMemo(
    () => (index === null ? [] : pinned(index).slice(0, PINNED_LIMIT)),
    [index],
  );
  const pinnedNotes = useMemo(
    () =>
      pins
        .filter((item): item is Extract<PinnedItem, { kind: 'note' }> => {
          return item.kind === 'note';
        })
        .map((item) => item.file),
    [pins],
  );
  const titles = useNoteTitles(pinnedNotes);

  const longPress = useLongPress((target) => {
    const { heldKind, heldKey } = target.dataset;
    if (heldKey === undefined) return;
    if (heldKind === 'note') setHeld({ kind: 'note', id: heldKey });
    else if (heldKind === 'folder') setHeld({ kind: 'folder', path: heldKey });
  });

  function titleOf(file: DriveFile): string {
    return titles.get(file.id) ?? noteTitle(file);
  }

  function toggle(path: string): void {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  /** A row's own tap: skipped once right after a long press on it, so
   * holding a row never also opens it. */
  function onRowClick(event: JSX.TargetedMouseEvent<HTMLElement>): void {
    if (longPress.consumeLongPress()) {
      event.preventDefault();
      return;
    }
    // A route change closes the menu too (`layout.tsx`); this also covers a
    // tap on the screen that is already open.
    onClose();
  }

  const rowHandlers = {
    onClick: onRowClick,
    onPointerDown: longPress.onPointerDown,
    onPointerMove: longPress.onPointerMove,
    onPointerUp: longPress.onPointerUp,
    onPointerCancel: longPress.onPointerCancel,
    onContextMenu: longPress.onContextMenu,
  };

  function pinSheet(): JSX.Element | null {
    if (held === null || index === null) return null;
    if (held.kind === 'note') {
      const { id } = held;
      const file = index.byId.get(id);
      if (file === undefined) return null;
      const name = titleOf(file);
      const already = index.notePinnedAt.has(id);
      return (
        <PinSheet
          kind="note"
          name={name}
          pinned={already}
          openHref={folderHref(folderOf(file.path))}
          tellHref={`/bower?text=${encodeURIComponent(`[[${name}]] `)}`}
          driveHref={driveViewUrl(file)}
          onTogglePin={() =>
            void runPinAction(
              () => (already ? unpinNote(id) : pinNote(id)),
              already ? 'Unpinned' : 'Pinned to Home',
            )
          }
          onClose={() => setHeld(null)}
        />
      );
    }
    const { path } = held;
    const name = lastSegment(path);
    const folder = index.byPath.get(path);
    const already = index.folderPinnedAt.has(path);
    return (
      <PinSheet
        kind="folder"
        name={name}
        pinned={already}
        openHref={folderHref(path)}
        tellHref={`/bower?text=${encodeURIComponent(`${name} `)}`}
        driveHref={folder === undefined ? '' : driveFolderUrl(folder)}
        onTogglePin={() =>
          void runPinAction(
            () => (already ? unpinFolder(path) : pinFolder(path)),
            already ? 'Unpinned' : 'Pinned to Home',
          )
        }
        onClose={() => setHeld(null)}
      />
    );
  }

  function folderLink(
    folder: MenuFolder,
    meaning: string | undefined,
  ): JSX.Element {
    return (
      <a
        href={folderHref(folder.path)}
        class="folder-menu-link"
        data-held-kind="folder"
        data-held-key={folder.path}
        {...rowHandlers}
      >
        <IconFolder />
        <span class="folder-menu-name">
          <span class="folder-menu-title">{folder.name}</span>
          {meaning !== undefined && (
            <span class="folder-menu-detail">{meaning}</span>
          )}
        </span>
        {folder.count > 0 && (
          <span class="folder-menu-count">{folder.count}</span>
        )}
      </a>
    );
  }

  return (
    <div class="drawer">
      <div class="drawer-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        class="drawer-panel folder-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-menu-title"
        tabIndex={-1}
      >
        <div class="folder-menu-head">
          <h2 id="folder-menu-title" class="folder-menu-heading">
            Your folders
          </h2>
          <button
            type="button"
            class="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        <div class="folder-menu-body">
          <button
            type="button"
            class="folder-menu-search"
            onClick={() => {
              onClose();
              openSwitcher();
            }}
          >
            <IconSearch />
            <span>Search or jump to anything</span>
          </button>

          {pins.length > 0 && (
            <section aria-labelledby="folder-menu-pinned">
              <h3 id="folder-menu-pinned" class="folder-menu-label">
                Pinned
              </h3>
              <ul class="folder-menu-list">
                {pins.map((item) => {
                  const detail = pinnedDetail(item, counts);
                  const note = item.kind === 'note';
                  return (
                    <li key={note ? item.file.id : item.path}>
                      <a
                        href={
                          note ? `/note/${item.file.id}` : folderHref(item.path)
                        }
                        class="folder-menu-link"
                        data-held-kind={item.kind}
                        data-held-key={note ? item.file.id : item.path}
                        {...rowHandlers}
                      >
                        <span class="folder-menu-pin">
                          <IconPin />
                        </span>
                        {note ? <IconNote /> : <IconFolder />}
                        <span class="folder-menu-name">
                          <span class="folder-menu-title">
                            {note ? titleOf(item.file) : lastSegment(item.path)}
                          </span>
                          {detail !== '' && (
                            <span class="folder-menu-detail">{detail}</span>
                          )}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="folder-menu-folders">
            <h3 id="folder-menu-folders" class="folder-menu-label">
              Folders
            </h3>
            <ul class="folder-menu-list">
              {roots.map((root) => {
                const expandable = root.children.length > 0;
                const expanded = expandable && open.has(root.path);
                return (
                  <li key={root.path}>
                    <div class="folder-menu-row">
                      {expandable ? (
                        <button
                          type="button"
                          class={`folder-menu-chevron${expanded ? ' folder-menu-chevron-open' : ''}`}
                          aria-label={`Folders in ${root.name}`}
                          aria-expanded={expanded}
                          onClick={() => toggle(root.path)}
                        >
                          <IconChevronRight />
                        </button>
                      ) : (
                        <span class="folder-menu-chevron" aria-hidden="true" />
                      )}
                      {folderLink(root, root.meaning)}
                    </div>
                    {expanded && (
                      <ul class="folder-menu-list folder-menu-children">
                        {root.children.map((child) => (
                          <li key={child.path}>
                            {folderLink(child, undefined)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <p class="folder-menu-foot">
            Tap a folder to open it. Long-press to pin it to Home. The full tree
            with search lives on the Notes tab.
          </p>
        </div>
        {pinSheet()}
      </div>
    </div>
  );
}
