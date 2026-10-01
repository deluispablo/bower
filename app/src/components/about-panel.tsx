/**
 * About this note / About this file (spec §3.28, R-ABOUT-1..3, boards
 * NO-About-375/1280, FI-About-375, FI-Main-1280): the properties, the
 * note's OUTLINE, and IN THIS FOLDER, every sibling in tree order with its
 * FileIcon, the one on show selected. From 1200 px it is the right-hand
 * column (the shell's `aside` slot, filled by `routes/note.tsx` and
 * `routes/file.tsx`); below that the (i) opens the same content as a sheet
 * (`openAbout`).
 */

import type { JSX } from 'preact';

import { originalDisplayName, resolveOriginal } from '../companion.js';
import type { DriveFile } from '../drive.js';
import { outlineOf } from '../markdown/frontmatter.js';
import type { NoteProperties } from '../markdown/frontmatter.js';
import { kindLabel } from '../meta-line.js';
import type { NoteMeta } from '../note-meta.js';
import { isBowerWritten } from '../bower-written.js';
import { close, open, OVERLAY_PRIORITY } from '../overlay-queue.js';
import { fileTitle } from '../vault-index.js';
import type { VaultIndex } from '../vault-index.js';
import { FileIcon } from './file-icon.js';
import { FilePropertiesList, NotePropertiesList } from './note-properties.js';
import type {
  AboutSource,
  FilePropertiesListProps,
  NoteFolderLink,
} from './note-properties.js';
import { Overlay, OverlayHeader } from './overlay.js';
import { itemHref, itemTitle } from './pager.js';
import { useBowerWritten } from './tree.js';
import { useNoteTitles } from './use-note-titles.js';
import '../styles/about-panel.css';

/**
 * The file a note was made from (`original` in its frontmatter), by the
 * folder screen's own rule (`resolveOriginal`, R-NOTE-3). `undefined` when
 * the note names none or it is not in the index.
 */
export function originalFileOf(
  index: VaultIndex,
  file: DriveFile,
  original: string | undefined,
): DriveFile | undefined {
  return resolveOriginal(file, original, index);
}

/** A value with its `[[wikilinks]]` read as the names they point to, so the
 * panel never shows raw brackets (R-ABOUT-3): `[[A/B.pdf|the CV]]` becomes
 * "the CV", `[[A/B.pdf]]` becomes "B.pdf". */
export function plainNames(value: string): string {
  return value.replace(/\[\[([^\]]*)\]\]/g, (_match, inner: string) => {
    const [target = '', alias] = inner.split('|');
    const shown = alias?.trim();
    if (shown !== undefined && shown !== '') return shown;
    return originalDisplayName(`[[${target}]]`) || target.trim();
  });
}

/**
 * About's Source row (R-ABOUT-3, N-2): the file the note was made from by
 * its name, without brackets or extension, a link when it is in the folder,
 * with its kind in words ("CV Australia · Word"). Falls back to the
 * frontmatter `source` as plain words; `undefined` when there is neither.
 */
