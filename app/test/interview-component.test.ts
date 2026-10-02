// @vitest-environment jsdom

import { createRef, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Interview, type InterviewProps } from '../src/components/interview.js';

let root: HTMLElement;
const onFinish = vi.fn();
const onSkip = vi.fn();

function button(label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === label,
  );
  if (found === undefined) throw new Error(`button ${label} missing`);
  return found;
}

function input(label: string): HTMLInputElement | HTMLTextAreaElement {
  const found = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `input[aria-label="${label}"], textarea[aria-label="${label}"]`,
  );
  if (found === null) throw new Error(`input ${label} missing`);
  return found;
}

function type(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function mount(props: Partial<InterviewProps> = {}): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(
      h(Interview, {
        onFinish,
        onSkip,
        busy: false,
        error: null,
        headingRef: createRef<HTMLHeadingElement>(),
        existingFolder: false,
        ...props,
      }),
      root,
    );
  });
}

function unmount(): void {
  void act(() => render(null, root));
  root.remove();
}

function nextTimes(n: number): void {
  for (let i = 0; i < n; i += 1) void act(() => button('Next').click());
}

beforeEach(() => {
  mount();
});

afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

describe('Question 1: what you will keep here (#999)', () => {
  it('keeps every picked chip, pressed, and the typed words apart', () => {
    void act(() => button('Work').click());
    void act(() => button('Money').click());
    void act(() => button('A project').click());

    for (const chip of ['Work', 'Money', 'A project']) {
      expect(button(chip).getAttribute('aria-pressed')).toBe('true');
      expect(button(chip).classList.contains('is-on')).toBe(true);
    }
    expect(input('What you will keep here').value).toBe('');

    void act(() => type(input('What you will keep here'), 'My move'));
    nextTimes(3);
    void act(() => button('Finish').click());

    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ keep: 'Work, Money, A project, My move' }),
    );
  });

  it('unpicks a chip on a second tap', () => {
    void act(() => button('Work').click());
    void act(() => button('Work').click());
    expect(button('Work').getAttribute('aria-pressed')).toBe('false');
    nextTimes(3);
    void act(() => button('Finish').click());
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ keep: '' }),
    );
  });
});

describe('Question 3: areas (#999)', () => {
  function keyEnter(field: HTMLInputElement | HTMLTextAreaElement): void {
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  }

  function addOwn(name: string): void {
    const field = input('Add your own area');
    void act(() => type(field, name));
    void act(() => keyEnter(field));
  }

  it('shows an own area as a picked chip that a tap removes', () => {
    nextTimes(2);
    addOwn('Garden');

    expect(button('Garden').getAttribute('aria-pressed')).toBe('true');
    expect(root.textContent).toContain('Picked: Garden');

    void act(() => button('Garden').click());
    expect(
      Array.from(root.querySelectorAll('button')).some(
        (b) => b.textContent === 'Garden',
      ),
    ).toBe(false);
    expect(root.textContent).not.toContain('Picked:');
  });

  it('at three, disables the field with the limit line and lists them', () => {
    nextTimes(2);
    void act(() => button('Health').click());
    void act(() => button('Career').click());
    addOwn('Garden');

    expect(input('Add your own area').disabled).toBe(true);
    expect(root.textContent).toContain(
      'Up to three. Unpick one to add another.',
    );
    expect(root.textContent).toContain('Picked: Health, Career, Garden');
    expect(root.textContent).not.toMatch(/3 of 3/);

    void act(() => button('Career').click());
    expect(input('Add your own area').disabled).toBe(false);
    expect(root.textContent).not.toContain('Up to three.');
  });
});

describe('Question 4: titles and tags (#999)', () => {
  function hasChip(label: string): boolean {
    return Array.from(root.querySelectorAll('button')).some(
      (b) => b.textContent === label,
    );
  }

  it('leaves out "Match my existing notes" for a new, empty folder', () => {
    nextTimes(3);
    expect(hasChip('Short and plain')).toBe(true);
    expect(hasChip('Match my existing notes')).toBe(false);
  });

  it('offers "Match my existing notes" for a folder the person had', () => {
    unmount();
    mount({ existingFolder: true });
    nextTimes(3);
    expect(hasChip('Match my existing notes')).toBe(true);
  });
});
