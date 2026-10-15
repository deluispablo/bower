import { useMemo } from 'react';
import { useChanges, useTree } from '@/data/provider';
import { formerNames, linkTarget } from '@/data/links';
import { displayName } from '@/data/tree';
import type { ChangeEntry, TreeNode } from '@/data/types';

/** Finds a note by its name, as a [[wikilink]] names it, or by a name it had before a rename. */
export function resolverFor(tree: readonly TreeNode[], changes: readonly ChangeEntry[]): (name: string) => string | null {
  const byName = new Map<string, string>();
  const byPlace = new Map<string, string>();
  const walk = (ns: readonly TreeNode[]): void =>
    ns.forEach((n) => {
      if (n.type === 'file') {
        byName.set(displayName(n.name).toLowerCase(), n.path);
        byPlace.set(n.path.replace(/\.md$/i, '').toLowerCase(), n.path);
      }
      else walk(n.children ?? []);
    });
  walk(tree);
  const former = formerNames(changes);
  return (name: string) => {
    const key = linkTarget(name);
    return byPlace.get(key) ?? byName.get(key) ?? former.get(key) ?? null;
  };
}

export function useResolver(): (name: string) => string | null {
  const { data } = useTree();
  const { data: changes } = useChanges();
  return useMemo(() => resolverFor(data ?? [], changes ?? []), [data, changes]);
}
