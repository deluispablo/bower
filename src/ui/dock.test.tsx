import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dock } from './Dock';
import { toast, useToasts } from './toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--dock-h');
  useToasts.setState({ list: [] });
});

describe('the dock', () => {
  it('the dock stacks three messages at most, oldest first', () => {
    render(<Dock />);
    act(() => {
      for (const t of ['One', 'Two', 'Three', 'Four']) toast(t);
    });
    const texts = [...screen.getByRole('status').children].map((n) => n.textContent);
    expect(texts).toEqual(['Two', 'Three', 'Four']);
  });

  it('the dock publishes its height as --dock-h, and takes it back when it is empty', () => {
    let seen: ResizeObserverCallback = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          seen = cb;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    render(<Dock />);
    const stack = screen.getByTestId('dock-stack');
    const size = (h: number): void => {
      Object.defineProperty(stack, 'offsetHeight', { configurable: true, value: h });
      act(() => seen([], {} as ResizeObserver));
    };
    size(60);
    expect(document.documentElement.style.getPropertyValue('--dock-h')).toBe('60px');
    size(0);
    expect(document.documentElement.style.getPropertyValue('--dock-h')).toBe('0px');
  });
});
