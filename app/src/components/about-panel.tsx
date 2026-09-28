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
import { kindById, keyFactsFor, statusLabel } from '../kinds.js';
import { outlineOf } from '../markdown/frontmatter.js';
import type { NoteProperties } from '../markdown/frontmatter.js';
import { extensionOf } from '../markdown/embeds.js';
import type { NoteMeta } from '../note-meta.js';
import { noteTitle } from '../note-title.js';
import { isAppFile } from '../vault-index.js';
import type { VaultIndex } from '../vault-index.js';
import { Bird } from './bird.js';
import { detailsGroups, humaniseKey } from './details.js';
import { KeyFacts } from './key-facts.js';
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

/**
 * The file a note was made from (`original` in its frontmatter): next to the
 * note first, then by path, then by name anywhere in the Bower folder.
 * `undefined` when the note names none or it is not in the index.
 */
export function originalFileOf(
  index: VaultIndex,
  file: DriveFile,
  original: string | undefined,
): DriveFile | undefined {
  if (original === undefined) return undefined;
  const name = original
    .replace(/^\[\[|\]\]$/g, '')
    .split('|')[0]
    ?.trim();
  if (name === undefined || name === '') return undefined;
  const folder = folderOf(file.path);
  const beside = folder === '' ? name : `${folder}/${name}`;
  return (
    index.byPath.get(beside) ??
    index.byPath.get(name) ??
    index.files.find((candidate) => candidate.name === name)
  );
}

/** "PDF, 2 pages": the original's format and its page count. */
export function originalSummary(meta: NoteMeta): string {
  const extension = extensionOf(meta.original ?? '').toUpperCase();
  const parts: string[] = [];
  if (extension !== '') parts.push(extension);
  if (meta.pages !== undefined) {
    parts.push(`${String(meta.pages)} ${meta.pages === 1 ? 'page' : 'pages'}`);
  }
  return parts.join(', ');
}

/** The anchors of the sections Bower wrote a note under (the contents
 * strip marks them), without the sanitizer's id prefix. */
function notedAnchors(html: string): Set<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchors = new Set<string>();
  for (const link of doc.querySelectorAll('a.bower-contents-noted')) {
    const href = link.getAttribute('href') ?? '';
    anchors.add(href.replace(/^#(?:user-content-)?/, ''));
  }
  return anchors;
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
  /** The note's frontmatter facts: a known kind adds "Key facts" and the
   * compact Details list; `original` adds "Original" (board
   * `Desktop-Note-Details`). */
  meta?: NoteMeta;
}

export function AboutPanel({
  index,
  file,
  html,
  properties,
  folder,
  meta,
}: AboutPanelProps): JSX.Element {
  const kind = meta?.kind === undefined ? undefined : kindById(meta.kind);
  const facts =
    kind === undefined || meta === undefined
      ? []
      : keyFactsFor(kind, meta.fields);
  const original =
    meta === undefined ? undefined : originalFileOf(index, file, meta.original);
  const summary = meta === undefined ? '' : originalSummary(meta);
  const noted = notedAnchors(html);
  const outline = outlineOf(html);
  const backlinks = backlinksFor(index, file.id);
  const siblings = notesInFolder(index, file);

  return (
    <>
      {kind !== undefined && meta !== undefined && (
        <AboutKind kind={kind} meta={meta} facts={facts} />
      )}

      {meta?.original !== undefined && (
        <section class="about-section" aria-label="Original">
          <h2 class="about-heading">Original</h2>
          {original === undefined ? (
            <span class="about-row">{summary || meta.original}</span>
          ) : (
            <a href={`/file/${original.id}`} class="about-row about-original">
              {summary === '' ? original.name : summary}
            </a>
          )}
        </section>
      )}

      {kind === undefined && hasNoteProperties(folder, properties) && (
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
                {noted.has(heading.id.replace(/^user-content-/, '')) && (
                  <span
                    class="about-outline-bird"
                    title="Bower on this section"
                  >
                    <Bird state="idle" size={14} reducedMotion />
                  </span>
                )}
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

/** "Key facts · rental listing", the compact Details list, the fields the
 * document did not state (board `Desktop-Note-Details`). */
function AboutKind({
  kind,
  meta,
  facts,
}: {
  kind: NonNullable<ReturnType<typeof kindById>>;
  meta: NoteMeta;
  facts: ReturnType<typeof keyFactsFor>;
}): JSX.Element {
  const shown = new Set(kind.keyFacts);
  const rows = detailsGroups(kind, meta)
    .flatMap((group) => group.rows)
    .filter((row) => !shown.has(row.key));
  const status = statusLabel(kind, meta.fields);
  return (
    <>
      {facts.length > 0 && (
        <section class="about-section" aria-label="Key facts">
          <h2 class="about-heading">{`Key facts · ${kind.name}`}</h2>
          <KeyFacts facts={facts} />
        </section>
      )}
      {(rows.length > 0 || status !== '' || meta.not_stated.length > 0) && (
        <section class="about-section" aria-label="Details">
          <h2 class="about-heading">Details</h2>
          <dl class="about-details">
            {rows.map((row) => (
              <div class="about-detail" key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
            {status !== '' && (
              <div class="about-detail">
                <dt>Status</dt>
                <dd>{status}</dd>
              </div>
            )}
          </dl>
          {meta.not_stated.length > 0 && (
            <p class="about-not-stated">
              {`${kind.notStatedLabel}: ${meta.not_stated
                .map((key) =>
                  (
                    kind.fields.find((field) => field.key === key)?.label ??
                    humaniseKey(key)
                  ).toLowerCase(),
                )
                .join(', ')}`}
            </p>
          )}
        </section>
      )}
    </>
  );
}
