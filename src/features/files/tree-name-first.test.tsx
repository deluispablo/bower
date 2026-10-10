import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { useTabs } from '@/app/tabs-store';
import { DataProvider } from '@/data/provider';
import { BowerError, type TreeNode } from '@/data/types';
import type { VaultSource } from '@/data/sources';
import { loadingSources } from '@/testing/loading-sources';
import { toast } from '@/ui/toast';
import { Explorer } from './Explorer';

vi.mock('@/ui/toast', () => ({ toast: vi.fn() }));
const initialUi = useUi.getState();
const initialTabs = useTabs.getState();
const folder = (path: string, children: TreeNode[] = []): TreeNode => ({
  path, name: path.split('/').at(-1) ?? path, type: 'folder', modified: 0, created: 0, children,
});
const drain = async (): Promise<void> => { await act(async () => {}); };

beforeEach(() => {
  vi.useFakeTimers();
  history.replaceState(null, '', '/files');
  useUi.setState({ ...initialUi, open: new Set(['Projects']), selected: 'Projects', sort: 'name-az' }, true);
});
afterEach(() => {
  cleanup();
  useUi.setState(initialUi, true);
  useTabs.setState(initialTabs, true);
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  history.replaceState(null, '', '/');
});

function Page() {
  return <output aria-label="Page">{useLocation().pathname}</output>;
}

/** A subscribed source, so the screen sees the made row just as it does in production. */
async function show() {
  const base = loadingSources();
  const resources = folder('Resources', [folder('Resources/Alpha'), folder('Resources/Zebra')]);
  const projects = folder('Projects', [folder('Projects/Existing')]);
  let tree = [projects, resources];
  const listeners = new Set<() => void>();
  const publish = (path: string): void => {
    const parent = path.slice(0, path.lastIndexOf('/'));
    tree = tree.map((node) => node.path === parent
      ? { ...node, children: [...(node.children ?? []), folder(path)] }
      : node);
    listeners.forEach((listener) => listener());
  };
  const create = vi.fn<VaultSource['create']>(async (parent, _type, name) => {
    const path = `${parent}/${name ?? 'New folder'}`;
    publish(path);
    return path;
  });
  const rename = vi.fn<VaultSource['rename']>(async (path, name) => {
    const to = `${path.slice(0, path.lastIndexOf('/'))}/${name}`;
    tree = tree.map((node) => ({ ...node, children: node.children?.map((child) => child.path === path ? folder(to) : child) }));
    listeners.forEach((listener) => listener());
    return to;
  });
  const trash = vi.fn<VaultSource['trash']>(async (path) => {
    tree = tree.map((node) => ({ ...node, children: node.children?.filter((child) => child.path !== path) }));
    listeners.forEach((listener) => listener());
  });
  render(<BrowserRouter><DataProvider sources={{ ...base, vault: {
    ...base.vault, tree: async () => tree, piles: async () => [], create, rename, trash,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  } }}><Explorer variant="panel" /><Page /><button>Elsewhere</button></DataProvider></BrowserRouter>);
  await drain();
  const treeElement = screen.getByRole('tree', { name: 'Your Bower folder' });
  const row = (path: string): HTMLElement => {
    const found = treeElement.querySelector<HTMLElement>(`[data-path="${path}"]`);
    expect(found, `loaded tree row ${path}`).not.toBeNull();
    if (!found) throw new Error('Fixture row missing');
    return found;
  };
  // Positive controls: both targets are present, and the header is an enabled real entry point.
  expect(row('Resources')).toHaveAttribute('aria-expanded', 'false');
  expect(row('Projects')).toHaveAttribute('aria-selected', 'true');
  const header = screen.getByRole('button', { name: 'New folder' });
  expect(header).toBeEnabled();
  return { create, rename, trash, publish, row, header, tree: treeElement };
}

