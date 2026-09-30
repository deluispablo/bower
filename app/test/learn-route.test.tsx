// @vitest-environment jsdom

/**
 * Learn Bower's screens (R-LEARN-0, 1, 3): signed in it shows the intro card
 * first, the four how-it-works cards, the six examples and the Ideas link;
 * signed out it has no Ideas link (they need a session) and ends with "Sign in
 * with Google". An example page has the four acts and the closing hint. The
 * sign-in page links here.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ShellSlotsProvider,
  useShellSlots,
} from '../src/components/shell-slots.js';
import { EXAMPLES, LEARN_EXAMPLE_HINT } from '../src/learn.js';

let status: 'signed-in' | 'signed-out' = 'signed-in';
let example = 'flat-hunting';

vi.mock('../src/session.js', () => ({
  useSession: () => ({ status, error: null }),
}));
vi.mock('preact-iso', () => ({
  useRoute: () => ({ params: { example } }),
  useLocation: () => ({ path: '/learn', query: {}, route: vi.fn() }),
}));
vi.mock('../src/api.js', () => ({
  loginUrl: () => '/api/auth/login',
}));

const { Learn, LearnExample } = await import('../src/routes/learn.js');
const { Login } = await import('../src/routes/login.js');

let root: HTMLDivElement;

function BackSlot(): ReturnType<typeof h> {
  const { back } = useShellSlots();
  return h('div', { class: 'topbar' }, back);
}

async function mount(screen: () => ReturnType<typeof h>): Promise<void> {
  await act(() => {
    render(
      h(ShellSlotsProvider, null, [
        h(BackSlot, { key: 'bar' }),
        h(screen, { key: 'screen' }),
      ]),
      root,
    );
  });
}

beforeEach(() => {
  status = 'signed-in';
  example = 'flat-hunting';
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  render(null, root);
  root.remove();
});

describe('Learn Bower', () => {
  it('signed in: the intro card first, then how it works, six examples and Ideas', async () => {
    await mount(Learn);
    const rows = [...root.querySelectorAll('a.learn-row')];
    expect(rows[0]?.textContent).toContain('The intro');
    expect(rows[0]?.textContent).toContain('Five screens, two minutes');
    expect(root.querySelectorAll('.learn-how-card')).toHaveLength(4);
    const links = [...root.querySelectorAll('.learn-examples a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual(EXAMPLES.map((e) => `/learn/${e.slug}`));
    expect(root.querySelector('a[href="/ideas"]')).not.toBeNull();
    expect(root.querySelector('.learn-signin')).toBeNull();
    expect(root.querySelector('.topbar-back')?.getAttribute('href')).toBe(
      '/settings',
    );
    expect(root.querySelectorAll('h1')).toHaveLength(1);
  });

  it('signed out: the same cards, no Ideas link, and Sign in with Google at the end', async () => {
    status = 'signed-out';
    await mount(Learn);
    expect(root.querySelector('a.learn-row')?.textContent).toContain(
      'The intro',
    );
    expect(root.querySelectorAll('.learn-examples li')).toHaveLength(6);
    expect(root.querySelector('a[href="/ideas"]')).toBeNull();
    expect(root.querySelector('.learn-signin a')?.textContent).toContain(
      'Sign in with Google',
    );
  });

  it('an example page has the four acts and the closing hint', async () => {
    await mount(LearnExample);
    expect(root.querySelector('h1')?.textContent).toBe('Flat hunting');
    expect(
      [...root.querySelectorAll('.learn-act h2')].map((el) => el.textContent),
    ).toEqual([
      'You add',
      'Bower files and writes',
      'You ask',
      'You get',
    ]);
    expect(root.querySelector('.learn-hint')?.textContent).toBe(
      LEARN_EXAMPLE_HINT,
    );
    expect(root.querySelector('.topbar-back')?.getAttribute('href')).toBe(
      '/learn',
    );
  });

  it('an unknown example says so and links back', async () => {
    example = 'nope';
    await mount(LearnExample);
    expect(root.querySelector('h1')?.textContent).toBe('Example not found');
    expect(root.querySelector('a[href="/learn"]')).not.toBeNull();
  });

  it('the sign-in page reaches it with "What is Bower? · 2 min"', async () => {
    status = 'signed-out';
    await mount(Login);
    const link = root.querySelector('a.auth-learn');
    expect(link?.textContent).toBe('What is Bower? · 2 min');
    expect(link?.getAttribute('href')).toBe('/learn');
  });
});
