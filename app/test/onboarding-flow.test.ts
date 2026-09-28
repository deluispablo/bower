// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me, Vault } from '../src/api.js';

const location = {
  path: '/onboarding',
  query: {} as Record<string, string>,
  route: vi.fn(),
};
const setMe = vi.fn();
const refresh = vi.fn(() => Promise.resolve());
const createVault = vi.fn<() => Promise<Vault>>();
const markTourSeen = vi.fn<(who: Me) => Promise<void>>(() => Promise.resolve());
const endTour = vi.fn();
const submitInterview = vi.fn(() =>
  Promise.resolve({ areasCreated: [], areasSkipped: [] }),
);

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

vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({ submitInterview }),
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

function input(label: string): HTMLInputElement {
  const found = root.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  if (found === null) throw new Error(`input ${label} missing`);
  return found;
}

function type(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Onboarding, {}), root);
  });
}

/** Re-renders with a different `useLocation().query`, as a fresh visit to
 * `/onboarding?...` would (`onboarding-drive.test.ts`'s `mountOnboarding`
 * remounts the whole module instead; this file mocks a shared `location`
 * object, so swapping its `query` and rendering again is enough). */
function remount(query: Record<string, string>): void {
  void act(() => render(null, root));
  root.remove();
  location.query = query;
  mount();
}

beforeEach(() => {
  location.query = {};
  mount();
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
    expect(heading()).toBe('Tell Bower about yourself');

    void act(() => button('Skip').click());
    expect(location.route).toHaveBeenCalledWith('/');
    expect(submitInterview).not.toHaveBeenCalled();
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

describe('The first-run interview (#198)', () => {
  async function reachInterview(): Promise<void> {
    void act(() => button('Show me around').click());
    createVault.mockResolvedValueOnce(vault);
    void act(() => button('Make a new Bower folder').click());
    await flush();
    void act(() => button('Continue').click());
  }

  it('answers with chips and free text, then Finish writes them and goes home', async () => {
    await reachInterview();
    expect(heading()).toBe('Tell Bower about yourself');

    void act(() => button('Everything I capture').click());
    void act(() => button('Next').click());
    void act(() => button('Spanish').click());
    void act(() => button('Next').click());
    void act(() => button('Health').click());
    void act(() => button('Career').click());
    void act(() => button('Next').click());
    void act(() => button('Short and plain').click());
    void act(() => type(input('An example title or tag'), 'Dentist'));
    void act(() => button('Finish').click());
    await flush();

    expect(submitInterview).toHaveBeenCalledWith({
      keep: 'Everything I capture',
      languages: 'Spanish',
      areas: ['Health', 'Career'],
      titleStyle: 'Short and plain',
      example: 'Dentist',
    });
    expect(location.route).toHaveBeenCalledWith('/');
  });

  it('does not add a fourth area', async () => {
    await reachInterview();
    void act(() => button('Next').click());
    void act(() => button('Next').click());

    void act(() => button('Health').click());
    void act(() => button('Career').click());
    void act(() => button('Home').click());
    void act(() => button('Finance').click());

    expect(root.textContent).toContain('3 of 3: Health, Career, Home');
  });

  it('shows the write error and lets the owner move on anyway', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    submitInterview.mockRejectedValueOnce(new Error('conflict'));
    await reachInterview();

    void act(() => button('Next').click());
    void act(() => button('Next').click());
    void act(() => button('Next').click());
    void act(() => button('Finish').click());
    await flush();

    expect(root.textContent).toContain(
      'Could not save that. Try again in a moment.',
    );
    expect(location.route).not.toHaveBeenCalledWith('/');
    error.mockRestore();
  });

  it('replayed from Settings, lands on the interview and returns there', () => {
    remount({ step: 'interview', from: 'settings' });
    expect(heading()).toBe('Tell Bower about yourself');
    expect(root.querySelector('.onb-dots')).toBeNull();

    void act(() => button('Skip').click());
    expect(location.route).toHaveBeenCalledWith('/settings');
    expect(submitInterview).not.toHaveBeenCalled();
  });
});
