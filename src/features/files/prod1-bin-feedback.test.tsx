import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { VaultSource } from '@/data/sources';
import { BowerError, type TreeNode } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { useTabs } from '@/app/tabs-store';
import { Dock } from '@/ui/Dock';
import { Sheet } from '@/ui/Sheet';
import { NOT_UNDONE_OFFLINE } from '@/ui/report';
import { Toasts, toast, useToasts } from '@/ui/toast';
import { useFileActions } from './file-actions';

const PENDING = 'Moving to Bin…';
const NOTE = 'Projects/Note.md';
const OTHER = 'Projects/Other.md';
const BINNED = "Note is in your Drive's Bin.";
const BACK = 'Note is back';
const nodes: TreeNode[] = [NOTE, OTHER].map((path) => ({ path, name: path.slice(9), type: 'file', kind: 'note', modified: 0, created: 0 }));

const ui = useUi.getState();
const tabs = useTabs.getState();
let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  history.replaceState(null, '', `/note/${NOTE}`);
  useUi.setState({ bookmarks: [] });
  useUi.getState().select(NOTE);
});
afterEach(() => {
  cleanup();
  useToasts.setState({ list: [] });
  useUi.setState(ui, true);
  useTabs.setState(tabs, true);
  vi.restoreAllMocks();
  vi.useRealTimers();
  history.replaceState(null, '', '/');
});

function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function vaultWith(over: Partial<VaultSource> = {}): VaultSource {
  return { ...loadingSources().vault, tree: async () => nodes, trash: async () => undefined, restore: async () => undefined, markSeen: async () => undefined, subscribe: () => () => undefined, ...over };
}

function With({ vault, children }: { vault: VaultSource; children: ReactNode }) {
  return <DataProvider sources={{ ...loadingSources(), vault }}>{children}</DataProvider>;
}

function Bin({ path = NOTE, name = 'Bin' }: { path?: string; name?: string }) {
  const actions = useFileActions();
  const location = useLocation();
  return <><span data-testid={`page ${name}`}>{location.pathname}</span><button type="button" onClick={() => void actions.trash(path)}>{name}</button></>;
}

const mount = (children: ReactNode) => render(<BrowserRouter>{children}<Toasts /></BrowserRouter>);
const press = (name = 'Bin'): void => { fireEvent.click(screen.getByRole('button', { name })); };
const texts = (): string[] => useToasts.getState().list.map((t) => t.text);
const status = (): HTMLElement => screen.getByRole('status');
const page = (name = 'Bin'): string | null => screen.getByTestId(`page ${name}`).textContent;
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await act(async () => undefined); };

it('held_bin_write_has_immediate_status_and_one_call', async () => {
  const read = later<TreeNode[]>();
  const write = later<undefined>();
  const tree = vi.fn(() => read.promise);
  const trash = vi.fn(() => write.promise);
  mount(<With vault={vaultWith({ tree, trash })}><Bin /></With>);

  press();
  // Announced in the same task as the press, before the folder read answers.
  expect(status()).toHaveTextContent(PENDING);
  press();
  expect(tree).toHaveBeenCalledOnce();
  expect(trash).not.toHaveBeenCalled();

  await act(async () => read.resolve(nodes));
  expect(trash).toHaveBeenCalledExactlyOnceWith(NOTE);
  press();
  press();
  await flush();
  expect(tree).toHaveBeenCalledOnce();
  expect(trash).toHaveBeenCalledOnce();
  expect(texts()).toEqual([PENDING]);
  expect(within(status()).queryByRole('button')).toBeNull();
  // Nothing claims removal while the write is held.
  expect(page()).toBe(`/note/${NOTE}`);
  expect(useUi.getState().selected).toBe(NOTE);

  await act(async () => write.resolve(undefined));
  await vi.waitFor(() => expect(texts()).toEqual([BINNED]));
  expect(within(status()).getByRole('button', { name: 'Undo' })).toBeVisible();
  await vi.waitFor(() => expect(page()).toBe('/files/Projects'));
});

