import { describe, expect, it } from 'vitest';
import type { TreeNode } from '@/data/types';
import { resolverFor } from './resolve';

const file = (path: string): TreeNode => ({ path, name: path.split('/').pop() ?? '', type: 'file', kind: 'note', modified: 0 }) as TreeNode;

describe('the reader', () => {
  it('links follow a rename in the reader: an old name opens the note under its new one', () => {
    const tree: TreeNode[] = [{ path: 'P', name: 'P', type: 'folder', modified: 0, children: [file('P/Cobble Row flat.md'), file('P/Flat 3.md')] } as TreeNode];
    const resolve = resolverFor(tree, [{ id: '1', at: 1, kind: 'rename', what: '', path: 'P/Cobble Row flat.md', from: 'P/Flat 7, Cobble Row.md' }]);
    expect(resolve('Flat 7, Cobble Row')).toBe('P/Cobble Row flat.md');
    expect(resolve('Flat 3')).toBe('P/Flat 3.md');
    expect(resolve('Nowhere')).toBeNull();
  });

  it('AC1 a link naming a note\'s place opens that note, so two notes sharing a title each open from their place', () => {
    const tree: TreeNode[] = [
      { path: 'Areas', name: 'Areas', type: 'folder', modified: 0, children: [
        { path: 'Areas/Career', name: 'Career', type: 'folder', modified: 0, children: [file('Areas/Career/Career profile.md')] } as TreeNode,
      ] } as TreeNode,
      { path: 'Archive', name: 'Archive', type: 'folder', modified: 0, children: [file('Archive/Career profile.md')] } as TreeNode,
    ];
    const resolve = resolverFor(tree, []);
    expect(resolve('Areas/Career/Career profile')).toBe('Areas/Career/Career profile.md');
    expect(resolve('archive/career profile')).toBe('Archive/Career profile.md');
    expect(resolve('Areas/Career/Career profile#Goals')).toBe('Areas/Career/Career profile.md');
  });

  it('AC2 a bare title and a former name resolve as before, and a place that names no note resolves to null', () => {
    const tree: TreeNode[] = [{ path: 'P', name: 'P', type: 'folder', modified: 0, children: [file('P/Flat 3.md')] } as TreeNode];
    const resolve = resolverFor(tree, [{ id: '1', at: 1, kind: 'rename', what: '', path: 'P/Flat 3.md', from: 'P/Flat 7.md' }]);
    expect(resolve('Flat 3')).toBe('P/Flat 3.md');
    expect(resolve('Flat 7')).toBe('P/Flat 3.md');
    expect(resolve('Q/Flat 3')).toBeNull();
  });
});
