// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HELP_ROWS,
  TOUR_TABS,
  helpSheet,
  tourLabel,
  tourNextLabel,
} from '../src/help-rows.js';

const state = vi.hoisted(() => ({ demo: false }));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

const { HelpSheet, INTRO_AGAIN_HREF, Tour, placeSheet } =
  await import('../src/components/help-sheet.js');

let root: HTMLElement;
let tabs: HTMLElement;

function tab(name: string): HTMLElement {
  const el = tabs.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (el === null) throw new Error(`tab ${name} missing`);
  return el;
}

function dialog(): HTMLElement {
  const el = root.querySelector<HTMLElement>('[role="dialog"]');
  if (el === null) throw new Error('dialog missing');
  return el;
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent) === label,
  );
  if (found === undefined) throw new Error(`button ${label} missing`);
  return found;
}

function link(label: string): HTMLAnchorElement | undefined {
  return Array.from(root.querySelectorAll('a')).find(
    (a) => a.textContent === label,
  );
}

function escape(): void {
  void act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

beforeEach(() => {
  tabs = document.createElement('nav');
  tabs.innerHTML =
    '<a href="/" data-tour="home">Home</a>' +
    '<a href="/notes" data-tour="notes">Notes</a>' +
    '<a href="/add" data-tour="add">Add</a>' +
    '<a href="/bower" data-tour="bower">Bower</a>';
  document.body.append(tabs);
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
  tabs.remove();
  state.demo = false;
});

describe('HELP_ROWS', () => {
  it('has the rows of every board, in order', () => {
    expect(HELP_ROWS.home.rows.map((r) => r.lead)).toEqual([
      'Inbox',
      'Last tidy-up',
      'Pinned',
      'Recent',
    ]);
    expect(HELP_ROWS.notes.rows.map((r) => r.lead)).toEqual([
      'Four folders',
      'Files and notes',
      'Search',
      'Hidden',
    ]);
    expect(HELP_ROWS.add.rows.map((r) => r.lead)).toEqual([
      'Photo, files, your Drive, a link',
      'Share from any app',
      'What is this?',
      'Tidy up',
    ]);
    expect(HELP_ROWS.bower.rows.map((r) => r.lead)).toEqual([
      'The box',
      'Rules',
      'Requests',
      'Activity',
    ]);
    expect(HELP_ROWS.folder.rows.map((r) => r.lead)).toEqual([
      'The line at the top',
      'Rows',
      'Ask Bower about it',
    ]);
    expect(HELP_ROWS.folder.tab).toBe('notes');
  });

  it('swaps in the demo lines only in a demo build', () => {
    expect(helpSheet('home', false)).toBe(HELP_ROWS.home);
    expect(helpSheet('home', true).lede).toContain("Alex's things");
    const tidy = helpSheet('add', true).rows.find((r) => r.lead === 'Tidy up');
    expect(tidy?.text).toContain('recording');
    expect(helpSheet('add', true).rows).toHaveLength(4);
    expect(helpSheet('bower', true)).toBe(HELP_ROWS.bower);
  });

  it('labels the tour: "Tour · n of 4", "Next: <tab>", "Let\'s go"', () => {
    expect(TOUR_TABS).toEqual(['home', 'notes', 'add', 'bower']);
    expect(tourLabel(0)).toBe('Tour · 1 of 4');
    expect(TOUR_TABS.map((_, i) => tourNextLabel(i))).toEqual([
      'Next: Notes',
      'Next: Add',
      'Next: Bower',
      "Let's go",
    ]);
  });
});

describe('Tour', () => {
  it('walks the four sheets, highlighting each tab, and finishes', () => {
    const onEnd = vi.fn();
    void act(() => {
      render(h(Tour, { onEnd }), root);
    });

    expect(dialog().getAttribute('aria-modal')).toBe('true');
    const titles: string[] = [];
    for (const [index, name] of TOUR_TABS.entries()) {
      expect(dialog().textContent).toContain(`Tour · ${index + 1} of 4`);
      expect(tab(name).classList.contains('help-tab-on')).toBe(true);
      titles.push(dialog().querySelector('h2')?.textContent ?? '');
      const label = tourNextLabel(index);
      expect(document.activeElement).toBe(button(label));
      void act(() => button(label).click());
      if (index < TOUR_TABS.length - 1) {
        expect(tab(name).classList.contains('help-tab-on')).toBe(false);
      }
    }
    expect(titles).toEqual(['Home', 'Notes', 'Add', 'Bower']);
    expect(onEnd).toHaveBeenCalledWith(true);
  });

  it('skips on Skip and on Escape, and leaves no highlight behind', () => {
    const onEnd = vi.fn();
    void act(() => {
      render(h(Tour, { onEnd }), root);
    });
    void act(() => button('Next: Notes').click());
    void act(() => button('Skip').click());
    expect(onEnd).toHaveBeenCalledWith(false);

    onEnd.mockReset();
    escape();
    expect(onEnd).toHaveBeenCalledWith(false);

    void act(() => {
      render(null, root);
    });
    expect(tabs.querySelector('.help-tab-on')).toBeNull();
  });

  it('carries the demo lines in a demo build', () => {
    state.demo = true;
    void act(() => {
      render(h(Tour, { onEnd: vi.fn() }), root);
    });
    expect(dialog().textContent).toContain(
      "These are Alex's things, a sample.",
    );
  });
});

describe('HelpSheet', () => {
  function mount(
    screen: 'home' | 'folder',
    ideasHref?: string,
  ): { onClose: () => void; onShowMeAround: () => void } {
    const props = {
      screen,
      onClose: vi.fn(),
      onShowMeAround: vi.fn(),
      ideasHref,
    };
    void act(() => {
      render(h(HelpSheet, props), root);
    });
    return props;
  }

  it('shows the screen\'s rows, "About this screen" and the intro link', () => {
    mount('home');
    expect(dialog().textContent).toContain('About this screen');
    expect(dialog().querySelector('h2')?.textContent).toBe('Home');
    expect(dialog().querySelectorAll('li')).toHaveLength(4);
    expect(dialog().textContent).not.toContain('top-left');
    expect(dialog().textContent).not.toContain('Tour ·');
    expect(link('What is Bower, from the start')?.getAttribute('href')).toBe(
      INTRO_AGAIN_HREF,
    );
    expect(tab('home').classList.contains('help-tab-on')).toBe(true);
  });

  it('puts the folder sheet over the Notes tab', () => {
    mount('folder');
    expect(dialog().querySelector('h2')?.textContent).toBe('A folder');
    expect(tab('notes').classList.contains('help-tab-on')).toBe(true);
  });

  it('closes on Close and Escape; Show me around starts the tour', () => {
    const props = mount('home');
    void act(() => button('Close').click());
    expect(props.onClose).toHaveBeenCalledTimes(1);
    escape();
    expect(props.onClose).toHaveBeenCalledTimes(2);
    void act(() => button('Show me around').click());
    expect(props.onShowMeAround).toHaveBeenCalledTimes(1);
  });

  it('shows Ideas only when there is somewhere to go', () => {
    mount('home');
    expect(link('Ideas')).toBeUndefined();
    void act(() => {
      render(null, root);
    });
    mount('home', '/ideas');
    expect(link('Ideas')?.getAttribute('href')).toBe('/ideas');
  });
});

describe('placeSheet', () => {
  it('puts the sheet right above the phone tab bar, full width', () => {
    const place = placeSheet(
      { top: 760, left: 0, width: 390, height: 84 },
      390,
      844,
    );
    expect(place.spot).not.toBeNull();
    expect(place.sheet).toMatchObject({
      left: '0px',
      width: '390px',
      bottom: '90px',
    });
  });

  it('puts the sheet beside the desktop sidebar', () => {
    const place = placeSheet(
      { top: 60, left: 0, width: 264, height: 200 },
      1440,
      900,
    );
    expect(place.sheet).toMatchObject({
      left: '280px',
      width: '400px',
      top: '60px',
    });
  });

  it('dims the whole screen when the tab is not on screen', () => {
    const place = placeSheet(null, 1024, 700);
    expect(place.spot).toBeNull();
    expect(place.sheet).toMatchObject({ width: '520px', left: '252px' });
  });
});
