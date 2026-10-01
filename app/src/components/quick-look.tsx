/**
 * Quick look (issue #613, spec §6.5 R-FOLDER-8, board
 * `Phone-Folder-QuickLook`): holding a row or tile of a folder opens a
 * bottom sheet with a preview, the title, kind and size, the path, who filed
 * it and when, Open and Open in Drive. From 900 px it is a centred card; on
 * the desktop Space opens it too, and #614 places it in the right pane.
 *
 * An `Overlay` dialog on the queue (R-OVL-2): inert page behind, focus
 * trap, closed by Escape, a swipe down on its handle or the scrim (guarded
 * like the pin sheet's, #510).
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { isDemo } from '../api.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import { FOLDER_MIME } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { formatSize } from '../file-preview.js';
import { filedBy } from '../file-origin.js';
import type { Origin } from '../file-origin.js';
import { whenWords } from '../folder-view.js';
import { renderNote } from '../markdown/render.js';
import type { RenderedNote } from '../markdown/render.js';
import { metaLine, shortDate } from '../meta-line.js';
import type { MetaItem } from '../meta-line.js';
import { showToast } from '../toast-store.js';
import { ITEM_KIND_WORDS } from '../kinds.js';
import { useVault } from '../vault-store.js';
import { FILE_KIND_LABELS } from '../vault-index.js';
import type { FileKind } from '../vault-index.js';
import {
  displayName,
  driveFileUrl,
  driveFolderUrl,
  paraKindOf,
} from '../navigation.js';
import { Badge } from './badge.js';
import { BowerNoteBox, splitOpening } from './bower-note-box.js';
import { FileIcon } from './file-icon.js';
import { folderCardMeta } from './folder-card.js';
import { FolderMark } from './folder-mark.js';
import { Thumb, NoteLines } from './folder-grid.js';
import { IconDoc, IconImage, IconNote, IconPanel, IconPdf } from './icons.js';
import { ListRow } from './list-row.js';
import { NoteBody } from './note-body.js';
import { TablePreview, parseCsv } from './table-preview.js';
import { Overlay } from './overlay.js';
import { Queued } from './queued-overlay.js';
import '../styles/quick-look.css';

/** The demo's fixture ids are not real Drive ids (as on the folder chip). */
export const NOT_IN_DEMO_DRIVE =
  'Not in the demo. Run your own Bower to use it.';

/** How far a swipe down on the handle must go to close the sheet. */
const SWIPE_CLOSE_PX = 70;

/** "PDF · 6 pages · 340 KB": the kind, then the pages and the size when
 * they are known. */
export function kindLine(
  kind: FileKind,
  pages: number | undefined,
  size: number | undefined,
  answer = false,
): string {
  // A Bower answer reads as the list and the note call it (R-LI-2, K-14).
  const parts: string[] = [
    answer ? ITEM_KIND_WORDS['bower-answer'] : FILE_KIND_LABELS[kind],
  ];
  if (pages !== undefined && pages > 0) {
    parts.push(`${pages} ${pages === 1 ? 'page' : 'pages'}`);
  }
  if (size !== undefined) parts.push(formatSize(size));
  return parts.join(' · ');
}

/** "Filed by Bower yesterday", or the person's own version of it. `null`
 * when the file has no date. `bower` is `isBowerWritten` for the row's
 * note: `false` with no known origin means the person's own file, so it
 * never reads "Filed by Bower". Left out, the old default holds. */
export function filedLine(
  origin: Origin | null,
  modified: string | undefined,
  now: number,
  bower?: boolean,
): string | null {
  if (modified === undefined || modified === '') return null;
  const when = whenWords(modified, now);
  if (origin === null && bower === false) return `Added by you ${when}`;
  switch (origin) {
    case 'yours':
      return `Added by you ${when}`;
    case 'drive':
      return `Copied from your Drive ${when}`;
    case 'asked':
      return `Answered by Bower ${when}`;
    default:
      return `Filed by Bower ${when}`;
  }
}

