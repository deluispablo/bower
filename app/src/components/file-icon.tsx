/**
 * The one icon for any item in a list, tile, tree or sheet (issue #905,
 * spec §3.16 R-FILEICON-1 and R-FILEICON-3, canon K-13, G-21, G-22):
 *
 * - anything Bower wrote: the still bird mark (`BowerMark`);
 * - an original: its kind's file glyph, stroked in its root's colour
 *   (`--color-para-inbox` only while it is in the Inbox);
 * - a subfolder: the folder outline in its root's colour, no fill;
 * - a root: the PARA disc (`FolderMark`);
 * - Answers, Clippings and anything outside the five roots: the outline or
 *   glyph in `--color-text-muted`.
 *
 * Four sizes only: 16 (tree, inline, About lists), 20 (inside the 32 px row
 * box), 28 (file tip), 40 (folder cards). Colours are token names; their
 * values come from `styles/tokens.css`.
 */

import type { ComponentChildren, JSX } from 'preact';

import { FOLDER_MIME } from '../drive.js';
import type { ItemKindWord } from '../kinds.js';
import { itemKind, kindLabel } from '../meta-line.js';
import type { KindItem } from '../meta-line.js';
import { paraKindOf } from '../navigation.js';
import type { ParaKind } from '../navigation.js';
import { BowerMark } from './bird.js';
import { FolderMark, markSizeFor } from './folder-mark.js';

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

function Glyph({
  size,
  children,
}: {
  size: FileIconSize;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const PAGE = (
  <>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  </>
);

/** The glyph for each kind; a subfolder uses `folder`. */
const GLYPHS: Readonly<Record<ItemKindWord, () => JSX.Element>> = {
  folder: () => (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  note: () => (
    <>
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M8 12h8M8 16h5" />
    </>
  ),
  'bower-note': () => GLYPHS.note(),
  'bower-answer': () => GLYPHS.note(),
  pdf: () => (
    <>
      {PAGE}
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  word: () => (
    <>
      {PAGE}
      <path d="M8.5 12l1.5 5 2-4 2 4 1.5-5" />
    </>
  ),
  spreadsheet: () => (
    <>
      {PAGE}
      <path d="M8.5 11h7v7h-7zM8.5 14.5h7M12 11v7" />
    </>
  ),
  photo: () => (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-5-8 8" />
    </>
  ),
  link: () => (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  file: () => PAGE,
};

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
    const Draw = GLYPHS[choice.mark === 'outline' ? 'folder' : choice.kind];
    drawing = (
      <Glyph size={size}>
        <Draw />
      </Glyph>
    );
  }
  const a11y = labelled
    ? { role: 'img' as const, 'aria-label': fileIconLabel(item) }
    : { 'aria-hidden': 'true' as const };
  const boxStyle: JSX.CSSProperties = box
    ? {
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        background: 'var(--color-surface)',
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
