// @vitest-environment jsdom

/**
 * Not invited (#143) falls back to "Run your own Bower" in a demo build
 * (#193): the demo has no allowlist, so this screen never has a real
 * reason to show. `isDemo()` is mocked directly (rather than stubbing
 * `VITE_DEMO` and re-importing `api.ts`) so the real demo module never
 * boots for a plain UI check.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ demo: false }));
const location = { path: '/not-invited', route: vi.fn() };
const signOut = vi.fn(() => Promise.resolve());
const refresh = vi.fn(() => Promise.resolve());

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({
    notInvitedEmail: 'you@example.com',
    signOut,
    refresh,
  }),
}));

const { NotInvited } = await import('../src/routes/not-invited.js');

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(NotInvited, null), root);
  });
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  state.demo = false;
});

describe('NotInvited', () => {
  it('shows its usual content outside the demo', () => {
    state.demo = false;
    mount();
    expect(root.querySelector('h1')?.textContent).toBe(
      'This Bower isn’t open to you yet',
    );
  });

  it('falls back to Run your own Bower in a demo build', () => {
    state.demo = true;
    mount();
    expect(root.textContent).not.toContain('open to you yet');
    expect(root.querySelector('h1')?.textContent).toBe('Run your own Bower');
  });
});
