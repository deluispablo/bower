// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INTRO_CASES,
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

describe('page 8 closing line (#509)', () => {
  it('reads as one sentence, not a designer note, verbatim from the board', () => {
    // INTRO_CASES[3] is the archive case, page 8 (`Intro-8.dc.html`).
    const closing = INTRO_CASES[3].closing;
    expect(closing).toBe(
      '**It asks before it archives.** "Lisbon looks finished, shall I file it away?" on Home; one tap.',
    );
    // Every run's plain text, joined, ends the page on a full stop.
    const plain = introRuns(closing)
      .map((run) => run.text)
      .join('');
    expect(plain.trim().endsWith('.')).toBe(true);
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

// Smoke test for the nine pages (UI smoke only, as cheap as it gets: each
// page's heading is on the page, and Skip or reaching the last page sets the
// seen flag). `preact-iso`
// is mocked the same way `test/layout.test.ts` mocks it, so the component
// does not need a real Router/LocationProvider.
const location = {
  path: '/welcome',
  query: {} as Record<string, string>,
  route: vi.fn(),
};

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

const { Intro } = await import('../src/routes/intro.js');
const { INTRO_PAGES } = await import('../src/intro.js');

// jsdom does not implement element scrolling; the track only needs to accept it.
HTMLElement.prototype.scrollTo = vi.fn();

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Intro, null), root);
  });
}

describe('Intro', () => {
  afterEach(() => {
    void act(() => {
      render(null, root);
    });
    document.body.replaceChildren();
    location.query = {};
    location.route.mockClear();
    localStorage.clear();
  });

  it('renders all nine pages, each with its heading', () => {
    mount();
    const headings = Array.from(root.querySelectorAll('.intro-heading')).map(
      (el) => el.textContent,
    );
    expect(headings).toHaveLength(9);
    expect(headings).toEqual(INTRO_PAGES.map((page) => page.heading));
  });

  it('marks the intro seen and goes to the sign-in on Skip', () => {
    mount();
    expect(introSeen(localStorage)).toBe(false);
    const skip = root.querySelector<HTMLButtonElement>('.intro-skip');
    void act(() => {
      skip?.click();
    });
    expect(introSeen(localStorage)).toBe(true);
    expect(location.route).toHaveBeenCalledWith('/login');
  });

  it('marks the intro seen on reaching the last page', () => {
    mount();
    const next = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.intro-next'),
    );
    expect(next).toHaveLength(8);
    void act(() => {
      next[6]?.click();
    });
    expect(introSeen(localStorage)).toBe(false);
    void act(() => {
      next[7]?.click();
    });
    expect(introSeen(localStorage)).toBe(true);
  });

  it('shows Skip and Sign in with Google on a first visit', () => {
    mount();
    expect(root.querySelector('.intro-skip')?.textContent).toBe('Skip');
    expect(root.querySelector('.intro-icon-button')).toBeNull();
    expect(root.querySelector('.intro-cta')?.textContent).toBe(
      'Sign in with Google',
    );
  });

  it('shows Close and Done when opened from Settings', () => {
    location.query = { from: 'settings' };
    mount();
    expect(
      root.querySelector('.intro-icon-button')?.getAttribute('aria-label'),
    ).toBe('Close');
    expect(root.querySelector('.intro-cta')?.textContent).toBe('Done');
  });
});
