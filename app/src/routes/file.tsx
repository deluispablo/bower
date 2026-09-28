/**
 * A file's own screen (issue #350, the Phone-File board): `/file/:id`, for
 * anything in the Bower folder that is not a note — a PDF, a photo, a
 * Google Doc. The title in the bar, then three lines (its type and size,
 * its folder, who put it there and when), the preview (`file-preview.ts`
 * chooses: an image inline, a Google Doc as text, else Drive's thumbnail,
 * which for a PDF is its first page), and a tip to ask Bower for a note on
 * it. Open in Drive is in the More menu, the one menu for note, file and
 * folder (#352, `note-menu.tsx`, `kind="file"`).
 *
 * A note's id opens the note screen instead; an id the index does not have
 * shows Not found.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';

import { isDemo } from '../api.js';
import { BackLink } from '../components/back-link.js';
import { DrivePreview } from '../components/drive-preview.js';
import { FolderMark } from '../components/folder-mark.js';
import {
  IconClock,
  IconDoc,
  IconFolder,
  IconSparkle,
} from '../components/icons.js';
import { KindBadge } from '../components/kind-badge.js';
import { MoreButton } from '../components/more-button.js';
import { loadImage } from '../components/note-body.js';
import { NoteMenu } from '../components/note-menu.js';
import { useShellSlot } from '../components/shell-slots.js';
import {
  TablePreview,
  dataRowCount,
  parseCsv,
} from '../components/table-preview.js';
import { useCatalogueOrigins } from '../components/use-catalogue-origins.js';
import { exportFile, getBlob, getText, thumbnailLinkOf } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { CATALOGUE_PATH, originOf } from '../file-origin.js';
import {
  DOC_PREVIEW_MIME,
  kindWord,
  metaFacts,
  previewKind,
  thumbnailUrl,
  whenLine,
} from '../file-preview.js';
import { formatPolicy } from '../formats.js';
import { imageMimeType } from '../markdown/embeds.js';
import {
  breadcrumb,
  displayPath,
  driveFileUrl,
  folderHref,
  folderOf,
  paraKindOf,
} from '../navigation.js';
import type { BreadcrumbSegment } from '../navigation.js';
import { loadNoteMeta } from '../note-meta.js';
import { useVault } from '../vault-store.js';
import { FILE_KIND_LABELS, fileKind, fileTitle } from '../vault-index.js';
import type { FileKind } from '../vault-index.js';
import { NotFound } from './not-found.js';
import '../styles/markdown.css';
import '../styles/file.css';

type PreviewLoad =
  | { status: 'loading' }
  | { status: 'image'; url: string }
  | { status: 'thumbnail'; url: string }
  | { status: 'text'; text: string }
  /** A CSV, parsed: the header row, then the data. */
  | { status: 'table'; rows: string[][] }
  /** Drive's own preview frame (Office files and video). */
  | { status: 'drive' }
  /** Drive has no picture of this file. */
  | { status: 'none' }
  /** The preview could not be fetched (offline, or Drive said no). */
  | { status: 'failed' };

/** #555/#364: the demo's fixture ids are not real Drive ids, so "open it
 * in Drive" is dropped instead of opening a broken Drive page, the same
 * sentence as Add's own greyed Drive door. */
const NOT_IN_DEMO_DRIVE = 'Not in the demo. Run your own Bower to use it.';

/**
 * Fetches `file`'s preview as `previewKind` says. Starts over for another
 * file or a newer version of this one; revokes an image's object URL when
 * it does.
 */
