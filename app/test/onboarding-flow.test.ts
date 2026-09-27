// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me, Vault } from '../src/api.js';

const location = { path: '/onboarding', route: vi.fn() };
const setMe = vi.fn();
const refresh = vi.fn(() => Promise.resolve());
const createVault = vi.fn<() => Promise<Vault>>();
const markTourSeen = vi.fn<(who: Me) => Promise<void>>(() => Promise.resolve());
const endTour = vi.fn();

const me: Me = {
  email: 'you@example.com',
  vault: null,
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

const vault: Vault = {
  folderId: 'FOLDER_ID',
  inboxFolderId: 'FOLDER_ID',
  name: 'Bower',
};

vi.mock('preact-iso', () => ({ useLocation: () => location }));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ status: 'signed-in', me, setMe, refresh }),
}));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  createVault: () => createVault(),
}));

vi.mock('../src/tour-store.js', () => ({
  endTour: (finished: boolean) => {
    endTour(finished);
  },
  markTourSeen: (who: Me) => markTourSeen(who),
}));

const { Onboarding } = await import('../src/routes/onboarding.js');

let root: HTMLElement;

function button(label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (found === undefined) throw new Error(`button ${label} missing`);
  return found;
}

function heading(): string {
  return root.querySelector('h1')?.textContent ?? '';
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Onboarding, {}), root);
  });
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
  vi.clearAllMocks();
});

describe('Onboarding', () => {
  it('goes Welcome → folder → Building → Continue to Home', async () => {
    expect(heading()).toBe("Hi, I'm Bower.");

    void act(() => button('Show me around').click());
    expect(heading()).toBe('Where your notes live');
    expect(markTourSeen).not.toHaveBeenCalled();

    let resolve: (v: Vault) => void = () => {};
    createVault.mockReturnValue(
      new Promise<Vault>((r) => {
        resolve = r;
      }),
    );
    void act(() => button('Make a new Bower folder').click());
    expect(heading()).toBe('Building your bower');
    expect(root.querySelectorAll('.onb-chip')).toHaveLength(6);
    expect(root.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(root.textContent).not.toContain('Continue');

    resolve(vault);
    await flush();
    expect(setMe).toHaveBeenCalledWith({ ...me, vault });
    void act(() => button('Continue').click());
    expect(location.route).toHaveBeenCalledWith('/');
  });

  it('skipping the tour on Welcome marks it seen and still asks for the folder', () => {
    void act(() => button('Skip the tour').click());

    expect(endTour).toHaveBeenCalledWith(false);
    expect(markTourSeen).toHaveBeenCalledWith(me);
    expect(heading()).toBe('Where your notes live');
  });

  it('shows the existing error copy with a confused bird when creating fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createVault.mockRejectedValue(new Error('network'));

    void act(() => button('Show me around').click());
    void act(() => button('Make a new Bower folder').click());
    await flush();

    expect(root.textContent).toContain('Something went wrong. Try again.');
    expect(root.querySelector('svg.b')?.getAttribute('class')).toContain(
      'p-confused',
    );
    expect(root.textContent).not.toContain('Continue');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
