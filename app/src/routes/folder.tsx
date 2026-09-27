/**
 * Folder screen (issue #214, spec §14 "Folder screen"): `/folder/:path*`,
 * one screen for a folder wherever it is reached from — the Home Answers
 * card, a note's breadcrumb, the desktop tree's folder name, or another
 * Folder screen's own subfolder rows. Shows the folder's icon and name, its
 * counts, a chip row (Pinned, Ask Bower about it, Open in Drive), its
 * subfolders (with their own counts) and its own notes, newest first.
 *
 * The chips share `styles/layout.css`'s generic `.chip` (already used by
 * `tell-composer.tsx`). Pinned toggles the folder's own pin (#215, #216:
 * `pinFolder`/`unpinFolder`, through `pin-action.ts`'s shared toast).
 *
 * The header's `back` and `crumb` slots (`shell-slots.ts`) work exactly
 * like a note's (`routes/note.tsx#Crumb`, #144, #318): Back to the parent
 * folder (or Home for a top-level one), then the phone title and the
 * desktop breadcrumb, both always in the markup, `layout.css` showing only
 * the one that fits — except the
 * breadcrumb here also ends in the folder's own name (not a link), since,
 * unlike a note, the folder itself is a valid breadcrumb segment.
 */

import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import { Bird } from '../components/bird.js';
import {
  IconChat,
  IconExternalLink,
  IconFolder,
  IconNote,
  IconPin,
} from '../components/icons.js';
import { BackLink } from '../components/back-link.js';
import { useShellSlot } from '../components/shell-slots.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import type { DriveFile } from '../drive.js';
import {
  breadcrumb,
  driveFolderUrl,
  folderContents,
  folderHref,
  relativeTime,
} from '../navigation.js';
import type { BreadcrumbSegment, FolderContents } from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { useVault } from '../vault-store.js';
import '../styles/folder.css';

/** "1 note" / "3 notes", "1 folder" / "2 folders" — the header's count line. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

interface FolderCrumbProps {
  /** This folder's ancestors only (`breadcrumb`), nearest last. */
  ancestors: BreadcrumbSegment[];
  /** This folder's own name — the breadcrumb's last, unlinked segment. */
  name: string;
}

/** The shell header's `crumb` slot content, folder version of #144's `Crumb`. */
function FolderCrumb({ ancestors, name }: FolderCrumbProps): JSX.Element {
  return (
    <>
      <span class="topbar-title">{name}</span>
      <nav class="breadcrumb" aria-label="Folder">
        {ancestors.map((crumb) => (
          <span key={crumb.path}>
            <a href={folderHref(crumb.path)}>{crumb.name}</a>
            <span aria-hidden="true"> / </span>
          </span>
        ))}
        <span class="breadcrumb-current">{name}</span>
      </nav>
    </>
  );
}

interface FolderBodyProps {
  contents: FolderContents;
  parentName: string | null;
  /** The folder's own Drive file, for "Open in Drive"; always set in
   * practice (`contents` only exists for a folder the index already has). */
  file: DriveFile | undefined;
  /** Whether the folder has a `pinned` timestamp (#215, #216). */
  pinned: boolean;
  /** Pins or unpins the folder; the chip's own label follows `pinned`. */
  onTogglePin: () => void;
  /** True for the two seconds right after a successful toggle, showing the
   * bird's `done` pose on the chip instead of the pin icon. */
  justChanged: boolean;
  onDoneShown: () => void;
}

