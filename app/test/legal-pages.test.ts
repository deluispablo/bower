// @vitest-environment jsdom

/**
 * Privacy and Terms: reachable signed out (Google's OAuth consent screen
 * links here, `PUBLIC_PATHS` in `session.tsx`), each with its own "Back"
 * link in place of the shell's header (#313, 6.3.4). Signed out, it must
 * go to `/login` — the only place a signed-out visitor could have come
 * from; signed in, it steps back through browser history instead of
 * bouncing to a now-signed-out `/login`. `useSession` is mocked directly
 * (as `settings-demo.test.ts` does) so the real session module, which
 * requires a `SessionProvider` ancestor, never has to be one here.
 */

import { h, render } from 'preact';
import type { FunctionComponent } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionStatus } from '../src/session.js';

const state = vi.hoisted<{ status: SessionStatus }>(() => ({
  status: 'signed-out',
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ status: state.status }),
}));

const { Privacy } = await import('../src/routes/privacy.js');
const { Terms } = await import('../src/routes/terms.js');

function mount(Component: FunctionComponent): HTMLDivElement {
  const root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Component, null), root);
  });
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
  state.status = 'signed-out';
  vi.restoreAllMocks();
});

describe('Privacy', () => {
  it('renders the privacy policy, reachable signed out', () => {
    const root = mount(Privacy);
    expect(root.querySelector('h1')?.textContent).toBe('Privacy');
  });

  it('says where dictated audio goes', () => {
    const root = mount(Privacy);
    expect(root.textContent).toContain('Bower never receives the audio');
    expect(root.textContent).toContain("Google's");
  });

  it('signed out, Back is a link to /login', () => {
    state.status = 'signed-out';
    const root = mount(Privacy);
    const back = root.querySelector('.page-bare-back');
    expect(back?.tagName).toBe('A');
    expect(back?.getAttribute('href')).toBe('/login');
  });

  it('signed in, Back steps through history instead of linking to /login', () => {
    state.status = 'signed-in';
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      /* no real navigation in jsdom */
    });
    const root = mount(Privacy);
    const back = root.querySelector('.page-bare-back');
    expect(back?.tagName).toBe('BUTTON');
    (back as HTMLButtonElement).click();
    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Terms', () => {
  it('renders the terms of service, reachable signed out', () => {
    const root = mount(Terms);
    expect(root.querySelector('h1')?.textContent).toBe('Terms of Service');
  });

  it('signed out, Back is a link to /login', () => {
    state.status = 'signed-out';
    const root = mount(Terms);
    const back = root.querySelector('.page-bare-back');
    expect(back?.tagName).toBe('A');
    expect(back?.getAttribute('href')).toBe('/login');
  });

  it('signed in, Back steps through history instead of linking to /login', () => {
    state.status = 'signed-in';
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      /* no real navigation in jsdom */
    });
    const root = mount(Terms);
    const back = root.querySelector('.page-bare-back');
    expect(back?.tagName).toBe('BUTTON');
    (back as HTMLButtonElement).click();
    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});
