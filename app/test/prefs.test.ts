import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPref, resetPrefs, setPref } from '../src/prefs.js';

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
    expect(getPref('theme')).toBe('system');
    expect(getPref('healthSeenAt')).toBe('');
    expect(getPref('showAppFiles')).toBe(false);
  });

  it('round-trips the time the health check was last opened', () => {
    stubLocalStorage();

    setPref('healthSeenAt', '2026-06-07T09:00:00.000Z');

    expect(getPref('healthSeenAt')).toBe('2026-06-07T09:00:00.000Z');
  });

  it('sorts the explorer by name until told otherwise', () => {
    stubLocalStorage();

    expect(getPref('explorerSort')).toBe('name');
    setPref('explorerSort', 'modified');
    expect(getPref('explorerSort')).toBe('modified');
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
    setPref('pushPromptShown', true);

    expect(store.size).toBe(2);
    expect(getPref('notifyOnFinish')).toBe(true);
    expect(getPref('pushPromptShown')).toBe(true);
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

  it('resetPrefs drops per-user prefs but keeps theme', () => {
    stubLocalStorage();
    setPref('notifyOnFinish', true);
    setPref('pushPromptShown', true);
    setPref('showAppFiles', true);
    setPref('theme', 'dark');

    resetPrefs();

    expect(getPref('notifyOnFinish')).toBe(false);
    expect(getPref('pushPromptShown')).toBe(false);
    expect(getPref('showAppFiles')).toBe(false);
    expect(getPref('theme')).toBe('dark');
  });

  it('resetPrefs never throws when localStorage.removeItem is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        // no-op
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => {
      resetPrefs();
    }).not.toThrow();
  });

  it('dictationLang defaults to the device and round-trips', () => {
    stubLocalStorage();

    expect(getPref('dictationLang')).toBe('');
    setPref('dictationLang', 'es-ES');
    expect(getPref('dictationLang')).toBe('es-ES');
  });

  it('resetPrefs clears the dictation language and the used flag', () => {
    const store = stubLocalStorage();
    setPref('dictationLang', 'fr-FR');
    store.set('bower:dictation:used', '1');

    resetPrefs();

    expect(store.has('bower:pref:dictationLang')).toBe(false);
    expect(store.has('bower:dictation:used')).toBe(false);
  });
});
