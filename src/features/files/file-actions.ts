import { useMemo } from 'react';
import { openDrive, report, undoToast } from '@/ui/report';
import { useLocation, useNavigate } from 'react-router';
import { useSources } from '@/data/provider';
import { crumbs, decodeSplat, folderRoute, routeFor } from '@/app/paths';
import { ancestors, useUi } from '@/app/ui-store';
import { useTabs } from '@/app/tabs-store';
import { BowerError, type TreeNode } from '@/data/types';
import { findNode, thingName, nameOf, parentOf } from '@/data/tree';
import { toast } from '@/ui/toast';
import { afterOverlaysClosed } from '@/ui/back';

/**
 * What a person can do to a thing in their folder, with the words they see
 * afterwards. In the demo it changes the tree; in phase 2 it moves the file in
 * Drive, where the next tidy-up's reconcile step sees it.
 */
export function useFileActions() {
  const { vault } = useSources();
  const nav = useNavigate();
  const loc = useLocation();
  /** Keeps the screen on a thing that moved, or leaves it when it is gone. Reads the screen at call time (an Undo comes later). */
  const follow = (from: string, to: string | null): void => {
    // A sheet that just closed may still be stepping back over its history entry.
    void afterOverlaysClosed().then(() => followNow(from, to));
  };
  const followNow = (from: string, to: string | null): void => {
    const here = window.location.pathname;
    const onNote = here.startsWith('/note/');
    const shown = onNote ? decodeSplat(here.slice(6)) : here.startsWith('/files/') ? decodeSplat(here.slice(7)) : null;
    if (to !== null) {
      useTabs.getState().relocate(routeFor({ path: from, type: 'file' }), routeFor({ path: to, type: 'file' }));
      useTabs.getState().relocate(routeFor({ path: from, type: 'folder' }), routeFor({ path: to, type: 'folder' }));
    }
    if (!shown || !(shown === from || shown.startsWith(`${from}/`))) return;
    if (to === null) {
      nav(folderRoute(parentOf(from)), { replace: true });
      return;
    }
    const now = to + shown.slice(from.length);
    nav(onNote ? routeFor({ path: now, type: 'file' }) : routeFor({ path: now, type: 'folder' }), { replace: true });
  };
  const open = (node: Pick<TreeNode, 'path' | 'type'>, newTab = false): void => {
    const route = routeFor(node);
    if (newTab) useTabs.getState().open(route);
    useUi.getState().select(node.path);
    nav(route);
    if (node.type === 'file') void vault.markSeen(node.path);
  };
  return useMemo(
    () => ({
      open,
      async move(path: string, to: string): Promise<string | null> {
        const from = parentOf(path);
        try {
          const folder = findNode(await vault.tree(), path)?.type === 'folder';
          const label = (p: string): string => folder ? nameOf(p) : thingName(nameOf(p));
          const moved = await vault.move(path, to);
          if (moved === path) return path;
          follow(path, moved);
          useUi.getState().relocate(path, moved);
          useUi.getState().openAll(ancestors(moved));
          undoToast(`Moved ${label(path)} to ${crumbs(to)}`, () => vault.move(moved, from, { undo: true }), (back) => {
            follow(moved, back);
            useUi.getState().relocate(moved, back);
            return `${label(back)} is back in ${crumbs(from) || 'your Bower folder'}`;
          });
          return moved;
        } catch (e) {
          if (e instanceof BowerError && e.applied?.path) {
            follow(path, e.applied.path);
            useUi.getState().relocate(path, e.applied.path);
            useUi.getState().openAll(ancestors(e.applied.path));
          }
          report(e, 'That did not work. Try again.');
          return e instanceof BowerError ? (e.applied?.path ?? null) : null;
        }
      },
      /** `quiet`: a thing just made gets its own word ("New note in …"), not a rename one. */
      async rename(path: string, name: string, opts: { quiet?: boolean; onPartial?: () => void } = {}): Promise<string | null> {
        try {
          const folder = findNode(await vault.tree(), path)?.type === 'folder';
          const label = (p: string): string => folder ? nameOf(p) : thingName(nameOf(p));
          const to = await vault.rename(path, name);
          useUi.getState().relocate(path, to);
          follow(path, to);
          const slash = /[/\\]/.test(name) ? ' Names cannot have slashes; Bower used a dash.' : '';
          if (!opts.quiet && to !== path) toast(`Renamed to ${label(to)}.${slash}`);
          else if (slash) toast(slash.trim());
          return to;
        } catch (e) {
          if (e instanceof BowerError && e.applied?.path) {
            useUi.getState().relocate(path, e.applied.path);
            follow(path, e.applied.path);
            opts.onPartial?.();
          }
          report(e, 'That did not work. Try again.');
          return e instanceof BowerError ? (e.applied?.path ?? null) : null;
        }
      },
      async trash(path: string): Promise<void> {
        try {
          const folder = findNode(await vault.tree(), path)?.type === 'folder';
          const label = (p: string): string => folder ? nameOf(p) : thingName(nameOf(p));
          await vault.trash(path);
          follow(path, null);
          const marks = useUi.getState().bookmarks;
          useUi.getState().relocate(path, null);
          undoToast(path.startsWith('Inbox/') ? "The pile is in your Drive's Bin." : `${label(path)} is in your Drive's Bin.`, () => vault.restore(path), () => {
            useUi.getState().setRestored(path);
            marks.filter((b) => b === path || b.startsWith(`${path}/`)).forEach((b) => !useUi.getState().bookmarks.includes(b) && useUi.getState().toggleBookmark(b));
            return path.startsWith('Inbox/') ? 'The pile is back in the inbox' : `${label(path)} is back`;
          });
        } catch (e) {
          if (e instanceof BowerError && e.applied?.path === null) {
            follow(path, null);
            useUi.getState().relocate(path, null);
          }
          report(e, 'That did not work. Try again.');
        }
      },
      askFolderName(folder: string, inline = false): void {
        if (inline) useUi.getState().openAll([...ancestors(folder), folder]);
        useUi.getState().setNaming({ folder, type: 'folder', inline });
      },
      async createNamed(folder: string, name: string, response?: {
        made: (path: string) => void;
        failed: (sentence: string) => void;
      }): Promise<void> {
        try {
          const path = await vault.create(folder, 'folder', name);
          open({ path, type: 'folder' });
          response?.made(path);
        } catch (e) {
          const applied = e instanceof BowerError ? e.applied?.path : null;
          if (applied) {
            open({ path: applied, type: 'folder' });
            response?.made(applied);
          }
          if (response && !applied) {
            console.error(e);
            response.failed('The folder was not made. Try again.');
          } else report(e, 'The folder was not made. Try again.');
        }
      },
      async create(folder: string, type: 'note'): Promise<void> {
        try {
          const path = await vault.create(folder, type);
          useUi.getState().openAll([...ancestors(path)]);
          // New note still gets its name in place; folders use askFolderName/createNamed.
          useUi.getState().setJustMade(path);
          useUi.getState().setRenaming(path);
        } catch (e) {
          if (e instanceof BowerError && e.applied?.path) {
            useUi.getState().openAll([...ancestors(e.applied.path)]);
            useUi.getState().setJustMade(e.applied.path);
            useUi.getState().setRenaming(e.applied.path);
          }
          report(e, 'That did not work. Try again.');
        }
      },
      /** Takes back a note just made when its inline name is cancelled. */
      async discard(path: string): Promise<void> {
        try {
          await vault.trash(path);
          useUi.getState().relocate(path, null);
        } catch (e) {
          report(e, 'That did not work. Try again.');
        }
      },
      copyLink(node: Pick<TreeNode, 'path' | 'type'>): void {
        const url = `${location.origin}${routeFor(node)}`;
        void navigator.clipboard?.writeText(url).then(
          () => toast('Link copied'),
          (e: unknown) => report(e, 'Could not copy the link.'),
        );
      },
      openInDrive(path: string): void {
        openDrive(vault, path);
      },
    }),
    // follow reads the current location on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vault, nav, loc.pathname],
  );
}
