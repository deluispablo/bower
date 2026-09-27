// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOUR_STEPS, Tour, placeCoach } from '../src/components/tour.js';

let root: HTMLElement;
let targets: HTMLElement;

function target(name: string): HTMLElement {
  const el = targets.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (el === null) throw new Error(`target ${name} missing`);
  return el;
}

function dialog(): HTMLElement {
  const el = root.querySelector<HTMLElement>('[role="dialog"]');
  if (el === null) throw new Error('dialog missing');
  return el;
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (b) => b.textContent === label,
  );
  if (found === undefined) throw new Error(`button ${label} missing`);
  return found;
}

function mount(onEnd: (finished: boolean) => void): void {
  void act(() => {
    render(h(Tour, { onEnd }), root);
  });
}

beforeEach(() => {
  targets = document.createElement('div');
  targets.innerHTML =
    '<a href="/add" data-tour="add">Add</a>' +
    '<button type="button" data-tour="tidy">Tidy up</button>' +
    '<a href="/tell" data-tour="tell">Tell</a>';
  document.body.append(targets);
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
  targets.remove();
});

describe('Tour', () => {
  it('walks through the three steps, ringing each target, and finishes', () => {
    const onEnd = vi.fn();
    mount(onEnd);

    expect(TOUR_STEPS.map((s) => s.target)).toEqual(['add', 'tidy', 'tell']);
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(dialog().textContent).toContain('Drop anything here.');
    expect(target('add').classList.contains('tour-ring')).toBe(true);
    expect(document.activeElement).toBe(button('Next'));

    void act(() => button('Next').click());
    expect(dialog().textContent).toContain('there is no schedule');
    expect(target('add').classList.contains('tour-ring')).toBe(false);
    expect(target('tidy').classList.contains('tour-ring')).toBe(true);

    void act(() => button('Next').click());
    expect(dialog().textContent).toContain('Talk to me like a person.');
    expect(target('tell').classList.contains('tour-ring')).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();

    void act(() => button("Let's go").click());
    expect(onEnd).toHaveBeenCalledWith(true);
  });

  it('offers Skip tour on every step', () => {
    const onEnd = vi.fn();
    mount(onEnd);
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      expect(button('Skip tour')).toBeDefined();
      if (i < TOUR_STEPS.length - 1) void act(() => button('Next').click());
    }

    void act(() => button('Skip tour').click());
    expect(onEnd).toHaveBeenCalledWith(false);
  });

  it('skips on Escape, with the keyboard only', () => {
    const onEnd = vi.fn();
    mount(onEnd);

    void act(() => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(onEnd).toHaveBeenCalledWith(false);
  });

  it('removes the ring when it closes', () => {
    mount(vi.fn());
    void act(() => {
      render(null, root);
    });
    expect(target('add').classList.contains('tour-ring')).toBe(false);
  });
});

describe('placeCoach', () => {
  it('puts the card above a bottom tab with the bird standing on it', () => {
    const place = placeCoach(
      { top: 780, left: 100, width: 80, height: 56 },
      390,
      844,
      true,
    );
    expect(place.spot).not.toBeNull();
    expect(place.card.bottom).toBeDefined();
    expect(place.bird).not.toBeNull();
  });

  it('puts the card below a target near the top, bird inside the card', () => {
    const place = placeCoach(
      { top: 8, left: 220, width: 110, height: 44 },
      360,
      640,
      false,
    );
    expect(place.card.top).toBe('76px');
    expect(place.bird).toBeNull();
  });

  it('dims the whole screen when the target is not on screen', () => {
    const place = placeCoach(null, 360, 640, true);
    expect(place.spot).toBeNull();
    expect(place.card.width).toBe('328px');
  });
});
