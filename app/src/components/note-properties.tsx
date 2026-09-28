/**
 * A note's properties (folder, tags, created, source; issue #307, spec §6
 * row Note, Part E 18.4): out of the reading flow and into "About this
 * note" — the existing third column from 1200 px (`about-panel.tsx`,
 * `AboutPanel`'s "Properties" section), a bottom sheet below that, opened
 * from a small trigger row `routes/note.tsx` renders next to the title.
 * `NotePropertiesList` is the shared content, so the panel and the sheet
 * never drift apart.
 */

import { useRef } from 'preact/hooks';
import type { JSX } from 'preact';

import type { NoteProperties } from '../markdown/frontmatter.js';
import { kindById } from '../kinds.js';
import type { NoteMeta } from '../note-meta.js';
import { Details } from './details.js';
import { IconClose } from './icons.js';
import { useFocusTrap } from './use-focus-trap.js';
import '../styles/note-properties.css';

export interface NoteFolderLink {
  name: string;
  href: string;
}

/** Whether there is anything to show at all: a folder link, tags, a
 * created date or a source. `false` means neither the panel section nor
 * the sheet's trigger should render. */
export function hasNoteProperties(
  folder: NoteFolderLink | undefined,
  properties: NoteProperties,
  meta?: NoteMeta,
): boolean {
  return (
    hasKindDetails(meta) ||
    folder !== undefined ||
    properties.tags.length > 0 ||
    properties.created !== undefined ||
    properties.source !== undefined
  );
}

/** Whether the note's frontmatter names a kind Bower knows: those notes
 * get `Details` (#603); every other note keeps the plain list. */
export function hasKindDetails(meta: NoteMeta | undefined): boolean {
  return meta?.kind !== undefined && kindById(meta.kind) !== undefined;
}

export interface NotePropertiesListProps {
  folder?: NoteFolderLink;
  properties: NoteProperties;
  /** The note's frontmatter facts; a known kind adds the Details block. */
  meta?: NoteMeta;
}

/** The properties themselves: a folder link, tag pills, created, source —
 * each shown only when present. Shared between the About panel's
 * "Properties" section and the sheet below 1200 px. */
export function NotePropertiesList({
  folder,
  properties,
  meta,
}: NotePropertiesListProps): JSX.Element {
  const kind = meta?.kind === undefined ? undefined : kindById(meta.kind);
  return (
    <div class="note-properties-list">
      {folder !== undefined && (
        <a class="note-property note-property-folder" href={folder.href}>
          <span class="note-property-label">Folder</span>
          {folder.name}
        </a>
      )}
      {properties.tags.length > 0 && (
        <ul class="tags note-property-tags">
          {properties.tags.map((tag) => (
            <li key={tag}>
              <a
                class="tag"
                href={`/search?q=${encodeURIComponent(`#${tag}`)}`}
              >
                #{tag}
              </a>
            </li>
          ))}
        </ul>
      )}
      {properties.created !== undefined && (
        <span class="note-property">
          <span class="note-property-label">Created</span>
          {properties.created}
        </span>
      )}
      {properties.source !== undefined && (
        <span class="note-property">
          <span class="note-property-label">Source</span>
          {properties.source}
        </span>
      )}
      {kind !== undefined && meta !== undefined && (
        <Details kind={kind} meta={meta} />
      )}
    </div>
  );
}

export interface NotePropertiesTriggerProps {
  onClick: () => void;
}

/** The row that opens the sheet below 1200 px (CSS hides it from there up,
 * `note-properties.css`, next to `AboutPanel`'s own breakpoint). */
export function NotePropertiesTrigger({
  onClick,
}: NotePropertiesTriggerProps): JSX.Element {
  return (
    <button type="button" class="note-properties-trigger" onClick={onClick}>
      Properties
    </button>
  );
}

export interface NotePropertiesSheetProps extends NotePropertiesListProps {
  onClose: () => void;
}

/** The bottom sheet a phone or tablet opens from `NotePropertiesTrigger`
 * (issue #307, Part E 18.4: "a sheet below" 1200 px). Same dialog pattern as
 * `pin-sheet.tsx` and `note-menu.tsx`: a backdrop, a focus-trapped panel,
 * Escape and a backdrop tap close it. */
export function NotePropertiesSheet({
  folder,
  properties,
  onClose,
}: NotePropertiesSheetProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);

  return (
    <div class="note-properties-sheet">
      <div
        class="note-properties-sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        class="note-properties-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Properties"
        tabIndex={-1}
      >
        <div class="note-properties-sheet-header">
          <h2 class="note-properties-sheet-title">Properties</h2>
          <button
            type="button"
            class="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        <NotePropertiesList folder={folder} properties={properties} />
      </div>
    </div>
  );
}
