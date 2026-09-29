// @vitest-environment jsdom

import { h, render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PinSheet } from '../src/components/pin-sheet.js';
import { RuleSheet } from '../src/components/rule-sheet.js';
import type { Rule } from '../src/rules.js';

let root: HTMLDivElement;
let inner: HTMLDivElement;

function mount(vnode: ComponentChild): void {
  const app = document.createElement('div');
  app.id = 'app';
  inner = document.createElement('div');
  inner.className = 'shell';
  root = document.createElement('div');
  inner.append(root);
  app.append(inner);
  document.body.append(app);
  void act(() => {
    render(vnode, root);
  });
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  document.body.style.overflow = '';
});

function escape(): void {
  void act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
}

describe('PinSheet on Overlay', () => {
  it('is a named menu outside the inert shell, and Escape closes it', () => {
    const onClose = vi.fn();
    mount(
      h(PinSheet, {
        kind: 'note',
        name: 'Lease agreement',
        pinned: false,
        openHref: '#/open',
        tellHref: '#/tell',
        driveHref: 'https://drive.example.com/FILE_ID',
        onTogglePin: vi.fn(),
        onClose,
      }),
    );
    const panel = document.body.querySelector('.overlay-panel');
    expect(panel?.getAttribute('role')).toBe('menu');
    expect(panel?.getAttribute('aria-label')).toBe('Lease agreement');
    expect(inner.contains(panel)).toBe(false);
    expect(inner.hasAttribute('inert')).toBe(true);
    expect(document.body.querySelector('.pin-sheet-backdrop')).toBeNull();
    escape();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('RuleSheet on Overlay', () => {
  it('is a named dialog, locks the page and reports the picked row', () => {
    const onPick = vi.fn();
    const rule: Rule = {
      line: 1,
      raw: '- Receipts go to Finance',
      marker: '- ',
      text: 'Receipts go to Finance',
      paused: false,
      date: null,
      origin: null,
      saidDate: null,
      tail: null,
    };
    mount(h(RuleSheet, { topic: 'Money', rule, onPick, onClose: vi.fn() }));
    const panel = document.body.querySelector('.overlay-panel');
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-label')).toBe('Receipts go to Finance');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.querySelector('.rule-sheet-backdrop')).toBeNull();
    const pause = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Pause it'),
    );
    void act(() => {
      pause?.click();
    });
    expect(onPick).toHaveBeenCalledWith('pause');
  });
});
