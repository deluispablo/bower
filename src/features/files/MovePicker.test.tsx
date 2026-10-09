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
