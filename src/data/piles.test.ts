import { describe, expect, it } from 'vitest';
import { countThings, folderCount, safeInboxName } from './piles';
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

  it('a link file always ends in .url, whatever its address ends with', () => {
    expect(safeInboxName({ name: 'example.com', kind: 'link' })).toBe('example.com.url');
    expect(safeInboxName({ name: 'site.org/page.html', kind: 'link' })).toBe('site.org - page.html.url');
    expect(safeInboxName({ name: 'curry-clipping.example', kind: 'link' })).toBe('curry-clipping.example.url');
    expect(safeInboxName({ name: 'Saved.url', kind: 'link' })).toBe('Saved.url');
    expect(safeInboxName({ name: 'scan.pdf', kind: 'pdf' })).toBe('scan.pdf');
  });
});

