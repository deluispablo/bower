/**
 * The one icon for any item in a list, tile, tree or sheet (issue #905,
 * spec §3.16 R-FILEICON-1 and R-FILEICON-3, canon K-13, G-21, G-22):
 *
 * - anything Bower wrote: the still bird mark (`BowerMark`);
 * - an original: one document glyph for every kind, stroked in its root's
 *   colour (`--color-para-inbox` only while it is in the Inbox);
 * - a subfolder: the folder outline in its root's colour, no fill;
 * - a root: the PARA disc (`FolderMark`);
 * - Answers, Clippings and anything outside the five roots: the outline or
 *   glyph in `--color-text-muted`.
 *
 * Four sizes only: 16 (tree, inline, About lists), 20 (inside the 32 px row
 * box), 28 (file tip), 40 (folder cards). Colours are token names; their
 * values come from `styles/tokens.css`.
 */

import type { JSX } from 'preact';

import { FOLDER_MIME } from '../drive.js';
import type { ItemKindWord } from '../kinds.js';
import { itemKind, kindLabel } from '../meta-line.js';
import type { KindItem } from '../meta-line.js';
import { paraKindOf } from '../navigation.js';
import type { ParaKind } from '../navigation.js';
import { BowerMark } from './bird.js';
import { FolderMark, markSizeFor } from './folder-mark.js';
import { IconDocument, IconFolder } from './icons.js';

import '../styles/file-icon.css';

export type FileIconSize = 16 | 20 | 28 | 40;

/** What FileIcon reads of an item. */
export interface FileIconItem extends KindItem {
  /** Path from the top of the Bower folder: gives the root and whether a
   * folder is a root itself. */
  path?: string;
  /** The item's root, when the caller already knows it (wins over `path`). */
  root?: ParaKind | null;
}

/** Which drawing FileIcon makes, and in which colour. */
export interface FileIconChoice {
  mark: 'bird' | 'glyph' | 'outline' | 'disc';
  kind: ItemKindWord;
  /** The root whose colour tints it; `null`: `--color-text-muted`. */
  root: ParaKind | null;
}

const ROOT_NAMES: Readonly<Record<ParaKind, string>> = {
  inbox: 'Inbox',
  projects: 'Projects',
  areas: 'Areas',
  resources: 'Resources',
  archives: 'Archives',
};

function rootOf(item: FileIconItem): ParaKind | null {
  if (item.root !== undefined) return item.root;
  const top = item.path?.split('/')[0] ?? '';
  return top === '' ? null : paraKindOf(top);
}

/** A folder at the top of the Bower folder. */
function isTopFolder(item: FileIconItem): boolean {
  const path = item.path ?? item.name;
  return !path.includes('/');
}

/** FileIcon's decision, pure (unit-tested in `file-icon.test.tsx`). */
export function fileIconChoice(item: FileIconItem): FileIconChoice {
  const kind = itemKind(item);
  const root = rootOf(item);
  if (item.mimeType === FOLDER_MIME) {
    if (isTopFolder(item)) {
      const own = paraKindOf(item.name);
      if (own !== null) return { mark: 'disc', kind, root: own };
      return { mark: 'outline', kind, root: null };
    }
    return { mark: 'outline', kind, root };
  }
  if (item.bowerWritten === true) return { mark: 'bird', kind, root };
  return { mark: 'glyph', kind, root };
}

/** The accessible name: the kind, and the root when known ("PDF in Areas"). */
export function fileIconLabel(item: FileIconItem): string {
  const { root } = fileIconChoice(item);
  const kind = kindLabel(item);
  return root === null ? kind : `${kind} in ${ROOT_NAMES[root]}`;
}

function tint(root: ParaKind | null): string {
  return root === null
    ? 'var(--color-text-muted)'
    : `var(--color-para-${root})`;
}

export interface FileIconProps {
  item: FileIconItem;
  size: FileIconSize;
  /** Inside the neutral 32 px row box (`--color-surface`, never tinted). */
  box?: boolean;
  /** The text next to the icon does not say the kind: name it
   * ("PDF in Areas"). Otherwise the icon is decorative. */
  labelled?: boolean;
}

/** One item's icon: bird, tinted glyph, outline or disc (see above). */
export function FileIcon({
  item,
  size,
  box = false,
  labelled = false,
}: FileIconProps): JSX.Element {
  const choice = fileIconChoice(item);
  let drawing: JSX.Element;
  if (choice.mark === 'bird') {
    drawing = <BowerMark size={size} />;
  } else if (choice.mark === 'disc' && choice.root !== null) {
    drawing = <FolderMark kind={choice.root} size={markSizeFor(size)} />;
  } else {
    drawing =
      choice.mark === 'outline' ? (
        <IconFolder size={size} />
      ) : (
        <IconDocument size={size} />
      );
  }
  const a11y = labelled
    ? { role: 'img' as const, 'aria-label': fileIconLabel(item) }
    : { 'aria-hidden': 'true' as const };
  const boxStyle: JSX.CSSProperties = box
    ? {
        width: '32px',
        height: '32px',
        borderRadius: 'var(--radius-row, 8px)',
      }
    : {};
  return (
    <span
      class={`file-icon file-icon-${choice.mark}${box ? ' file-icon-box' : ''}`}
      data-mark={choice.mark}
      data-kind={choice.kind}
      data-root={choice.root ?? 'none'}
      data-size={size}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: tint(choice.root),
        ...boxStyle,
      }}
      {...a11y}
    >
      {drawing}
    </span>
  );
}
