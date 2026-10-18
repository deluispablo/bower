import { describe, expect, it } from 'vitest';
import { findNode } from '../tree';
import type { Pile, TreeNode } from '../types';
import { DemoWorld } from './world';

// prod1-pile-undo R-demo: the demo's Remove keeps the pile where its Undo (`restore`) looks, by path or by id.
const inboxPaths = (tree: TreeNode[]): string[] => {
  const out: string[] = [];
  const walk = (n: TreeNode): void => {
    if (n.path === 'Inbox' || n.path.startsWith('Inbox/')) out.push(n.path);
    n.children?.forEach(walk);
  };
  tree.forEach(walk);
  return out.sort();
};

describe('the demo restores a removed pile', () => {
  it('by its place: the same pile, words, things and inbox entries, once', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 });
    const { vault } = w.sources();
    try {
      const before = await vault.piles();
      const pile = before.find((p) => p.id === 'p1');
      if (!pile?.path) throw new Error('no folder pile');
      const entries = inboxPaths(await vault.tree());
      expect(findNode(await vault.tree(), pile.path)).not.toBeNull();
      await vault.removePile(pile.id);
      expect((await vault.piles()).some((p) => p.id === pile.id)).toBe(false);
      expect(findNode(await vault.tree(), pile.path)).toBeNull();
      await expect(vault.restore(pile.path ?? pile.id)).resolves.toBeUndefined();
      const after = await vault.piles();
      expect(after.filter((p) => p.id === pile.id)).toEqual([pile]);
      expect(after.map((p) => p.id)).toEqual(before.map((p) => p.id));
      expect(inboxPaths(await vault.tree())).toEqual(entries);
      await expect(vault.restore(pile.path)).rejects.toMatchObject({ code: 'not-found' });
      expect((await vault.piles()).filter((p) => p.id === pile.id)).toHaveLength(1);
    } finally {
      w.dispose();
    }
  });

  it('by its id when it has no place in the inbox', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 });
    const { vault } = w.sources();
    try {
      // A declared pile with nothing left in it has no folder or file: only its id names it.
      const empty: Pile = { id: 'empty-pile', text: '', createdAt: 1, items: [] };
      (w as unknown as { piles: Pile[] }).piles.push(empty);
      const shown = (await vault.piles()).find((p) => p.id === empty.id);
      expect(shown?.path).toBeUndefined();
      await vault.removePile(empty.id);
      expect((await vault.piles()).some((p) => p.id === empty.id)).toBe(false);
      await expect(vault.restore(shown?.path ?? empty.id)).resolves.toBeUndefined();
      expect((await vault.piles()).filter((p) => p.id === empty.id)).toEqual([shown]);
    } finally {
      w.dispose();
    }
  });
});
