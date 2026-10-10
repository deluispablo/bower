import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Dock } from './Dock';
import { undoToast } from './report';
import { useToasts } from './toast';

afterEach(() => {
  cleanup();
  for (const { id } of useToasts.getState().list) useToasts.getState().dismiss(id);
  vi.useRealTimers();
});

it('an online Undo confirmation replaces its toast in place', async () => {
  vi.useFakeTimers();
  render(<main id="main" tabIndex={-1}><button type="button">Before</button><Dock /></main>);
  const before = screen.getByRole('button', { name: 'Before' });
  before.focus();
  act(() => undoToast('Rule removed.', async () => undefined, () => 'The rule is back.'));
  const undo = screen.getByRole('button', { name: 'Undo' });
  const box = undo.parentElement;
  act(() => undo.focus());
  expect(document.activeElement).toBe(undo);
  await act(async () => { fireEvent.click(undo); });
  expect(screen.queryByText('The rule is back.')?.parentElement).toBe(box);
  expect(screen.getByRole('status').children).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  expect(document.activeElement).toBe(before);
  act(() => vi.advanceTimersByTime(3999));
  expect(screen.getByText('The rule is back.')).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText('The rule is back.')).toBeNull();
});