type View = Awaited<ReturnType<typeof show>>;
type Entry = 'row menu' | 'header';
async function fresh(): Promise<View> {
  cleanup();
  useUi.setState({ ...initialUi, open: new Set(['Projects']), selected: 'Projects', sort: 'name-az' }, true);
  history.replaceState(null, '', '/files');
  return show();
}
function start(view: View, entry: Entry = 'header'): void {
  if (entry === 'header') {
    view.header.focus();
    fireEvent.click(view.header);
  } else {
    fireEvent.contextMenu(view.row('Resources'));
    const item = screen.getByRole('menuitem', { name: 'New folder' });
    expect(item).toBeEnabled();
    fireEvent.click(item);
  }
}

/** Query the editable tree field, allowing reds to reach the old create-then-rename behaviour. */
function box(view: View): HTMLInputElement {
  const input = within(view.tree).queryByRole('textbox');
  expect(input, 'an editable row in the tree').toBeInstanceOf(HTMLInputElement);
  return input as HTMLInputElement;
}
function typeName(input: HTMLInputElement, name = 'Garden plans'): void {
  fireEvent.change(input, { target: { value: name } });
  expect(input).toHaveValue(name);
}
function enter(input: HTMLInputElement): void { fireEvent.keyDown(input, { key: 'Enter' }); }
function blur(input: HTMLInputElement): void {
  act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus());
  // The focus call dispatches a real blur; do not also fire a second artificial blur.
  expect(input).not.toHaveFocus();
}
function fieldError(view: View, input: HTMLInputElement, sentence: string): void {
  const error = within(view.tree).queryByRole('alert');
  expect.soft(error, 'inline FieldError exists').not.toBeNull();
  if (error) expect.soft(error).toHaveTextContent(sentence);
  expect.soft(input).toHaveAttribute('aria-invalid', 'true');
  const ids = input.getAttribute('aria-describedby')?.split(' ') ?? [];
  if (error) {
    expect.soft(error.id, 'FieldError has an id').toBeTruthy();
    expect.soft(ids, 'field describes its FieldError').toContain(error.id);
  }
}

it.each(['row menu', 'header'] as const)('%s New folder focuses its name before an unresolved create', async (entry) => {
  const view = await show();
  let resolve!: (path: string) => void;
  const pending = new Promise<string>((done) => { resolve = done; });
  view.create.mockImplementation(() => pending);
  start(view, entry);
  // No await, timer advance, or field wait after the production click.
  const target = entry === 'row menu' ? 'Resources' : 'Projects';
  const input = within(view.tree).queryByRole('textbox', { name: `New folder in ${target}` });
  expect.soft(input, 'name field exists synchronously').toBeInstanceOf(HTMLInputElement);
  expect.soft(view.create, 'nothing is created before a name').not.toHaveBeenCalled();
  if (!(input instanceof HTMLInputElement)) return;
  expect(input).toHaveFocus();
  typeName(input);
  enter(input);
  expect(view.create).toHaveBeenCalledExactlyOnceWith(target, 'folder', 'Garden plans');
  expect(input).toHaveValue('Garden plans');
  await act(async () => { view.publish(`${target}/Garden plans`); resolve(`${target}/Garden plans`); await pending; });
  expect(view.row(`${target}/Garden plans`)).toHaveAttribute('aria-selected', 'true');
  expect(view.create).toHaveBeenCalledOnce();
});

it.each(['row menu', 'header'] as const)('%s pending row is the first child with folder icon, Name placeholder and immediate focus', async (entry) => {
  const view = await show();
  start(view, entry);
  await drain();
  const input = box(view);
  const target = entry === 'row menu' ? 'Resources' : 'Projects';
  expect.soft(input).toHaveValue('');
  expect.soft(input).toHaveAttribute('placeholder', 'Name');
  expect.soft(input).toHaveAccessibleName(`New folder in ${target}`);
  expect.soft(input).toHaveFocus();
  const pending = input.closest('[role="treeitem"]');
  expect(pending).not.toBeNull();
  if (!(pending instanceof HTMLElement)) return;
  const parent = view.row(target);
  expect.soft(parent).toHaveAttribute('aria-expanded', 'true');
  const rows = within(view.tree).getAllByRole('treeitem');
  expect.soft(rows.indexOf(pending)).toBe(rows.indexOf(parent) + 1);
  const sibling = view.row(`${target}/${entry === 'row menu' ? 'Alpha' : 'Existing'}`);
  expect.soft(pending).toHaveAttribute('aria-level', sibling.getAttribute('aria-level'));
  expect.soft(pending.style.paddingLeft).toBe(sibling.style.paddingLeft);
  // The existing Icon folder path is a decorative SVG, not an extra accessible control.
  const folderPath = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
  expect.soft([...pending.querySelectorAll('svg[aria-hidden="true"] path')].some((path) => path.getAttribute('d') === folderPath)).toBe(true);
  expect.soft(view.create).not.toHaveBeenCalled();
});

