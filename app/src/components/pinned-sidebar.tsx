/**
 * The explorer's PINNED group (spec §3.3, §3.14; #909): between the search
 * field (and, on desktop, the nav) and YOUR FOLDERS. A row per pin, with
 * the same icon the tree gives it (a root's disc, a folder outline or the
 * FileIcon, tinted by root) and its name; no counts and no "new" tags (K-1).
 * Rows are 28 px in the sidebar, 40 px in the drawer and the Folders tab.
 * The sidebar shows up to 5 pins. Hidden while nothing is pinned.
 */

import type { JSX } from 'preact';

import type { DriveFile } from '../drive.js';
import { FOLDER_MIME } from '../drive.js';
import { displayName, folderHref, paraKindOf } from '../navigation.js';
import { noteTitle } from '../note-title.js';
import type { PinnedItem } from '../vault-store.js';
import { fileTitle } from '../vault-index.js';
import { FileIcon } from './file-icon.js';
import { FolderMark } from './folder-mark.js';
import { useBowerWritten } from './tree.js';
import type { TreeHost } from './tree.js';
import { useNoteTitles } from './use-note-titles.js';

const ROW_LIMIT = 5;

export interface PinnedSidebarProps {
  items: readonly PinnedItem[];
  /** The host: the sidebar shows 5 pins, the others every pin. */
  variant?: TreeHost;
  /** Called when a row is chosen, e.g. to close the drawer. */
  onNavigate?: () => void;
}

export function PinnedSidebar({
  items,
  variant = 'sidebar',
  onNavigate,
}: PinnedSidebarProps): JSX.Element | null {
  const shown = variant === 'sidebar' ? items.slice(0, ROW_LIMIT) : items;
  const noteFiles: DriveFile[] = shown
    .filter(
      (item): item is Extract<PinnedItem, { kind: 'note' }> =>
        item.kind === 'note',
    )
    .map((item) => item.file);
  const titles = useNoteTitles(noteFiles);
  // The bird on what Bower wrote, from the cached frontmatter (as the tree).
  const bowerIds = useBowerWritten(noteFiles);

  if (items.length === 0) return null;

  return (
    <div class={`explorer-pinned explorer-host-rows-${variant}`}>
      <div class="explorer-section">
        <h2 class="explorer-label">Pinned</h2>
      </div>
      <div class="explorer-list">
        {shown.map((item) => {
          if (item.kind === 'folder') {
            const root = paraKindOf(item.path.split('/')[0] ?? '');
            const top = !item.path.includes('/');
            const name = displayName(
              item.path.slice(item.path.lastIndexOf('/') + 1),
            );
            return (
              <a
                key={item.path}
                href={folderHref(item.path)}
                class="explorer-item"
                title={name}
                onClick={() => onNavigate?.()}
              >
                {top && root !== null ? (
                  <FolderMark kind={root} size={18} />
                ) : (
                  <FileIcon
                    item={{ name, mimeType: FOLDER_MIME, path: item.path }}
                    size={16}
                  />
                )}
                <span class="explorer-item-label">{name}</span>
              </a>
            );
          }
          const name =
            item.kind === 'note'
              ? (titles.get(item.file.id) ?? noteTitle(item.file))
              : fileTitle(item.file.name);
          return (
            <a
              key={item.file.id}
              href={`/${item.kind}/${item.file.id}`}
              class="explorer-item"
              title={name}
              onClick={() => onNavigate?.()}
            >
              <FileIcon
                item={{
                  ...item.file,
                  bowerWritten: bowerIds.has(item.file.id),
                }}
                size={16}
              />
              <span class="explorer-item-label">{name}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
