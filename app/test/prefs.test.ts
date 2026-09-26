import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPref, setPref } from '../src/prefs.js';

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
});

describe('prefs', () => {
  it('defaults to each preference’s own default when nothing is stored', () => {
    stubLocalStorage();

    expect(getPref('notifyOnFinish')).toBe(false);
    expect(getPref('autoProcessOnAdd')).toBe(true);
    expect(getPref('theme')).toBe('system');
  });

  it('round-trips a value written with setPref', () => {
    stubLocalStorage();

    setPref('notifyOnFinish', true);

    expect(getPref('notifyOnFinish')).toBe(true);
  });

  it('round-trips the theme override', () => {
    stubLocalStorage();

    setPref('theme', 'dark');

    expect(getPref('theme')).toBe('dark');
  });

  it('keeps each preference under its own key', () => {
    const store = stubLocalStorage();

    setPref('notifyOnFinish', true);
    setPref('autoProcessOnAdd', true);

    expect(store.size).toBe(2);
    expect(getPref('notifyOnFinish')).toBe(true);
    expect(getPref('autoProcessOnAdd')).toBe(true);
  });

  it('falls back to the default when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    expect(getPref('notifyOnFinish')).toBe(false);
    expect(() => {
      setPref('notifyOnFinish', true);
    }).not.toThrow();
  });

  it('falls back to the default when the stored value is not valid JSON', () => {
    const store = stubLocalStorage();
    store.set('bower:pref:notifyOnFinish', 'not-json');

    expect(getPref('notifyOnFinish')).toBe(false);
  });
});