function FolderBody({
  contents,
  parentName,
  file,
  pinned,
  onTogglePin,
  justChanged,
  onDoneShown,
}: FolderBodyProps): JSX.Element {
  const tellHref = `/bower?text=${encodeURIComponent(`${contents.name} `)}`;
  const now = Date.now();
  const titles = useNoteTitles(contents.notes);

  return (
    <section class="folder-view">
      <div class="folder-head">
        <IconFolder />
        <div class="folder-head-text">
          <h1>{contents.name}</h1>
          <p class="folder-meta">
            {parentName !== null ? `${parentName} · ` : ''}
            {plural(contents.noteCount, 'note')} ·{' '}
            {plural(contents.subfolders.length, 'folder')}
          </p>
        </div>
      </div>

      <div class="folder-chips">
        <button
          type="button"
          class="chip"
          aria-pressed={pinned}
          onClick={onTogglePin}
        >
          {justChanged ? (
            <Bird state="done" size={16} onDone={onDoneShown} />
          ) : (
            <IconPin />
          )}
          {pinned ? 'Pinned' : 'Pin to Home'}
        </button>
        <a class="chip" href={tellHref}>
          <IconChat />
          Ask Bower about it
        </a>
        {file !== undefined && (
          <a
            class="chip"
            href={driveFolderUrl(file)}
            target="_blank"
            rel="noopener"
          >
            <IconExternalLink />
            Open in Drive
          </a>
        )}
      </div>

      {contents.subfolders.length > 0 && (
        <div class="folder-section">
          <h2 class="folder-label">Folders</h2>
          <ul class="folder-list">
            {contents.subfolders.map((folder) => (
              <li key={folder.path}>
                <a class="folder-row" href={folderHref(folder.path)}>
                  <IconFolder />
                  <span class="folder-row-name">{folder.name}</span>
                  <span class="folder-row-count">{folder.count}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="folder-section">
        <h2 class="folder-label">Notes · newest first</h2>
        {contents.notes.length === 0 ? (
          <div class="folder-empty">
            <Bird state="idle" size={40} />
            <p>Nothing here yet.</p>
            <a class="button" href="/add">
              Add
            </a>
          </div>
        ) : (
          <ul class="folder-list">
            {contents.notes.map((note) => (
              <li key={note.id}>
                <a class="folder-row" href={`/note/${note.id}`}>
                  <IconNote />
                  <span class="folder-row-name">
                    {titles.get(note.id) ?? noteTitle(note)}
                  </span>
                  {note.modifiedTime !== undefined && (
                    <span class="folder-row-meta">
                      {relativeTime(note.modifiedTime, now)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function Folder(): JSX.Element {
  const { params } = useRoute();
  const path = params.path ?? '';
  const { index, pinFolder, unpinFolder } = useVault();
  const [justChanged, setJustChanged] = useState(false);

  const contents = useMemo(
    () =>
      index === null
        ? null
        : folderContents(index, path, getPref('explorerSort')),
    [index, path],
  );
  const ancestors = useMemo(() => breadcrumb(path), [path]);
  const parent = ancestors[ancestors.length - 1];

  // The phone top bar's Back (#318): the parent folder, or Home for a
  // top-level one.
  const backContent = useMemo(
    () =>
      parent === undefined ? (
        <BackLink href="/" label="Home" />
      ) : (
        <BackLink href={folderHref(parent.path)} label={parent.name} />
      ),
    [parent],
  );
  useShellSlot('back', backContent);

  const crumbContent = useMemo(() => {
    if (contents === null) return null;
    return <FolderCrumb ancestors={ancestors} name={contents.name} />;
  }, [contents, ancestors]);
  useShellSlot('crumb', crumbContent);

  if (index === null) {
    return (
      <section>
        <p>Loading…</p>
      </section>
    );
  }

  if (contents === null) {
    return (
      <section>
        <p>This folder is not in your notes.</p>
      </section>
    );
  }

  const folderPath = contents.path;
  const pinned = index.folderPinnedAt.has(folderPath);

  async function handleTogglePin(): Promise<void> {
    const ok = await runPinAction(
      () => (pinned ? unpinFolder(folderPath) : pinFolder(folderPath)),
      pinned ? 'Unpinned' : 'Pinned to Home',
    );
    if (ok) setJustChanged(true);
  }

  return (
    <FolderBody
      contents={contents}
      parentName={parent === undefined ? null : parent.name}
      file={index.byPath.get(contents.path)}
      pinned={pinned}
      onTogglePin={() => void handleTogglePin()}
      justChanged={justChanged}
      onDoneShown={() => setJustChanged(false)}
    />
  );
}
