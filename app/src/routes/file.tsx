/**
 * A file's own screen (spec §4.13, boards FI-Main, FI-About, FI-Bottom):
 * `/file/:id`, for anything in the Bower folder that is not a note — a
 * PDF, a photo, a Google Doc. The PageHeader (title once, (i) and ⋯, the
 * meta line "PDF · 117 KB · filed by Bower yesterday"), the preview
 * (`file-preview.ts` chooses: an image inline, a Google Doc as text, else
 * Drive's thumbnail, which for a PDF is its first page), the file tip
 * (`FileTip`), and the "n of N" footer. About this file is the column from
 * 1200 px and a sheet from the (i) below that. Open in Drive is in the ⋯
 * menu (`note-menu.tsx`, `kind="file"`).
 *
 * A note's id opens the note screen instead; an id the index does not have
 * shows Not found.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';

import { isDemo } from '../api.js';
import {
  AboutPanel,
  closeAbout,
  openAbout,
} from '../components/about-panel.js';
import type { AboutPanelProps } from '../components/about-panel.js';
import { BackLink } from '../components/back-link.js';
import { DrivePreview } from '../components/drive-preview.js';
import { FileTip, Hint } from '../components/hint.js';
import { IconSparkle } from '../components/icons.js';
import { crumbsFor, PageHeader } from '../components/page-header.js';
import { itemHref, itemTitle, Pager } from '../components/pager.js';
import {
  BowerNoteBox,
  splitOpening,
  takeCheckSection,
} from '../components/bower-note-box.js';
import { NoteBody, loadImage } from '../components/note-body.js';
import { NoteMenu } from '../components/note-menu.js';
import { PendingRequestLine } from '../components/pending-request-line.js';
import { PhotoViewer } from '../components/photo-viewer.js';
import { useShellSlot } from '../components/shell-slots.js';
import { TablePreview, parseCsv } from '../components/table-preview.js';
import { useCatalogueOrigins } from '../components/use-catalogue-origins.js';
import { useFiledHistory } from '../components/use-filed-history.js';
import {
  companionCandidates,
  copyNotice,
  findCompanion,
  pageUrl,
  parseCatalogueFiles,
  sourceKindOf,
  sourceUrl,
  whereToLook,
  withoutWhereToLook,
} from '../companion.js';
import type { SourceKind } from '../companion.js';
import {
  driveFetch,
  exportFile,
  getBlob,
  getText,
  thumbnailLinkOf,
} from '../drive.js';
import type { DriveFile } from '../drive.js';
import {
  CATALOGUE_PATH,
  filedBy,
  originOf,
  withHistory,
} from '../file-origin.js';
import {
  DOC_PREVIEW_MIME,
  previewKind,
  thumbnailUrl,
} from '../file-preview.js';
import { siblings } from '../folder-view.js';
import { formatPolicy } from '../formats.js';
import { imageMimeType } from '../markdown/embeds.js';
import { renderNote } from '../markdown/render.js';
import { kindLabel, metaLine, sizeWords } from '../meta-line.js';
import {
  breadcrumb,
  buildTree,
  displayName,
  driveFileUrl,
  folderHref,
  folderOf,
  paraKindOf,
} from '../navigation.js';
import { loadNoteMeta } from '../note-meta.js';
import { noteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { markSeen } from '../seen.js';
import { pendingByPath, siblingNames } from '../rename-request.js';
import { useMediaQuery } from '../use-media-query.js';
import { fileHelpTopic, useHelpTopic } from '../help-rows.js';
import { useTitle } from '../use-title.js';
import { useRequestRows } from '../use-request-rows.js';
import { ErrorLine, Skeleton } from '../components/system-state.js';
import { useVault } from '../vault-store.js';
import { fileKind, fileTitle } from '../vault-index.js';
import type { FileKind, VaultIndex } from '../vault-index.js';
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
        // The demo's first pages are pictures of their own (no Drive host).
        const url =
          isDemo() && link?.startsWith('data:image/') === true
            ? link
            : thumbnailUrl(link);
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
      return <Skeleton shape="tiles" count={1} />;
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
          demo={isDemo()}
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
        {
          "It can't be shown here. Open it in Drive to see what is inside, or download it."
        }
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
        <Hint id="file-zip" variant="tip" icon={<IconSparkle />}>
          Next time, add the photos themselves: Bower can file and describe
          photos, not what is inside a ZIP.
        </Hint>
      )}
    </div>
  );
}

interface Companion {
  note: DriveFile;
  text: string;
}

/** How many of a folder's notes are read for their `original` at most. */
const COMPANION_READS = 30;

