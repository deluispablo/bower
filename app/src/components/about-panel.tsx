/**
 * Desktop "About this note" third column (spec §5.2, issue #144): Properties
 * (folder, tags, created, source — issue #307; the same section a phone or
 * tablet gets as a sheet instead, below 1200 px, `note-properties.tsx`),
 * Outline (the rendered note's own headings), Linked mentions (only once
 * `VaultIndex` carries `backlinks`, #150 — it does not yet, so this section
 * never renders today) and In this folder (the note's siblings, current one
 * marked). Filled into the shell through the `aside` slot (`shell-slots.ts`)
 * by `routes/note.tsx`; never rendered directly by `Layout`.
 */

import type { JSX } from 'preact';

import type { DriveFile } from '../drive.js';
import { outlineOf } from '../markdown/frontmatter.js';
import type { NoteProperties } from '../markdown/frontmatter.js';
import { noteTitle } from '../note-title.js';
import { isAppFile } from '../vault-index.js';
import type { VaultIndex } from '../vault-index.js';
import { hasNoteProperties, NotePropertiesList } from './note-properties.js';
import type { NoteFolderLink } from './note-properties.js';
import '../styles/about-panel.css';

function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/**
 * Not on `VaultIndex` yet (#150): guarded so "Linked mentions" stays
 * invisible until a real `backlinks` map exists. No data work here, per the
 * issue — this is only the shape the section expects once it does.
 */
interface IndexWithBacklinks {
  backlinks: Map<string, DriveFile[]>;
}

function backlinksFor(index: VaultIndex, id: string): DriveFile[] | undefined {
  const withBacklinks = index as Partial<IndexWithBacklinks>;
  return withBacklinks.backlinks?.get(id);
}

/** The note's siblings (spec: "In this folder"): every visible note in the
 * same folder, by name, the note itself included. */
function notesInFolder(index: VaultIndex, file: DriveFile): DriveFile[] {
  const folder = folderOf(file.path);
  return index.notes
    .filter(
      (note) =>
        folderOf(note.path) === folder && !isAppFile(note.path, note.name),
    )
    .sort((a, b) => compareNames(a.name, b.name));
}

export interface AboutPanelProps {
  index: VaultIndex;
  file: DriveFile;
  /** The note's rendered, sanitized HTML (`RenderedNote.html`). */
  html: string;
  /** Folder, tags, created, source (issue #307); `properties` is the same
   * object `routes/note.tsx` also hands the phone/tablet sheet. */
  properties: NoteProperties;
  folder?: NoteFolderLink;
}

export function AboutPanel({
  index,
  file,
  html,
  properties,
  folder,
}: AboutPanelProps): JSX.Element {
  const outline = outlineOf(html);
  const backlinks = backlinksFor(index, file.id);
  const siblings = notesInFolder(index, file);

  return (
    <>
      {hasNoteProperties(folder, properties) && (
        <section class="about-section about-properties" aria-label="Properties">
          <h2 class="about-heading">Properties</h2>
          <NotePropertiesList folder={folder} properties={properties} />
        </section>
      )}

      {outline.length > 0 && (
        <section class="about-section" aria-label="Outline">
          <h2 class="about-heading">Outline</h2>
          <nav class="about-outline">
            {outline.map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                class={`about-row about-outline-row about-outline-row-${String(heading.depth)}`}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </section>
      )}

      {backlinks !== undefined && backlinks.length > 0 && (
        <section class="about-section" aria-label="Linked mentions">
          <h2 class="about-heading">Linked mentions</h2>
          <nav class="about-links">
            {backlinks.map((note) => (
              <a
                key={note.id}
                href={`/note/${note.id}`}
                class="about-row about-link-row"
              >
                {noteTitle(note)}
              </a>
            ))}
          </nav>
        </section>
      )}

      {siblings.length > 0 && (
        <section class="about-section" aria-label="In this folder">
          <h2 class="about-heading">In this folder</h2>
          <nav class="about-folder">
            {siblings.map((note) => (
              <a
                key={note.id}
                href={`/note/${note.id}`}
                class="about-row about-folder-row"
                aria-current={note.id === file.id ? 'page' : undefined}
              >
                {noteTitle(note)}
              </a>
            ))}
          </nav>
        </section>
      )}
    </>
  );
}