function usePreview(file: DriveFile | undefined): PreviewLoad {
  const [load, setLoad] = useState<PreviewLoad>({ status: 'loading' });
  const id = file?.id;
  const version = file?.modifiedTime;

  useEffect(() => {
    if (file === undefined || fileKind(file) === 'note') return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoad({ status: 'loading' });

    const fail = (err: unknown): void => {
      console.error(err);
      if (!cancelled) setLoad({ status: 'failed' });
    };

    const kind = previewKind(file);
    if (kind === 'image') {
      loadImage(file).then((blob) => {
        if (cancelled) return;
        const type = imageMimeType(file, blob.type);
        if (type === undefined) {
          setLoad({ status: 'none' });
          return;
        }
        objectUrl = URL.createObjectURL(new Blob([blob], { type }));
        setLoad({ status: 'image', url: objectUrl });
      }, fail);
    } else if (kind === 'drive' || kind === 'none') {
      setLoad({ status: kind });
    } else if (kind === 'table' || kind === 'plain') {
      getText(file.id).then((text) => {
        if (cancelled) return;
        setLoad(
          kind === 'table'
            ? { status: 'table', rows: parseCsv(text) }
            : { status: 'text', text },
        );
      }, fail);
    } else if (kind === 'text') {
      exportFile(file.id, DOC_PREVIEW_MIME)
        .then((blob) => blob.text())
        .then((text) => {
          if (!cancelled) setLoad({ status: 'text', text });
        }, fail);
    } else {
      thumbnailLinkOf(file.id).then((link) => {
        if (cancelled) return;
        const url = thumbnailUrl(link);
        setLoad(
          url === null ? { status: 'none' } : { status: 'thumbnail', url },
        );
      }, fail);
    }

    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
    // `file` itself changes with every refreshed index; its id and version
    // are what decide whether the preview is still the right one.
  }, [id, version]);

  return load;
}

interface PreviewProps {
  file: DriveFile;
  title: string;
  load: PreviewLoad;
  /** The thumbnail would not load (an expired link, say). */
  onThumbnailError: () => void;
}

function Preview({
  file,
  title,
  load,
  onThumbnailError,
}: PreviewProps): JSX.Element {
  const drive = (
    <a href={driveFileUrl(file)} target="_blank" rel="noopener">
      open it in Drive
    </a>
  );
  switch (load.status) {
    case 'loading':
      return <p class="file-preview-note">Loading the preview…</p>;
    case 'image':
      return (
        <div class="file-preview file-preview-picture">
          <img src={load.url} alt={title} />
        </div>
      );
    case 'thumbnail':
      return (
        <div class="file-preview file-preview-picture file-preview-page">
          <img
            src={load.url}
            alt={`First page of ${title}`}
            referrerpolicy="no-referrer"
            onError={onThumbnailError}
          />
        </div>
      );
    case 'table':
      return <TablePreview rows={load.rows} />;
    case 'drive':
      return (
        <DrivePreview
          id={file.id}
          title={title}
          label={
            fileKind(file) === 'video'
              ? 'Plays from Google Drive'
              : 'Preview from Google Drive'
          }
        />
      );
    case 'text':
      return load.text.trim() === '' ? (
        <p class="file-preview-note">This document is empty.</p>
      ) : (
        <div class="file-preview file-preview-text">{load.text}</div>
      );
    case 'none':
      return (
        <p class="file-preview-note">
          {isDemo() ? (
            `There is no preview for this file. ${NOT_IN_DEMO_DRIVE}`
          ) : (
            <>There is no preview for this file; {drive} to see it.</>
          )}
        </p>
      );
    case 'failed':
      return (
        <p class="file-preview-note" role="alert">
          {isDemo() ? (
            `Could not load the preview. ${NOT_IN_DEMO_DRIVE}`
          ) : (
            <>Could not load the preview; {drive} instead.</>
          )}
        </p>
      );
  }
}

interface CrumbProps {
  crumbs: BreadcrumbSegment[];
  title: string;
}

/** The shell header's `crumb` slot: the phone title and the desktop
 * breadcrumb, the same pair as a note's (`routes/note.tsx`). */
function Crumb({ crumbs, title }: CrumbProps): JSX.Element {
  return (
    <>
      <span class="topbar-title">{title}</span>
      {crumbs.length > 0 && (
        <nav class="breadcrumb" aria-label="Folder">
          {crumbs.map((crumb) => (
            <span key={crumb.path}>
              <a href={folderHref(crumb.path)}>{crumb.name}</a>
              <span aria-hidden="true"> / </span>
            </span>
          ))}
        </nav>
      )}
    </>
  );
}

