// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INTRO_PAGES,
  INTRO_PILE,
  introLastAction,
  introPageFromQuery,
  introPageLabel,
  introReturnPath,
  introRuns,
  introSeen,
  markIntroSeen,
} from '../src/intro.js';

describe('introSeen', () => {
  it('is false on a first visit (nothing stored yet)', () => {
    expect(introSeen(makeStorage())).toBe(false);
  });

  it('is true once markIntroSeen has run (e.g. after Skip)', () => {
    const storage = makeStorage();
    markIntroSeen(storage);
    expect(introSeen(storage)).toBe(true);
  });

  it('is false when the storage throws, so the intro shows rather than hides for good', () => {
    expect(introSeen(throwingStorage())).toBe(false);
  });
});

describe('introReturnPath', () => {
  it('goes back to Settings when opened from it', () => {
    expect(introReturnPath('settings')).toBe('/settings');
  });

  it('goes back to the sign-in when opened from it', () => {
    expect(introReturnPath('login')).toBe('/login');
  });

  it("goes back to the demo's Run your own Bower when opened from it (#366)", () => {
    expect(introReturnPath('run-your-own')).toBe('/login');
  });

  it('is null on a first visit or an unknown origin', () => {
    expect(introReturnPath(undefined)).toBeNull();
    expect(introReturnPath('elsewhere')).toBeNull();
  });
});

describe('markIntroSeen', () => {
  it('does not throw when the storage throws (best effort)', () => {
    expect(() => markIntroSeen(throwingStorage())).not.toThrow();
  });
});

describe('the five pages (R-INTRO-1)', () => {
  it('are exactly five, each with a heading and a body', () => {
    expect(INTRO_PAGES).toHaveLength(5);
    for (const page of INTRO_PAGES) {
      expect(page.heading).not.toBe('');
      expect(page.body).not.toBe('');
    }
  });

  it('say nothing the old pages got wrong', () => {
    const all = INTRO_PAGES.map((p) => `${p.heading} ${p.body}`).join(' ');
    for (const untrue of [
      'Nothing else happens',
      'stops there',
      'moves it to the archive',
      'never leave your Drive',
      '4-Archive ',
      'Ideas list',
    ]) {
      expect(all).not.toContain(untrue);
    }
  });
});

describe('introLastAction (R-IN-6)', () => {
  it('is Back to Bower when replayed signed in, Done from the sign-in, else the sign-in or the demo', () => {
    expect(introLastAction('settings', false)).toBe('back-to-bower');
    expect(introLastAction('login', false)).toBe('done');
    expect(introLastAction('run-your-own', true)).toBe('done');
    expect(introLastAction(undefined, false)).toBe('sign-in');
    expect(introLastAction(undefined, true)).toBe('try-demo');
  });
});

describe('introPageFromQuery (R-INTRO-2)', () => {
  it('reads a 1-based page as an index', () => {
    expect(introPageFromQuery('1')).toBe(0);
    expect(introPageFromQuery('3')).toBe(2);
    expect(introPageFromQuery('5')).toBe(4);
  });

  it('clamps values outside 1 to 5 and treats junk or nothing as page 1', () => {
    expect(introPageFromQuery('0')).toBe(0);
    expect(introPageFromQuery('-4')).toBe(0);
    expect(introPageFromQuery('9')).toBe(4);
    expect(introPageFromQuery('abc')).toBe(0);
    expect(introPageFromQuery('')).toBe(0);
    expect(introPageFromQuery(undefined)).toBe(0);
    expect(introPageFromQuery(null)).toBe(0);
  });
});

describe('introPageLabel', () => {
  it('reads "n of 5"', () => {
    expect(introPageLabel(0)).toBe('1 of 5');
    expect(introPageLabel(4)).toBe('5 of 5');
  });
});

describe('introRuns', () => {
  it('splits a prose string into plain and bold runs', () => {
    expect(introRuns('**Told.** You said so.')).toEqual([
      { text: 'Told.', bold: true },
      { text: ' You said so.', bold: false },
    ]);
  });

  it('keeps a string without markers as one plain run', () => {
    expect(introRuns('No menus to learn.')).toEqual([
      { text: 'No menus to learn.', bold: false },
    ]);
  });
});

/** A minimal in-memory `Storage`, without needing jsdom's real one. */
function makeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

