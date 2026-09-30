// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ROUND_BUTTON_SIZE,
  RoundButton,
  type RoundButtonState,
} from '../src/components/round-button.js';

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
});

async function show(
  state: RoundButtonState,
  label: string,
  onPress?: () => void,
): Promise<HTMLButtonElement> {
  await act(() => {
    render(h(RoundButton, { state, label, onPress }), root);
  });
  const button = root.querySelector('button');
  if (button === null) throw new Error('no button');
  return button;
}

describe('RoundButton', () => {
  const cases: [RoundButtonState, string, string][] = [
    ['mic', 'Dictate', 'svg rect'],
    ['asking', 'Dictate', 'svg rect'],
    ['mic-off', 'Dictation is off', 'svg path'],
    ['arrow', 'Send', 'svg path'],
    ['stop', 'Stop dictating', '.round-button-stop-square'],
    ['spinner', 'Sending…', '.round-button-spin'],
  ];

  it.each(cases)(
    '%s shows its glyph and its name',
    async (state, label, glyph) => {
      const button = await show(state, label);
      expect(button.getAttribute('aria-label')).toBe(label);
      expect(button.querySelector(glyph)).not.toBeNull();
      expect(button.classList.contains(`round-button-${state}`)).toBe(true);
    },
  );

  it('crosses the mic out only when dictation is off', async () => {
    const off = await show('mic-off', 'Dictation is off');
    expect(off.querySelector('path')?.getAttribute('d')).toContain(
      'M4 4l16 16',
    );
    const on = await show('mic', 'Dictate');
    expect(on.querySelector('path')?.getAttribute('d')).not.toContain(
      'M4 4l16 16',
    );
  });

  it('keeps one size and one base class in every state', async () => {
    expect(ROUND_BUTTON_SIZE).toBe(40);
    for (const [state, label] of cases) {
      const button = await show(state, label);
      expect(button.classList.contains('round-button')).toBe(true);
      expect(button.classList.contains('round-button-small')).toBe(false);
    }
  });

  it('presses in the live states and ignores presses when blocked or sending', async () => {
    const onPress = vi.fn();
    (await show('arrow', 'Send', onPress)).click();
    expect(onPress).toHaveBeenCalledTimes(1);

    const off = await show('mic-off', 'Dictation is off', onPress);
    expect(off.getAttribute('aria-disabled')).toBe('true');
    off.click();
    const sending = await show('spinner', 'Sending…', onPress);
    expect(sending.getAttribute('aria-disabled')).toBe('true');
    sending.click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
