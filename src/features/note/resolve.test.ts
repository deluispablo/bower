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
});
