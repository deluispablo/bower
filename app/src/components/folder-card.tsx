/**
 * The folder card of a folder of folders (issue #908, spec §3.19 R-FCARD-1
 * and R-FCARD-2, boards AR-Main-375 and AR-Main-1280): the folder outline
 * 40 in its root's colour, the name, "<n> things · updated <when>" with a
 * "<n> new" Badge, and up to three of the first things inside as "title ·
 * kind" (title and kind only, G-18). Select and open as `ListRow`: with
 * `onSelect` one click selects and a double click or Enter opens.
 */

import type { JSX } from 'preact';
import { useId } from 'preact/hooks';

import { FOLDER_MIME } from '../drive.js';
import { dayWords, kindLabel } from '../meta-line.js';
import type { DateInput } from '../meta-line.js';
import { Badge } from './badge.js';
import { FileIcon } from './file-icon.js';
import type { FileIconItem } from './file-icon.js';
import { IconChevronRight } from './icons.js';
import { follow, selectionKeys } from './list-row.js';

import '../styles/folder-card.css';

/** A thing inside the folder, as its card lists it. */
export interface FolderCardItem extends FileIconItem {
  id: string;
  title: string;
}

export interface FolderCardFolder {
  /** Path from the top of the Bower folder (gives the root colour). */
  path: string;
  name: string;
  href: string;
  /** Things inside, subfolders included. */
  things: number;
  /** Newest change inside, ISO. */
  updated?: string;
}

export interface FolderCardProps {
  folder: FolderCardFolder;
  /** The first things inside; only three are shown. */
  items: readonly FolderCardItem[];
  /** How many things inside are new; 0 shows no Badge. */
  newCount?: number;
  now: DateInput;
  selected?: boolean;
  onSelect?: () => void;
  onOpen?: () => void;
}

/** "2 things · updated today", "1 thing", "Nothing here yet". */
export function folderCardMeta(
  things: number,
  updated: string | undefined,
  now: DateInput,
): string {
  const count = `${String(things)} ${things === 1 ? 'thing' : 'things'}`;
  const when = updated === undefined ? '' : dayWords(updated, now);
  return when === '' ? count : `${count} · updated ${when}`;
}

export function FolderCard({
  folder,
  items,
  newCount = 0,
  now,
  selected = false,
  onSelect,
  onOpen,
}: FolderCardProps): JSX.Element {
  const nameId = useId();
  const metaId = useId();
  const open = onOpen ?? ((): void => follow(folder.href));
  const shown = items.slice(0, 3);
  const icon: FileIconItem = {
    name: folder.name,
    mimeType: FOLDER_MIME,
    path: folder.path,
  };
  return (
    <a
      class={`folder-card${selected ? ' is-selected' : ''}`}
      href={folder.href}
      data-row-key={folder.path}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      aria-labelledby={nameId}
      aria-describedby={metaId}
      onClick={(event: MouseEvent) => {
        if (onSelect === undefined) return;
        event.preventDefault();
        onSelect();
      }}
      onDblClick={(event: MouseEvent) => {
        if (onSelect === undefined) return;
        event.preventDefault();
        open();
      }}
      onFocus={() => onSelect?.()}
      onKeyDown={(event: KeyboardEvent) => {
        selectionKeys(
          event,
          '.folder-card',
          1,
          onSelect === undefined ? onOpen : open,
        );
      }}
    >
      <FileIcon item={icon} size={40} />
      <span class="folder-card-text">
        <span class="folder-card-name" id={nameId}>
          {folder.name}
        </span>
        <span class="folder-card-meta" id={metaId}>
          {folder.things === 0
            ? 'Nothing here yet'
            : folderCardMeta(folder.things, folder.updated, now)}
          {newCount > 0 && (
            <Badge tone="new">{`${String(newCount)} new`}</Badge>
          )}
        </span>
        {shown.length > 0 && (
          <span class="folder-card-items">
            {shown.map((item) => (
              <span class="folder-card-item" key={item.id}>
                <FileIcon item={item} size={16} />
                <span class="folder-card-item-title">{item.title}</span>
                <span class="folder-card-item-kind">
                  {` · ${kindLabel(item)}`}
                </span>
              </span>
            ))}
          </span>
        )}
      </span>
      <span class="folder-card-chevron" aria-hidden="true">
        <IconChevronRight />
      </span>
    </a>
  );
}