function previewIcon(kind: FileKind): JSX.Element {
  if (kind === 'note') return <IconNote />;
  if (kind === 'pdf') return <IconPdf />;
  if (kind === 'photo' || kind === 'heic' || kind === 'image') {
    return <IconImage />;
  }
  return <IconDoc />;
}

export interface QuickLookProps {
  /** The title the row shows. */
  title: string;
  /** What Open opens: the note for a pair, else the file. */
  href: string;
  /** The row's own file: the note for a pair. */
  file: DriveFile;
  /** The original a note is about, when it is in the folder. */
  original?: DriveFile | undefined;
  /** The kind the badge shows: the original's for a pair. */
  kind: FileKind;
  /** The page count a companion note recorded. */
  pages?: number | undefined;
  origin: Origin | null;
  /** `isBowerWritten` for the row, when the folder knows it. */
  bower?: boolean | undefined;
  /** The row's own file is a Bower answer (`type: answer`). */
  answer?: boolean | undefined;
  folderPath: string;
  now: number;
  onClose: () => void;
}

export function QuickLook({
  title,
  href,
  file,
  original,
  kind,
  pages,
  origin,
  bower,
  answer,
  folderPath,
  now,
  onClose,
}: QuickLookProps): JSX.Element {
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);

  const shown = original ?? file;
  const isNote = shown === file && kind === 'note';
  const segments = folderPath.split('/').filter(Boolean);
  const para = paraKindOf(segments[0] ?? '');
  const filed = filedLine(origin, shown.modifiedTime, now, bower);
  const demo = isDemo();

  return (
    <Queued id="quick-look" priority={OVERLAY_PRIORITY.own}>
      <Overlay
        kind="dialog"
        label={`Quick look: ${title}`}
        onClose={onClose}
        scrimGuardMs={300}
      >
        <div
          class="quick-look-panel"
          style={
            drag === null || drag.dy <= 0
              ? undefined
              : { transform: `translateY(${drag.dy}px)` }
          }
        >
          <div
            class="quick-look-grip"
            aria-hidden="true"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setDrag({ from: event.clientY, dy: 0 });
            }}
            onPointerMove={(event) => {
              if (drag !== null)
                setDrag({ from: drag.from, dy: event.clientY - drag.from });
            }}
            onPointerUp={() => {
              if (drag !== null && drag.dy > SWIPE_CLOSE_PX) onClose();
              else setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
          />
          <div class="quick-look-preview">
            {isNote ? (
              <NoteLines id={file.id} max={6} class="quick-look-note" />
            ) : (
              <Thumb
                file={shown}
                kind={kind}
                alt={`Preview of ${title}`}
                fallback={
                  <span class="quick-look-icon">{previewIcon(kind)}</span>
                }
              />
            )}
          </div>
          <h2 class="quick-look-title">{title}</h2>
          <p class="quick-look-kind">{kindLine(kind, pages, shown.size, answer === true && isNote)}</p>
          <p class="quick-look-path">
            {para !== null && <FolderMark kind={para} size={18} />}
            <span class="quick-look-path-text">
              {segments.map(displayName).join(' › ')}
            </span>
          </p>
          {filed !== null && <p class="quick-look-filed">{filed}</p>}
          <div class="quick-look-actions">
            <a class="quick-look-open" href={href} onClick={onClose}>
              Open
            </a>
            {demo ? (
              <button
                type="button"
                class="quick-look-drive"
                disabled
                aria-disabled
                title={NOT_IN_DEMO_DRIVE}
              >
                Open in Drive
              </button>
            ) : (
              <a
                class="quick-look-drive"
                href={driveFileUrl(shown)}
                target="_blank"
                rel="noopener"
                onClick={onClose}
              >
                Open in Drive
              </a>
            )}
          </div>
          {demo && <p class="quick-look-demo">{NOT_IN_DEMO_DRIVE}</p>}
        </div>
      </Overlay>
    </Queued>
  );
}

