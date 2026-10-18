import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeFocus, focusHeading, focusRouteHeading, openerNow, returnFocusTo, focusMain } from './focus';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusHeading', () => {
  it('moves focus from the body to the main heading', () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Add a pile</h1></main>';
    focusHeading();
    expect(document.activeElement?.tagName).toBe('H1');
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  });
  it('falls back to main, and leaves a held focus alone', () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><a href="#x" id="a">x</a></main>';
    focusHeading();
    expect(document.activeElement?.id).toBe('main');
    document.getElementById('a')?.focus();
    focusHeading();
    expect(document.activeElement?.id).toBe('a');
  });
});

describe('returnFocusTo', () => {
  it('returns to the opener, and to the heading once the opener is gone', async () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Home</h1><button id="o">Watch</button></main>';
    const opener = document.getElementById('o');
    returnFocusTo(opener);
    expect(document.activeElement).toBe(opener);
    opener?.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.tagName).toBe('H1');
  });
  it('goes to the heading when the opener is already gone', () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Home</h1></main>';
    returnFocusTo(null);
    expect(document.activeElement?.tagName).toBe('H1');
  });
  it('unfocusable_opener_goes_to_heading: goes to the heading when the opener was disabled before the close', () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Home</h1><button id="o">Tidy up</button></main>';
    const opener = document.getElementById('o') as HTMLButtonElement;
    opener.disabled = true;
    document.body.focus();
    returnFocusTo(opener);
    const h1 = document.querySelector('#main h1');
    expect(document.activeElement).toBe(h1);
    expect(h1?.getAttribute('tabindex')).toBe('-1');
  });
});

describe('close focus (one home, no timer)', () => {
  const closing = (): Event => new Event('focus-scope.unmount', { cancelable: true });

  it('focus returns on close with no timer', async () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Home</h1><button id="o">Tidy up</button></main>';
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const opener = document.getElementById('o');
    opener?.focus();
    const was = openerNow();
    expect(was).toBe(opener);
    // A sheet takes the keyboard, then closes: the handler runs once Radix has removed it.
    document.body.focus();
    const event = closing();
    closeFocus(event, was);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(opener);
    // The opener gone: the heading, again with no timer.
    opener?.remove();
    document.body.focus();
    const again = closing();
    closeFocus(again, was);
    expect(document.activeElement?.tagName).toBe('H1');
    expect(timers).not.toHaveBeenCalled();
    timers.mockRestore();
  });

  it('leaves a field that the next sheet already took', () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Home</h1><button id="o">More</button><input id="f" aria-label="Name"></main>';
    document.getElementById('f')?.focus();
    const event = closing();
    closeFocus(event, document.getElementById('o'));
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('f');
  });

  it('falls to the heading when the opener left before the close, and when there was none', () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Home</h1></main>';
    expect(openerNow()).toBeNull();
    closeFocus(closing(), null);
    expect(document.activeElement?.tagName).toBe('H1');
  });

  it('watches the opener without a timer: it goes, focus goes to the heading; focus moved elsewhere ends the watch', async () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Home</h1><button id="o">Watch</button><button id="p">Other</button></main>';
    const opener = document.getElementById('o');
    returnFocusTo(opener);
    document.getElementById('p')?.focus();
    opener?.remove();
    await Promise.resolve();
    expect(document.activeElement?.id).toBe('p');
  });
});

describe('a sheet opened from a menu sheet', () => {
  const closing = (): Event => new Event('focus-scope.unmount', { cancelable: true });
  const page = '<main id="main" tabindex="-1"><h1>Car</h1><button id="more">More for Car</button></main>';

  const openMenuThenRename = (): { more: HTMLElement | null; rename: HTMLElement | null; was: HTMLElement | null } => {
    document.body.innerHTML = page;
    const more = document.getElementById('more');
    more?.focus();
    openerNow(); // the menu sheet opens from "More for Car"
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><button id="rename">Rename</button></div>');
    const rename = document.getElementById('rename');
    rename?.focus();
    return { more, rename, was: openerNow() }; // the rename sheet opens from the menu
  };

  it('a sheet opened from a menu sheet returns focus to the menu\'s opener', () => {
    const { more, rename, was } = openMenuThenRename();
    expect(was).toBe(rename);
    // The menu sheet closes with its Rename button; the rename sheet then closes.
    document.querySelector('[role="dialog"]')?.remove();
    closeFocus(closing(), was);
    expect(document.activeElement).toBe(more);
  });

  it('goes to the heading when both openers are gone', () => {
    const { more, was } = openMenuThenRename();
    document.querySelector('[role="dialog"]')?.remove();
    more?.remove();
    closeFocus(closing(), was);
    expect(document.activeElement?.tagName).toBe('H1');
  });

  it('keeps the menu opener when the menu sheet left with its Rename button before the next sheet opened', () => {
    const { more, rename } = openMenuThenRename();
    document.querySelector('[role="dialog"]')?.remove();
    document.body.focus();
    const was = openerNow();
    expect(was).toBe(rename);
    closeFocus(closing(), was);
    expect(document.activeElement).toBe(more);
  });

  it('prefers the opener itself while it is on the page', () => {
    document.body.innerHTML = page + '<button id="again">Again</button>';
    document.getElementById('more')?.focus();
    openerNow();
    const again = document.getElementById('again');
    again?.focus();
    const was = openerNow();
    document.body.focus();
    closeFocus(closing(), was);
    expect(document.activeElement).toBe(again);
  });
});

