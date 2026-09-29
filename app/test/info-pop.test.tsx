// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { InfoPop, popOffset } from '../src/components/info-pop.js';

let host: HTMLElement | undefined;

function mount(): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  render(
    h(InfoPop, { label: 'What By Bower means', children: 'Some words' }),
    host,
  );
  return host;
}

function button(root: HTMLElement): HTMLButtonElement {
  const b = root.querySelector('button');
  if (b === null) throw new Error('no button');
  return b;
}

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
});

describe('InfoPop (issue #742)', () => {
  it('starts closed with a named button', () => {
    const root = mount();
    expect(button(root).getAttribute('aria-label')).toBe('What By Bower means');
    expect(button(root).getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens a non-modal dialog on tap', async () => {
    const root = mount();
    await act(() => {
      button(root).click();
    });
    expect(button(root).getAttribute('aria-expanded')).toBe('true');
    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toBe('Some words');
    expect(dialog?.getAttribute('aria-modal')).toBeNull();
  });

  it('closes on Escape and returns focus to the button', async () => {
    const root = mount();
    await act(() => {
      button(root).click();
    });
    await act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(button(root).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button(root));
  });

  it('closes on an outside tap but not on a tap inside', async () => {
    const root = mount();
    await act(() => {
      button(root).click();
    });
    await act(() => {
      root
        .querySelector('[role="dialog"]')
        ?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();
    await act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('popOffset keeps the panel inside a 375 px viewport', () => {
    // Fits: no shift.
    expect(popOffset(16, 200, 375)).toBe(0);
    // Button at the far end: shifted so the panel ends 16 px from the edge.
    const shift = popOffset(320, 300, 375);
    expect(320 + shift + 300).toBe(375 - 16);
    // Never past the start gutter, even for a panel wider than the space.
    expect(320 + popOffset(320, 400, 375)).toBe(16);
  });
});
