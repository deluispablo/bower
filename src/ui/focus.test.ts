import { afterEach, describe, expect, it } from 'vitest';
import { focusHeading, focusRouteHeading, returnFocusTo } from './focus';

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
});

describe('focusRouteHeading', () => {
  const wait = (ms: number): Promise<unknown> => new Promise((r) => setTimeout(r, ms));

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
});