it('bin_failure_replaces_pending_status_without_false_success', async () => {
  const write = later<undefined>();
  const trash = vi.fn(() => write.promise);
  useUi.getState().toggleBookmark(NOTE);
  mount(<With vault={vaultWith({ trash })}><Bin /></With>);

  press();
  expect(status()).toHaveTextContent(PENDING);
  const failure = new BowerError('conflict', 'Someone changed this meanwhile. Try again.');
  await act(async () => write.reject(failure));
  await vi.waitFor(() => expect(texts()).toEqual([failure.message]));
  expect(logged).toHaveBeenCalledWith(failure);
  expect(status()).not.toHaveTextContent("Drive's Bin");
  expect(within(status()).queryByRole('button')).toBeNull();
  // The item stays where it was: page, selection and bookmark.
  expect(page()).toBe(`/note/${NOTE}`);
  expect(useUi.getState().selected).toBe(NOTE);
  expect(useUi.getState().bookmarks).toEqual([NOTE]);

  // Recovery is the same Bin action, free again.
  trash.mockImplementationOnce(async () => undefined);
  press();
  expect(texts()).toEqual([failure.message, PENDING]);
  await vi.waitFor(() => expect(texts()).toEqual([failure.message, BINNED]));
  expect(trash).toHaveBeenCalledTimes(2);
});

it('a Bin kept only on this page leaves with its warning and offers no Undo or retry', async () => {
  const failure = new BowerError('offline', 'Your change was made; keep this page open so Bower can remember it.', { path: null, changeId: 'CHANGE_ID' });
  const write = later<undefined>();
  mount(<With vault={vaultWith({ trash: () => write.promise })}><Bin /></With>);

  press();
  expect(status()).toHaveTextContent(PENDING);
  await act(async () => write.reject(failure));
  await vi.waitFor(() => expect(page()).toBe('/files/Projects'));
  expect(texts()).toEqual([failure.message]);
  expect(within(status()).queryByRole('button')).toBeNull();
  expect(useUi.getState().selected).toBeNull();
  expect(logged).toHaveBeenCalledWith(failure);
});

it('a refused folder read replaces the pending status, writes nothing and lets go', async () => {
  const read = later<TreeNode[]>();
  const tree = vi.fn(() => read.promise);
  const trash = vi.fn(async () => undefined);
  mount(<With vault={vaultWith({ tree, trash })}><Bin /></With>);

  press();
  expect(status()).toHaveTextContent(PENDING);
  press();
  expect(tree).toHaveBeenCalledOnce();
  const failure = new Error('Read refused');
  await act(async () => read.reject(failure));
  await vi.waitFor(() => expect(texts()).toEqual(['That did not work. Try again.']));
  expect(logged).toHaveBeenCalledWith(failure);
  expect(trash).not.toHaveBeenCalled();
  expect(page()).toBe(`/note/${NOTE}`);

  tree.mockImplementation(async () => nodes);
  press();
  await vi.waitFor(() => expect(texts()).toEqual(['That did not work. Try again.', BINNED]));
  expect(tree).toHaveBeenCalledTimes(2);
  expect(trash).toHaveBeenCalledExactlyOnceWith(NOTE);
});

it('a press re-entering during the folder read joins the first Bin', async () => {
  let again: (() => void) | undefined = () => {
    again = undefined;
    screen.getByRole('button', { name: 'Bin' }).click();
  };
  // The read itself presses again, synchronously, before it returns.
  const tree = vi.fn(() => { again?.(); return Promise.resolve(nodes); });
  const trash = vi.fn(async () => undefined);
  mount(<With vault={vaultWith({ tree, trash })}><Bin /></With>);

  press();
  expect(tree).toHaveBeenCalledOnce();
  expect(texts()).toEqual([PENDING]);
  await vi.waitFor(() => expect(texts()).toEqual([BINNED]));
  expect(tree).toHaveBeenCalledOnce();
  expect(trash).toHaveBeenCalledExactlyOnceWith(NOTE);
});