/** A `Storage` whose every method throws, as a blocked storage would. */
function throwingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
    clear: () => {
      throw new Error('blocked');
    },
    key: () => {
      throw new Error('blocked');
    },
    get length(): number {
      throw new Error('blocked');
    },
  };
}

// The route. `preact-iso` is mocked the same way `test/layout.test.ts`
// mocks it, so the component does not need a real Router/LocationProvider.
const location = {
  path: '/welcome',
  query: {} as Record<string, string>,
  route: vi.fn(),
};

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

// Page 2 draws the real note box, whose body reads the vault for embeds.
vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({ index: null, getNoteText: () => Promise.resolve('') }),
}));

const { Intro } = await import('../src/routes/intro.js');

// jsdom does not implement element scrolling; the track only needs to accept it.
HTMLElement.prototype.scrollTo = vi.fn();

let root: HTMLDivElement;

function mount(search = ''): void {
  window.history.replaceState(null, '', `/welcome${search}`);
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Intro, null), root);
  });
}

function click(selector: string, index = 0): void {
  const el = root.querySelectorAll<HTMLElement>(selector)[index];
  void act(() => {
    el?.click();
  });
}

function button(name: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll('button')).find(
    (b) => b.textContent === name || b.getAttribute('aria-label') === name,
  );
}

function currentPages(): number[] {
  return Array.from(root.querySelectorAll('.intro-page'))
    .map((el, i) => (el.hasAttribute('inert') ? -1 : i + 1))
    .filter((n) => n > 0);
}

