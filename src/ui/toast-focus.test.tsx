import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toasts, toast, useToasts } from './toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useToasts.setState({ list: [] });
});

describe('the Undo toast and focus', () => {
  it('focus never drops to body when the Undo toast closes', async () => {
    render(
      <main id="main" tabIndex={-1}>
        <h1>Home</h1>
        <button type="button">Before</button>
        <Toasts />
      </main>,
    );
    const before = screen.getByRole('button', { name: 'Before' });
    before.focus();
    toast('Moved to the Bin.', { label: 'Undo', run: () => undefined });
    const undo = await screen.findByRole('button', { name: 'Undo' });
    // The keyboard reaches the toast, and a press closes it: focus goes back to where it was.
    await userEvent.tab();
    expect(document.activeElement).toBe(undo);
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(before));
  });

  it('a toast that never had the keyboard leaves focus where it is when it times out', async () => {
    render(
      <main id="main" tabIndex={-1}>
        <button type="button">Before</button>
        <Toasts />
      </main>,
    );
    const before = screen.getByRole('button', { name: 'Before' });
    before.focus();
    toast('Saved.');
    await screen.findByText('Saved.');
    useToasts.getState().dismiss(useToasts.getState().list[0]?.id ?? 0);
    await waitFor(() => expect(screen.queryByText('Saved.')).toBeNull());
    expect(document.activeElement).toBe(before);
  });
});
