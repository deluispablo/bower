// @vitest-environment jsdom

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TOUR_TABS,
  folderHelpTopic,
  tourNextLabel,
  useHelpTopic,
} from '../src/help-rows.js';

const state = vi.hoisted(() => ({ demo: false }));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

import { OverlayHost } from '../src/components/overlay.js';
import { close, open, resetOverlayQueue } from '../src/overlay-queue.js';
import { resetTourStore } from '../src/tour-store.js';
import { currentToast, dismissToast } from '../src/toast-store.js';

const {
  HelpSheet,
  dismissedTips,
  INTRO_AGAIN_HREF,
  Tour,
  isBowerRow,
  placeTour,
} = await import('../src/components/help-sheet.js');

let root: HTMLElement;
let tabs: HTMLElement;

function tab(name: string): HTMLElement {
  const el = tabs.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (el === null) throw new Error(`tab ${name} missing`);
  return el;
}

function dialog(): HTMLElement {
  const el = document.body.querySelector<HTMLElement>('[role="dialog"]');
  if (el === null) throw new Error('dialog missing');
  return el;
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.body.querySelectorAll('button')).find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent) === label,
  );
  if (found === undefined) throw new Error(`button ${label} missing`);
  return found;
}

function link(label: string): HTMLAnchorElement | undefined {
  return Array.from(document.body.querySelectorAll('a')).find(
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
  resetOverlayQueue();
  resetTourStore();
  dismissToast();
  localStorage.clear();
  root.remove();
  tabs.remove();
  state.demo = false;
});

describe('Tour', () => {
  async function mountTour(
    onEnd = vi.fn<(finished: boolean) => void>(),
  ): Promise<typeof onEnd> {
    await act(async () => {
      render(h(Fragment, null, h(Tour, { onEnd }), h(OverlayHost, null)), root);
      await Promise.resolve();
    });
    return onEnd;
  }

  it('walks the four steps, lighting each tab, and finishes', async () => {
    const onEnd = await mountTour();

    expect(dialog().getAttribute('aria-modal')).toBe('true');
    const titles: string[] = [];
    for (const [index, name] of TOUR_TABS.entries()) {
      expect(dialog().textContent).toContain(`Tour · ${index + 1} of 4`);
      expect(tab(name).classList.contains('help-tab-on')).toBe(true);
      titles.push(dialog().querySelector('h2')?.textContent ?? '');
      const label = tourNextLabel(index);
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(button(label));
      await act(async () => {
        button(label).click();
        await Promise.resolve();
      });
      if (index < TOUR_TABS.length - 1) {
        expect(tab(name).classList.contains('help-tab-on')).toBe(false);
      }
    }
    expect(titles).toEqual(['Home', 'Folders', 'Add', 'Bower']);
    expect(onEnd).toHaveBeenCalledWith(true);
    expect(currentToast()).toBeNull();
  });

  it('has no Back on the first step and goes back from the next', async () => {
    await mountTour();
    expect(
      Array.from(document.body.querySelectorAll('button')).some(
        (b) => b.textContent === 'Back',
      ),
    ).toBe(false);
    void act(() => {
      button('Next: Folders').click();
    });
    expect(dialog().querySelector('h2')?.textContent).toBe('Folders');
    void act(() => {
      button('Back').click();
    });
    expect(dialog().querySelector('h2')?.textContent).toBe('Home');
    expect(tab('home').classList.contains('help-tab-on')).toBe(true);
  });

  it('shows the pointing bird (80 px, down) and the ring over the tab', async () => {
    tab('home').getBoundingClientRect = () =>
      ({ top: 700, left: 20, width: 90, height: 56 }) as DOMRect;
    tabs.getBoundingClientRect = () =>
      ({ top: 690, left: 0, width: 1024, height: 78 }) as DOMRect;
    await mountTour();
    const bird = document.body.querySelector<HTMLElement>('.tour-bird');
    expect(bird).not.toBeNull();
    expect(bird?.querySelector('svg')?.getAttribute('width')).toBe('80');
    expect(bird?.querySelector('svg')?.getAttribute('class')).toContain('pd');
    expect(bird?.querySelector('svg')?.getAttribute('class')).not.toContain(
      'flip',
    );
  });

  it('turns the bird to face a desktop sidebar target (TR-*-1280)', async () => {
    tab('home').getBoundingClientRect = () =>
      ({ top: 95, left: 12, width: 240, height: 34 }) as DOMRect;
    tabs.getBoundingClientRect = () =>
      ({ top: 60, left: 0, width: 264, height: 600 }) as DOMRect;
    await mountTour();
    const svg = document.body.querySelector('.tour-bird svg');
    expect(svg?.getAttribute('class')).toContain('flip');
    expect(svg?.getAttribute('class')).not.toContain('pd');
  });

  it('skips on Skip and on Escape with the toast once, and leaves no highlight', async () => {
    const onEnd = await mountTour();
    void act(() => {
      button('Next: Folders').click();
    });
    void act(() => {
      button('Skip').click();
    });
    expect(onEnd).toHaveBeenCalledWith(false);
    expect(currentToast()?.message).toBe(
      'Replay the tour any time from Settings.',
    );

    dismissToast();
    onEnd.mockReset();
    escape();
    expect(onEnd).toHaveBeenCalledWith(false);
    expect(currentToast()).toBeNull();

    void act(() => {
      render(null, root);
    });
    expect(tabs.querySelector('.help-tab-on')).toBeNull();
  });

  it('waits while another overlay is open', async () => {
    open({
      id: 'other',
      priority: 1,
      render: () => h('div', { role: 'dialog', 'aria-label': 'Other' }),
    });
    await mountTour();
    expect(dialog().getAttribute('aria-label')).toBe('Other');
    expect(tabs.querySelector('.help-tab-on')).toBeNull();
    expect(document.body.querySelector('.tour-bird')).toBeNull();
    await act(async () => {
      close('other');
      await Promise.resolve();
    });
    expect(dialog().textContent).toContain('Tour · 1 of 4');
    expect(tab('home').classList.contains('help-tab-on')).toBe(true);
  });

  it('never shows with a run sheet in front, only once the queue is free', async () => {
    // First load with a held run: the run's sheet (priority 2) is up.
    open({
      id: 'run-sheet',
      priority: 2,
      render: () => h('div', { role: 'dialog', 'aria-label': 'Tidying up' }),
    });
    await mountTour();
    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog().getAttribute('aria-label')).toBe('Tidying up');
    expect(document.body.textContent).not.toContain('Tour ·');
    await act(async () => {
      close('run-sheet');
      await Promise.resolve();
    });
    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog().textContent).toContain('Tour · 1 of 4');
  });

  it('shows the Home Help words on step 1, as in the Help (K-28)', async () => {
    state.demo = true;
    await mountTour();
    expect(dialog().textContent).toContain(
      'Where Bower tells you what is going on.',
    );
    expect(dialog().querySelectorAll('li')).toHaveLength(4);
  });
});

