// @vitest-environment jsdom

import { h, render } from 'preact';
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFocusTrap } from '../src/components/use-focus-trap.js';

interface TrapProps {
  onEscape: () => void;
}

function Trap({ onEscape }: TrapProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onEscape);
  return h(
    'div',
    { ref },
    h('button', { type: 'button', id: 'first' }, 'First'),
    h('a', { href: '/x', tabIndex: -1, id: 'skipped' }, 'Skipped'),
    h('button', { type: 'button', id: 'last' }, 'Last'),
  );
}

function press(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} missing`);
  return el;
}

let opener: HTMLButtonElement;
let root: HTMLDivElement;

function open(onEscape = vi.fn()): () => void {
  opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Trap, { onEscape }), root);
  });
  return onEscape;
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
});

describe('useFocusTrap', () => {
  it('moves focus into the container on open', () => {
    open();
    expect(document.activeElement).toBe(byId('first'));
  });

  it('wraps Tab from the last control to the first', () => {
    open();
    byId('last').focus();
    const event = press('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('first'));
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    open();
    const event = press('Tab', true);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('last'));
  });

  it('leaves Tab alone between two controls inside', () => {
    open();
    const event = press('Tab');
    expect(event.defaultPrevented).toBe(false);
  });

  it('calls onEscape on Escape', () => {
    const onEscape = open();
    press('Escape');
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('gives focus back to whatever had it before, on close', () => {
    open();
    void act(() => {
      render(null, root);
    });
    expect(document.activeElement).toBe(opener);
  });
});
