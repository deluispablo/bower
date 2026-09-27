// @vitest-environment jsdom

/**
 * Settings section order and copy (#309, spec C.8): account, Tidying up,
 * Look, Bower, Advanced (API key, Sign out everywhere), Sign out, Delete —
 * a red text link at the very bottom — then the footer. Mocked the same
 * way `settings-demo.test.ts` does, so the real API/session modules never
 * boot for a plain UI check.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';

const baseMe: Me = {
  email: 'you@example.com',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'FOLDER_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

const state = vi.hoisted(() => ({ me: undefined as Me | undefined }));

const signOut = vi.fn(() => Promise.resolve());
const location = { path: '/settings', route: vi.fn() };

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => false,
}));

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ me: state.me, setMe: vi.fn(), signOut }),
}));

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ index: undefined, files: [], updateRules: vi.fn() }),
}));

const { Settings } = await import('../src/routes/settings.js');

let root: HTMLDivElement;

function mount(me: Me): void {
  state.me = me;
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Settings, null), root);
  });
}

function headings(): string[] {
  return Array.from(root.querySelectorAll('h2')).map(
    (el) => el.textContent ?? '',
  );
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
});

describe('Settings section order', () => {
  it('runs Tidying up, Look, Bower, Advanced in that order', () => {
    mount(baseMe);
    expect(headings()).toEqual(['Tidying up', 'Look', 'Bower', 'Advanced']);
  });

  it('keeps Sign out on its own, apart from Sign out everywhere', () => {
    mount(baseMe);
    expect(textsOf('.settings-button-secondary')).toContain('Sign out');
    expect(textsOf('.settings-button-secondary')).not.toContain(
      'Sign out everywhere',
    );
    expect(
      textsOf('.settings-row').some((t) => t.includes('Sign out everywhere')),
    ).toBe(true);
  });

  it('puts Delete my Bower account as a red text link at the bottom', () => {
    mount(baseMe);
    const link = root.querySelector('.settings-link-danger');
    expect(link?.textContent).toBe(
      'Delete my Bower account (your Drive folder stays)',
    );
    // Nothing settings-shaped follows it except the footer.
    const footer = root.querySelector('.settings-footer');
    expect(link?.compareDocumentPosition(footer as Node)).toBeTruthy();
  });

  it('shows the disabled web-lookup row under Tidying up, marked Soon', () => {
    mount(baseMe);
    const hints = textsOf('.toggle-hint');
    const webLookupHint = hints.find((t) => t.includes('search the web'));
    expect(webLookupHint).toContain('Coming soon');
    const input = Array.from(
      root.querySelectorAll<HTMLInputElement>('.toggle-input'),
    ).find((el) => el.closest('.toggle-row')?.textContent?.includes('web'));
    expect(input?.disabled).toBe(true);
  });
});

describe('Settings copy fixes', () => {
  it('says notifications are on this device, not this phone', () => {
    mount(baseMe);
    const hints = textsOf('.toggle-hint');
    expect(hints).toContain('Notifications on this device');
    expect(hints).not.toContain('Notifications on this phone');
  });

  it('says the API key runs on billing instead of the operator’s', () => {
    mount(baseMe);
    expect(
      textsOf('.settings-hint').some((t) =>
        t.includes("instead of the operator's"),
      ),
    ).toBe(true);
  });
});

describe('Reconnect Google', () => {
  it('is hidden when Google access is fine', () => {
    mount({ ...baseMe, needsReauth: false });
    expect(textsOf('.settings-account-links')[0] ?? '').not.toContain(
      'Reconnect Google',
    );
  });

  it('shows why, only when reconnecting is needed', () => {
    mount({ ...baseMe, needsReauth: true });
    const text = root.querySelector('.settings-account-links')?.textContent;
    expect(text).toContain('Reconnect Google');
    expect(text).toContain('needs to be renewed');
  });
});