/** A file, note or pair the desktop preview column shows (§3.37). */
export type PanePreview = Omit<QuickLookProps, 'onClose'> & {
  type?: 'file';
};

/** One thing inside a folder the preview column shows ("INSIDE", AR-4). */
export interface PaneInsideItem extends MetaItem {
  id: string;
  title: string;
  href: string;
  path: string;
  /** ISO, for the trailing date. */
  modified?: string;
  isNew?: boolean;
}

/** A folder the preview column shows (AR-Select-1280). */
export interface PaneFolder {
  type: 'folder';
  title: string;
  href: string;
  path: string;
  /** The folder's own Drive entry, for Open in Drive. */
  file?: DriveFile;
  things: number;
  updated?: string;
  inside: readonly PaneInsideItem[];
  now: number;
}

export type PaneItem = PanePreview | PaneFolder;

/** The words the empty column says (K-33). */
export const PANE_EMPTY = 'Select something to see it here.';

/** A note's text, rendered, once it is read; `null` until then. */
function useRenderedNote(id: string | null, path: string): RenderedNote | null {
  const { index, getNoteText } = useVault();
  const [rendered, setRendered] = useState<RenderedNote | null>(null);
  useEffect(() => {
    setRendered(null);
    if (id === null || index === null) return;
    let cancelled = false;
    getNoteText(id).then(
      (text) => {
        if (!cancelled) setRendered(renderNote(text, index, { path }));
      },
      (err: unknown) => console.error('Could not read a note', err),
    );
    return () => {
      cancelled = true;
    };
  }, [id, index, getNoteText, path]);
  return rendered;
}

/** A spreadsheet's rows, once read; `null` until then or on failure. */
function useCsvRows(id: string | null): string[][] | null {
  const { getNoteText } = useVault();
  const [rows, setRows] = useState<string[][] | null>(null);
  useEffect(() => {
    setRows(null);
    if (id === null) return;
    let cancelled = false;
    getNoteText(id).then(
      (text) => {
        if (!cancelled) setRows(parseCsv(text));
      },
      (err: unknown) => console.error('Could not read a spreadsheet', err),
    );
    return () => {
      cancelled = true;
    };
  }, [id, getNoteText]);
  return rows;
}

/** Open (primary sm) and Open in Drive (secondary sm), as on every pane. */
function PaneActions({
  href,
  driveUrl,
}: {
  href: string;
  driveUrl: string | null;
}): JSX.Element {
  return (
    <div class="quick-look-pane-actions">
      <a class="btn btn-sm" href={href}>
        Open
      </a>
      {isDemo() || driveUrl === null ? (
        // Drawn as the board draws it (secondary sm, PF-Main-1280); in the
        // demo it says why it does nothing rather than greying out.
        <button
          type="button"
          class="btn btn-sm btn-secondary"
          title={NOT_IN_DEMO_DRIVE}
          onClick={() => {
            showToast(NOT_IN_DEMO_DRIVE);
          }}
        >
          Open in Drive
        </button>
      ) : (
        <a
          class="btn btn-sm btn-secondary"
          href={driveUrl}
          target="_blank"
          rel="noopener"
        >
          Open in Drive
        </a>
      )}
    </div>
  );
}

