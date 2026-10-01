// @vitest-environment jsdom

/**
 * The "What is Bower" intro in a demo build (#361): the demo banner on top
 * and "Try the demo" instead of "Sign in with Google", which marks the
 * intro seen and goes Home (where the tour starts), except when opened from
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

// Page 2 draws the real note box, whose body reads the vault for embeds.
vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({ index: null, getNoteText: () => Promise.resolve('') }),
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
  localStorage.clear();
  location.route.mockReset();
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  location.query = {};
  state.demo = false;
});

describe('Intro in a demo build', () => {
  it('shows Try the demo instead of Sign in with Google, and goes Home', () => {
    state.demo = true;
    location.query = { page: '5' };
    mount();
    const cta = root.querySelector<HTMLButtonElement>('.intro-cta');
    expect(cta?.textContent).toBe('Try the demo');
    expect(root.textContent).not.toContain('Sign in with Google');
    void act(() => cta?.click());
    expect(localStorage.getItem('bower:intro:seen')).toBe('1');
    expect(location.route).toHaveBeenCalledWith('/');
  });

  it('carries the demo banner on top', () => {
    state.demo = true;
    mount();
    expect(root.querySelector('.intro-bar + .demo-banner')).not.toBeNull();
  });

  it('has no banner and signs in with Google in a real build', () => {
    location.query = { page: '5' };
    mount();
    expect(root.querySelector('.demo-banner')).toBeNull();
    expect(root.querySelector('.intro-cta')?.textContent).toBe(
      'Sign in with Google',
    );
  });

  it('shows Back to Bower when replayed from Settings', () => {
    state.demo = true;
    location.query = { from: 'settings', page: '5' };
    mount();
    expect(root.querySelector('.intro-cta')?.textContent).toBe('Back to Bower');
  });
});
