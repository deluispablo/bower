// @vitest-environment jsdom

/**
 * The "What is Bower" intro's last page in a demo build (#193): "Run your
 * own Bower" instead of "Sign in with Google", except when opened from
 * Settings (`?from=settings`), which still just closes. `isDemo()` is
 * mocked directly (rather than stubbing `VITE_DEMO` and re-importing
 * `api.ts`) so the real demo module never boots for a plain UI check.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ demo: false }));

const location = {
  path: '/welcome',
  query: {} as Record<string, string>,
  route: vi.fn(),
};

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ refresh: vi.fn(() => Promise.resolve()) }),
}));

const { Intro } = await import('../src/routes/intro.js');

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Intro, null), root);
  });
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  location.query = {};
  state.demo = false;
});

describe('Intro in a demo build', () => {
  it('shows Run your own Bower instead of Sign in with Google', () => {
    state.demo = true;
    mount();
    expect(root.querySelector('.intro-cta')).toBeNull();
    expect(
      Array.from(root.querySelectorAll('button')).some(
        (b) => b.textContent === 'Explore the demo',
      ),
    ).toBe(true);
  });

  it('still shows Done when opened from Settings', () => {
    state.demo = true;
    location.query = { from: 'settings' };
    mount();
    expect(root.querySelector('.intro-cta')?.textContent).toBe('Done');
  });
});
