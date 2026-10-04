import { useEffect } from 'react';
import { useTree } from '@/data/provider';
import { findNode } from '@/data/tree';
import { useUi } from '@/app/ui-store';

/**
 * The bookmarks that still lead somewhere. Once the folder is listed, a
 * bookmark to something gone (binned or moved elsewhere, on another device
 * too) is dropped, so it never leads to "Not here any more".
 */
export function useBookmarks(): string[] {
  const { data: tree } = useTree();
  const { bookmarks, pruneBookmarks } = useUi();
  useEffect(() => {
    if (tree) pruneBookmarks((p) => !!findNode(tree, p));
  }, [tree, bookmarks, pruneBookmarks]);
  return tree ? bookmarks.filter((p) => !!findNode(tree, p)) : bookmarks;
}
