// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPref } from '../src/prefs.js';
import { applyTheme, initTheme, setTheme } from '../src/theme.js';

function stubLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('applyTheme', () => {
  it('sets data-theme for an explicit override', () => {
    const root = document.createElement('html');
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    applyTheme('light', root);
    expect(root.dataset.theme).toBe('light');
  });

  it('clears data-theme for "system", following the OS again', () => {
    const root = document.createElement('html');
    root.dataset.theme = 'dark';
    applyTheme('system', root);
    expect(root.dataset.theme).toBeUndefined();
  });
});

describe('initTheme', () => {
  it('applies the remembered override to the document root', () => {
    stubLocalStorage();
    localStorage.setItem('bower:pref:theme', JSON.stringify('dark'));

    initTheme();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('leaves data-theme unset when the preference is "system"', () => {
    stubLocalStorage();

    initTheme();

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('setTheme', () => {
  it('remembers the choice and applies it right away', () => {
    stubLocalStorage();

    setTheme('light');

    expect(getPref('theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
