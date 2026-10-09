import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { TreeNode } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { loadingSources } from '@/testing/loading-sources';
import { MovePicker } from './MovePicker';

afterEach(() => {
  cleanup();
  useUi.getState().setMoveFor(null);
});

it("enter on the current folder's name moves nothing and says it is already there", async () => {
  for (const duplicate of [false, true]) {
    const folder = (path: string, name: string, children?: TreeNode[]): TreeNode =>
      ({ path, name, type: 'folder', modified: 0, created: 0, children });
    const tree = [folder('Projects', 'Projects', [
      folder('Projects/Flat hunt', 'Flat hunt', [
        folder('Projects/Flat hunt/Viewing photos', 'Viewing photos'),
      ]),
    ])];
    if (duplicate) tree.push(folder('Elsewhere', 'Elsewhere', [folder('Elsewhere/Flat hunt', 'Flat hunt')]));
    const base = loadingSources();
    const move = vi.fn(async () => 'Projects/Flat hunt/Viewing photos/Example.md');
    const vault = new Proxy(base.vault, {
      get: (target, key) => key === 'tree' ? async () => tree : key === 'move' ? move : Reflect.get(target, key),
    });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...base, vault }}>
          <MovePicker />
        </DataProvider>
      </MemoryRouter>,
    );
    await act(async () => useUi.getState().setMoveFor('Projects/Flat hunt/Example.md'));
    const input = screen.getByRole('textbox', { name: 'Find a folder' });
    fireEvent.change(input, { target: { value: 'fLaT hUnT' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useUi.getState().moveFor).toBe('Projects/Flat hunt/Example.md');
    expect(move).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(duplicate
      ? 'Several folders match. Pick one with the arrows, or type more.'
      : 'It is already in Flat hunt. Pick another folder with the arrows, or type another name.');
    fireEvent.change(input, { target: { value: 'Flat hunt more' } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    cleanup();
    useUi.getState().setMoveFor(null);
  }
});

it("the move sheet's arrows step over the current folder", async () => {
  const folder = (name: string): TreeNode => ({ path: name, name, type: 'folder', modified: 0, created: 0 });
  const tree = [folder('Before'), folder('Current'), folder('After')];
  const base = loadingSources();
  const move = vi.fn(async () => undefined);
  const vault = new Proxy(base.vault, {
    get: (target, key) => key === 'tree' ? async () => tree : key === 'move' ? move : Reflect.get(target, key),
  });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...base, vault }}>
        <MovePicker />
      </DataProvider>
    </MemoryRouter>,
  );
  await act(async () => useUi.getState().setMoveFor('Current/Example.md'));
  const current = screen.getByRole('button', { name: /Current.*Now here/ });
  expect(current).toHaveAttribute('aria-disabled', 'true');
  const input = screen.getByRole('textbox', { name: 'Find a folder' });
  const before = screen.getByRole('button', { name: 'Before' });
  const after = screen.getByRole('button', { name: 'After' });
  input.focus();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(before).toHaveFocus();
  fireEvent.keyDown(before, { key: 'ArrowDown' });
  expect(after).toHaveFocus();
  fireEvent.keyDown(after, { key: 'ArrowDown' });
  expect(after).toHaveFocus();
  fireEvent.keyDown(after, { key: 'ArrowUp' });
  expect(before).toHaveFocus();
  fireEvent.keyDown(before, { key: 'ArrowUp' });
  expect(input).toHaveFocus();
  fireEvent.click(current);
  expect(useUi.getState().moveFor).toBe('Current/Example.md');
  expect(move).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'Current' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input).toHaveFocus();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(useUi.getState().moveFor).toBe('Current/Example.md');
  expect(move).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'After' } });
  expect(screen.queryByText('Now here')).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: '' } });
  act(() => useUi.getState().setMoveFor('Example.md'));
  expect(screen.queryByText('Now here')).not.toBeInTheDocument();
  act(() => useUi.getState().setMoveFor('Inbox/Example.md'));
  expect(screen.queryByText('Now here')).not.toBeInTheDocument();
});
