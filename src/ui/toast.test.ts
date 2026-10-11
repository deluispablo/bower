import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from './toast';

afterEach(() => {
  vi.useRealTimers();
  useToasts.setState({ list: [] });
});

describe('toasts', () => {
  it('MWS no sheet open keeps the usual four and eight second message lifetimes', () => {
    vi.useFakeTimers();
    const { show } = useToasts.getState();
    const plain = show('Alex added a note');
    const action = show('Pile moved', { label: 'Undo', run: () => undefined });
    // Positive control: both kinds are in the stack before time advances.
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([plain, action]);
    vi.advanceTimersByTime(3999);
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([plain, action]);
    vi.advanceTimersByTime(1);
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([action]);
    vi.advanceTimersByTime(3999);
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([action]);
    vi.advanceTimersByTime(1);
    expect(useToasts.getState().list).toHaveLength(0);
  });

  it.each(['pointer', 'keyboard'] as const)('MWS no sheet open keeps the existing %s hold', (by) => {
    vi.useFakeTimers();
    const { show, hold } = useToasts.getState();
    const id = show('Pile moved', { label: 'Undo', run: () => undefined });
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([id]);
    vi.advanceTimersByTime(1000);
    hold(id, true, by);
    vi.advanceTimersByTime(30_000);
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([id]);
    hold(id, false, by);
    vi.advanceTimersByTime(7999);
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([id]);
    vi.advanceTimersByTime(1);
    expect(useToasts.getState().list).toHaveLength(0);
  });

  it('an Undo toast stays long enough: 8 seconds, and while the pointer or keyboard is on it', () => {
    vi.useFakeTimers();
    const t = useToasts.getState();
    t.show('Moved', { label: 'Undo', run: () => undefined });
    const id = useToasts.getState().list[0]?.id ?? 0;
    vi.advanceTimersByTime(7900);
    expect(useToasts.getState().list).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(useToasts.getState().list).toHaveLength(0);
    t.show('Moved again', { label: 'Undo', run: () => undefined });
    const held = useToasts.getState().list[0]?.id ?? 0;
    expect(held).not.toBe(id);
    useToasts.getState().hold(held, true, 'pointer');
    vi.advanceTimersByTime(30_000);
    expect(useToasts.getState().list).toHaveLength(1);
    useToasts.getState().hold(held, false, 'pointer');
    vi.advanceTimersByTime(8100);
    expect(useToasts.getState().list).toHaveLength(0);
  });

  it('a toast held by the keyboard and the pointer waits until both have left', () => {
    vi.useFakeTimers();
    useToasts.getState().show('Moved', { label: 'Undo', run: () => undefined });
    const id = useToasts.getState().list[0]?.id ?? 0;
    const { hold } = useToasts.getState();
    hold(id, true, 'keyboard');
    hold(id, true, 'pointer');
    hold(id, false, 'pointer');
    vi.advanceTimersByTime(30_000);
    expect(useToasts.getState().list).toHaveLength(1);
    hold(id, false, 'keyboard');
    vi.advanceTimersByTime(8100);
    expect(useToasts.getState().list).toHaveLength(0);
  });

  it('toast replace keeps the item and restarts its timer', async () => {
    vi.useFakeTimers();
    let undo: (() => void) | undefined;
    const id = useToasts.getState().show('Rule removed.', { label: 'Undo', run: () => new Promise<void>((done) => (undo = done)) });
    vi.advanceTimersByTime(6000);
    const retry = { label: 'Try again', run: () => undefined };
    useToasts.getState().replace(id, 'Not undone yet: Bower could not reach Drive to check. Try again when you are back online.', retry);
    // The same item, with its new words and action: no second message.
    expect(useToasts.getState().list).toEqual([{ id, text: 'Not undone yet: Bower could not reach Drive to check. Try again when you are back online.', action: retry }]);
    // Its 8 seconds start again from the replace.
    vi.advanceTimersByTime(7900);
    expect(useToasts.getState().list).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(useToasts.getState().list).toHaveLength(0);
    // A press whose action is still running keeps its toast until it ends, so a refusal can replace it.
    const again = useToasts.getState().show('Rule removed.', { label: 'Undo', run: () => new Promise<void>((done) => (undo = done)) });
    await useToasts.getState().press(again);
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([again]);
    vi.advanceTimersByTime(30_000);
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([again]);
    undo?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(useToasts.getState().list).toHaveLength(0);
  });
});
