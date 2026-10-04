import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { findNode } from '../tree';
import { DriveVault } from './drive-vault';

const PASSPORT = 'Areas/Documents/Passport renewal.md';
let drive: FakeDrive;
let root: string;
let vault: DriveVault;

beforeEach(async () => {
  localStorage.clear();
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
  vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
});

const idOf = async (path: string): Promise<string> => {
  const all = await drive.listAll(root);
  const f = all.find((x) => drive.pathOf(x.id, root) === path);
  if (!f) throw new Error(`no ${path}`);
  return f.id;
};

describe('DriveVault files', () => {
  it('toggleTask rejects on a stale modifiedTime', async () => {
    await vault.note(PASSPORT);
    drive.touch(await idOf(PASSPORT));
    await expect(vault.toggleTask(PASSPORT, 4)).rejects.toMatchObject({ code: 'conflict' });
    expect(drive.dump(root).get(PASSPORT)).toContain('- [ ] Photo form signed by a witness');
  });

  it('a toggle writes the file and a journal line', async () => {
    await vault.toggleTask(PASSPORT, 4);
    expect(drive.dump(root).get(PASSPORT)).toContain('- [x] Photo form signed by a witness');
    expect((await vault.changes()).at(-1)?.what).toBe('Ticked "Photo form signed by a witness" in Passport renewal');
  });

  it('a file in the Bin is not in the tree', async () => {
    await drive.trash(await idOf('Resources/Cooking/Lemon tart.md'));
    await vault.refresh();
    expect(findNode(await vault.tree(), 'Resources/Cooking/Lemon tart.md')).toBeNull();
  });

  it('Bower bookkeeping stays out of the tree', async () => {
    const tree = await vault.tree();
    expect(tree.some((n) => n.name.startsWith('.'))).toBe(false);
  });

  it('a note lists its links and backlinks as paths', async () => {
    const n = await vault.note('Projects/Flat hunt/Flat hunt.md');
    expect(n.links).toContain('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md');
    const larkspur = await vault.note('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md');
    expect(larkspur.backlinks).toContain('Projects/Flat hunt/Flat hunt.md');
  });

  it('opening a new thing marks it seen on this device', async () => {
    const isNew = (await vault.tree()).flatMap(function all(n): string[] {
      return [...(n.isNew ? [n.path] : []), ...(n.children ?? []).flatMap(all)];
    });
    const first = isNew[0];
    if (!first) return;
    await vault.markSeen(first);
    expect(findNode(await vault.tree(), first)?.isNew).toBeFalsy();
  });

  it('tells listeners after a change', async () => {
    let heard = 0;
    vault.subscribe(() => heard++);
    await vault.move('Resources/Cooking/Lemon tart.md', 'Areas');
    expect(heard).toBeGreaterThan(0);
  });

  it('a Drive failure reaches the screen as a BowerError', async () => {
    drive.failNext('offline');
    await expect(vault.tree()).rejects.toMatchObject({ code: 'offline' });
    await expect(vault.tree()).resolves.toBeDefined();
  });
});
