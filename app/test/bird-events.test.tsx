// @vitest-environment jsdom

import { render } from 'preact';
import type { VNode } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NAP_CYCLE_MS,
  SETTLE_MS,
  resetBirdEvents,
  wakeBird,
} from '../src/bird-events.js';
import { resetBirdPresence } from '../src/bird-presence.js';
import { birdClasses } from '../src/components/bird-classes.js';
import { Bird, BirdNapButton } from '../src/components/bird.js';

let host: HTMLElement | undefined;

function mount(vnode: VNode): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  void act(() => {
    render(vnode, host as HTMLElement);
  });
  return host;
}

function advance(ms: number): void {
  void act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function svgClass(): string {
  return host?.querySelector('svg')?.getAttribute('class') ?? '';
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
  resetBirdPresence();
  resetBirdEvents();
  vi.useRealTimers();
});

describe('birdClasses settled', () => {
  it('holds the still class of the pose and adds settled', () => {
    expect(birdClasses('reading', undefined, false, false, false, true)).toBe(
      'b s-read settled',
    );
    expect(birdClasses('singing', undefined, false, false, false, true)).toBe(
      'b e-happy settled',
    );
  });

  it('keeps the Asleep pose for the nest and only stops it', () => {
    expect(birdClasses('asleep', undefined, false, false, false, true)).toBe(
      'b p-sleep e-sleepy settled',
    );
  });

  it('is unchanged while not settled', () => {
    expect(birdClasses('looking', undefined, false, false)).toBe('b p-look');
  });
});

describe('Bird settling', () => {
  it('settles after 10 s and holds its key pose', () => {
    mount(<Bird state="looking" size={64} />);
    expect(svgClass()).toContain('p-look');
    advance(SETTLE_MS - 1);
    expect(svgClass()).not.toContain('settled');
    advance(1);
    expect(svgClass()).toContain('settled');
    expect(svgClass()).toContain('s-perch');
    expect(svgClass()).not.toContain('p-look');
  });

  it('wakes for one more cycle on an event, then settles again', () => {
    mount(<Bird state="singing" size={64} />);
    advance(SETTLE_MS);
    expect(svgClass()).toContain('settled');
    void act(() => {
      wakeBird();
    });
    expect(svgClass()).not.toContain('settled');
    expect(svgClass()).toContain('p-sing');
    advance(SETTLE_MS);
    expect(svgClass()).toContain('settled');
  });

  it('wakes on a text field input, a file drag and a route change', () => {
    mount(
      <div>
        <Bird state="looking" size={64} />
        <textarea />
      </div>,
    );
    const wakeWith = (fire: () => void): void => {
      advance(SETTLE_MS);
      expect(svgClass()).toContain('settled');
      void act(() => {
        fire();
      });
      expect(svgClass()).not.toContain('settled');
    };
    wakeWith(() => {
      document
        .querySelector('textarea')
        ?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    wakeWith(() => {
      const drag = new Event('dragenter', { bubbles: true });
      Object.defineProperty(drag, 'dataTransfer', {
        value: { types: ['Files'] },
      });
      document.dispatchEvent(drag);
    });
    wakeWith(() => {
      history.pushState({}, '', '/somewhere');
    });
  });

  it('ignores a drag that carries no file', () => {
    mount(<Bird state="looking" size={64} />);
    advance(SETTLE_MS);
    void act(() => {
      const drag = new Event('dragenter', { bubbles: true });
      Object.defineProperty(drag, 'dataTransfer', {
        value: { types: ['text/plain'] },
      });
      document.dispatchEvent(drag);
    });
    expect(svgClass()).toContain('settled');
  });

  it('never settles a play-once state', () => {
    mount(<Bird state="hello" size={64} />);
    advance(SETTLE_MS * 2);
    expect(svgClass()).not.toContain('settled');
  });
});

describe('the nap button', () => {
  function nap(): HTMLButtonElement {
    const button = host?.querySelector('button');
    if (button === null || button === undefined) throw new Error('no button');
    return button;
  }

  it('is a button named Bower with aria-pressed', () => {
    mount(
      <BirdNapButton>
        <Bird state="looking" size={64} />
      </BirdNapButton>,
    );
    expect(nap().getAttribute('aria-label')).toBe('Bower');
    expect(nap().getAttribute('aria-pressed')).toBe('false');
  });

  it('plays Asleep for one cycle, holds it, and wakes on the next tap', () => {
    mount(
      <BirdNapButton>
        <Bird state="looking" size={64} />
      </BirdNapButton>,
    );
    void act(() => {
      nap().click();
    });
    expect(nap().getAttribute('aria-pressed')).toBe('true');
    expect(svgClass()).toContain('p-sleep');
    expect(svgClass()).not.toContain('settled');
    advance(NAP_CYCLE_MS);
    expect(svgClass()).toContain('settled');
    expect(svgClass()).toContain('e-sleepy');
    // An event does not wake a napping bird.
    void act(() => {
      wakeBird();
    });
    expect(svgClass()).toContain('settled');
    void act(() => {
      nap().click();
    });
    expect(nap().getAttribute('aria-pressed')).toBe('false');
    expect(svgClass()).toContain('p-look');
    expect(svgClass()).not.toContain('settled');
  });
});
