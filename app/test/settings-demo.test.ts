// @vitest-environment jsdom

/**
 * Settings in a demo build (#193): the own API key field, "Sign out
 * everywhere" and "Delete my Bower account" each show one sentence instead
 * of a working form or button; plain "Sign out" is untouched. `isDemo()`
 * is mocked directly (rather than stubbing `VITE_DEMO` and re-importing
 * `api.ts`) so the real demo module never boots for a plain UI check.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';

const state = vi.hoisted(() => ({ demo: false }));

const me: Me = {
  email: 'you@example.com',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'FOLDER_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

const signOut = vi.fn(() => Promise.resolve());
const location = { path: '/settings', route: vi.fn() };

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ me, setMe: vi.fn(), signOut }),
}));

const { Settings } = await import('../src/routes/settings.js');

const NOT_IN_DEMO = 'Not in the demo: run your own Bower to use this.';

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Settings, null), root);
  });
}

function textsOf(selector: string): string[] {
  return Array.from(root.querySelectorAll(selector)).map(
    (el) => el.textContent ?? '',
  );
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  state.demo = false;
});

describe('Settings outside the demo', () => {
  it('has working forms and buttons', () => {
    state.demo = false;
    mount();
    expect(root.querySelector('#api-key')).not.toBeNull();
    expect(
      textsOf('.settings-button-secondary').includes('Sign out everywhere'),
    ).toBe(true);
    expect(
      textsOf('.settings-button-danger').includes('Delete my Bower account'),
    ).toBe(true);
    expect(textsOf('.settings-note')).not.toContain(NOT_IN_DEMO);
  });
});

describe('Settings in a demo build', () => {
  it('shows the sentence instead of the API key form', () => {
    state.demo = true;
    mount();
    expect(root.querySelector('#api-key')).toBeNull();
  });

  it('shows the sentence instead of Sign out everywhere, keeps Sign out', () => {
    state.demo = true;
    mount();
    const buttons = textsOf('.settings-button-secondary');
    expect(buttons).toContain('Sign out');
    expect(buttons).not.toContain('Sign out everywhere');
  });

  it('shows the sentence instead of Delete my Bower account', () => {
    state.demo = true;
    mount();
    expect(textsOf('.settings-button-danger')).not.toContain(
      'Delete my Bower account',
    );
  });

  it('shows the sentence exactly three times (API key, sign out everywhere, delete)', () => {
    state.demo = true;
    mount();
    const notes = textsOf('.settings-note').filter((t) => t === NOT_IN_DEMO);
    expect(notes).toHaveLength(3);
  });
});
