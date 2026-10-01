// @vitest-environment jsdom

/**
 * A rule opened (#915, boards BW-Rule-375 and BW-Rule-1280, R-BW-6): the
 * phone draws an action sheet ending with Cancel, desktop a side panel
 * with ✕ "Close the rule", never both. The rule text is body text, and
 * the rows are the four drawn. Remove asking first is covered on the Rules
 * screen (`rules-screen.test.tsx`), where the confirm lives.
 */

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import { RuleSheet, ruleSheetClose } from '../src/components/rule-sheet.js';
import type { Rule } from '../src/rules.js';
import { stubMatchMedia } from './helpers/match-media.js';

const rule: Rule = {
  line: 1,
  raw: '- Receipts go to Finance (your rule, 2026-09-29)',
  marker: '- ',
  text: 'Receipts go to Finance',
  paused: false,
  date: '2026-09-29',
  origin: null,
  saidDate: null,
  tail: null,
};

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  render(null, root);
  root.remove();
  vi.unstubAllGlobals();
});

function mount(desktop: boolean, onPick = vi.fn()): void {
  stubMatchMedia(desktop);
  act(() => {
    render(
      h(
        Fragment,
        null,
        h(RuleSheet, { topic: 'Money', rule, onPick, onClose: vi.fn() }),
        h(OverlayHost, null),
      ),
      root,
    );
  });
}

function buttonNames(): string[] {
  return [...document.body.querySelectorAll('.overlay-panel button')].map(
    (b) =>
      b.getAttribute('aria-label') ??
      b.querySelector('.rule-sheet-row-label')?.textContent ??
      b.textContent ??
      '',
  );
}

describe('RuleSheet (#915)', () => {
  it('picks Cancel on the phone and ✕ on desktop', () => {
    expect(ruleSheetClose(false)).toBe('cancel');
    expect(ruleSheetClose(true)).toBe('close');
  });

  it('the phone: an action sheet ending with Cancel, no ✕', () => {
    mount(false);
    const panel = document.body.querySelector('.overlay-panel');
    expect(panel?.getAttribute('role')).toBe('menu');
    expect(buttonNames()).toEqual([
      'Change it',
      'Apply it to what is already filed',
      'Pause it',
      'Remove it',
      'Cancel',
    ]);
  });

  it('desktop: a side panel with ✕ "Close the rule", no Cancel', () => {
    mount(true);
    const panel = document.body.querySelector('.overlay-panel');
    expect(panel?.getAttribute('role')).toBe('dialog');
    const names = buttonNames();
    expect(names[0]).toBe('Close the rule');
    expect(names).not.toContain('Cancel');
    expect(
      document.body.querySelector('.rule-sheet-text')?.tagName.toLowerCase(),
    ).toBe('p');
  });

  it('Remove it only reports the pick: the screen asks first', () => {
    const onPick = vi.fn();
    mount(false, onPick);
    const remove = [
      ...document.body.querySelectorAll<HTMLButtonElement>('.rule-sheet-row'),
    ].find((b) => b.textContent?.includes('Remove it'));
    act(() => {
      remove?.click();
    });
    expect(onPick).toHaveBeenCalledWith('remove');
  });
});
