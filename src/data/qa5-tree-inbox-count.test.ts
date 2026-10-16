/**
 * qa5-tree-inbox-count (qa-5 Claude F6): the tree's Inbox count is Home's count of what waits. A pile that is only a
 * note waits as one thing (`thingsIn`), and the tree counted none: its folder holds only the pile's note, which
 * `countThings` leaves out. The vault tells the tree of the change (the tree is read again); the count rule was wrong.
 * Both the pretend Drive (DriveVault) and the demo build the same tree; the one count is `folderCount`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { FakeDrive } from './drive/fake-drive';
import { DriveVault } from './vault/drive-vault';
import { DemoWorld } from './demo/world';
import { folderCount, waitingIn } from './piles';
import { findNode } from './tree';
import type { NewPile, TreeNode } from './types';
import type { VaultSource } from './sources';

const AT = Date.parse('2026-10-10T12:00:00Z');
const pdf = (name: string): NewPile['items'][number] => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`], { type: 'application/pdf' }) });
const NOTE_ONLY: NewPile = { text: 'Ideas for the garden', items: [] };
const ONE_FILE: NewPile = { text: '', items: [pdf('lease.pdf')] };
const WORDS_AND_FILES: NewPile = { text: 'Receipts from the flat move', items: [pdf('a.pdf'), pdf('b.pdf')] };

const disposers: Array<() => void> = [];
// Real time: the demo names a pile by the moment it was added, so frozen time would give two piles one id.
afterEach(() => {
  for (const d of disposers.splice(0)) d();
});

/** A vault, and a wait until what it sends to the inbox has arrived (the pretend Drive sends files after Add). */
type Made = { vault: VaultSource; arrived: () => Promise<void> };

async function driveVault(): Promise<Made> {
  const drive = new FakeDrive({ clock: () => AT });
  const root = (await drive.createFolder('root', 'Bower')).id;
  await drive.createFolder(root, 'Inbox');
  const system = (await drive.createFolder(root, '.bower')).id;
  await drive.createFolder(system, 'piles');
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
  disposers.push(() => vault.dispose());
  return { vault, arrived: () => vault.settled() };
}

async function demoVault(): Promise<Made> {
  const world = new DemoWorld({ scenario: 'empty', scale: 'instant', latency: 0 });
  disposers.push(() => world.dispose());
  return { vault: world.sources().vault, arrived: async () => undefined };
}

async function inbox(vault: VaultSource): Promise<TreeNode> {
  const node = findNode(await vault.tree(), 'Inbox');
  if (!node) throw new Error('no Inbox in the tree');
  return node;
}

describe.each([
  ['the pretend Drive', driveVault],
  ['the demo', demoVault],
] as const)('qa5-tree-inbox-count on %s', (_name, make) => {
  it('AC1 inbox-count-note-pile: after a note-only pile is added, the tree\'s Inbox count is Home\'s', async () => {
    const { vault, arrived } = await make();
    const before = waitingIn(await vault.piles());
    await vault.addPile(ONE_FILE);
    await vault.addPile(WORDS_AND_FILES);
    await arrived();
    // Positive control: piles with files already agree.
    expect(folderCount(await inbox(vault))).toBe(waitingIn(await vault.piles()));
    await vault.addPile(NOTE_ONLY);
    const home = waitingIn(await vault.piles());
    expect(home, 'Home counts the note as one thing').toBe(before + 4);
    expect(folderCount(await inbox(vault))).toBe(home);
  });

  it('AC2 pile-row-note-pile: a closed note-only pile in the tree shows 1; a pile with words and files shows its files', async () => {
    const { vault, arrived } = await make();
    await vault.addPile(WORDS_AND_FILES);
    await vault.addPile(NOTE_ONLY);
    await arrived();
    const piles = (await inbox(vault)).children?.filter((c) => c.type === 'folder') ?? [];
    const counts = Object.fromEntries(piles.map((p) => [p.name.replace(/^\d{4}-\d{2}-\d{2} /, ''), folderCount(p)]));
    expect(counts).toEqual({ 'Ideas for the garden': 1, 'Receipts from the flat move': 2 });
  });

  it('R4 inbox-count-after-remove: removing the note-only pile brings both counts down together', async () => {
    const { vault, arrived } = await make();
    await vault.addPile(ONE_FILE);
    await arrived();
    const pile = await vault.addPile(NOTE_ONLY);
    await vault.removePile(pile.id);
    const home = waitingIn(await vault.piles());
    expect(folderCount(await inbox(vault))).toBe(home);
  });
});
