/**
 * The property rows of About this note and About this file (spec §3.28,
 * boards NO-About and FI-About): a label in muted text, then the value.
 * A row whose value is missing is left out, never "undefined". The same
 * rows sit in the desktop column and in the phone sheet (`about-panel.tsx`).
 */

import type { ComponentChildren, JSX } from 'preact';

import { kindById } from '../kinds.js';
import { writtenWords } from '../meta-line.js';
import type { NoteProperties } from '../markdown/frontmatter.js';
import type { NoteMeta } from '../note-meta.js';
import { showToast } from '../toast-store.js';
import '../styles/note-properties.css';

/** Why Open in Drive does nothing in the demo (the folder page's words). */
const NOT_IN_DEMO_DRIVE = 'Not in the demo. Run your own Bower to use it.';

export interface NoteFolderLink {
  name: string;
  href: string;
}

/** Whether there is anything to show at all: a folder link, tags, a
 * created date or a source. */
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

/** Whether the note's frontmatter names a kind Bower knows. */
export function hasKindDetails(meta: NoteMeta | undefined): boolean {
  return meta?.kind !== undefined && kindById(meta.kind) !== undefined;
}

/** The file a note was made from, as About's Source row shows it: its
 * name without brackets or extension, a link when it is in the folder,
 * and its kind in words ("Word"). */
export interface AboutSource {
  name: string;
  href?: string;
  kind?: string;
}

/** The tag search a tag opens (#917's route): `/search?q=%23tag`. */
export function tagHref(tag: string): string {
  return `/search?q=${encodeURIComponent(`#${tag}`)}`;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <div class="about-prop">
      <dt class="about-prop-label">{label}</dt>
      <dd class="about-prop-value">{children}</dd>
    </div>
  );
}

export interface NotePropertiesListProps {
  folder?: NoteFolderLink | undefined;
  properties: NoteProperties;
  /** Who wrote it: "Bower" or "you"; left out, the date stands alone. */
  writtenBy?: 'Bower' | 'you' | undefined;
  source?: AboutSource | undefined;
}

/** A note's rows: Folder, Written, Source, Tags (NO-About-375). */
export function NotePropertiesList({
  folder,
  properties,
  writtenBy,
  source,
}: NotePropertiesListProps): JSX.Element {
  const day =
    properties.created === undefined
      ? undefined
      : writtenWords(properties.created, Date.now());
  return (
    <dl class="about-props">
      {folder !== undefined && (
        <Row label="Folder">
          <a href={folder.href}>{folder.name}</a>
        </Row>
      )}
      {day !== undefined && (
        <Row label="Written">
          {writtenBy === undefined ? day : `${day}, by ${writtenBy}`}
        </Row>
      )}
      {source !== undefined && source.name !== '' && (
        <Row label="Source">
          {source.href === undefined ? (
            source.name
          ) : (
            <a href={source.href}>{source.name}</a>
          )}
          {source.kind !== undefined && (
            <span class="about-prop-kind">{` ${source.kind}`}</span>
          )}
        </Row>
      )}
      {properties.tags.length > 0 && (
        <Row label="Tags">
          {properties.tags.map((tag, at) => (
            <span key={tag}>
              {at > 0 && ' '}
              <a class="about-prop-tag" href={tagHref(tag)}>
                #{tag}
              </a>
            </span>
          ))}
        </Row>
      )}
    </dl>
  );
}

export interface FilePropertiesListProps {
  folder?: NoteFolderLink | undefined;
  /** "PDF, 117 KB". */
  kind: string;
  /** "yesterday, by Bower, as it is" (`file-origin.ts#filedBy().about`). */
  filed: string;
  /** The file in Drive; `null` (the demo) shows the words without a link. */
  driveHref: string | null;
}

/** A file's rows: Folder, Kind, Filed, In Drive (FI-About-375). */
export function FilePropertiesList({
  folder,
  kind,
  filed,
  driveHref,
}: FilePropertiesListProps): JSX.Element {
  return (
    <dl class="about-props">
      {folder !== undefined && (
        <Row label="Folder">
          <a href={folder.href}>{folder.name}</a>
        </Row>
      )}
      {kind !== '' && <Row label="Kind">{kind}</Row>}
      {filed !== '' && <Row label="Filed">{filed}</Row>}
      <Row label="In Drive">
        {driveHref === null ? (
          // The demo has no Drive: the same text link (FI-Main-1280),
          // which says why instead of opening anything.
          <button
            type="button"
            class="about-prop-drive"
            onClick={() => {
              showToast(NOT_IN_DEMO_DRIVE);
            }}
          >
            Open in Drive
          </button>
        ) : (
          <a href={driveHref} target="_blank" rel="noopener">
            Open in Drive
          </a>
        )}
      </Row>
    </dl>
  );
}
