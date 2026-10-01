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
import { MoreButton } from '../components/more-button.js';
import { NoteMenu } from '../components/note-menu.js';
import { useShellSlot } from '../components/shell-slots.js';
import { folderHref } from '../navigation.js';
import { revealInFolders, targetFromReveal } from '../reveal.js';
import { useSession } from '../session.js';
import { FOLDERS_TAB_LABEL } from '../shell-routes.js';
import { useMediaQuery } from '../use-media-query.js';
import { useVault } from '../vault-store.js';

export function Notes(): JSX.Element | null {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { route } = useLocation();
  const { index } = useVault();
  const { me } = useSession();
  const shown = useShowAppFiles();
  const [menuOpen, setMenuOpen] = useState(false);
  const folderId = me?.vault?.folderId ?? null;

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

  // The bar's title is the shell's (`topBarVariant` "explorer"); the shared
  // ⋯ follows it in the actions slot.
  const more = useMemo(
    () => (
      <div class="folders-title">
        <MoreButton
          expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          name={FOLDERS_TAB_LABEL}
        />
      </div>
    ),
    [menuOpen],
  );

  useShellSlot('actions', more);

  if (desktop) return null;

  return (
    <div class="notes-screen">
      <Explorer variant="page" />
      {/* The shared ⋯ action sheet (#920 DA-5), rendered as every other
          page renders it (it queues itself): 52 px items, separators and
          Cancel on the phone. */}
      {menuOpen && (
        <NoteMenu
          kind="notes"
          title={FOLDERS_TAB_LABEL}
          {...(folderId !== null && { driveIds: { root: folderId } })}
          ownFilesShown={shown}
          onToggleOwnFiles={() => setShowAppFiles(!shown)}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