describe('Intro', () => {
  beforeEach(() => {
    location.query = {};
  });

  afterEach(() => {
    void act(() => {
      render(null, root);
    });
    document.body.replaceChildren();
    location.query = {};
    location.route.mockClear();
    localStorage.clear();
  });

  it('renders five pages, each with its own h1, in order', () => {
    mount();
    const headings = Array.from(root.querySelectorAll('h1')).map(
      (el) => el.textContent,
    );
    expect(headings).toEqual(INTRO_PAGES.map((page) => page.heading));
  });

  it('shows one page at a time: the others are inert', () => {
    mount();
    expect(currentPages()).toEqual([1]);
    click('.intro-next');
    expect(currentPages()).toEqual([2]);
  });

  it('has a polite status "2 of 5" next to the dots that follows the page', () => {
    mount();
    const status = root.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toBe('1 of 5');
    click('.intro-next');
    expect(status?.textContent).toBe('2 of 5');
  });

  it('moves focus to the new page heading on Next and on Back', () => {
    mount();
    click('.intro-next');
    expect(document.activeElement).toBe(root.querySelectorAll('h1')[1]);
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
    click('.intro-back');
    expect(document.activeElement).toBe(root.querySelectorAll('h1')[0]);
  });

  it('does not steal focus on the first load', () => {
    mount('?page=3');
    expect(document.activeElement).toBe(document.body);
  });

  it('shows Back from page 2 on, never on page 1 or as a page-5 Next', () => {
    mount();
    expect(button('Back')).toBeUndefined();
    click('.intro-next');
    expect(button('Back')).toBeDefined();
    click('.intro-next');
    click('.intro-next');
    click('.intro-next');
    expect(root.querySelector('.intro-status')?.textContent).toBe('5 of 5');
    expect(button('Next')).toBeUndefined();
    expect(button('Back')).toBeDefined();
  });

  it('puts the page in the address: Next and Back push, the first load replaces', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    location.query = { page: '9' };
    mount('?page=9');
    // Clamped, and written back without adding an entry.
    expect(window.location.search).toBe('?page=5');
    expect(currentPages()).toEqual([5]);
    push.mockClear();
    click('.intro-back');
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?page=4');
    expect(replace).toHaveBeenCalled();
    push.mockRestore();
    replace.mockRestore();
  });

  it('keeps ?from= when it writes the page', () => {
    location.query = { from: 'settings' };
    mount('?from=settings');
    click('.intro-next');
    expect(window.location.search).toBe('?from=settings&page=2');
  });

  it('follows browser back to the page the address names', () => {
    mount();
    click('.intro-next');
    click('.intro-next');
    window.history.replaceState(null, '', '/welcome?page=2');
    void act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(currentPages()).toEqual([2]);
    expect(document.activeElement).toBe(root.querySelectorAll('h1')[1]);
  });

  it('replaces the entry and goes to the sign-in on Skip, marking the intro seen', () => {
    mount();
    expect(introSeen(localStorage)).toBe(false);
    click('.intro-skip');
    expect(introSeen(localStorage)).toBe(true);
    expect(location.route).toHaveBeenCalledWith('/login', true);
  });

  it('marks the intro seen on reaching page 5 through the controls', () => {
    mount();
    for (let i = 0; i < 3; i += 1) click('.intro-next');
    expect(introSeen(localStorage)).toBe(false);
    click('.intro-next');
    expect(introSeen(localStorage)).toBe(true);
  });

  it('does not mark the intro seen when ?page=5 is typed in', () => {
    location.query = { page: '5' };
    mount('?page=5');
    expect(currentPages()).toEqual([5]);
    expect(introSeen(localStorage)).toBe(false);
  });

  it('shows Skip on the first pages of a first visit', () => {
    mount();
    expect(root.querySelector('.intro-skip')?.textContent).toBe('Skip');
  });

  it('shows Close top right on page 5 of a first visit, with Sign in with Google where Next was', () => {
    location.query = { page: '5' };
    mount('?page=5');
    expect(root.querySelector('.intro-skip')?.textContent).toBe('Close');
    expect(button('Next')).toBeUndefined();
    expect(root.querySelector('.intro-footer .intro-cta')?.textContent).toBe(
      'Sign in with Google',
    );
    // IN-P5 draws no link to Learn Bower (L-46 reversed).
    expect(root.querySelector('.intro-learn')).toBeNull();
  });

  it('replayed while signed in, the last button reads Back to Bower and goes Home (R-IN-6)', () => {
    location.query = { from: 'settings', page: '5' };
    mount('?from=settings&page=5');
    const last = root.querySelector<HTMLButtonElement>(
      '.intro-footer .intro-cta',
    );
    expect(last?.textContent).toBe('Back to Bower');
    click('.intro-footer .intro-cta');
    expect(location.route).toHaveBeenCalledWith('/');
    expect(introSeen(localStorage)).toBe(true);
  });

  it('Skip and Close go back to Settings when opened from there', () => {
    location.query = { from: 'settings' };
    mount('?from=settings');
    expect(root.querySelector('.intro-skip')?.textContent).toBe('Skip');
    click('.intro-skip');
    expect(location.route).toHaveBeenCalledWith('/settings', true);
  });

  it('returns to the sign-in from ?from=login, with Done on page 5', () => {
    location.query = { from: 'login', page: '5' };
    mount('?from=login&page=5');
    expect(root.querySelector('.intro-footer .intro-cta')?.textContent).toBe(
      'Done',
    );
    click('.intro-skip');
    expect(location.route).toHaveBeenCalledWith('/login', true);
  });

  it('lists the pile on page 1 by name, without extensions (R-IN-7)', () => {
    mount();
    const names = Array.from(
      root.querySelectorAll('.intro-page--1 .intro-row span:last-child'),
    ).map((el) => el.textContent);
    expect(names).toEqual(['Lease 2026', 'flat-camden.example', 'IMG_2231']);
    for (const name of INTRO_PILE.files) {
      expect(name).not.toMatch(/\.(pdf|jpe?g|png|docx?)$/i);
    }
  });

  it('draws pages 1 and 4 with the real text box and page 2 with the note box (R-IN-2, R-IN-3)', () => {
    // A picture: the resting mic whatever the browser (jsdom has no speech API).
    mount();
    const one = root.querySelector('.intro-page--1 .composer');
    expect(one).not.toBeNull();
    expect(
      root
        .querySelector('.intro-page--1 .composer button')
        ?.getAttribute('aria-label'),
    ).toBe('Dictate');
    expect(
      root
        .querySelector('.intro-page--4 .composer button')
        ?.getAttribute('aria-label'),
    ).toBe('Send');
    expect(root.querySelector('.intro-page--2 .bower-note-box')).not.toBeNull();
    expect(root.querySelectorAll('.intro-page--5 .folder-mark')).toHaveLength(
      5,
    );
  });

  it('draws its illustrations without animation', () => {
    mount();
    for (const art of root.querySelectorAll('.intro-art')) {
      expect(art.getAttribute('aria-hidden')).toBe('true');
      expect(art.hasAttribute('inert')).toBe(true);
    }
  });
});
