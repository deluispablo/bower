// @vitest-environment jsdom

import { h, render, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Segmented } from '../src/components/segmented.js';

type Show = 'all' | 'originals' | 'bower';

const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'originals', label: 'Originals', count: 1 },
  { value: 'bower', label: 'By Bower', count: 6 },
] as const;

let root: HTMLDivElement;

function Harness(): JSX.Element {
  const [value, setValue] = useState<Show>('all');
  return h(Segmented<Show>, {
    label: 'Show',
    options: OPTIONS,
    value,
    onChange: setValue,
  });
}

beforeEach(async () => {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(Harness, null), root);
  });
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
});

function radios(): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
}

function checked(): string | undefined {
  return radios().find((r) => r.getAttribute('aria-checked') === 'true')
    ?.textContent ?? undefined;
}

async function press(key: string): Promise<void> {
  const group = root.querySelector('[role="radiogroup"]');
  await act(() => {
    group?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('Segmented', () => {
  it('is a named radiogroup with counts after the labels', () => {
    const group = root.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe('Show');
    expect(radios().map((r) => r.textContent)).toEqual([
      'All',
      'Originals 1',
      'By Bower 6',
    ]);
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves the choice and the focus with the arrow keys, wrapping', async () => {
    await press('ArrowRight');
    expect(checked()).toBe('Originals 1');
    expect(document.activeElement).toBe(radios()[1]);
    await press('ArrowDown');
    expect(checked()).toBe('By Bower 6');
    await press('ArrowRight');
    expect(checked()).toBe('All');
    await press('ArrowLeft');
    expect(checked()).toBe('By Bower 6');
    await press('ArrowUp');
    expect(checked()).toBe('Originals 1');
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('jumps to the ends with Home and End', async () => {
    await press('End');
    expect(checked()).toBe('By Bower 6');
    await press('Home');
    expect(checked()).toBe('All');
  });
});
