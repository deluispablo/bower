import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSources } from '@/data/provider';
import { crumbs, decodeSplat, folderRoute, routeFor } from '@/app/paths';
import { ancestors, useUi } from '@/app/ui-store';
import { useTabs } from '@/app/tabs-store';
import { BowerError, type TreeNode } from '@/data/types';
import { displayName, nameOf, parentOf } from '@/data/tree';
import { toast } from '@/ui/toast';

function fail(e: unknown): void {
  if (e instanceof BowerError) toast(e.message);
  else {
    console.error(e);
    toast('That did not work. Try again.');
  }
}

/**
 * What a person can do to a thing in their folder, with the words they see
 * afterwards. In the demo it changes the tree; in phase 2 it moves the file in
 * Drive, where the next tidy-up's reconcile step sees it.
 */
export function useFileActions() {
  const { vault } = useSources();
  const nav = useNavigate();
  const loc = useLocation();
  /** The path the screen shows now, if it is a note, a file or a folder. */
  const shown = loc.pathname.startsWith('/note/')
    ? decodeSplat(loc.pathname.slice(6))
    : loc.pathname.startsWith('/files/')
      ? decodeSplat(loc.pathname.slice(7))
      : null;
  /** Keeps the screen on a thing that moved, or leaves it when it is gone. */
  const follow = (from: string, to: string | null): void => {
    if (!shown || !(shown === from || shown.startsWith(`${from}/`))) return;
    if (to === null) {
      nav(folderRoute(parentOf(from)), { replace: true });
      return;
    }
    const now = to + shown.slice(from.length);
    nav(loc.pathname.startsWith('/note/') ? routeFor({ path: now, type: 'file' }) : routeFor({ path: now, type: 'folder' }), { replace: true });
  };
  return useMemo(
    () => ({
      open(node: Pick<TreeNode, 'path' | 'type'>, newTab = false): void {
        const route = routeFor(node);
        if (newTab) useTabs.getState().open(route);
        useUi.getState().select(node.path);
        nav(route);
        if (node.type === 'file') void vault.markSeen(node.path);
      },
      async move(path: string, to: string): Promise<string | null> {
        const from = parentOf(path);
        try {
          const moved = await vault.move(path, to);
          if (moved === path) return path;
          follow(path, moved);
          useUi.getState().relocate(path, moved);
          useUi.getState().openAll(ancestors(moved));
          toast(`Moved ${displayName(nameOf(path))} to ${crumbs(to)}`, {
            label: 'Undo',
            run: () =>
              void vault.move(moved, from, { undo: true }).then((back) => {
                follow(moved, back);
                useUi.getState().relocate(moved, back);
              }, fail),
          });
          return moved;
        } catch (e) {
          fail(e);
          return null;
        }
      },
      async rename(path: string, name: string): Promise<string | null> {
        try {
          if (/[/\\]/.test(name)) toast('Names cannot have slashes; Bower used a dash.');
          const to = await vault.rename(path, name);
          useUi.getState().relocate(path, to);
          follow(path, to);
          return to;
        } catch (e) {
          fail(e);
          return null;
        }
      },
      async trash(path: string): Promise<void> {
        try {
          await vault.trash(path);
          follow(path, null);
          const marks = useUi.getState().bookmarks;
          useUi.getState().relocate(path, null);
          toast(`${displayName(nameOf(path))} is in the Bin of your Drive`, {
            label: 'Undo',
            run: () =>
              void vault.restore(path).then(() => {
                marks.filter((b) => b === path || b.startsWith(`${path}/`)).forEach((b) => !useUi.getState().bookmarks.includes(b) && useUi.getState().toggleBookmark(b));
              }, fail),
          });
        } catch (e) {
          fail(e);
        }
      },
      async create(folder: string, type: 'note' | 'folder'): Promise<void> {
        try {
          const path = await vault.create(folder, type);
          useUi.getState().openAll([...ancestors(path)]);
          // The new thing gets its name in place; the selection stays, so New folder twice makes two siblings.
          useUi.getState().setJustMade(path);
          useUi.getState().setRenaming(path);
        } catch (e) {
          fail(e);
        }
      },
      /** Takes back a thing just made (Escape on its name), with no Bin and no journal line. */
      async discard(path: string): Promise<void> {
        try {
          await vault.trash(path);
          useUi.getState().relocate(path, null);
        } catch (e) {
          fail(e);
        }
      },
      copyLink(node: Pick<TreeNode, 'path' | 'type'>): void {
        const url = `${location.origin}${routeFor(node)}`;
        void navigator.clipboard?.writeText(url).then(
          () => toast('Link copied'),
          () => toast('Could not copy the link.'),
        );
      },
      openInDrive(path: string): void {
        toast(`In your Drive, ${displayName(nameOf(path))} opens in a new tab.`);
      },
    }),
    // follow reads the current location on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vault, nav, loc.pathname],
  );
}
