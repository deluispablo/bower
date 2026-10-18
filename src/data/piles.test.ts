import { describe, expect, it } from 'vitest';
import { countThings, folderCount, isEmptyPile, safeInboxName, thingsIn } from './piles';
import type { Pile, TreeNode } from './types';

const file = (path: string, hub = false): TreeNode => ({ path, name: path.split('/').pop() ?? '', type: 'file', kind: 'note', modified: 0, ...(hub ? { hub: true } : {}) }) as TreeNode;

describe('counting', () => {
  it("a folder's own note is not counted, inside or out", () => {
    const car: TreeNode = {
      path: 'Areas/Car',
      name: 'Car',
      type: 'folder',
      modified: 0,
      children: [file('Areas/Car/Car.md', true), file('Areas/Car/Insurance.pdf'), { path: 'Areas/Car/Service', name: 'Service', type: 'folder', modified: 0, children: [file('Areas/Car/Service/Service.md', true), file('Areas/Car/Service/2026.pdf')] } as TreeNode],
    } as TreeNode;
    expect(folderCount(car)).toBe(2);
    expect(countThings(car)).toBe(2);
  });

  it('a link file always ends in .url, whatever its address ends with', () => {
    expect(safeInboxName({ name: 'example.com', kind: 'link' })).toBe('example.com.url');
    expect(safeInboxName({ name: 'site.org/page.html', kind: 'link' })).toBe('site.org - page.html.url');
    expect(safeInboxName({ name: 'curry-clipping.example', kind: 'link' })).toBe('curry-clipping.example.url');
    expect(safeInboxName({ name: 'Saved.url', kind: 'link' })).toBe('Saved.url');
    expect(safeInboxName({ name: 'scan.pdf', kind: 'pdf' })).toBe('scan.pdf');
  });
});


describe('an empty pile', () => {
  it('is never a pile whose note Bower could not read', () => {
    expect(isEmptyPile({ items: [], text: '' })).toBe(true);
    expect(isEmptyPile({ items: [], text: '', noteLocked: true })).toBe(false);
  });
});

describe('things in a pile', () => {
  const pile = (items: number, text: string, noteLocked?: boolean) => ({ items: Array.from({ length: items }, () => ({})), text, ...(noteLocked ? { noteLocked } : {}) }) as unknown as Pile;
  it('counts a locked note once, as isEmptyPile does, and a note beside files not at all', () => {
    expect(thingsIn(pile(0, '', true))).toBe(1);
    expect(thingsIn(pile(0, '   '))).toBe(0);
    expect(thingsIn(pile(0, 'words'))).toBe(1);
    expect(thingsIn(pile(2, 'words'))).toBe(2);
  });
});