describe('focusRouteHeading', () => {
  // The checks run on timers: fake time moves them, so no test waits on the clock.
  const wait = async (ms: number): Promise<void> => { await vi.advanceTimersByTimeAsync(ms); };
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('moves the keyboard to the new heading when the control that navigated went away', async () => {
    document.body.innerHTML = '<main><button id="b">Go</button></main>';
    document.getElementById('b')?.focus();
    const cancel = focusRouteHeading();
    document.body.innerHTML = '<main><h1>Note</h1></main>';
    await wait(300);
    expect(document.activeElement?.tagName).toBe('H1');
    cancel();
  });

  it('leaves a control that navigated and stays on screen (a top-bar link)', async () => {
    document.body.innerHTML = '<nav><a href="#x" id="a">x</a></nav><main><h1>Home</h1></main>';
    document.getElementById('a')?.focus();
    const cancel = focusRouteHeading();
    document.querySelector('main')?.replaceChildren(Object.assign(document.createElement('h1'), { textContent: 'Settings' }));
    await wait(700);
    expect(document.activeElement?.id).toBe('a');
    cancel();
  });

  it('never takes a field the new view focused itself', async () => {
    document.body.innerHTML = '<main><button id="b">Go</button></main>';
    document.getElementById('b')?.focus();
    const cancel = focusRouteHeading();
    document.body.innerHTML = '<main><h1>Pile</h1><input id="f" aria-label="Paste a link"></main>';
    document.getElementById('f')?.focus();
    await wait(300);
    expect(document.activeElement?.id).toBe('f');
    cancel();
  });

  it('never moves focus while a menu or dialog is open', async () => {
    document.body.innerHTML = '<main><button id="b">Go</button></main>';
    document.getElementById('b')?.focus();
    const cancel = focusRouteHeading();
    document.body.innerHTML = '<main><h1>Files</h1></main><div role="menu"><div role="menuitem">Remove</div></div>';
    await wait(300);
    expect(document.activeElement?.tagName).not.toBe('H1');
    cancel();
  });

  it('stops once focus is placed after the change, even when a menu closes between checks', async () => {
    document.body.innerHTML = '<main><h1>Files</h1><div role="tree" tabindex="0" id="t"></div></main>';
    document.getElementById('t')?.focus();
    const cancel = focusRouteHeading();
    document.body.innerHTML = '<main><h1>Lease draft</h1><button id="m">Move to</button></main>';
    document.getElementById('m')?.focus();
    (document.activeElement as HTMLElement | null)?.blur();
    await wait(300);
    expect(document.activeElement?.tagName).not.toBe('H1');
    cancel();
  });
});

describe('focus timers do nothing once the page is gone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (typeof document !== 'undefined') {
      document.body.innerHTML = '';
    }
  });

  it('handles document being undefined in focusMain callback', () => {
    document.body.innerHTML = '<main id="main"></main>';
    focusMain();
    vi.stubGlobal('document', undefined);
    expect(() => {
      vi.runAllTimers();
    }).not.toThrow();
  });

  it('handles document being undefined in returnFocusTo callback', () => {
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Home</h1><button id="o">Watch</button></main>';
    const opener = document.getElementById('o');
    returnFocusTo(opener);
    vi.stubGlobal('document', undefined);
    expect(() => {
      vi.runAllTimers();
    }).not.toThrow();
  });

  it('handles document being undefined in focusRouteHeading callback', () => {
    document.body.innerHTML = '<main><button id="b">Go</button></main>';
    document.getElementById('b')?.focus();
    focusRouteHeading();
    vi.stubGlobal('document', undefined);
    expect(() => {
      vi.runAllTimers();
    }).not.toThrow();
  });
});
