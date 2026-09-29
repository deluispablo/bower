import { afterEach, describe, expect, it, vi } from 'vitest';

import { forgetDevice } from '../src/forget.js';
import type { ForgetDeviceDeps } from '../src/forget.js';
import { SHARE_CACHE_NAME } from '../src/share-target.js';

function stubDeps(overrides: Partial<ForgetDeviceDeps> = {}): ForgetDeviceDeps {
  return {
    clearIdb: vi.fn(() => Promise.resolve()),
    deleteCache: vi.fn(() => Promise.resolve(true)),
    invalidateToken: vi.fn(),
    resetPrefs: vi.fn(),
    clearSent: vi.fn(),
    clearRecentSearches: vi.fn(),
    clearOpened: vi.fn(),
    clearUploadQueue: vi.fn(() => Promise.resolve()),
    clearPiles: vi.fn(),
    clearMe: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('forgetDevice', () => {
  it('calls every dependency, including both cache names', async () => {
    const deps = stubDeps();

    await forgetDevice(deps);

    expect(deps.clearIdb).toHaveBeenCalledOnce();
    expect(deps.deleteCache).toHaveBeenCalledWith('bower-api');
    expect(deps.deleteCache).toHaveBeenCalledWith(SHARE_CACHE_NAME);
    expect(deps.invalidateToken).toHaveBeenCalledOnce();
    expect(deps.resetPrefs).toHaveBeenCalledOnce();
    expect(deps.clearSent).toHaveBeenCalledOnce();
    expect(deps.clearRecentSearches).toHaveBeenCalledOnce();
    expect(deps.clearOpened).toHaveBeenCalledOnce();
    expect(deps.clearUploadQueue).toHaveBeenCalledOnce();
    expect(deps.clearPiles).toHaveBeenCalledOnce();
    expect(deps.clearMe).toHaveBeenCalledOnce();
  });

  it('still runs the rest when clearIdb rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = stubDeps({
      clearIdb: vi.fn(() => Promise.reject(new Error('idb blocked'))),
    });

    await forgetDevice(deps);

    expect(deps.deleteCache).toHaveBeenCalledTimes(2);
    expect(deps.invalidateToken).toHaveBeenCalledOnce();
    expect(deps.resetPrefs).toHaveBeenCalledOnce();
    expect(deps.clearSent).toHaveBeenCalledOnce();
    expect(deps.clearRecentSearches).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(new Error('idb blocked'));
  });

  it('still runs the rest when deleteCache rejects for one name', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = stubDeps({
      deleteCache: vi.fn((name: string) =>
        name === 'bower-api'
          ? Promise.reject(new Error('cache blocked'))
          : Promise.resolve(true),
      ),
    });

    await forgetDevice(deps);

    expect(deps.clearIdb).toHaveBeenCalledOnce();
    expect(deps.deleteCache).toHaveBeenCalledTimes(2);
    expect(deps.invalidateToken).toHaveBeenCalledOnce();
    expect(deps.resetPrefs).toHaveBeenCalledOnce();
    expect(deps.clearSent).toHaveBeenCalledOnce();
    expect(deps.clearRecentSearches).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(new Error('cache blocked'));
  });

  it('still runs the rest when a synchronous dependency throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = stubDeps({
      invalidateToken: vi.fn(() => {
        throw new Error('token blocked');
      }),
      resetPrefs: vi.fn(() => {
        throw new Error('prefs blocked');
      }),
    });

    await forgetDevice(deps);

    expect(deps.clearIdb).toHaveBeenCalledOnce();
    expect(deps.deleteCache).toHaveBeenCalledTimes(2);
    expect(deps.clearSent).toHaveBeenCalledOnce();
    expect(deps.clearRecentSearches).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(new Error('token blocked'));
    expect(errorSpy).toHaveBeenCalledWith(new Error('prefs blocked'));
  });

  it('still runs the rest when clearSent or clearRecentSearches throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = stubDeps({
      clearSent: vi.fn(() => {
        throw new Error('sent history blocked');
      }),
      clearRecentSearches: vi.fn(() => {
        throw new Error('recent searches blocked');
      }),
    });

    await forgetDevice(deps);

    expect(deps.clearIdb).toHaveBeenCalledOnce();
    expect(deps.deleteCache).toHaveBeenCalledTimes(2);
    expect(deps.invalidateToken).toHaveBeenCalledOnce();
    expect(deps.resetPrefs).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(new Error('sent history blocked'));
    expect(errorSpy).toHaveBeenCalledWith(new Error('recent searches blocked'));
  });
});
