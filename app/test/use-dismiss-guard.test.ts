// @vitest-environment jsdom

/**
 * useDismissGuard (#510): a backdrop tap right after a sheet mounts
 * (during its slide-up transition) must not dismiss it — the report's
 * "for about 300 ms the backdrop lets taps through", a fast double-tap
 * closing what it just opened. A synthetic click during that window is
 * swallowed; one after it dismisses normally.
 */

import { h } from 'preact';
import { act } from 'preact/test-utils';
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDismissGuard } from '../src/components/use-dismiss-guard.js';

interface GuardedProps {
  onDismiss: () => void;
}

function Guarded({ onDismiss }: GuardedProps) {
  const guarded = useDismissGuard(onDismiss);
  return h('button', { type: 'button', onClick: guarded }, 'backdrop');
}

let root: HTMLDivElement;

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
  vi.useRealTimers();
});

describe('useDismissGuard', () => {
  it('swallows a tap within the guard window instead of dismissing', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const onDismiss = vi.fn();
    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(h(Guarded, { onDismiss }), root);
    });

    vi.advanceTimersByTime(80);
    root.querySelector('button')?.click();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses normally once the guard window has passed', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const onDismiss = vi.fn();
    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(h(Guarded, { onDismiss }), root);
    });

    vi.advanceTimersByTime(350);
    root.querySelector('button')?.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
