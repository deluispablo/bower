// @vitest-environment jsdom

/**
 * The bubble's Tidy up / Try again links (#420): the button's click event
 * must never reach `onTidyUp`/`onFailure`. Before the fix, `onClick` was
 * wired straight to the handler, so the PointerEvent landed in `tidyUp`'s
 * optional `count` parameter and the confirmation sheet read
 * "[object PointerEvent] things are waiting".
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BubbleText } from '../src/routes/home.js';

let root: HTMLDivElement;

afterEach(() => {
  render(null, root);
  root.remove();
});

async function mount(
  onTidyUp: () => void,
  onFailure: () => void,
): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(
      h(BubbleText, {
        parts: [
          '3 things in your inbox. ',
          { link: 'tidy-up', text: 'Tidy up' },
          ' when you have added everything.',
        ],
        onTidyUp,
        onFailure,
      }),
      root,
    );
  });
}

describe('BubbleText', () => {
  it('calls onTidyUp with no arguments when the link is clicked', async () => {
    const onTidyUp = vi.fn();
    const onFailure = vi.fn();
    await mount(onTidyUp, onFailure);

    const link = root.querySelector('.home-bubble-link') as HTMLButtonElement;
    expect(link.textContent).toBe('Tidy up');
    await act(() => {
      link.click();
    });

    expect(onTidyUp).toHaveBeenCalledTimes(1);
    expect(onTidyUp.mock.calls[0]).toEqual([]);
  });
});
