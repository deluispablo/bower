import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSources } from './choose';
import type { LiveOptions } from './live';

/** The options each live source of the app was made with. */
const made = vi.hoisted(() => [] as Array<Pick<LiveOptions, 'uploadQueue'>>);

vi.mock('./live', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./live')>();
  return {
    ...mod,
    makeLiveSources: (opts: LiveOptions) => {
      made.push({ uploadQueue: opts.uploadQueue });
      return mod.makeLiveSources(opts);
    },
  };
});

afterEach(() => {
  made.length = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('the persistent upload queue by source (no source opts out of it)', () => {
  it('the pretend Drive sends pile files through the upload queue', async () => {
    const { sources } = await buildSources('fake', 'default', 'instant');
    expect(sources.vault).toBeDefined();
    expect(made).toEqual([{ uploadQueue: undefined }]);
  });

  it('the real source sends pile files through the upload queue', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example');
    // Hermetic: nothing may reach a network.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const { sources } = await buildSources('real', 'default', 'instant');
    expect(sources.vault).toBeDefined();
    expect(made).toEqual([{ uploadQueue: undefined }]);
  });
});
