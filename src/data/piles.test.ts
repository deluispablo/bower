import { describe, expect, it } from 'vitest';
import { countThings, folderCount } from './piles';
import type { TreeNode } from './types';

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
});