export function aboutSource(
  index: VaultIndex,
  file: DriveFile,
  meta: NoteMeta | undefined,
  source: string | undefined,
): AboutSource | undefined {
  const original =
    meta === undefined ? undefined : originalFileOf(index, file, meta.original);
  if (original !== undefined) {
    return {
      name: fileTitle(original.name),
      href: itemHref(original),
      kind: kindLabel(original),
    };
  }
  const named = meta?.original ?? source;
  if (named === undefined || named.trim() === '') return undefined;
  const shown = plainNames(named).trim();
  if (/^https?:\/\//i.test(shown)) return { name: shown, href: shown };
  return { name: fileTitle(shown) };
}

interface NoteAbout {
  kind: 'note';
  /** The note's rendered, sanitized HTML (`RenderedNote.html`). */
  html: string;
  properties: NoteProperties;
  meta?: NoteMeta | undefined;
}

interface FileAbout {
  kind: 'file';
  rows: Omit<FilePropertiesListProps, 'folder'>;
}

export type AboutPanelProps = (NoteAbout | FileAbout) & {
  index: VaultIndex;
  file: DriveFile;
  folder?: NoteFolderLink | undefined;
  /** The siblings in tree order (`siblings()`), the pager's own list. */
  items: readonly DriveFile[];
  /** In the phone sheet: no overline, the sheet's title says it. */
  inSheet?: boolean;
};

/** "About this note" / "About this file". */
export function aboutTitle(kind: 'note' | 'file'): string {
  return kind === 'note' ? 'About this note' : 'About this file';
}

function InThisFolder({
  file,
  items,
}: {
  file: DriveFile;
  items: readonly DriveFile[];
}): JSX.Element | null {
  const titles = useNoteTitles(items);
  const bowerIds = useBowerWritten(items);
  if (items.length === 0) return null;
  return (
    <section class="about-section" aria-label="In this folder">
      <h3 class="about-heading">In this folder</h3>
      <nav class="about-folder">
        {items.map((item) => (
          <a
            key={item.id}
            href={itemHref(item)}
            class="about-row about-folder-row"
            aria-current={item.id === file.id ? 'page' : undefined}
          >
            <FileIcon
              item={{ ...item, bowerWritten: bowerIds.has(item.id) }}
              size={16}
            />
            <span class="about-folder-name">{itemTitle(item, titles)}</span>
          </a>
        ))}
      </nav>
    </section>
  );
}

export function AboutPanel(props: AboutPanelProps): JSX.Element {
  const { index, file, folder, items, inSheet = false } = props;
  const title = aboutTitle(props.kind);
  const outline = props.kind === 'note' ? outlineOf(props.html) : [];
  return (
    <div class={`about-panel${inSheet ? ' about-panel-sheet' : ''}`}>
      <section class="about-section about-properties" aria-label={title}>
        {!inSheet && <h2 class="about-heading">{title}</h2>}
        {props.kind === 'note' ? (
          <NotePropertiesList
            folder={folder}
            properties={props.properties}
            writtenBy={
              props.meta === undefined
                ? undefined
                : isBowerWritten(props.meta, file)
                  ? 'Bower'
                  : 'you'
            }
            source={aboutSource(
              index,
              file,
              props.meta,
              props.properties.source,
            )}
          />
        ) : (
          <FilePropertiesList folder={folder} {...props.rows} />
        )}
      </section>

      {outline.length > 0 && (
        <section class="about-section" aria-label="Outline">
          <h3 class="about-heading">Outline</h3>
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

      <InThisFolder file={file} items={items} />
    </div>
  );
}

const ABOUT_ID = 'about';

/** Opens About this note or file as a content sheet (phone and below
 * 1200 px, K-7): the same content as the column, under a title and ✕. */
export function openAbout(props: AboutPanelProps): void {
  const title = aboutTitle(props.kind);
  const onClose = (): void => close(ABOUT_ID);
  open({
    id: ABOUT_ID,
    priority: OVERLAY_PRIORITY.own,
    render: () => (
      <Overlay kind="sheet" labelledBy="about-title" onClose={onClose}>
        <div class="overlay-body about-sheet">
          <OverlayHeader
            titleId="about-title"
            title={title}
            closeLabel={
              props.kind === 'note'
                ? 'Close About this note'
                : 'Close About this file'
            }
            onClose={onClose}
          />
          {/* Following a link leaves the sheet behind. */}
          <div
            onClick={(event) => {
              const target = event.target;
              if (target instanceof Element && target.closest('a') !== null) {
                onClose();
              }
            }}
          >
            <AboutPanel {...props} inSheet />
          </div>
        </div>
      </Overlay>
    ),
  });
}

/** Closes the About sheet (leaving the page, or the column took over). */
export function closeAbout(): void {
  close(ABOUT_ID);
}
