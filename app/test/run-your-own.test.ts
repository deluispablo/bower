// @vitest-environment jsdom

/**
 * "Run your own Bower" (#193): the demo's stand-in for sign-in — what it
 * is, the three links (the "what is Bower" one only when `VITE_ABOUT_URL`
 * is set) and "Explore the demo", which refreshes the session (the demo's
 * `getMe()` always answers as Alex, `demo/api.ts`) and goes home.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const location = { path: '/login', route: vi.fn() };
const refresh = vi.fn(() => Promise.resolve());

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ refresh }),
}));

let root: HTMLDivElement;

async function mount(): Promise<void> {
  const { RunYourOwn } = await import('../src/routes/run-your-own.js');
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(RunYourOwn, null), root);
  });
}

function query<T extends Element>(selector: string): T {
  const el = root.querySelector<T>(selector);
  if (el === null) throw new Error(`${selector} missing`);
  return el;
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  location.route.mockClear();
  refresh.mockClear();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('RunYourOwn', () => {
  it('links to the repository and the runbook, not "what is Bower" when VITE_ABOUT_URL is unset', async () => {
    vi.stubEnv('VITE_ABOUT_URL', '');
    vi.resetModules();
    await mount();
    const links = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('.run-your-own-links a'),
    ).map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([
      ['Repository', 'https://github.com/deluispablo/bower'],
      [
        'Runbook',
        'https://github.com/deluispablo/bower/blob/main/docs/runbook.md',
      ],
    ]);
  });

  it('adds the "what is Bower" link when VITE_ABOUT_URL is set', async () => {
    vi.stubEnv('VITE_ABOUT_URL', 'https://bower.example.com/about');
    vi.resetModules();
    await mount();
    const links = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('.run-your-own-links a'),
    );
    expect(links).toHaveLength(3);
    expect(links[2]?.textContent?.trim()).toBe('What is Bower');
    expect(links[2]?.getAttribute('href')).toBe(
      'https://bower.example.com/about',
    );
  });

  it('"Explore the demo" refreshes the session and goes home', async () => {
    vi.stubEnv('VITE_ABOUT_URL', '');
    vi.resetModules();
    await mount();
    void act(() => {
      query<HTMLButtonElement>('.auth-actions button').click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(location.route).toHaveBeenCalledWith('/');
  });
});
