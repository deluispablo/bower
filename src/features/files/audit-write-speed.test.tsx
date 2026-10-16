import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import { parseNote } from '@/data/contracts/note-format';
import type { TreeNode } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { FolderScreen } from './FolderScreen';

const initial = useUi.getState();
const AT = Date.UTC(2026, 9, 11);
const path = 'Resources/Contacts';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT); localStorage.setItem('bower:folder-view', 'table'); });
afterEach(() => { cleanup(); useUi.setState(initial, true); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('AC3 audit-write-speed-table-reads-once: the folder table reads its notes once, not again on each render of the screen', async () => {
  const items: TreeNode[] = ['Alex', 'Sam'].map((n) => ({ path: `${path}/${n}.md`, name: `${n}.md`, type: 'file', kind: 'note', created: AT, modified: AT }));
  const tree: TreeNode[] = [{ path: 'Resources', name: 'Resources', type: 'folder', created: AT, modified: AT,
    children: [{ path, name: 'Contacts', type: 'folder', created: AT, modified: AT, children: items }] }];
  const reads: string[] = [];
  const base = loadingSources();
  const vault = new Proxy(base.vault, { get: (target, key) => key === 'tree' ? async () => tree
    : key === 'note' ? async (name: string) => (reads.push(name), parseNote(name, `---\ntype: contact\n---\n${name} is a contact.`))
      : key === 'typeTable' ? async () => [] : Reflect.get(target, key) });
  const sources = { ...base, vault };
  const screen = (): React.JSX.Element => (
    <MemoryRouter initialEntries={[`/files/${path}`]}>
      <DataProvider sources={sources}><FolderScreen /></DataProvider>
    </MemoryRouter>
  );
  const view = render(screen());
  await act(async () => {});
  expect(reads.toSorted()).toEqual(items.map((i) => i.path));
  for (let i = 0; i < 3; i++) {
    view.rerender(screen());
    await act(async () => {});
  }
  expect(reads, 'the same children are not read again on a render of the screen').toHaveLength(items.length);
});

it('AC3 audit-write-speed-table-reads-changes: a change of the folder reads its current notes once each and shows them fresh', async () => {
  const node = (n: string, at = AT): TreeNode => ({ path: `${path}/${n}.md`, name: `${n}.md`, type: 'file', kind: 'note', created: AT, modified: at });
  let items = [node('Alex'), node('Sam')];
  const roles = new Map([['Alex', 'Old role'], ['Sam', 'Gone role'], ['Kim', 'New role']]);
  const tree = (): TreeNode[] => [{ path: 'Resources', name: 'Resources', type: 'folder', created: AT, modified: AT,
    children: [{ path, name: 'Contacts', type: 'folder', created: AT, modified: AT, children: items }] }];
  const reads: string[] = [];
  const listeners = new Set<() => void>();
  const base = loadingSources();
  const vault = new Proxy(base.vault, { get: (target, key) => key === 'tree' ? async () => tree()
    : key === 'subscribe' ? (cb: () => void) => (listeners.add(cb), () => listeners.delete(cb))
      : key === 'note' ? async (name: string) => (reads.push(name), parseNote(name, `---\nrole: ${roles.get(name.slice(path.length + 1, -3)) ?? ''}\n---\n${name}.`))
        : key === 'typeTable' ? async () => [] : Reflect.get(target, key) });
  const sources = { ...base, vault };
  const screen = (): React.JSX.Element => (
    <MemoryRouter initialEntries={[`/files/${path}`]}>
      <DataProvider sources={sources}><FolderScreen /></DataProvider>
    </MemoryRouter>
  );
  const view = render(screen());
  await act(async () => {});
  expect(view.container.textContent).toContain('Old role');
  reads.length = 0;
  roles.set('Alex', 'Fresh role');
  items = [node('Alex', AT + 1000), node('Kim')];
  await act(async () => listeners.forEach((cb) => cb()));
  await act(async () => {});
  for (let i = 0; i < 2; i++) {
    view.rerender(screen());
    await act(async () => {});
  }
  expect(reads.toSorted(), 'each current note is read once after the change').toEqual([node('Alex').path, node('Kim').path]);
  const text = view.container.textContent ?? '';
  expect(text).toContain('Fresh role');
  expect(text).toContain('New role');
  expect(text).not.toContain('Gone role');
  expect(text).not.toContain('Old role');
});
