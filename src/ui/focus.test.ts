import { afterEach, describe, expect, it } from 'vitest';
import { focusHeading, returnFocusTo } from './focus';

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
