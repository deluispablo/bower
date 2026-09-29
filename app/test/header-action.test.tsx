// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeaderAction } from '../src/components/header-action.js';

let host: HTMLElement | undefined;

function mount(vnode: ReturnType<typeof h>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  render(vnode, host);
  return host;
}

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
});

const icon = h('svg', { class: 'icon' });

describe('HeaderAction (issue #742)', () => {
  it('renders a labelled button and fires onClick', async () => {
    const onClick = vi.fn();
    const root = mount(h(HeaderAction, { icon, onClick }, 'Pin'));
    const button = root.querySelector('button');
    expect(button?.className).toBe('header-action');
    expect(button?.textContent).toBe('Pin');
    expect(button?.hasAttribute('aria-pressed')).toBe(false);
    await act(() => {
      button?.click();
    });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('a toggle exposes aria-pressed', () => {
    const root = mount(
      h(HeaderAction, { icon, onClick: () => undefined, pressed: true }, 'Pinned'),
    );
    expect(root.querySelector('button')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('renders a link when given an href', () => {
    const root = mount(h(HeaderAction, { icon, href: '/rules' }, 'Rules'));
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/rules');
    expect(root.querySelector('button')).toBeNull();
  });
});
