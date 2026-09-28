/**
 * The marks of v4 (spec §5, board `System-Folders`): the five folders wear a
 * solid disc (letter, or the tray for Inbox), folders inside Projects and
 * friends tint their outline icon, and Bower's note lines get a tinted square
 * (never a disc, so a line never reads as a folder). Colour comes from the
 * `--color-para-*` and `--color-origin-*` tokens; every mark is decoration
 * (`aria-hidden`) because the name beside it says the same thing.
 */

import type { ComponentChildren, JSX } from 'preact';

import { IconFolder, IconInbox } from './icons.js';

import '../styles/marks.css';

export type ParaKind =
  | 'inbox'
  | 'projects'
  | 'areas'
  | 'resources'
  | 'archives';

export type OriginKind = 'file' | 'notes' | 'web' | 'you';

export type MarkSize = 18 | 28 | 40;

const LETTERS: Record<Exclude<ParaKind, 'inbox'>, string> = {
  projects: 'P',
  areas: 'A',
  resources: 'R',
  archives: 'A',
};

export function FolderMark({
  kind,
  size,
}: {
  kind: ParaKind;
  size: MarkSize;
}): JSX.Element {
  return (
    <span
      class={`folder-mark folder-mark-${kind} folder-mark-${size}`}
      data-kind={kind}
      aria-hidden="true"
    >
      {kind === 'inbox' ? <IconInbox /> : LETTERS[kind]}
    </span>
  );
}

/** An outline folder: the colour of its top folder, grey when `tint` is absent. */
export function FolderIcon({ tint }: { tint?: ParaKind }): JSX.Element {
  return (
    <span
      class={`folder-icon${tint === undefined ? '' : ` folder-icon-${tint}`}`}
      data-tint={tint}
      aria-hidden="true"
    >
      <IconFolder />
    </span>
  );
}

function OriginSvg({ children }: { children: ComponentChildren }): JSX.Element {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
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

const ORIGIN_ICONS: Record<OriginKind, () => JSX.Element> = {
  file: () => (
    <OriginSvg>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </OriginSvg>
  ),
  notes: () => (
    <OriginSvg>
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M8 12h8M8 16h5" />
    </OriginSvg>
  ),
  web: () => (
    <OriginSvg>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" />
    </OriginSvg>
  ),
  you: () => (
    <OriginSvg>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-4 4-6 7-6s6 2 7 6" />
    </OriginSvg>
  ),
};

/** Where a line of Bower's note comes from: a tinted square with its icon. */
export function OriginSquare({ origin }: { origin: OriginKind }): JSX.Element {
  const Icon = ORIGIN_ICONS[origin];
  return (
    <span
      class={`origin-square origin-square-${origin}`}
      data-origin={origin}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