it('one Bin per source and path, across callers, navigation and a remount', async () => {
  const held = later<undefined>();
  const tree = vi.fn(async () => nodes);
  const trash = vi.fn(() => held.promise);
  const vault = vaultWith({ tree, trash });
  const view = mount(<With vault={vault}><Bin name="Bin here" /><Bin name="Bin there" /></With>);
  press('Bin here');
  press('Bin there');
  await flush();
  expect(tree).toHaveBeenCalledOnce();
  expect(trash).toHaveBeenCalledOnce();
  expect(texts()).toEqual([PENDING]);

  view.unmount();
  history.replaceState(null, '', '/files/Areas');
  const elsewhere = later<undefined>();
  const trashElsewhere = vi.fn(() => elsewhere.promise);
  mount(<>
    <With vault={vault}><Bin name="Bin again" /><Bin path={OTHER} name="Bin other" /></With>
    <With vault={vaultWith({ trash: trashElsewhere })}><Bin name="Bin elsewhere" /></With>
  </>);
  press('Bin again');
  await flush();
  expect(tree).toHaveBeenCalledOnce();
  expect(trash).toHaveBeenCalledOnce();
  expect(texts()).toEqual([PENDING]);

  // Another path on the same source, and the same path on another source, are their own Bins.
  press('Bin other');
  press('Bin elsewhere');
  await flush();
  expect(trash).toHaveBeenCalledTimes(2);
  expect(trash).toHaveBeenLastCalledWith(OTHER);
  expect(trashElsewhere).toHaveBeenCalledExactlyOnceWith(NOTE);
  expect(texts()).toEqual([PENDING, PENDING, PENDING]);

  await act(async () => { held.resolve(undefined); elsewhere.resolve(undefined); });
  await vi.waitFor(() => expect(texts()).toEqual([BINNED, "Other is in your Drive's Bin.", BINNED]));
  expect(trash).toHaveBeenCalledTimes(2);
});

it('Bin, Undo, then Bin again: one write each, the bookmark back, nothing left pending', async () => {
  const trash = vi.fn(async () => undefined);
  const restore = vi.fn(async () => undefined);
  useUi.getState().toggleBookmark(NOTE);
  mount(<With vault={vaultWith({ trash, restore })}><Bin /></With>);

  press();
  await vi.waitFor(() => expect(texts()).toEqual([BINNED]));
  expect(useUi.getState().bookmarks).toEqual([]);
  press('Undo');
  await vi.waitFor(() => expect(texts()).toEqual([BACK]));
  expect(restore).toHaveBeenCalledExactlyOnceWith(NOTE);
  expect(useUi.getState().bookmarks).toEqual([NOTE]);

  press();
  expect(texts()).toEqual([BACK, PENDING]);
  await vi.waitFor(() => expect(texts()).toEqual([BACK, BINNED]));
  expect(trash).toHaveBeenCalledTimes(2);
});

it('a pending Bin stays past thirty seconds, then its outcome keeps ordinary timing', async () => {
  vi.useFakeTimers();
  const write = later<undefined>();
  mount(<With vault={vaultWith({ trash: () => write.promise })}><Bin /></With>);

  press();
  await flush();
  act(() => vi.advanceTimersByTime(31_000));
  expect(texts()).toEqual([PENDING]);
  expect(status()).toHaveTextContent(PENDING);

  await act(async () => write.resolve(undefined));
  await flush();
  expect(texts()).toEqual([BINNED]);
  act(() => vi.advanceTimersByTime(7999));
  expect(texts()).toEqual([BINNED]);
  act(() => vi.advanceTimersByTime(1));
  expect(texts()).toEqual([]);
});

