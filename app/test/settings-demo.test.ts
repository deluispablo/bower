// @vitest-environment jsdom
/**
 * Settings in a demo build (#193, spec §4.14 states, #917): every control
 * that needs a real backend (the Claude key, Sign out everywhere, Delete my
 * Bower account, the push toggle) stays on screen, as drawn on ST-Mid and
 * ST-Bot, but disabled, with "Not in the demo. Run your own Bower to use
 * it." Outside the demo they work.
 *
 * The demo flag is mocked (`isDemo`) rather than set through `VITE_DEMO`
 * and re-importing `api.ts`, so the real demo module never loads here.
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

vi.mock('../src/session.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/session.js')>()),
  useSession: () => ({ me, setMe: vi.fn(), signOut }),
}));

// Settings reads the vault for the rulebook update row (#197): an empty
// vault so the row has nothing to show, and no real VaultProvider needed.
vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ index: undefined, files: [], updateRules: vi.fn() }),
}));

const { Settings, NOT_IN_DEMO } = await import('../src/routes/settings.js');

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Settings, null), root);
  });
}

function button(name: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
    (el) => el.textContent?.trim() === name,
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
  it('has working controls and no demo sentence', () => {
    state.demo = false;
    mount();
    expect(root.querySelector<HTMLInputElement>('#api-key')?.disabled).toBe(
      false,
    );
    expect(button('Sign out everywhere')?.disabled).toBe(false);
    expect(
      button('Delete my Bower account (your Bower folder stays)')?.disabled,
    ).toBe(false);
    expect(root.textContent).not.toContain(NOT_IN_DEMO);
  });
});

describe('Settings in a demo build', () => {
  it('keeps the key box on screen, disabled, with the sentence', () => {
    state.demo = true;
    mount();
    expect(root.querySelector<HTMLInputElement>('#api-key')?.disabled).toBe(
      true,
    );
    expect(root.querySelector('.settings-key')?.textContent).toContain(
      NOT_IN_DEMO,
    );
  });

  it('disables Sign out everywhere and Delete, keeps Sign out', () => {
    state.demo = true;
    mount();
    expect(button('Sign out everywhere')?.disabled).toBe(true);
    expect(
      button('Delete my Bower account (your Bower folder stays)')?.disabled,
    ).toBe(true);
    expect(button('Sign out')?.disabled).toBe(false);
  });

  it('turns the push toggle off with the same sentence', () => {
    state.demo = true;
    mount();
    const row = Array.from(root.querySelectorAll('.toggle-row')).find((el) =>
      el.textContent?.includes('Ping me when it is done'),
    );
    expect(row?.textContent).toContain(NOT_IN_DEMO);
    expect(row?.querySelector('input')?.disabled).toBe(true);
  });
});
