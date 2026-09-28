// @vitest-environment jsdom

import { h, render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ demo: false }));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

const {
  TidyConfirmSheet,
  confirmSentenceParts,
  DEMO_RECORDING_NOTICE,
} = await import('../src/components/tidy-confirm-sheet.js');

let root: HTMLDivElement | undefined;

/**
 * Mounts `TidyConfirmSheet` the way `run-sheets.tsx` does —
 * `{confirmOpen && <TidyConfirmSheet .../>}` — so a dismiss really unmounts
 * it, the same as the note menu and the pin sheet.
 */
function mount(
  count: number,
  onConfirm = vi.fn(),
  onDismiss = vi.fn(),
): { onConfirm: () => void; onDismiss: () => void } {
  function Harness() {
    const [open, setOpen] = useState(true);
    if (!open) return null;
    return h(TidyConfirmSheet, {
      count,
      onConfirm: () => {
        onConfirm();
        setOpen(false);
      },
      onDismiss: () => {
        onDismiss();
        setOpen(false);
      },
    });
  }

  const container = document.createElement('div');
  document.body.append(container);
  root = container;
  void act(() => {
    render(h(Harness, {}), container);
  });
  return { onConfirm, onDismiss };
}

function currentRoot(): HTMLDivElement {
  if (root === undefined) throw new Error('not mounted');
  return root;
}

function dialog(): HTMLElement {
  const el = currentRoot().querySelector('[role="dialog"]');
  if (el === null) throw new Error('dialog missing');
  return el as HTMLElement;
}

function buttonByText(text: string): HTMLButtonElement {
  const buttons = Array.from(currentRoot().querySelectorAll('button'));
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (button === undefined) throw new Error(`button "${text}" missing`);
  return button;
}

function click(el: Element): void {
  void act(() => {
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
}

afterEach(() => {
  const container = root;
  if (container !== undefined) {
    void act(() => {
      render(null, container);
    });
  }
  document.body.replaceChildren();
  root = undefined;
  state.demo = false;
});

describe('confirmSentenceParts', () => {
  it('singular: "1 thing is waiting…"', () => {
    expect(confirmSentenceParts(1)).toEqual({
      lead: '1 thing',
      rest:
        'is waiting. A tidy-up takes a few minutes and uses one run of ' +
        'your Claude plan, so it is better to add the whole pile first.',
    });
  });

  it('plural: "3 things are waiting…"', () => {
    expect(confirmSentenceParts(3)).toEqual({
      lead: '3 things',
      rest:
        'are waiting. A tidy-up takes a few minutes and uses one run of ' +
        'your Claude plan, so it is better to add the whole pile first.',
    });
  });

  it('zero counts as plural ("0 things are waiting")', () => {
    expect(confirmSentenceParts(0).lead).toBe('0 things');
  });
});

describe('TidyConfirmSheet', () => {
  it('shows the bird, the heading, the count and the two buttons, no "Don\'t ask again"', () => {
    mount(3);
    const el = dialog();
    expect(el.getAttribute('aria-label')).toBe('Is that everything?');
    expect(el.querySelector('svg')).toBeDefined();
    expect(currentRoot().textContent).toContain('Is that everything?');
    expect(currentRoot().textContent).toContain('3 things');
    expect(currentRoot().textContent).toContain('are waiting');
    expect(buttonByText('Yes, tidy up')).toBeDefined();
    expect(buttonByText('Add more first')).toBeDefined();
    expect(currentRoot().textContent?.toLowerCase()).not.toContain(
      "don't ask again",
    );
  });

  it('singular count reads "1 thing is waiting"', () => {
    mount(1);
    expect(currentRoot().textContent).toContain('1 thing');
    expect(currentRoot().textContent).toContain('is waiting');
  });

  it('"Yes, tidy up" calls onConfirm', () => {
    const { onConfirm, onDismiss } = mount(2);
    click(buttonByText('Yes, tidy up'));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('"Add more first" calls onDismiss, not onConfirm', () => {
    const { onConfirm, onDismiss } = mount(2);
    click(buttonByText('Add more first'));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the backdrop dismisses without confirming', () => {
    const { onConfirm, onDismiss } = mount(2);
    const backdrop = currentRoot().querySelector('.tidy-confirm-backdrop');
    if (backdrop === null) throw new Error('backdrop missing');
    click(backdrop);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape dismisses without confirming', () => {
    const { onConfirm, onDismiss } = mount(2);
    void act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('no amber recording notice outside the demo', () => {
    state.demo = false;
    mount(2);
    expect(currentRoot().textContent).not.toContain(DEMO_RECORDING_NOTICE);
  });

  it('shows the amber recording notice in a demo build (#363)', () => {
    state.demo = true;
    mount(2);
    expect(currentRoot().textContent).toContain(DEMO_RECORDING_NOTICE);
  });
});
