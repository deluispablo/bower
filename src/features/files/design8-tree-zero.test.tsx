/**
 * design8-layout (designer, post-qa-7, P3-8): the desktop folder list shows "0" beside an empty Inbox. A closed folder
 * with nothing in it shows no count; one with things keeps its count. Made-up names only.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { TreeNode } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Explorer } from './Explorer';
import s from './explorer.module.css';

const initialUi = useUi.getState();
const node = (path: string, type: TreeNode['type'], children?: TreeNode[]): TreeNode => ({
  path, name: path.split('/').at(-1) ?? path, type, modified: 0, created: 0, ...(children ? { children } : {}),
});
const tree: TreeNode[] = [
  node('Inbox', 'folder', []),
  node('Projects', 'folder', [node('Projects/Flat hunt.md', 'file'), node('Projects/Garden plan.md', 'file')]),
  node('Areas', 'folder', []),
];

beforeEach(() => {
  history.replaceState(null, '', '/files');
  useUi.setState({ ...initialUi, open: new Set(), selected: null, sort: 'name-az' }, true);
});
afterEach(() => {
  cleanup();
  useUi.setState(initialUi, true);
  history.replaceState(null, '', '/');
});

async function rows(): Promise<(path: string) => HTMLElement> {
  const base = loadingSources();
  await act(async () => {
    render(<BrowserRouter><DataProvider sources={{ ...base, vault: { ...base.vault, tree: async () => tree, piles: async () => [], subscribe: () => () => undefined } }}><Explorer variant="panel" /></DataProvider></BrowserRouter>);
  });
  const list = await screen.findByRole('tree', { name: 'Your Bower folder' });
  return (path) => {
    const found = list.querySelector<HTMLElement>(`[data-path="${path}"]`);
    if (!found) throw new Error(`no row ${path}`);
    return found;
  };
}
const count = (row: HTMLElement): string | null => row.querySelector(`.${s.count ?? 'count'}`)?.textContent ?? null;

describe('AC3 no count beside an empty folder', () => {
  it('AC3 design8-layout-zero-control: a closed folder with things shows how many (positive control)', async () => {
    const row = await rows();
    expect(row('Projects')).toHaveAttribute('aria-expanded', 'false');
    expect(count(row('Projects'))).toBe('2');
  });

  it('AC3 design8-layout-zero-inbox: an empty Inbox and an empty folder show no count', async () => {
    const row = await rows();
    expect(count(row('Inbox'))).toBeNull();
    expect(count(row('Areas'))).toBeNull();
  });
});
