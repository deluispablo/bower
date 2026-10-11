import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import { parseNote } from '@/data/contracts/note-format';
import type { TreeNode, TypeRow } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { FolderScreen } from './FolderScreen';

const initial = useUi.getState();
const AT = Date.UTC(2026, 9, 11);
const path = 'Resources/Contacts';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT); localStorage.setItem('bower:folder-view', 'table'); });
afterEach(() => { cleanup(); useUi.setState(initial, true); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('b5b-r3 2 declared properties have their own ids', async () => {
  const row: TypeRow = { id: 'contact', match: ['contact'], template: 'source',
    properties: { name: { type: 'text' }, modified: { type: 'text' }, company: { type: 'text' } },
    table: ['name', 'modified'],
  };
  const items: TreeNode[] = [
    { path: `${path}/Contact 10.md`, name: 'Contact 10.md', type: 'file', kind: 'note', created: AT,
      modified: AT - 2 * 86_400_000 },
    { path: `${path}/Contact 2.md`, name: 'Contact 2.md', type: 'file', kind: 'note', created: AT,
      modified: AT - 3 * 86_400_000 },
  ];
  const notes = Object.fromEntries(items.map((item, i) => [item.path, parseNote(item.path,
    `---\ntype: contact\nname: ${i === 0 ? 'Alex' : 'Zebra'}\nmodified: Person-entered fact\ncompany: ${i === 0 ? 'Acorn Studio' : 'Willow Studio'}\n---\nAlex keeps a contact.`)]));
  const tree: TreeNode[] = [{ path: 'Resources', name: 'Resources', type: 'folder', created: AT, modified: AT,
    children: [{ path, name: 'Contacts', type: 'folder', created: AT, modified: AT, children: items }] }];
  const base = loadingSources();
  const show = async (table: string[]) => {
    const vault = new Proxy(base.vault, { get: (target, key) => key === 'tree' ? async () => tree
      : key === 'note' ? async (name: string) => notes[name] ?? null
        : key === 'typeTable' ? async () => [{ ...row, table }] : Reflect.get(target, key) });
    render(<MemoryRouter initialEntries={['/files/Resources/Contacts']}>
      <DataProvider sources={{ ...base, vault }}><FolderScreen /></DataProvider>
    </MemoryRouter>);
    await act(async () => {});
    return within(screen.getByRole('table'));
  };
  const control = await show(['company']);
  // The ordinary declared key is a positive control: its facts must survive under its own column.
  expect(control.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Name', 'Company', 'Changed']);
  expect(control.getByRole('cell', { name: 'Acorn Studio' })).toBeVisible();
  expect(control.getByRole('cell', { name: 'Willow Studio' })).toBeVisible();
  fireEvent.click(control.getByRole('button', { name: 'Company' }));
  expect(control.getAllByRole('link').map((link) => link.textContent), 'ordinary declared fact sorts under its own id')
    .toEqual(['Contact 10', 'Contact 2']);
  fireEvent.click(control.getByRole('button', { name: 'Company' }));
  expect(control.getAllByRole('link').map((link) => link.textContent)).toEqual(['Contact 2', 'Contact 10']);
  cleanup();
  const view = await show(row.table);
  expect.soft(view.getAllByRole('columnheader').map((header) => header.textContent))
    .toEqual(['Name', 'Changed']);
  expect.soft(view.getAllByRole('columnheader', { name: 'Name' })).toHaveLength(1);
  expect.soft(view.getAllByRole('columnheader', { name: 'Changed' })).toHaveLength(1);
  for (const item of items) {
    const tr = view.getByRole('link', { name: item.name.replace('.md', '') }).closest('tr');
    if (!tr) throw new Error('Missing contact row');
    const i = items.indexOf(item);
    expect.soft(within(tr).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      item.name.replace('.md', ''), i === 0 ? '9 Oct' : '8 Oct',
    ]);
  }
  for (const fact of ['Alex', 'Zebra', 'Person-entered fact']) expect(view.queryByRole('cell', { name: fact })).toBeNull();
  const order = () => view.getAllByRole('link').map((link) => link.textContent);
  expect(order(), 'Name initially sorts filenames numerically, rather than the declared name fact')
    .toEqual(['Contact 2', 'Contact 10']);
  const name = view.getAllByRole('button', { name: 'Name' })[0];
  const changed = view.getAllByRole('columnheader', { name: 'Changed' }).at(-1);
  if (!name || !changed) throw new Error('Missing built-in table controls');
  fireEvent.click(name);
  expect(order()).toEqual(['Contact 10', 'Contact 2']);
  fireEvent.click(name);
  expect(order()).toEqual(['Contact 2', 'Contact 10']);
  fireEvent.click(within(changed).getByRole('button'));
  expect(changed).toHaveAttribute('aria-sort', 'ascending');
  expect(order(), 'Changed sorts timestamps rather than the declared modified fact').toEqual(['Contact 2', 'Contact 10']);
  fireEvent.click(within(changed).getByRole('button'));
  expect(changed).toHaveAttribute('aria-sort', 'descending');
  expect(order()).toEqual(['Contact 10', 'Contact 2']);
});
