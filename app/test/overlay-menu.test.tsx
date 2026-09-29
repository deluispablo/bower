// @vitest-environment jsdom

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Overlay, OverlayHost } from '../src/components/overlay.js';
import {
  OVERLAY_PRIORITY,
  close,
  open,
  resetOverlayQueue,
} from '../src/overlay-queue.js';

let host: HTMLElement;
let opener: HTMLButtonElement;

beforeEach(() => {
  const app = document.createElement('div');
  app.id = 'app';
  const shell = document.createElement('div');
  shell.className = 'shell';
  const heading = document.createElement('h1');
  heading.textContent = 'Home';
  opener = document.createElement('button');
  host = document.createElement('div');
  shell.append(heading, opener, host);
  app.append(shell);
  document.body.append(app);
  void act(() => {
    render(<OverlayHost />, host);
  });
  opener.focus();
});

afterEach(() => {
  void act(() => {
    render(null, host);
  });
  resetOverlayQueue();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

function openMenu(): void {
  void act(() => {
    open({
      id: 'menu',
      priority: OVERLAY_PRIORITY.own,
      render: () => (
        <Overlay
          kind="menu"
          label="Actions"
          onClose={() => {
            close('menu');
          }}
        >
          <button type="button" role="menuitem">
            One
          </button>
          <button type="button" role="menuitem">
            Two
          </button>
          <button type="button" role="menuitem">
            Three
          </button>
        </Overlay>
      ),
    });
  });
}

function key(name: string): void {
  void act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true }),
    );
  });
}

function focused(): string | null {
  return document.activeElement?.textContent ?? null;
}

describe('menu overlay keys', () => {
  it('roves with ArrowDown, ArrowUp, Home and End, wrapping at the ends', () => {
    openMenu();
    expect(focused()).toBe('One');
    key('ArrowDown');
    expect(focused()).toBe('Two');
    key('End');
    expect(focused()).toBe('Three');
    key('ArrowDown');
    expect(focused()).toBe('One');
    key('ArrowUp');
    expect(focused()).toBe('Three');
    key('Home');
    expect(focused()).toBe('One');
  });

  it('closes on Tab and gives focus back to the opener', () => {
    openMenu();
    key('Tab');
    expect(document.querySelector('.overlay-panel')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('focus after the opener is gone', () => {
  it('lands on the main heading, never BODY', async () => {
    openMenu();
    opener.remove();
    void act(() => {
      close('menu');
    });
    await Promise.resolve();
    expect(document.activeElement?.tagName).toBe('H1');
  });
});

describe('menu placement', () => {
  it('flips above the opener when there is no room below', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 600,
      configurable: true,
    });
    opener.getBoundingClientRect = (): DOMRect =>
      ({ top: 540, bottom: 570, left: 20, right: 60 }) as DOMRect;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 120,
    });
    openMenu();
    const panel = document.querySelector<HTMLElement>('.overlay-panel');
    expect(panel?.style.getPropertyValue('--overlay-anchor-top')).toBe('416px');
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight');
  });
});
