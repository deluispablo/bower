/**
 * A note's properties (folder, tags, created, source; issue #307, spec §6
 * row Note, Part E 18.4): out of the reading flow and into "About this
 * note", the third column from 1200 px (`about-panel.tsx`, `AboutPanel`'s
 * "Properties" section). Below that the note screen's own props line says
 * the same (#609). `NotePropertiesList` is the content.
 */

import type { JSX } from 'preact';

import type { NoteProperties } from '../markdown/frontmatter.js';
import { kindById } from '../kinds.js';
import type { NoteMeta } from '../note-meta.js';
import { Details } from './details.js';
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
