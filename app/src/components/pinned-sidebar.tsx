/**
 * The desktop sidebar's Pinned group (spec §14, issue #216): up to 5 rows
 * between the primary nav and "Your notes" (`components/explorer.tsx`,
 * `variant="sidebar"` only — the phone drawer has no room for it and
 * reaches pinned items through Home instead). Hidden while there is
 * nothing pinned. Reuses `.explorer-section`/`.explorer-label` (the same
 * "Your notes" heading) and `.explorer-row` (the same nav rows), so it
 * needs no CSS of its own.
 */

import type { JSX } from 'preact';

import { folderHref } from '../navigation.js';
import type { PinnedItem } from '../vault-store.js';
import { IconFolder, IconNote } from './icons.js';

const ROW_LIMIT = 5;

export interface PinnedSidebarProps {
  items: readonly PinnedItem[];
}

export function PinnedSidebar({
  items,
}: PinnedSidebarProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <div class="explorer-pinned">
      <div class="explorer-section">
        <h2 class="explorer-label">Pinned</h2>
      </div>
      <div class="explorer-rows">
        {items.slice(0, ROW_LIMIT).map((item) =>
          item.kind === 'note' ? (
            <a
              key={item.file.id}
              href={`/note/${item.file.id}`}
              class="explorer-row"
            >
              <IconNote />
              <span class="explorer-row-label">
                {item.file.name.replace(/\.md$/i, '')}
              </span>
            </a>
          ) : (
            <a
              key={item.path}
              href={folderHref(item.path)}
              class="explorer-row"
            >
              <IconFolder />
              <span class="explorer-row-label">
                {item.path.slice(item.path.lastIndexOf('/') + 1)}
              </span>
            </a>
          ),
        )}
      </div>
    </div>
  );
}