it.each(['row menu', 'header'] as const)('%s Escape drops the pending row without a write and returns focus to its opener', async (entry) => {
  const view = await show();
  start(view, entry);
  await drain();
  const input = box(view);
  const pendingRow = input.closest('[role="treeitem"]');
  expect(pendingRow).not.toBeNull();
  typeName(input);
  fireEvent.keyDown(input, { key: 'Escape' });
  await drain();
  expect(within(view.tree).queryByRole('textbox')).toBeNull();
  expect.soft(pendingRow, 'Escape removes the pending row').not.toBeInTheDocument();
  expect.soft(view.create, 'Escape creates nothing').not.toHaveBeenCalled();
  expect.soft(view.trash, 'Escape needs no compensating write').not.toHaveBeenCalled();
  if (entry === 'header') expect.soft(view.header).toHaveFocus();
  else {
    const origin = view.row('Resources');
    expect.soft(document.activeElement === origin || (document.activeElement === view.tree && view.tree.getAttribute('aria-activedescendant') === origin.id)).toBe(true);
  }
  // Positive control: cancelling did not disable naming; a fresh named submission makes a folder.
  const positive = await fresh();
  start(positive, entry);
  await drain();
  typeName(box(positive), 'Garden sketches');
  enter(box(positive));
  await drain();
  expect.soft(positive.create).toHaveBeenCalledExactlyOnceWith(entry === 'row menu' ? 'Resources' : 'Projects', 'folder', 'Garden sketches');
});

it('blur with a name makes that folder once', async () => {
  const view = await show();
  start(view);
  await drain();
  const input = box(view);
  typeName(input);
  blur(input);
  await drain();
  expect(view.create).toHaveBeenCalledExactlyOnceWith('Projects', 'folder', 'Garden plans');
  expect(view.row('Projects/Garden plans')).toHaveAttribute('aria-selected', 'true');
  expect(view.rename).not.toHaveBeenCalled();
});

it('empty blur drops the pending row silently and a named blur still creates', async () => {
  const view = await show();
  start(view);
  await drain();
  const input = box(view);
  const pendingRow = input.closest('[role="treeitem"]');
  expect(pendingRow).not.toBeNull();
  typeName(input, '');
  blur(input);
  await drain();
  expect(within(view.tree).queryByRole('textbox')).toBeNull();
  expect.soft(pendingRow, 'empty blur removes the pending row').not.toBeInTheDocument();
  expect.soft(view.create).not.toHaveBeenCalled();
  expect.soft(view.trash).not.toHaveBeenCalled();
  expect.soft(toast).not.toHaveBeenCalled();
  const positive = await fresh();
  start(positive);
  await drain();
  typeName(box(positive));
  blur(box(positive));
  await drain();
  expect.soft(positive.create).toHaveBeenCalledExactlyOnceWith('Projects', 'folder', 'Garden plans');
});

it('empty Enter makes nothing and keeps the field until a named Enter creates', async () => {
  const view = await show();
  start(view);
  await drain();
  const input = box(view);
  typeName(input, '');
  enter(input);
  await drain();
  expect.soft(view.create).not.toHaveBeenCalled();
  expect.soft(input).toBeInTheDocument();
  expect.soft(input).toHaveFocus();
  expect.soft(toast).not.toHaveBeenCalled();
  // Positive control: the same entry accepts a non-empty name.
  const positive = await fresh();
  start(positive);
  await drain();
  typeName(box(positive));
  enter(box(positive));
  await drain();
  expect.soft(positive.create).toHaveBeenCalledExactlyOnceWith('Projects', 'folder', 'Garden plans');
});

