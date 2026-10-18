import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { useTabs } from '@/app/tabs-store';
import { useToasts } from '@/ui/toast';
import { useFileActions } from './file-actions';
import * as fileActions from './file-actions';
import { NameSheet } from './NameSheet';

const ui = useUi.getState();
const tabs = useTabs.getState();
/** What the real message stack shows, with whether each has a button (a saved or Undo promise would). */
const said = (): Array<{ text: string; action: boolean }> => useToasts.getState().list.map((t) => ({ text: t.text, action: !!t.action }));
afterEach(() => {
  cleanup();
  useToasts.setState({ list: [] });
  useUi.setState(ui, true);
  useTabs.setState(tabs, true);
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

function Actions() {
  const actions = useFileActions();
  const location = useLocation();
  const [result, setResult] = useState<string | null>('');
  return <><output aria-label="Page">{location.pathname}</output><output aria-label="Result">{result}</output><button onClick={() => void actions.move('Projects/Note.md', 'Areas').then(setResult)}>Move</button><button onClick={() => void actions.rename('Projects/Note.md', 'Named').then(setResult)}>Rename</button><button onClick={() => void actions.trash('Projects/Note.md')}>Bin</button></>;
}

it('a change kept only on this page follows its applied path without a saved or Undo promise', async () => {
  for (const action of ['Move', 'Rename', 'Bin']) {
    const base = loadingSources();
    const path = action === 'Bin' ? null : action === 'Move' ? 'Areas/Note.md' : 'Projects/Named.md';
    const failure = new BowerError('offline', 'Your change was made; keep this page open so Bower can remember it.', { path, changeId: 'CHANGE_ID' });
    const reject = async (): Promise<never> => { throw failure; };
    history.replaceState(null, '', '/note/Projects/Note.md');
    useUi.getState().select('Projects/Note.md');
    render(<BrowserRouter><DataProvider sources={{ ...base, vault: { ...base.vault, tree: async () => [{ path: 'Projects/Note.md', name: 'Note.md', type: 'file', kind: 'note', modified: 0, created: 0 }], move: reject, rename: reject, trash: reject } }}><Actions /></DataProvider></BrowserRouter>);
    fireEvent.click(screen.getByRole('button', { name: action }));
    await vi.waitFor(() => expect(screen.getByLabelText('Page').textContent).toBe(path === null ? '/files/Projects' : `/note/${path}`));
    if (path) expect(screen.getByLabelText('Result').textContent).toBe(path);
    // One message, the warning itself (a Bin's pending words are replaced by it), with no button.
    expect(said()).toEqual([{ text: failure.message, action: false }]);
    expect(useUi.getState().selected).toBe(path);
    cleanup();
    useToasts.setState({ list: [] });
  }
});

it('a named thing made before its journal warning opens once without a retry prompt', async () => {
  const base = loadingSources();
  const failure = new BowerError('unknown', 'Your change was made; keep this page open so Bower can remember it.', { path: 'Projects/New folder', changeId: 'CHANGE_ID' });
  const create = vi.fn(async (): Promise<never> => { throw failure; });
  history.replaceState(null, '', '/files/Projects');
  useUi.getState().setNaming({ folder: 'Projects', type: 'folder' });
  render(<BrowserRouter><DataProvider sources={{ ...base, vault: { ...base.vault, tree: async () => [], subscribe: () => () => undefined, create, markSeen: async () => undefined } }}><Actions /><NameSheet /></DataProvider></BrowserRouter>);
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'New folder' } });
  fireEvent.click(screen.getByRole('button', { name: 'Make the folder' }));
  await vi.waitFor(() => expect(screen.getByLabelText('Page').textContent).toBe('/files/Projects/New%20folder'));
  expect(create).toHaveBeenCalledOnce();
  expect(said()).toEqual([{ text: failure.message, action: false }]);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it("createNamed creates once and reports NameSheet's refused-create sentence", async () => {
  const base = loadingSources();
  const path = 'Resources/Garden plans';
  const create = vi.fn(async () => path);
  const { result } = renderHook(() => fileActions.useFileActions() as ReturnType<typeof useFileActions> & {
    createNamed?: (folder: string, name: string) => Promise<void>;
  }, {
    wrapper: ({ children }) => <BrowserRouter><DataProvider sources={{ ...base, vault: { ...base.vault, create } }}>{children}</DataProvider></BrowserRouter>,
  });
  expect(typeof result.current.createNamed).toBe('function');
  const createNamed = result.current.createNamed;
  if (!createNamed) return;

  await act(() => createNamed('Resources', 'Garden plans'));
  expect(create).toHaveBeenCalledExactlyOnceWith('Resources', 'folder', 'Garden plans');
  expect(location.pathname).toBe('/files/Resources/Garden%20plans');
  expect(useUi.getState().selected).toBe(path);
  expect(said()).toEqual([]);

  const failure = new Error('Create refused');
  create.mockClear();
  create.mockRejectedValueOnce(failure);
  await act(() => createNamed('Resources', 'Garden plans'));
  expect(create).toHaveBeenCalledExactlyOnceWith('Resources', 'folder', 'Garden plans');
  expect(said()).toEqual([{ text: 'The folder was not made. Try again.', action: false }]);
});
