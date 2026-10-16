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
