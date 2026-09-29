/**
 * Quick look (issue #613, spec §6.5 R-FOLDER-8, board
 * `Phone-Folder-QuickLook`): holding a row or tile of a folder opens a
 * bottom sheet with a preview, the title, kind and size, the path, who filed
 * it and when, Open and Open in Drive. From 900 px it is a centred card; on
 * the desktop Space opens it too, and #614 places it in the right pane.
 *
 * A dialog with a focus trap (`use-focus-trap.ts`), closed by Escape, a
 * swipe down on its handle or the backdrop (guarded like the pin sheet's,
 * #510).
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { isDemo } from '../api.js';
import type { DriveFile } from '../drive.js';
import { formatSize } from '../file-preview.js';
import type { Origin } from '../file-origin.js';
import { whenWords } from '../folder-view.js';
import { renderNote } from '../markdown/render.js';
import { useVault } from '../vault-store.js';
import { FILE_KIND_LABELS } from '../vault-index.js';
import type { FileKind } from '../vault-index.js';
import { displayName, driveFileUrl, paraKindOf } from '../navigation.js';
import { FolderMark } from './folder-mark.js';
import { Thumb, NoteLines } from './folder-grid.js';
import { IconDoc, IconImage, IconNote, IconPdf } from './icons.js';
import { KeyFacts } from './key-facts.js';
import type { KeyFact } from './key-facts.js';
import { KindBadge } from './kind-badge.js';
import { NoteBody } from './note-body.js';
import { useDismissGuard } from './use-dismiss-guard.js';
import { useFocusTrap } from './use-focus-trap.js';
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
): string {
  const parts: string[] = [FILE_KIND_LABELS[kind]];
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
  folderPath,
  now,
  onClose,
}: QuickLookProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  const guardedClose = useDismissGuard(onClose);
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);

  const shown = original ?? file;
  const isNote = shown === file && kind === 'note';
  const segments = folderPath.split('/').filter(Boolean);
  const para = paraKindOf(segments[0] ?? '');
  const filed = filedLine(origin, shown.modifiedTime, now, bower);
  const demo = isDemo();

  return (
    <div class="quick-look">
      <div
        class="quick-look-backdrop"
        aria-hidden="true"
        onClick={guardedClose}
      />
      <div
        ref={panelRef}
        class="quick-look-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Quick look: ${title}`}
        tabIndex={-1}
        style={
          drag === null || drag.dy <= 0
            ? undefined
            : { transform: `translateY(${drag.dy}px)`, animation: 'none' }
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
          {!isNote && <KindBadge kind={kind} file={shown} />}
        </div>
        <h2 class="quick-look-title">{title}</h2>
        <p class="quick-look-kind">{kindLine(kind, pages, shown.size)}</p>
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
    </div>
  );
}

/** What the desktop's preview pane shows: a quick look's own details, plus
 * a companion note's key facts. */
export type PanePreview = Omit<QuickLookProps, 'onClose'> & {
  facts: readonly KeyFact[];
};

/** A note's text, rendered, once it is read; `null` until then. */
function useNoteHtml(id: string | null, path: string): string | null {
  const { index, getNoteText } = useVault();
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    setHtml(null);
    if (id === null || index === null) return;
    let cancelled = false;
    getNoteText(id).then(
      (text) => {
        if (!cancelled) setHtml(renderNote(text, index, { path }).html);
      },
      (err: unknown) => console.error('Could not read a note', err),
    );
    return () => {
      cancelled = true;
    };
  }, [id, index, getNoteText, path]);
  return html;
}

/**
 * Quick look's pane variant (#614, board `Desktop-Explorer` and
 * `Desktop-Folder`): the same details in the desktop's right-hand column,
 * with Bower's note rendered under them, in place of the phone's sheet.
 * `item` is `null` when nothing is selected.
 */
export function QuickLookPane({
  item,
}: {
  item: PanePreview | null;
}): JSX.Element {
  const noteId =
    item === null
      ? null
      : item.original !== undefined || item.kind === 'note'
        ? item.file.id
        : null;
  const notePath = item === null ? '' : item.file.path;
  const html = useNoteHtml(noteId, notePath);
  if (item === null) {
    return <p class="quick-look-empty">Select something to preview it.</p>;
  }
  const { title, href, file, original, kind, pages, origin, bower, now } = item;
  const shown = original ?? file;
  const isNote = shown === file && kind === 'note';
  const filed = filedLine(origin, shown.modifiedTime, now, bower);
  const demo = isDemo();
  const line =
    original === undefined
      ? kindLine(kind, pages, shown.size)
      : `Bower · Original: ${kindLine(kind, pages, undefined)}`;

  return (
    <div class="quick-look-pane">
      <h2 class="quick-look-title">{title}</h2>
      <div class="quick-look-actions quick-look-pane-actions">
        <a class="quick-look-open" href={href}>
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
          >
            Open in Drive
          </a>
        )}
      </div>
      <p class="quick-look-kind">
        {line}
        {filed !== null && original === undefined && ` · ${filed}`}
      </p>
      {original !== undefined && <KeyFacts facts={item.facts} />}
      {noteId !== null && html !== null && (
        <div class="quick-look-pane-note">
          <NoteBody html={html} />
        </div>
      )}
      {!isNote && (
        <div class="quick-look-preview">
          <Thumb
            file={shown}
            kind={kind}
            alt={`Preview of ${title}`}
            fallback={<span class="quick-look-icon">{previewIcon(kind)}</span>}
          />
          <KindBadge kind={kind} file={shown} />
        </div>
      )}
    </div>
  );
}