/** Open in Drive as a button; in the demo, a greyed one with the same sentence as elsewhere. */
function OpenInDrive({
  file,
  label,
  secondary = false,
}: {
  file: DriveFile;
  label: string;
  secondary?: boolean;
}): JSX.Element {
  const cls = `button${secondary ? ' file-button-secondary' : ''}`;
  if (isDemo()) {
    return (
      <div class="file-actions">
        <button type="button" class={cls} disabled aria-disabled="true">
          {label}
        </button>
        <span class="file-caption">{NOT_IN_DEMO_DRIVE}</span>
      </div>
    );
  }
  return (
    <div class="file-actions">
      <a class={cls} href={driveFileUrl(file)} target="_blank" rel="noopener">
        {label}
      </a>
    </div>
  );
}

const KEPT_LINE_EXCEL =
  'Bower keeps it, not reads it; editing happens in Drive or Excel.';

/** The sentence a kind has on its screen (`formats.ts`), before the preview. */
function FileNotice({
  file,
  kind,
}: {
  file: DriveFile;
  kind: FileKind;
}): JSX.Element | null {
  const sayHref = `/bower?text=${encodeURIComponent(`About ${file.name}: `)}`;
  if (kind === 'video' || kind === 'audio') {
    const cant =
      kind === 'video'
        ? "Bower can't watch videos."
        : "Bower can't listen to audio.";
    const what = kind === 'video' ? 'shows' : 'is';
    return (
      <div class="file-notice">
        <p>
          <b>{cant}</b> It filed this one by its name and the date it was taken.
          Tell Bower what it {what} and it will write that down with it.
        </p>
        <div class="file-actions">
          <a class="button" href={sayHref}>
            Say what it is
          </a>
        </div>
      </div>
    );
  }
  if (kind === 'excel') return null;
  const notice = formatPolicy(kind).fileNotice;
  return notice === null ? null : <p class="file-notice">{notice}</p>;
}

/** A ZIP, or a file Bower has no way to show (board `Phone-File-NoPreview`). */
function NoPreview({
  file,
  kind,
}: {
  file: DriveFile;
  kind: FileKind;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  const download = (): void => {
    setFailed(false);
    getBlob(file.id).then(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
      },
      (err: unknown) => {
        console.error(err);
        setFailed(true);
      },
    );
  };
  return (
    <div class="file-nopreview">
      {kind === 'zip' && (
        <p class="file-notice">
          <b>A ZIP archive holds other files packed together.</b>
        </p>
      )}
      <p class="file-preview-note">
        It can&rsquo;t be shown here. Open it in Drive to see what is inside, or
        download it.
      </p>
      <div class="file-actions">
        <OpenInDrive file={file} label="Open in Drive" />
        <button
          type="button"
          class="button file-button-secondary"
          onClick={download}
        >
          Download
        </button>
      </div>
      {failed && (
        <p class="file-preview-note" role="alert">
          Could not download it. Try again in a moment.
        </p>
      )}
      {kind === 'zip' && (
        <p class="file-tip">
          <IconSparkle />
          <span>
            Next time, add the photos themselves: Bower can file and describe
            photos, not what is inside a ZIP.
          </span>
        </p>
      )}
    </div>
  );
}

