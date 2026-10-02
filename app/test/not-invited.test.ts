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

interface State {
  demo: boolean;
  status: 'loading' | 'signed-out' | 'signed-in';
  email: string | undefined;
}

const state = vi.hoisted((): State => ({
  demo: false,
  status: 'signed-out',
  email: 'you@example.com',
}));
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
    status: state.status,
    notInvitedEmail: state.email,
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
  state.status = 'signed-out';
  state.email = 'you@example.com';
  location.route.mockClear();
});

describe('NotInvited', () => {
  it('goes to Sign in when there is no session (#1004)', () => {
    state.email = undefined;
    mount();
    expect(location.route).toHaveBeenCalledWith('/login', true);
    expect(root.textContent).toBe('');
  });

  it('stays while the session is still loading', () => {
    state.email = undefined;
    state.status = 'loading';
    mount();
    expect(location.route).not.toHaveBeenCalled();
  });

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
