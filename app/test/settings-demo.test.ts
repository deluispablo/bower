// @vitest-environment jsdom

/**
 * Settings in a demo build (#193): the own API key field and "Sign out
 * everywhere" render nothing of their own, replaced by one combined
 * sentence for the whole Advanced section (#364, not one per control);
 * "Delete my Bower account" (its own section) keeps its own sentence, and
 * the push toggle is greyed with its own sentence too. Plain "Sign out"
 * is untouched. `isDemo()` is mocked directly (rather than stubbing
 * `VITE_DEMO` and re-importing `api.ts`) so the real demo module never
 * boots for a plain UI check.
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

// #197 added a `useVault()` call to Settings (the rulebook update row).
// Mocked the same way sibling suites do (see layout.test.ts): an empty
// vault so the row has nothing to show, and no real VaultProvider needed.
vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ index: undefined, files: [], updateRules: vi.fn() }),
}));

const { Settings } = await import('../src/routes/settings.js');

const NOT_IN_DEMO = 'Not in the demo: run your own Bower to use this.';
const NOT_IN_DEMO_PUSH = 'Not in the demo. Run your own Bower to use it.';

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
      textsOf('.settings-row').some((t) => t.includes('Sign out everywhere')),
    ).toBe(true);
    expect(
      textsOf('.settings-link-danger').some((t) =>
        t.includes('Delete my Bower account'),
      ),
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
    const rows = textsOf('.settings-row');
    const buttons = textsOf('.settings-button-secondary');
    expect(buttons).toContain('Sign out');
    expect(rows.some((t) => t.includes('Sign out everywhere'))).toBe(false);
  });

  it('shows the sentence instead of Delete my Bower account', () => {
    state.demo = true;
    mount();
    expect(
      textsOf('.settings-link-danger').some((t) =>
        t.includes('Delete my Bower account'),
      ),
    ).toBe(false);
  });

  it('shows the sentence exactly twice, not once per control (#364)', () => {
    state.demo = true;
    mount();
    const notes = textsOf('.settings-note').filter((t) => t === NOT_IN_DEMO);
    // Once for the whole Advanced section (API key + sign out everywhere,
    // now silent), once for the Danger zone (delete my account).
    expect(notes).toHaveLength(2);
  });

  it('greys the push toggle with its own sentence', () => {
    state.demo = true;
    mount();
    const row = Array.from(root.querySelectorAll('.toggle-row')).find((el) =>
      el.textContent?.includes("Ping me when it's done"),
    );
    if (row === undefined) throw new Error('push toggle row missing');
    expect(row.textContent).toContain(NOT_IN_DEMO_PUSH);
    expect(row.textContent).not.toContain('Notifications on this device');
    const input = row.querySelector('input[role="switch"]');
    expect((input as HTMLInputElement | null)?.disabled).toBe(true);
  });
});
