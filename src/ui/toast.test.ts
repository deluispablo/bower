import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from './toast';

afterEach(() => {
  vi.useRealTimers();
  useToasts.setState({ list: [] });
});

describe('toasts', () => {
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
    useToasts.getState().hold(held, true);
    vi.advanceTimersByTime(30_000);
    expect(useToasts.getState().list).toHaveLength(1);
    useToasts.getState().hold(held, false);
    vi.advanceTimersByTime(8100);
    expect(useToasts.getState().list).toHaveLength(0);
  });
});
