// @vitest-environment jsdom

import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Hint,
  hintStorageKey,
  isHintDismissed,
  restoreHint,
} from '../src/components/hint.js';

let host: HTMLElement | undefined;

function mount(
  variant: 'tip' | 'suggestion' | 'state',
  id = 'demo',
): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  render(
    h(Hint, {
      id,
      variant,
      icon: h('svg', { class: 'icon' }),
      children: 'Some words',
    }),
    host,
  );
  return host;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
  vi.restoreAllMocks();
});

describe('Hint (issue #742)', () => {
  it('uses the bower:hint:<id> key', () => {
    expect(hintStorageKey('home-tip')).toBe('bower:hint:home-tip');
  });

  it.each(['tip', 'suggestion'] as const)(
    '%s has a dismiss button named "Dismiss this tip"',
    (variant) => {
      const root = mount(variant);
      expect(root.querySelector('.hint')?.className).toBe(
        `hint hint-${variant}`,
      );
      const button = root.querySelector('button');
      expect(button?.getAttribute('aria-label')).toBe('Dismiss this tip');
    },
  );

  it('dismissing hides the hint and remembers it', () => {
    const root = mount('tip');
    root.querySelector('button')?.click();
    // Preact flushes state updates on a microtask.
    return Promise.resolve().then(() => {
      expect(root.querySelector('.hint')).toBeNull();
      expect(localStorage.getItem('bower:hint:demo')).not.toBeNull();
      expect(isHintDismissed('demo')).toBe(true);
    });
  });

  it('stays hidden when it was dismissed earlier, and comes back on restore', () => {
    localStorage.setItem('bower:hint:demo', '1');
    const root = mount('suggestion');
    expect(root.querySelector('.hint')).toBeNull();
    restoreHint('demo');
    expect(isHintDismissed('demo')).toBe(false);
  });

  it('the state variant has no dismiss button and ignores a stored dismissal', () => {
    localStorage.setItem('bower:hint:demo', '1');
    const root = mount('state');
    expect(root.querySelector('.hint-state')).not.toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });

  it('shows the hint and logs when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = mount('tip');
    expect(root.querySelector('.hint')).not.toBeNull();
    expect(log).toHaveBeenCalled();
  });
});