function FolderPane({ item }: { item: PaneFolder }): JSX.Element {
  const icon = { name: item.title, mimeType: FOLDER_MIME, path: item.path };
  return (
    <div class="quick-look-pane">
      <h2 class="quick-look-pane-title quick-look-pane-folder">
        <FileIcon item={icon} size={20} />
        <span>{item.title}</span>
      </h2>
      <PaneActions
        href={item.href}
        driveUrl={item.file === undefined ? null : driveFolderUrl(item.file)}
      />
      <p class="quick-look-pane-meta">
        Folder · {folderCardMeta(item.things, item.updated, item.now)}
      </p>
      {item.inside.length > 0 && (
        <>
          <p class="quick-look-pane-overline">Inside</p>
          <ul class="quick-look-pane-inside" role="list">
            {item.inside.map((thing) => (
              <li key={thing.id}>
                <ListRow
                  item={thing}
                  meta={metaLine(thing, { view: 'row', now: item.now })}
                  badge={
                    thing.isNew === true ? (
                      <Badge tone="new">New</Badge>
                    ) : undefined
                  }
                  trailing={
                    thing.modified === undefined ? undefined : (
                      <time dateTime={thing.modified}>
                        {shortDate(thing.modified, item.now)}
                      </time>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FilePane({ item }: { item: PanePreview }): JSX.Element {
  const { title, href, file, original, kind, origin, bower, answer, now } =
    item;
  const shown = original ?? file;
  // A pair and a note read the note: its Bower's note box and its text.
  const readsNote = original !== undefined || kind === 'note';
  const rendered = useRenderedNote(readsNote ? file.id : null, file.path);
  const rows = useCsvRows(!readsNote && kind === 'csv' ? shown.id : null);
  const filed = filedBy(
    shown,
    origin ?? (bower === true ? 'filed' : null),
    now,
  ).line;
  const meta = metaLine(
    {
      name: shown.name,
      mimeType: shown.mimeType,
      ...(original === undefined &&
        bower !== undefined && {
          bowerWritten: bower,
        }),
      ...(original === undefined && answer === true && { answer: true }),
      ...(shown.size !== undefined && { size: shown.size }),
      filed,
    },
    { view: 'title', now },
  ).text;
  const opening =
    rendered === null || bower !== true ? null : splitOpening(rendered.html);

  return (
    <div class="quick-look-pane">
      <h2 class="quick-look-pane-title">{title}</h2>
      <PaneActions href={href} driveUrl={driveFileUrl(shown)} />
      <p class="quick-look-pane-meta">{meta}</p>
      {rendered !== null && opening !== null && opening.top !== '' && (
        <BowerNoteBox
          html={opening.top}
          frontmatter={rendered.frontmatter}
          path={file.path}
          names={[title]}
          fold
          summaryOnly
        />
      )}
      {rendered !== null && (
        <div class="quick-look-pane-note">
          <NoteBody html={opening === null ? rendered.html : opening.rest} />
        </div>
      )}
      {!readsNote && kind === 'csv' && rows !== null && (
        <TablePreview rows={rows} />
      )}
      {!readsNote && kind !== 'csv' && (
        <div class="quick-look-preview">
          <Thumb
            file={shown}
            kind={kind}
            alt={kind === 'pdf' ? 'PDF preview' : `Preview of ${title}`}
            fallback={<span class="quick-look-icon">{previewIcon(kind)}</span>}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The desktop preview column (§3.37, R-PREVIEW-1, boards PF-Main-1280,
 * AR-Main-1280, AR-Select-1280): from 1200 px, 360 wide, full height, one
 * vertical scroll. Nothing selected: "Select something to see it here."
 * A selected item: its title, Open and Open in Drive, the meta line, then
 * Bower's note box (folding, O-R6) for a note, the first page for a PDF, a
 * table for a spreadsheet, or "INSIDE" and its rows for a folder.
 */
export function QuickLookPane({
  item,
}: {
  item: PaneItem | null;
}): JSX.Element {
  if (item === null) {
    return (
      <div class="quick-look-pane quick-look-pane-empty">
        <span class="quick-look-empty-icon" aria-hidden="true">
          <IconPanel />
        </span>
        <p class="quick-look-empty">{PANE_EMPTY}</p>
      </div>
    );
  }
  if (item.type === 'folder') return <FolderPane item={item} />;
  return <FilePane item={item} />;
}