describe('HelpSheet', () => {
  function mount(screen: 'home' | 'folder'): {
    onClose: () => void;
    onShowMeAround: () => void;
  } {
    const props = {
      screen,
      onClose: vi.fn(),
      onShowMeAround: vi.fn(),
    };
    void act(() => {
      render(
        h(Fragment, null, h(HelpSheet, props), h(OverlayHost, null)),
        root,
      );
    });
    return props;
  }

  it('draws the one Help template: bird 52, overline, title, lede, rows, the Bower group (#907)', () => {
    mount('home');
    expect(dialog().querySelector('.help-kicker')?.textContent).toBe(
      'Help and about this',
    );
    expect(
      dialog().querySelector('.help-bird svg')?.getAttribute('width'),
    ).toBe('52');
    expect(dialog().querySelector('h2')?.textContent).toBe('Home');
    expect(dialog().querySelector('.help-head + .help-lede')).not.toBeNull();
    expect(dialog().querySelectorAll('li')).toHaveLength(4);
    expect(dialog().textContent).not.toContain('top-left');
    expect(dialog().textContent).not.toContain('Tour ·');
    expect(dialog().querySelector('.help-group')?.textContent).toBe('Bower');
    const actions = dialog().querySelectorAll('.help-actions .btn-secondary');
    expect(Array.from(actions, (a) => a.textContent?.trim())).toEqual([
      'Show me around',
      'Learn Bower',
    ]);
    expect(link('Learn Bower')?.getAttribute('href')).toBe('/learn');
    expect(INTRO_AGAIN_HREF).toBe('/welcome?from=settings');
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(dialog().closest('#app, nav')).toBeNull();
  });

  it('names the folder sheet', () => {
    mount('folder');
    expect(dialog().querySelector('h2')?.textContent).toBe('A folder');
  });

  it('opens the Help the screen on show asked for (R-HELP-2)', () => {
    const screen = document.createElement('div');
    document.body.append(screen);
    function Areas(): null {
      useHelpTopic(folderHelpTopic('Areas', true, undefined));
      return null;
    }
    void act(() => {
      render(h(Areas, null), screen);
    });
    mount('folder');
    expect(dialog().querySelector('h2')?.textContent).toBe(
      'A folder of folders',
    );
    expect(dialog().textContent).toContain(
      'Ask Bower sends a question about everything in Areas.',
    );
    void act(() => {
      render(null, screen);
    });
    screen.remove();
  });

  it('lists a dismissed tip under "Tips on this screen" and brings it back', () => {
    mount('home');
    expect(dialog().textContent).not.toContain('Tips on this screen');
    void act(() => {
      render(null, root);
    });
    resetOverlayQueue();
    localStorage.setItem('bower:hint:home', '1');
    mount('home');
    expect(dialog().textContent).toContain('Tips on this screen');
    expect(dialog().textContent).toContain(
      'Use Tidy up once, when you have added everything.',
    );
    void act(() => button('Show again').click());
    expect(localStorage.getItem('bower:hint:home')).toBeNull();
    expect(dialog().textContent).not.toContain('Tips on this screen');
    expect(dismissedTips('home')).toEqual([]);
  });

  it('waits while another overlay is open, then shows', () => {
    void act(() => {
      open({ id: 'other', priority: 1, render: () => h('p', null, 'other') });
    });
    mount('home');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    void act(() => {
      close('other');
    });
    expect(dialog().querySelector('h2')?.textContent).toBe('Home');
  });

  it('closes on Close Help and Escape; Show me around starts the tour', () => {
    const props = mount('home');
    void act(() => button('Close Help').click());
    expect(props.onClose).toHaveBeenCalledTimes(1);
    escape();
    expect(props.onClose).toHaveBeenCalledTimes(2);
    void act(() => button('Show me around').click());
    expect(props.onShowMeAround).toHaveBeenCalledTimes(1);
  });

  it('marks rows about what Bower wrote with the bird (R-HELP-4)', () => {
    expect(isBowerRow('By Bower')).toBe(true);
    expect(isBowerRow('The bird')).toBe(true);
    expect(isBowerRow('Ask Bower')).toBe(false);
  });

  it('has no Ideas button (#859)', () => {
    mount('home');
    expect(link('Ideas')).toBeUndefined();
  });
});

