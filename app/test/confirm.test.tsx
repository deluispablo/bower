// @vitest-environment jsdom

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Confirm, confirmCopy } from '../src/components/confirm.js';
import type { ConfirmAction } from '../src/components/confirm.js';
import { OverlayHost } from '../src/components/overlay.js';
import { resetOverlayQueue } from '../src/overlay-queue.js';

let root: HTMLDivElement | undefined;

async function mount(
  action: ConfirmAction,
  onConfirm = vi.fn(),
  onCancel = vi.fn(),
): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(async () => {
    render(
      h(
        Fragment,
        null,
        h(Confirm, { action, onConfirm, onCancel }),
        h(OverlayHost, null),
      ),
      root as HTMLDivElement,
    );
    await Promise.resolve();
  });
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === text,
  );
  if (found === undefined) throw new Error(`button ${text} missing`);
  return found;
}

afterEach(() => {
  if (root !== undefined) render(null, root);
  resetOverlayQueue();
  document.body.replaceChildren();
});

describe('confirmCopy (#907, spec §3.39)', () => {
  it('has the five strings of the spec', () => {
    expect(confirmCopy('removePile')).toEqual({
      title: 'Remove this pile?',
      sentence: 'Its 2 things leave your inbox. Nothing else changes.',
      confirm: 'Remove the pile',
    });
    expect(confirmCopy('removeRule').confirm).toBe('Remove the rule');
    expect(confirmCopy('clearKey').title).toBe('Remove your Claude key?');
    expect(confirmCopy('signOutEverywhere').sentence).toBe(
      'Every browser and device signed in to this account is signed out.',
    );
    expect(confirmCopy('deleteAccount')).toEqual({
      title: 'Delete your Bower account?',
      sentence:
        'Your Bower folder in Drive stays, with everything in it. Bower forgets you.',
      confirm: 'Delete my account',
    });
    expect(confirmCopy('removePile', 1).sentence).toBe(
      'Its 1 thing leaves your inbox. Nothing else changes.',
    );
  });
});

describe('Confirm', () => {
  it('is a labelled dialog whose focus starts on Cancel', async () => {
    await mount('removeRule');
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('confirm-title');
    expect(document.getElementById('confirm-title')?.textContent).toBe(
      'Remove this rule?',
    );
    expect(document.activeElement).toBe(button('Cancel'));
  });

  it('confirms once on the red button, and only closes on Cancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    await mount('clearKey', onConfirm, onCancel);
    void act(() => button('Cancel').click());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
    void act(() => button('Remove the key').click());
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
