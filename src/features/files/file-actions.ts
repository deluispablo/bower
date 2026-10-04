import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useSources } from '@/data/provider';
import { crumbs, routeFor } from '@/app/paths';
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
          useUi.getState().openAll(ancestors(moved));
          if (useUi.getState().selected === path) useUi.getState().select(moved);
          toast(`Moved ${displayName(nameOf(path))} to ${crumbs(to)}`, {
            label: 'Undo',
            run: () => void vault.move(moved, from).catch(fail),
          });
          return moved;
        } catch (e) {
          fail(e);
          return null;
        }
      },
      async rename(path: string, name: string): Promise<string | null> {
        try {
          const to = await vault.rename(path, name);
          if (useUi.getState().selected === path) useUi.getState().select(to);
          return to;
        } catch (e) {
          fail(e);
          return null;
        }
      },
      async trash(path: string): Promise<void> {
        try {
          await vault.trash(path);
          toast(`${displayName(nameOf(path))} is in the Bin of your Drive`, {
            label: 'Undo',
            run: () => void vault.restore(path).catch(fail),
          });
        } catch (e) {
          fail(e);
        }
      },
      async create(folder: string, type: 'note' | 'folder'): Promise<void> {
        try {
          const path = await vault.create(folder, type);
          useUi.getState().openAll([...ancestors(path)]);
          useUi.getState().select(path);
          useUi.getState().setRenaming(path);
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
    [vault, nav],
  );
}
