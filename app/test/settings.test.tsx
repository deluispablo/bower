// @vitest-environment jsdom
/**
 * Settings v6 (#917, spec §4.14, boards ST-Top, ST-Mid, ST-Bot): Look is
 * the one segmented control (a radiogroup), the Claude key box is the
 * Composer with no separate Save button, destructive actions ask first
 * with the §3.39 strings, and the copy follows K-30.
 */

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';

const baseMe: Me = {
  email: 'you@example.com',
  name: 'Alex',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'FOLDER_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

const state = vi.hoisted(() => ({ me: undefined as Me | undefined }));
const signOut = vi.fn(() => Promise.resolve());
const setMe = vi.fn();
const updateSettings = vi.fn(() =>
  Promise.resolve({ hasApiKey: false, allowWeb: false }),
);
const location = { path: '/settings', route: vi.fn() };
const deleteAccount = vi.fn(() => Promise.resolve());

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => false,
  updateSettings,
  deleteAccount,
}));

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

vi.mock('../src/session.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/session.js')>()),
  useSession: () => ({ me: state.me, setMe, signOut }),
}));

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ index: undefined, files: [], updateRules: vi.fn() }),
}));

const { Settings, KEY_SAVED } = await import('../src/routes/settings.js');
const { OverlayHost } = await import('../src/components/overlay.js');
const { resetOverlayQueue } = await import('../src/overlay-queue.js');

// Dictation available, so the key box's own line shows (jsdom has none).
(window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
  function SpeechRecognition(): void {
    /* never started here */
  };

let root: HTMLDivElement;

function mount(me: Me): void {
  state.me = me;
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Fragment, null, h(Settings, null), h(OverlayHost, null)), root);
  });
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('button'),
  ).find((button) => button.textContent?.trim() === name);
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  resetOverlayQueue();
});

describe('Settings › Look', () => {
  it('is a radiogroup of Match my device, Light and Dark (R-SEG-1)', () => {
    mount(baseMe);
    const group = root.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe('Look');
    const radios = Array.from(
      group?.querySelectorAll('[role="radio"]') ?? [],
    ).map((el) => el.textContent);
    expect(radios).toEqual(['Match my device', 'Light', 'Dark']);
    expect(root.querySelector('select[aria-label="Look"]')).toBeNull();
  });
});

describe('Settings › the Claude key box', () => {
  it('is the Composer with the mic and no separate Save button (R-ST-4)', () => {
    mount(baseMe);
    const input = root.querySelector<HTMLInputElement>('#api-key');
    expect(input?.type).toBe('password');
    expect(input?.placeholder).toBe('sk-ant-…');
    expect(input?.closest('.composer')).not.toBeNull();
    expect(buttonNamed('Save')).toBeUndefined();
    expect(root.textContent).toContain('Use your own Claude key');
    expect(root.textContent).toContain(
      'Runs Bower on your own Claude billing.',
    );
  });

  it('says the key is saved and offers Clear, which asks first', () => {
    mount({ ...baseMe, hasApiKey: true });
    expect(root.textContent).toContain(KEY_SAVED);
    const clear = buttonNamed('Clear');
    expect(clear).toBeDefined();
    void act(() => {
      clear?.click();
    });
    expect(document.body.textContent).toContain('Remove your Claude key?');
    expect(buttonNamed('Remove the key')).toBeDefined();
    expect(updateSettings).not.toHaveBeenCalled();
  });
});

describe('Settings › account actions', () => {
  it('asks before Sign out everywhere, with a button (R-ST-5)', () => {
    mount(baseMe);
    const button = buttonNamed('Sign out everywhere');
    expect(button?.classList.contains('btn')).toBe(true);
    void act(() => {
      button?.click();
    });
    expect(document.body.textContent).toContain('Sign out everywhere?');
    expect(document.body.textContent).toContain(
      'Every browser and device signed in to this account is signed out.',
    );
  });

  it('asks before deleting the account', () => {
    mount(baseMe);
    void act(() => {
      buttonNamed('Delete my Bower account (your Bower folder stays)')?.click();
    });
    expect(document.body.textContent).toContain('Delete your Bower account?');
    expect(buttonNamed('Delete my account')).toBeDefined();
  });

  it('lands on Sign in saying the account is deleted (#1004)', async () => {
    mount(baseMe);
    void act(() => {
      buttonNamed('Delete my Bower account (your Bower folder stays)')?.click();
    });
    await act(async () => {
      buttonNamed('Delete my account')?.click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(deleteAccount).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
    expect(location.route).toHaveBeenCalledWith('/login?deleted=1');
  });
});

describe('Settings › copy (K-30)', () => {
  it('uses the new words and none of the old ones (R-ST-6)', () => {
    mount(baseMe);
    const text = root.textContent ?? '';
    expect(text).toContain(
      'other files Bower keeps for itself, at the bottom of your folders.',
    );
    expect(text).toContain('Things you can ask');
    expect(text).toContain('your Bower folder stays');
    expect(text).toContain('Ping me when it is done');
    for (const old of ['operator', 'Anthropic billing', 'dot-folders']) {
      expect(text).not.toContain(old);
    }
  });

  it('shows the profile with the avatar initial and a Home crumb (R-ST-1/2)', () => {
    mount(baseMe);
    expect(root.querySelector('.settings-account-avatar')?.textContent).toBe(
      'A',
    );
    expect(root.querySelector('.settings-account-name')?.textContent).toBe(
      'Alex',
    );
    const crumb = root.querySelector('nav[aria-label="Breadcrumb"] a');
    expect(crumb?.textContent).toBe('Home');
  });
});