it.each([
  { outcome: 'success', said: BINNED },
  { outcome: 'failure', said: 'That did not work. Try again.' },
])('a pending Bin put away by newer messages still says its $outcome once', async ({ outcome, said }) => {
  const write = later<undefined>();
  const tree = vi.fn(async () => nodes);
  const trash = vi.fn(() => write.promise);
  const restore = vi.fn(async () => undefined);
  mount(<With vault={vaultWith({ tree, trash, restore })}><Bin /></With>);

  press();
  await flush();
  act(() => { for (const text of ['One', 'Two', 'Three']) toast(text); });
  expect(texts()).toEqual(['One', 'Two', 'Three']);
  // Still pending: pressing again joins it without a second write or message.
  press();
  await flush();
  expect(trash).toHaveBeenCalledOnce();
  expect(texts()).toEqual(['One', 'Two', 'Three']);

  await act(async () => { if (outcome === 'success') write.resolve(undefined); else write.reject(new Error('Refused')); });
  await vi.waitFor(() => expect(texts()).toEqual(['Two', 'Three', said]));
  expect(tree).toHaveBeenCalledOnce();
  if (outcome === 'failure') return;
  press('Undo');
  await vi.waitFor(() => expect(texts()).toEqual(['Two', 'Three', BACK]));
  expect(restore).toHaveBeenCalledOnce();
});

it('an Undo put away while it runs, refused offline, then tried again, restores once in its own message', async () => {
  const offline = later<undefined>();
  const restore = vi.fn(() => offline.promise);
  useUi.getState().toggleBookmark(NOTE);
  mount(<With vault={vaultWith({ restore })}><Bin /></With>);

  press();
  await vi.waitFor(() => expect(texts()).toEqual([BINNED]));
  press('Undo');
  act(() => { for (const text of ['One', 'Two', 'Three']) toast(text); });
  expect(texts()).toEqual(['One', 'Two', 'Three']);
  await act(async () => offline.reject(new BowerError('offline', 'Bower could not reach Drive.')));
  await vi.waitFor(() => expect(texts()).toEqual(['Two', 'Three', NOT_UNDONE_OFFLINE]));
  expect(useUi.getState().bookmarks).toEqual([]);
  const retry = useToasts.getState().list.at(-1)?.id;

  restore.mockImplementationOnce(async () => undefined);
  press('Try again');
  await vi.waitFor(() => expect(texts()).toEqual(['Two', 'Three', BACK]));
  expect(useToasts.getState().list.at(-1)?.id).toBe(retry);
  expect(restore).toHaveBeenCalledTimes(2);
  expect(useUi.getState().bookmarks).toEqual([NOTE]);
});

function ModalDock({ open }: { open: boolean }) {
  return <>
    <Dock />
    <Bin />
    <Sheet open={open} onOpenChange={() => undefined} title="Bin details"><button type="button">Keep it</button></Sheet>
  </>;
}

it('a Bin pressed under a sheet waits to be announced, and a settled one announces only its outcome', async () => {
  vi.spyOn(history, 'pushState').mockImplementation(() => undefined);
  const write = later<undefined>();
  const vault = vaultWith({ trash: () => write.promise });
  const view = render(<BrowserRouter><With vault={vault}><ModalDock open /></With></BrowserRouter>);
  expect(screen.getByRole('dialog', { name: 'Bin details' })).toBeVisible();

  fireEvent.click(screen.getByText('Bin', { selector: 'button' }));
  expect(texts()).toEqual([PENDING]);
  expect(screen.getByRole('status', { hidden: true })).toBeEmptyDOMElement();
  view.rerender(<BrowserRouter><With vault={vault}><ModalDock open={false} /></With></BrowserRouter>);
  expect(screen.getByRole('status')).toHaveTextContent(PENDING);

  view.rerender(<BrowserRouter><With vault={vault}><ModalDock open /></With></BrowserRouter>);
  const failure = new Error('Refused');
  await act(async () => write.reject(failure));
  await vi.waitFor(() => expect(texts()).toEqual(['That did not work. Try again.']));
  expect(screen.getByRole('status', { hidden: true })).toBeEmptyDOMElement();
  view.rerender(<BrowserRouter><With vault={vault}><ModalDock open={false} /></With></BrowserRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('That did not work. Try again.');
  expect(screen.getByRole('status')).not.toHaveTextContent(PENDING);
});