it('slashes show the inline FieldError and create with dashes while a plain name has no error', async () => {
  const view = await show();
  start(view);
  await drain();
  const input = box(view);
  typeName(input);
  expect(within(view.tree).queryByRole('alert')).toBeNull();
  expect(input).not.toHaveAttribute('aria-invalid', 'true');
  typeName(input, 'Garden/plans\\Sketches');
  fieldError(view, input, 'Names cannot have slashes; Bower used a dash.');
  enter(input);
  await drain();
  expect.soft(view.create).toHaveBeenCalledExactlyOnceWith('Projects', 'folder', 'Garden-plans-Sketches');
  expect.soft(view.rename).not.toHaveBeenCalled();
});

it.each([
  ['failed create', 'Garden plans', new BowerError('offline', 'The folder could not be made.')],
  ['taken name', 'Existing', new BowerError('conflict', 'That name is already taken.')],
  ['leading dot', '.Garden plans', new BowerError('conflict', 'A name cannot start with a dot.')],
] as const)('%s keeps the name and inline FieldError; Enter retries once without a toast', async (_reason, name, failure) => {
  const view = await show();
  start(view);
  await drain();
  const input = box(view);
  // Refuse the named write, after the input is open. The source owns taken-name and dot rules.
  view.create.mockRejectedValueOnce(failure);
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  typeName(input, name);
  enter(input);
  await drain();
  expect.soft(input, 'refusal keeps the editable name').toBeInTheDocument();
  expect.soft(input).toHaveValue(name);
  fieldError(view, input, 'The folder was not made. Try again.');
  expect.soft(toast).not.toHaveBeenCalled();
  expect.soft(view.create).toHaveBeenCalledExactlyOnceWith('Projects', 'folder', name);
  expect.soft(errorLog).toHaveBeenCalled();
  if (!input.isConnected) return;
  // Positive control: retrying (or correcting a refused name) succeeds, with one additional write.
  if (name !== 'Garden plans') typeName(input);
  enter(input);
  await drain();
  expect(view.create.mock.calls).toEqual([
    ['Projects', 'folder', name], ['Projects', 'folder', 'Garden plans'],
  ]);
  expect(within(view.tree).queryByRole('textbox')).toBeNull();
  expect(view.row('Projects/Garden plans')).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('Page')).toHaveTextContent('/files/Projects/Garden%20plans');
  expect(toast).not.toHaveBeenCalled();
});

it('after create the new row is selected and focused and its folder page opens', async () => {
  const view = await show();
  expect(screen.getByLabelText('Page')).toHaveTextContent('/files');
  start(view);
  await drain();
  typeName(box(view));
  enter(box(view));
  await drain();
  const made = view.row('Projects/Garden plans');
  expect.soft(made).toHaveAttribute('aria-selected', 'true');
  expect.soft(document.activeElement === made || (document.activeElement === view.tree && view.tree.getAttribute('aria-activedescendant') === made.id)).toBe(true);
  expect.soft(screen.getByLabelText('Page')).toHaveTextContent('/files/Projects/Garden%20plans');
  expect.soft(view.create).toHaveBeenCalledExactlyOnceWith('Projects', 'folder', 'Garden plans');
});

it('Enter followed by blur and another Enter makes the named folder once', async () => {
  const view = await show();
  let resolve!: (path: string) => void;
  const pending = new Promise<string>((done) => { resolve = done; });
  // Bootstrap the old rename field too, then hold the actual named write unresolved.
  start(view);
  await drain();
  view.create.mockImplementation(() => pending);
  const input = box(view);
  typeName(input);
  enter(input);
  blur(input);
  enter(input);
  expect(view.create).toHaveBeenCalledExactlyOnceWith('Projects', 'folder', 'Garden plans');
  await act(async () => { view.publish('Projects/Garden plans'); resolve('Projects/Garden plans'); await pending; });
  expect(view.row('Projects/Garden plans')).toHaveAttribute('aria-selected', 'true');
  expect(view.create).toHaveBeenCalledOnce();
});
