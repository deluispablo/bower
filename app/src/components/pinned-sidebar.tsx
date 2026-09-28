/**
 * The explorer's Pinned group (spec §14, issue #216; v4 #589): between the
 * primary nav (or the search field, on the phone) and "Your folders"
 * (`components/explorer.tsx`). The sidebar shows up to 5 rows, a pinned
 * folder with the number of things new in it ("Flat hunt · 4 new", from
 * `useNew`, #587); the Notes tab shows every pin, a pinned folder with its
 * count ("Flat hunt 5"). Hidden while there is nothing pinned. Reuses
 * `.explorer-section`/`.explorer-label` and `.explorer-row`.
 */

import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';

import type { DriveFile } from '../drive.js';
import { folderCounts, folderHref, paraKindOf } from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { useNew } from '../use-new.js';
import { useVault } from '../vault-store.js';
import type { PinnedItem } from '../vault-store.js';
import { FolderIcon } from './folder-mark.js';
import { IconNote } from './icons.js';
import { useNoteTitles } from './use-note-titles.js';

const ROW_LIMIT = 5;

export interface PinnedSidebarProps {
  items: readonly PinnedItem[];
  /** The Notes tab (`page`) shows counts and every pin; the sidebar, "n new". */
  variant?: 'sidebar' | 'page';
}

export function PinnedSidebar({
  items,
  variant = 'sidebar',
}: PinnedSidebarProps): JSX.Element | null {
  const { index } = useVault();
  const newState = useNew();
  const counts = useMemo(
    () => (index === null ? undefined : folderCounts(index, true)),
    [index],
  );
  const shown = variant === 'sidebar' ? items.slice(0, ROW_LIMIT) : items;
  const noteFiles: DriveFile[] = shown
    .filter(
      (item): item is Extract<PinnedItem, { kind: 'note' }> =>
        item.kind === 'note',
    )
    .map((item) => item.file);
  const titles = useNoteTitles(noteFiles);

  if (items.length === 0) return null;

  return (
    <div class={`explorer-pinned explorer-pinned-${variant}`}>
      <div class="explorer-section">
        <h2 class="explorer-label">Pinned</h2>
      </div>
      <div class="explorer-rows">
        {shown.map((item) =>
          item.kind === 'note' ? (
            <a
              key={item.file.id}
              href={`/note/${item.file.id}`}
              class="explorer-row"
            >
              <IconNote />
              <span class="explorer-row-label">
                {titles.get(item.file.id) ?? noteTitle(item.file)}
              </span>
            </a>
          ) : (
            <PinnedFolder
              key={item.path}
              path={item.path}
              count={counts?.get(item.path) ?? 0}
              fresh={newState.newCountIn(item.path)}
              variant={variant}
            />
          ),
        )}
      </div>
    </div>
  );
}

function PinnedFolder({
  path,
  count,
  fresh,
  variant,
}: {
  path: string;
  count: number;
  fresh: number;
  variant: 'sidebar' | 'page';
}): JSX.Element {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const tint = paraKindOf(path.split('/')[0] ?? '') ?? undefined;
  return (
    <a href={folderHref(path)} class="explorer-row">
      <FolderIcon tint={tint} />
      <span class="explorer-row-label">
        {name}
        {variant === 'sidebar' && fresh > 0 && (
          <span class="explorer-pinned-new"> · {fresh} new</span>
        )}
      </span>
      {variant === 'page' && count > 0 && (
        <span class="explorer-pinned-count">{count}</span>
      )}
    </a>
  );
}
