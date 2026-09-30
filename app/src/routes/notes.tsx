/**
 * `/notes`, the Folders tab (#909, spec §4.3, K-1): the drawer's tree at full
 * width, with the "Just filed · n" card and Pinned above it and Answers,
 * Clippings and Health check under it (`Explorer`'s `page` host). The top
 * bar reads "Folders" with its ⋯ ("More for Folders": open the Bower folder
 * in Drive, show or hide Bower's own files, help). Phone only: on desktop
 * the sidebar is the explorer, so `/notes` goes Home, or, with a
 * `?reveal=` from "Show in folders", back to that item with the sidebar
 * showing it.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import {
  DESKTOP_QUERY,
  Explorer,
  setShowAppFiles,
  useShowAppFiles,
} from '../components/explorer.js';
import {
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconHelp,
  IconMore,
} from '../components/icons.js';
import { Overlay } from '../components/overlay.js';
import { useShellSlot } from '../components/shell-slots.js';
import { folderHref } from '../navigation.js';
import {
  close as closeOverlay,
  open as openOverlay,
  OVERLAY_PRIORITY,
} from '../overlay-queue.js';
import { revealInFolders, targetFromReveal } from '../reveal.js';
import { useSession } from '../session.js';
import { useMediaQuery } from '../use-media-query.js';
import { useVault } from '../vault-store.js';

// TODO(#906): import FOLDERS_TAB_LABEL from '../shell-routes.js' once #906
// has merged; the tab, this title and the ⋯ name all read it.
export const FOLDERS_TAB_LABEL = 'Folders';

const MORE_ID = 'folders-more';

function driveFolderHref(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function FoldersMenu({
  driveHref,
  shown,
  onClose,
}: {
  driveHref: string | null;
  shown: boolean;
  onClose: () => void;
}): JSX.Element {
  return (
    <Overlay
      kind="menu"
      label={`More for ${FOLDERS_TAB_LABEL}`}
      onClose={onClose}
    >
      <div
        class="folders-menu"
        role="menu"
        aria-label={`More for ${FOLDERS_TAB_LABEL}`}
      >
        {driveHref !== null && (
          <a
            role="menuitem"
            class="folders-menu-item"
            href={driveHref}
            target="_blank"
            rel="noopener"
            onClick={onClose}
          >
            <IconExternalLink />
            <span>Open your Bower folder in Drive</span>
          </a>
        )}
        <button
          type="button"
          role="menuitem"
          class="folders-menu-item"
          onClick={() => {
            setShowAppFiles(!shown);
            onClose();
          }}
        >
          {shown ? <IconEyeOff /> : <IconEye />}
          <span class="folders-menu-text">
            <span>
              {shown ? "Hide Bower's own files" : "Show Bower's own files"}
            </span>
            <span class="folders-menu-sub">Files Bower keeps for itself</span>
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          class="folders-menu-item"
          onClick={() => {
            onClose();
            // The help sheet belongs to the shell: layout.tsx (#906)
            // listens for this event, as for #907's `requestHelp`.
            window.dispatchEvent(new CustomEvent('bower:open-help'));
          }}
        >
          <IconHelp />
          <span>Help and about this</span>
        </button>
      </div>
    </Overlay>
  );
}

export function Notes(): JSX.Element | null {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { route } = useLocation();
  const { index } = useVault();
  const { me } = useSession();
  const shown = useShowAppFiles();
  const [menuOpen, setMenuOpen] = useState(false);
  const folderId = me?.vault?.folderId ?? null;
  const driveHref = folderId === null ? null : driveFolderHref(folderId);

  // R-NT-5: the desktop has the sidebar; "Show in folders" goes back to the
  // item and points the sidebar at it.
  useEffect(() => {
    if (!desktop) return;
    const reveal = new URLSearchParams(window.location.search).get('reveal');
    const target = targetFromReveal(reveal ?? undefined, index);
    if (target === null) {
      route('/', true);
      return;
    }
    route(
      target.kind === 'folder'
        ? folderHref(target.path)
        : `/${target.kind}/${encodeURIComponent(target.id ?? '')}`,
      true,
    );
    revealInFolders(target.path, target.id);
  }, [desktop, index]);

  function openMenu(): void {
    setMenuOpen(true);
    openOverlay({
      id: MORE_ID,
      priority: OVERLAY_PRIORITY.own,
      render: () => (
        <FoldersMenu
          driveHref={driveHref}
          shown={shown}
          onClose={() => {
            setMenuOpen(false);
            closeOverlay(MORE_ID);
          }}
        />
      ),
    });
  }

  const crumb = useMemo(
    () => (
      <div class="folders-title">
        <h1 class="topbar-title">{FOLDERS_TAB_LABEL}</h1>
        <span class="folders-more">
          <button
            type="button"
            class="icon-button"
            aria-label={`More for ${FOLDERS_TAB_LABEL}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={openMenu}
          >
            <IconMore />
          </button>
        </span>
      </div>
    ),
    [menuOpen, shown, driveHref],
  );

  useShellSlot('crumb', crumb);

  if (desktop) return null;

  return (
    <div class="notes-screen">
      <Explorer variant="page" />
    </div>
  );
}