/**
 * The note Bower wrote about `file` and its text (`companion.ts`): found by
 * its `original` (the frontmatter of the folder's notes, cached), then by the
 * catalogue, then by sharing the file's name. `undefined` while it looks, `null` when
 * there is none.
 */
function useCompanion(
  file: DriveFile | undefined,
  index: VaultIndex | null,
  getNoteText: (id: string) => Promise<string>,
): Companion | null | undefined {
  const [found, setFound] = useState<Companion | null | undefined>(undefined);
  const id = file?.id;
  const version = file?.modifiedTime;
  const notes = index?.notes.length;
  const catalogue = index?.byPath.get(CATALOGUE_PATH);
  const catalogueVersion = catalogue?.modifiedTime;

  useEffect(() => {
    setFound(undefined);
    if (file === undefined || index === null) return;
    if (fileKind(file) === 'note') {
      setFound(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const originals = new Map<string, string>();
      const candidates = companionCandidates(
        file,
        index.notes,
        index.byPath,
      ).slice(0, COMPANION_READS);
      for (const note of candidates) {
        try {
          const meta = await loadNoteMeta(note);
          if (meta.original !== undefined)
            originals.set(note.id, meta.original);
        } catch (err) {
          console.error(err);
        }
        if (cancelled) return;
      }
      let listed = new Map<string, string>();
      if (catalogue !== undefined) {
        try {
          listed = parseCatalogueFiles(await getNoteText(catalogue.id));
        } catch (err) {
          console.error(err);
        }
      }
      const note = findCompanion(file, {
        notes: index.notes,
        byPath: index.byPath,
        originals,
        catalogue: listed,
      });
      if (note === undefined) {
        if (!cancelled) setFound(null);
        return;
      }
      const text = await getNoteText(note.id);
      if (!cancelled) setFound({ note, text });
    })().catch((err: unknown) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [id, version, notes, catalogueVersion]);

  return found;
}

/** Bower's note under the preview: its first lines, "Where to look" on a long PDF, and the way to the note. */
function BowerNote({
  file,
  companion,
  index,
}: {
  file: DriveFile;
  companion: Companion;
  index: VaultIndex;
}): JSX.Element {
  const { note, text } = companion;
  const requests = useRequestRows();
  const pages = useMemo(() => whereToLook(text), [text]);
  const rendered = useMemo(() => {
    const out = renderNote(withoutWhereToLook(text), index, {
      path: note.path,
      title: noteTitle(note, text),
    });
    const opening = splitOpening(out.html);
    const checked = takeCheckSection(opening.rest);
    return {
      top: opening.top,
      rest: checked.rest,
      items: checked.items,
      frontmatter: out.frontmatter,
    };
  }, [text, index, note.path]);
  const driveUrl = driveFileUrl(file);
  return (
    <section class="file-bower-note" aria-label="Bower's note">
      {rendered.top !== '' && (
        <BowerNoteBox
          html={rendered.top}
          frontmatter={rendered.frontmatter}
          checkSection={rendered.items}
          path={note.path}
          requests={requests}
          names={[noteTitle(note, text)]}
        />
      )}
      <div class="file-bower-note-text">
        <NoteBody html={rendered.rest} />
      </div>
      {pages.length > 0 && (
        <div class="file-where">
          <h2>Where to look</h2>
          <ul>
            {pages.map((page) => (
              <li key={page.page}>
                <a
                  href={pageUrl(driveUrl, page.page)}
                  target="_blank"
                  rel="noopener"
                >
                  {page.label}
                </a>
                <span>{page.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <a class="file-bower-note-link" href={`/note/${note.id}`}>
        {"Bower's note on this"}
      </a>
    </section>
  );
}

type SourceName =
  { status: 'loading' } | { status: 'known'; name: string | null };

/**
 * The name of the Google file a copy was made from (`files.get`, name only).
 * `null` once Drive says it is gone or cannot be reached. In the demo the
 * fixture's `bowerSource` already is the name.
 */
function useSourceName(source: string | undefined): SourceName {
  const [load, setLoad] = useState<SourceName>({ status: 'loading' });
  useEffect(() => {
    if (source === undefined) return;
    if (isDemo()) {
      setLoad({ status: 'known', name: source });
      return;
    }
    let cancelled = false;
    setLoad({ status: 'loading' });
    driveFetch(`/drive/v3/files/${encodeURIComponent(source)}?fields=name`)
      .then((response) => response.json() as Promise<unknown>)
      .then((body) => {
        const name =
          typeof body === 'object' &&
          body !== null &&
          'name' in body &&
          typeof body.name === 'string'
            ? body.name
            : null;
        if (!cancelled) setLoad({ status: 'known', name });
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) setLoad({ status: 'known', name: null });
      });
    return () => {
      cancelled = true;
    };
  }, [source]);
  return load;
}

/** "A copy of your Google Sheet “…”" with the way to the original and to this copy. */
export function CopyNotice({
  file,
  kind,
  source,
}: {
  file: DriveFile;
  kind: SourceKind;
  source: string;
}): JSX.Element | null {
  const load = useSourceName(source);
  if (load.status === 'loading') return null;
  const original = load.name === null ? null : sourceUrl(kind, source);
  return (
    <div class="file-notice file-copy-notice">
      <p>{copyNotice(kind, load.name)}</p>
      <div class="file-actions">
        {isDemo() ? (
          <>
            <button type="button" class="button" disabled aria-disabled="true">
              Open the original
            </button>
            <button
              type="button"
              class="button file-button-secondary"
              disabled
              aria-disabled="true"
            >
              Open this copy in Drive
            </button>
            <span class="file-caption">{NOT_IN_DEMO_DRIVE}</span>
          </>
        ) : (
          <>
            {original !== null && (
              <a class="button" href={original} target="_blank" rel="noopener">
                Open the original
              </a>
            )}
            <a
              class="button file-button-secondary"
              href={driveFileUrl(file)}
              target="_blank"
              rel="noopener"
            >
              Open this copy in Drive
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export function FileScreen(): JSX.Element {
  const { params } = useRoute();
  const { route } = useLocation();
  const id = params.id ?? '';
  const { index, status, refresh, getNoteText, pinFile, unpinFile } =
    useVault();
  const [menuOpen, setMenuOpen] = useState(false);
  const requests = useRequestRows();
  const [thumbnailBroken, setThumbnailBroken] = useState(false);

  const file = index?.byId.get(id);
  // The tab reads the name as the page does, without its extension (#922).
  useTitle(file === undefined ? null : fileTitle(file.name));
  const isNote = file !== undefined && fileKind(file) === 'note';
  const load = usePreview(file);
  const companion = useCompanion(file, index, getNoteText);

  useEffect(() => {
    setMenuOpen(false);
    setThumbnailBroken(false);
  }, [id]);

  // Opening a file marks it seen (#587).
  useEffect(() => {
    if (file !== undefined && !isNote) {
      markSeen(id).catch((err: unknown) => console.error(err));
    }
  }, [id, file === undefined, isNote]);

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

  // The phone bar's Back, with the parent's full name (R-FI-1). The
  // breadcrumb and the ⋯ are the page's own (PageHeader): the shell's crumb
  // and actions slots stay empty (G-10).
  const backContent = useMemo(() => {
    if (file === undefined) return null;
    const parent = crumbs[crumbs.length - 1];
    return parent === undefined ? (
      <BackLink href="/" label="Home" />
    ) : (
      <BackLink href={folderHref(parent.path)} label={parent.name} named />
    );
  }, [file === undefined, crumbs]);
  useShellSlot('back', backContent);

  // The one sibling list (R-API-9, K-31), in the tree's order: About's
  // "In this folder" and the footer both read it.
  const sort = getPref('explorerSort');
  const items = useMemo(
    () =>
      index === null || file === undefined
        ? []
        : siblings(file, buildTree(index, sort)),
    [index, file, sort],
  );
  const aboutColumn = useMediaQuery('(min-width: 1200px)');
  const now = Date.now();
  const history = useFiledHistory();
  const origin = file === undefined ? null : originOf(file, catalogue);
  // Who filed it and when, from the run history (R-API-3, #922).
  const known = file === undefined ? null : withHistory(file, origin, history);
  const filed = known === null ? null : filedBy(known.file, known.origin, now);
  const folderPath = file === undefined ? '' : folderOf(file.path);
  const aboutProps: AboutPanelProps | null =
    index === null || file === undefined || filed === null
      ? null
      : {
          kind: 'file',
          index,
          file,
          folder:
            folderPath === ''
              ? undefined
              : {
                  name: displayName(
                    folderPath.slice(folderPath.lastIndexOf('/') + 1),
                  ),
                  href: folderHref(folderPath),
                },
          items,
          rows: {
            kind: [
              kindLabel(file),
              file.size === undefined ? '' : sizeWords(file.size),
            ]
              .filter((part) => part !== '')
              .join(', '),
            filed: filed.about,
            driveHref: isDemo() ? null : driveFileUrl(file),
          },
        };
  const aboutContent = useMemo(
    () =>
      aboutProps === null || !aboutColumn ? null : (
        <AboutPanel {...aboutProps} />
      ),
    [index, file, items, aboutColumn, filed?.about],
  );
  useShellSlot('aside', aboutContent);
  useHelpTopic(
    fileHelpTopic(file?.path, file && kindLabel(file), filed?.by ?? null),
  );
  useEffect(() => {
    closeAbout();
  }, [id, aboutColumn]);

  if (index === null || isNote) {
    return (
      <section>
        {index === null && status === 'error' ? (
          <ErrorLine what="file" onRetry={() => void refresh()} />
        ) : (
          <Skeleton shape="properties" count={6} />
        )}
      </section>
    );
  }

  if (file === undefined) return <NotFound kind="file" />;

  const folder = folderOf(file.path);
  const filePinned = index.filePinnedAt.has(file.id);

  const fileId = file.id;
  async function handleTogglePin(): Promise<void> {
    await runPinAction(
      () => (filePinned ? unpinFile(fileId) : pinFile(fileId)),
      filePinned ? 'Unpinned' : 'Pinned to Home',
    );
  }
  const kind = fileKind(file);
  const shows = previewKind(file);
  const policy = formatPolicy(kind);
  const preview: PreviewLoad =
    thumbnailBroken && load.status === 'thumbnail' ? { status: 'none' } : load;
  const topFolder = folder.split('/')[0] ?? '';
  const para = folder === '' ? null : paraKindOf(topFolder);
  const folderName = displayName(folder.slice(folder.lastIndexOf('/') + 1));
  // The photo viewer's counter walks the folder's photos and files only, not
  // its notes (#704).
  const viewerSiblings = items.filter((item) => fileKind(item) !== 'note');
  const viewerAt = viewerSiblings.findIndex((item) => item.id === file.id);
  const meta = metaLine(
    {
      name: file.name,
      mimeType: file.mimeType,
      ...(file.size !== undefined && { size: file.size }),
      ...(filed !== null && filed.line !== '' && { filed: filed.line }),
      ...(file.modifiedTime !== undefined && { modified: file.modifiedTime }),
    },
    { view: 'title', now },
  );
  const sourceKind = sourceKindOf(file);
  const source = file.appProperties?.bowerSource;

  return (
    <section class="note-view file-view">
      <PageHeader
        title={title}
        kind="file"
        crumbs={crumbsFor(file.path)}
        more={{
          expanded: menuOpen,
          onClick: () => setMenuOpen((open) => !open),
          name: title,
        }}
        meta={{ ...meta, dot: { at: 0, root: para } }}
        {...(aboutProps !== null && {
          onAbout: () => openAbout(aboutProps),
        })}
      />
      {menuOpen && (
        <NoteMenu
          kind="file"
          file={file}
          title={title}
          askName={displayName(file.name)}
          pinned={filePinned}
          onTogglePin={folder === '' ? undefined : () => void handleTogglePin()}
          siblingNames={siblingNames(index, file.path)}
          pending={pendingByPath(requests).get(file.path)}
          onClose={() => setMenuOpen(false)}
        />
      )}
      <PendingRequestLine path={file.path} rows={requests} />

      <FileNotice file={file} kind={kind} />
      {sourceKind !== null && source !== undefined && source !== '' && (
        <CopyNotice file={file} kind={sourceKind} source={source} />
      )}

      {shows === 'none' ? (
        <NoPreview file={file} kind={kind} />
      ) : preview.status === 'image' ? (
        <PhotoViewer
          src={preview.url}
          title={title}
          siblings={(viewerAt === -1 ? [file] : viewerSiblings).map((item) => ({
            id: item.id,
            name: itemTitle(item),
          }))}
          index={viewerAt === -1 ? 0 : viewerAt}
          folderName={folder === '' ? 'Bower' : folderName}
          onNavigate={(at) => {
            const target = viewerSiblings[at];
            if (target !== undefined) route(itemHref(target));
          }}
          onMore={() => setMenuOpen(true)}
          moreOpen={menuOpen}
        />
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

      {policy.bowerReads === 'yes' &&
        companion === null &&
        source === undefined && (
          <FileTip file={file} filedAsItIs={origin === 'filed'} />
        )}

      {companion !== null && companion !== undefined && (
        <BowerNote file={file} companion={companion} index={index} />
      )}

      <Pager
        id={file.id}
        items={items}
        folder={
          folder === '' ? null : { name: folderName, href: folderHref(folder) }
        }
      />
    </section>
  );
}
