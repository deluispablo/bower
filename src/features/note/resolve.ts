import { useMemo } from 'react';
import { useTree } from '@/data/provider';
import { displayName } from '@/data/tree';
import type { TreeNode } from '@/data/types';

/** Finds a note by its name, as a [[wikilink]] names it. */
export function useResolver(): (name: string) => string | null {
  const { data } = useTree();
  return useMemo(() => {
    const byName = new Map<string, string>();
    const walk = (ns: TreeNode[]): void =>
      ns.forEach((n) => {
        if (n.type === 'file') byName.set(displayName(n.name).toLowerCase(), n.path);
        else walk(n.children ?? []);
      });
    walk(data ?? []);
    return (name: string) => byName.get(name.trim().toLowerCase()) ?? null;
  }, [data]);
}
