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
const setMe = vi.fn();
const updateSettings = vi.fn((input: { allowWeb?: boolean }) =>
  Promise.resolve({ hasApiKey: false, allowWeb: input.allowWeb === true }),
);
const location = { path: '/settings', route: vi.fn() };

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => false,
  updateSettings,
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
  it('runs Tidying up, Look, Bower, Learn Bower, Advanced in that order', () => {
    mount(baseMe);
    expect(headings()).toEqual([
      'Tidying up',
      'Look',
      'Bower',
      'Learn Bower',
      'Advanced',
    ]);
  });

  it('puts Show Bower’s own files in Advanced, next to the API key (#379 review)', () => {
    mount(baseMe);
    const sections = Array.from(root.querySelectorAll('.settings-section'));
    const advanced = sections.find(
      (el) => el.querySelector('h2')?.textContent === 'Advanced',
    );
    const bower = sections.find(
      (el) => el.querySelector('h2')?.textContent === 'Bower',
    );
    expect(advanced?.textContent).toContain("Show Bower's own files");
    expect(bower?.textContent).not.toContain("Show Bower's own files");
  });

  it('has a Dictation language row in Advanced defaulting to Match my device', () => {
    mount(baseMe);
    const select = root.querySelector('select.settings-select');
    expect(select).not.toBeNull();
    expect((select as HTMLSelectElement).value).toBe('');
    expect(select?.textContent).toContain('Match my device');
  });

  it('keeps Sign out on its own, apart from Sign out everywhere', () => {
    mount(baseMe);
    expect(textsOf('.settings-sign-out')).toEqual(['Sign out']);
    expect(
      textsOf('.settings-row').some((t) => t.includes('Sign out everywhere')),
    ).toBe(true);
  });

  it('puts Delete my Bower account as a red text link at the bottom', () => {
    mount(baseMe);
    const link = root.querySelector('.settings-link-danger');
    expect(link?.textContent).toBe(
      'Delete my Bower account (your Bower folder stays)',
    );
    // Nothing settings-shaped follows it except the footer.
    const footer = root.querySelector('.settings-footer');
    expect(link?.compareDocumentPosition(footer as Node)).toBeTruthy();
  });

  function webLookupInput(): HTMLInputElement | undefined {
    return Array.from(
      root.querySelectorAll<HTMLInputElement>('.toggle-input'),
    ).find((el) => el.closest('.toggle-row')?.textContent?.includes('web'));
  }

  it('shows the web-lookup row under Tidying up, off by default (#374)', () => {
    mount(baseMe);
    const hints = textsOf('.toggle-hint');
    expect(hints).toContain(
      'Off, Bower only reads what you gave it. On, it may search the web to fill in what a document leaves out.',
    );
    const input = webLookupInput();
    expect(input?.disabled).toBe(false);
    expect(input?.checked).toBe(false);
  });

  it('turns web lookups on through PATCH /settings (#374)', async () => {
    updateSettings.mockClear();
    setMe.mockClear();
    mount(baseMe);
    const input = webLookupInput();
    await act(async () => {
      input?.click();
      await Promise.resolve();
    });
    expect(updateSettings).toHaveBeenCalledWith({ allowWeb: true });
    expect(setMe).toHaveBeenCalledWith({ ...baseMe, allowWeb: true });
  });

  it('shows the switch on when the user allowed web lookups', () => {
    mount({ ...baseMe, allowWeb: true });
    expect(webLookupInput()?.checked).toBe(true);
  });
});

describe('Settings copy fixes', () => {
  it('says notifications are on this device, not this phone', () => {
    mount(baseMe);
    const hints = textsOf('.toggle-hint');
    expect(hints).toContain('Notifications on this device');
    expect(hints).not.toContain('Notifications on this phone');
  });

  it('says the key runs Bower on your own Claude billing (K-30, C-5)', () => {
    mount(baseMe);
    expect(textsOf('.settings-hint')).toContain(
      'Runs Bower on your own Claude billing.',
    );
  });

  // R-LEARN-3 and K-30: four rows in the Learn Bower group.
  it('has a Learn Bower group of four rows with their hints', () => {
    mount(baseMe);
    const labels = textsOf('.settings-row-label');
    for (const label of [
      'What is Bower',
      'Show me around',
      'Examples and use cases',
      'Things you can ask',
    ]) {
      expect(labels).toContain(label);
    }
    const hints = textsOf('.settings-hint');
    expect(hints).toContain('The intro: five screens');
    expect(hints).toContain('What people use Bower for');
    expect(hints).not.toContain('The four-page intro, again');
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