describe('placeTour', () => {
  it('stands the bird on the phone tab bar, centred over the tab', () => {
    const place = placeTour(
      { top: 770, left: 100, width: 90, height: 56 },
      { top: 760, left: 0, width: 390, height: 84 },
      390,
      844,
    );
    expect(place.spot).toMatchObject({ top: '766px', left: '96px' });
    expect(place.bird).toEqual({ left: '105px', bottom: '84px' });
    expect(place.facing).toBe('down');
    expect(place.spot).toMatchObject({ borderRadius: '14px' });
  });

  it('keeps the bird inside the screen at the edges', () => {
    const place = placeTour(
      { top: 770, left: 0, width: 50, height: 56 },
      { top: 760, left: 0, width: 390, height: 84 },
      390,
      844,
    );
    expect(place.bird).toMatchObject({ left: '8px' });
  });

  it('stands it on the tab itself beside a desktop sidebar', () => {
    const place = placeTour(
      { top: 200, left: 16, width: 232, height: 44 },
      { top: 60, left: 0, width: 264, height: 400 },
      1440,
      900,
    );
    // 12 px past the ring's right edge, level with its middle, facing it.
    expect(place.bird).toEqual({ left: '264px', top: '182px' });
    expect(place.facing).toBe('left');
    expect(place.spot).toMatchObject({ borderRadius: '10px' });
  });

  it('uses the sidebar branch for a tall sidebar that reaches the lower half', () => {
    const place = placeTour(
      { top: 300, left: 16, width: 232, height: 44 },
      { top: 0, left: 0, width: 264, height: 800 },
      1280,
      800,
    );
    expect(place.bird).toEqual({ left: '264px', top: '282px' });
  });

  it('treats a short, wide bar in the lower half as a bottom bar', () => {
    const place = placeTour(
      { top: 730, left: 100, width: 90, height: 56 },
      { top: 720, left: 0, width: 1280, height: 80 },
      1280,
      800,
    );
    expect(place.bird).toEqual({ left: '105px', bottom: '80px' });
  });

  it('has no ring or bird when the tab is not on screen', () => {
    expect(placeTour(null, null, 1024, 700)).toEqual({
      spot: null,
      bird: null,
      facing: 'left',
    });
  });
});
