/**
 * c4-undo-compensate (TL-P4-27 addenda 4 (4) and 5): an Undo that cannot reach Drive (a Bin restore offline) is told in
 * place, in the same message, with Try again running the same Undo; it never says the thing is back before it is.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BowerError } from '@/data/types';
import { undoToast } from './report';
import { useToasts } from './toast';

const NOT_UNDONE = 'Not undone yet: Bower could not reach Drive. Try again when you are back online.';

afterEach(() => {
  useToasts.setState({ list: [] });
  vi.restoreAllMocks();
});

describe('undoToast offline', () => {
  it('an Undo refused offline replaces its message with Not undone yet and Try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const done = vi.fn();
    const undo = vi.fn(async () => { throw new BowerError('offline', "You're offline. Changes wait until you're back."); });
    undoToast("Lease draft is in your Drive's Bin.", undo, done);
    const [first] = useToasts.getState().list;
    if (!first) throw new Error('no toast');
    await useToasts.getState().press(first.id);
    await vi.waitFor(() => expect(useToasts.getState().list.map((t) => t.text)).toEqual([NOT_UNDONE]));
    expect(useToasts.getState().list[0]?.id).toBe(first.id);
    expect(useToasts.getState().list[0]?.action?.label).toBe('Try again');
    expect(done).not.toHaveBeenCalled();
    // Try again runs the same Undo; back online, it is done.
    undo.mockResolvedValueOnce(undefined);
    await useToasts.getState().press(first.id);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(undo).toHaveBeenCalledTimes(2);
  });
});
