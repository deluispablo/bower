import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { useTabs } from '@/app/tabs-store';
import { toast } from '@/ui/toast';
import { useFileActions } from './file-actions';
import { NameSheet } from './NameSheet';

vi.mock('@/ui/toast', () => ({ toast: vi.fn() }));
const ui = useUi.getState();
const tabs = useTabs.getState();
afterEach(() => {
  cleanup();
  useUi.setState(ui, true);
  useTabs.setState(tabs, true);
  vi.clearAllMocks();
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
    expect(toast).toHaveBeenCalledWith(failure.message);
    expect(vi.mocked(toast).mock.calls.every((call) => call.length === 1)).toBe(true);
    expect(useUi.getState().selected).toBe(path);
    cleanup();
    vi.clearAllMocks();
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
  expect(toast).toHaveBeenCalledWith(failure.message);
  expect(screen.queryByRole('dialog')).toBeNull();
});