/** A PDF's page count, from its companion note's `pages` (`Name.pdf` → `Name.md`). */
function usePages(
  file: DriveFile | undefined,
  byPath: ReadonlyMap<string, DriveFile> | undefined,
): number | undefined {
  const [pages, setPages] = useState<number | undefined>(undefined);
  const path = file?.path;
  const isPdf = file !== undefined && fileKind(file) === 'pdf';
  const companion =
    isPdf && path !== undefined && byPath !== undefined
      ? byPath.get(path.replace(/\.[^./]+$/, '.md'))
      : undefined;
  const id = companion?.id;
  const version = companion?.modifiedTime;

  useEffect(() => {
    setPages(undefined);
    if (companion === undefined) return;
    let cancelled = false;
    loadNoteMeta(companion).then(
      (meta) => {
        if (!cancelled) setPages(meta.pages);
      },
      (err: unknown) => console.error(err),
    );
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  return pages;
}

export function FileScreen(): JSX.Element {
  const { params } = useRoute();
  const { route } = useLocation();
  const id = params.id ?? '';
  const { index, getNoteText } = useVault();
  const [menuOpen, setMenuOpen] = useState(false);
  const [thumbnailBroken, setThumbnailBroken] = useState(false);

  const file = index?.byId.get(id);
  const isNote = file !== undefined && fileKind(file) === 'note';
  const load = usePreview(file);
  const pages = usePages(file, index?.byPath);

  useEffect(() => {
    setMenuOpen(false);
    setThumbnailBroken(false);
  }, [id]);

  // A note's id belongs on the note screen.
  useEffect(() => {
    if (isNote) route(`/note/${encodeURIComponent(id)}`, true);
  }, [isNote, id]);

  const catalogue = useCatalogueOrigins(
    index?.byPath.get(CATALOGUE_PATH),
    getNoteText,
  );

  const crumbs = useMemo(
    () => (file === undefined ? [] : breadcrumb(file.path)),
    [file?.path],
  );
  const title = file === undefined ? '' : fileTitle(file.name);

  const backContent = useMemo(() => {
    if (file === undefined) return null;
    const parent = crumbs[crumbs.length - 1];
    return parent === undefined ? (
      <BackLink href="/" label="Home" />
    ) : (
      <BackLink href={folderHref(parent.path)} label={parent.name} />
    );
  }, [file === undefined, crumbs]);
  useShellSlot('back', backContent);

  const crumbContent = useMemo(
    () => (file === undefined ? null : <Crumb crumbs={crumbs} title={title} />),
    [file === undefined, crumbs, title],
  );
  useShellSlot('crumb', crumbContent);

  const actionsContent = useMemo(
    () =>
      file === undefined ? null : (
        <MoreButton
          expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        />
      ),
    [file === undefined, menuOpen],
  );
  useShellSlot('actions', actionsContent);

  if (index === null || isNote) {
    return (
      <section>
        <p>Loading…</p>
      </section>
    );
  }

  if (file === undefined) return <NotFound kind="file" />;

  const origin = originOf(file, catalogue);
  const folder = folderOf(file.path);
  const kind = fileKind(file);
  const shows = previewKind(file);
  const policy = formatPolicy(kind);
  const preview: PreviewLoad =
    thumbnailBroken && load.status === 'thumbnail' ? { status: 'none' } : load;
  const rows = load.status === 'table' ? dataRowCount(load.rows) : undefined;
  const facts = metaFacts(file, { pages, rows });
  const topFolder = folder.split('/')[0] ?? '';
  const para = paraKindOf(topFolder);
  const askHref = `/bower?text=${encodeURIComponent(
    `Summarise [[${file.name}]] and list what matters in it`,
  )}`;

  return (
    <section class="note-view file-view">
      <div class="file-head">
        <h1>{title}</h1>
        <div class="note-header-actions">
          <MoreButton
            class="note-header-more"
            expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          />
          {menuOpen && (
            <NoteMenu
              kind="file"
              file={file}
              title={title}
              typeLabel={FILE_KIND_LABELS[kind]}
              askName={file.name}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      <ul class="file-props">
        <li>
          <KindBadge kind={kind} file={file} />
          {[kindWord(file), ...facts].join(' · ')}
        </li>
        {folder !== '' && (
          <li>
            {para === null ? (
              <IconFolder />
            ) : (
              <FolderMark kind={para} size={18} />
            )}
            <a href={folderHref(folder)}>{displayPath(folder)}</a>
          </li>
        )}
        <li>
          <IconClock />
          {whenLine(origin, file.modifiedTime, Date.now())}
        </li>
      </ul>

      <FileNotice file={file} kind={kind} />

      {shows === 'none' ? (
        <NoPreview file={file} kind={kind} />
      ) : (
        <Preview
          file={file}
          title={title}
          load={preview}
          onThumbnailError={() => setThumbnailBroken(true)}
        />
      )}
      {kind === 'excel' && (
        <>
          <OpenInDrive file={file} label="Open in Drive to edit" />
          <p class="file-caption">{KEPT_LINE_EXCEL}</p>
        </>
      )}

      {policy.bowerReads === 'yes' && (
        <p class="file-tip">
          <IconSparkle />
          <span>
            <b>Want a note on it?</b>{' '}
            {origin === 'filed' ? 'Bower filed this as it is. ' : ''}Ask for
            one:{' '}
            <a href={askHref}>
              &ldquo;Summarise this and list what matters&rdquo;
            </a>
          </span>
        </p>
      )}
    </section>
  );
}
