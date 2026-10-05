import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Note, TreeNode } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { NameSheet } from './NameSheet';
import { MovePicker } from './MovePicker';
import { ConfirmBin } from './ConfirmBin';
import { BookmarksPanel } from './BookmarksPanel';
import { Explorer } from './Explorer';
import { LocalGraph } from '@/features/note/LocalGraph';
import { LinkedList } from '@/features/note/RightPanel';

const initial = useUi.getState();
const folder: TreeNode = { path: 'Projects/Garden.md', name: 'Garden.md', type: 'folder', modified: 0, created: 0 };
const file: TreeNode = { path: 'Projects/Lease draft.pdf', name: 'Lease draft.pdf', type: 'file', kind: 'pdf', modified: 0, created: 0 };
const dotted: TreeNode = { path: 'Projects/Garden.2026.md', name: 'Garden.2026.md', type: 'file', kind: 'note', modified: 0, created: 0 };
const tree: TreeNode[] = [{ path: 'Projects', name: 'Projects', type: 'folder', modified: 0, created: 0, children: [folder, file, dotted] }];
afterEach(() => { cleanup(); useUi.setState(initial, true); });

function show(Component: ComponentType) {
  const base = loadingSources();
  const vault = new Proxy(base.vault, { get: (target, key) => key === 'tree' ? async () => tree : Reflect.get(target, key) });
  render(<MemoryRouter><DataProvider sources={{ ...base, vault }}><Component /></DataProvider></MemoryRouter>);
}

it('rename starts with a plain file name or the whole folder name', async () => {
  for (const node of [folder, file]) {
    useUi.getState().setNaming({ rename: node.path });
    show(NameSheet);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(node === folder ? 'Garden.md' : 'Lease draft'));
    cleanup();
    useUi.getState().setNaming(null);
  }
});

it('move titles use a plain file name or the whole folder name', async () => {
  for (const node of [folder, file]) {
    useUi.getState().setMoveFor(node.path);
    show(MovePicker);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `Move ${node === folder ? 'Garden.md' : 'Lease draft'}` })).not.toBeNull());
    cleanup();
    useUi.getState().setMoveFor(null);
  }
});

it('a folder Bin confirmation keeps its dots', async () => {
  useUi.getState().setConfirmBin({ path: folder.path, count: 2 });
  show(ConfirmBin);
  expect(screen.queryByRole('dialog', { name: 'Put Garden.md in the Bin?' })).not.toBeNull();
});

it('bookmarks use real types and plain file names', async () => {
  useUi.setState({ bookmarks: [folder.path, file.path] });
  show(BookmarksPanel);
  await waitFor(() => expect(screen.queryByText('Garden.md', { exact: true })).not.toBeNull());
  expect(screen.queryByText('Lease draft', { exact: true })).not.toBeNull();
  expect(screen.queryByText('Lease draft.pdf', { exact: true })).toBeNull();
});


it('inline rename keeps the whole dotted stem and a typed plain label', async () => {
  for (const node of [dotted, file, folder]) {
    const name = node === dotted ? 'Garden.2026' : node === file ? 'Lease draft' : 'Garden.md';
    useUi.setState({ ...initial, open: new Set(['Projects']), renaming: node.path });
    show(() => <Explorer variant="panel" />);
    await waitFor(() => expect(screen.queryByRole('textbox', { name: `New name for ${name}` })).not.toBeNull());
    expect(screen.getByRole('textbox', { name: `New name for ${name}` })).toHaveValue(name);
    cleanup();
  }
});

it('linked file labels agree in the graph and the list', () => {
  const note: Note = { path: dotted.path, title: 'Garden.2026', summary: '', properties: [], tags: [], currentState: [], body: '', timeline: [], links: [file.path], backlinks: [], byBower: false };
  show(() => <><LocalGraph note={note} /><LinkedList note={note} /></>);
  expect(screen.queryAllByText('Lease draft', { exact: true })).toHaveLength(2);
  expect(screen.queryByRole('link', { name: 'Lease draft' })).not.toBeNull();
});
