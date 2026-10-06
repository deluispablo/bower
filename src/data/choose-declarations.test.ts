import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSources } from './choose';

/** The options each folder client of the app was made with (the runner's and the worker's carry a device). */
const made = vi.hoisted(() => [] as Array<{ device?: string; declarePiles?: boolean }>);

vi.mock('./vault/drive-vault', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./vault/drive-vault')>();
  class Recording extends mod.DriveVault {
    constructor(...args: ConstructorParameters<typeof mod.DriveVault>) {
      super(...args);
      made.push({ ...(args[0].device ? { device: args[0].device } : {}), ...(args[0].declarePiles !== undefined ? { declarePiles: args[0].declarePiles } : {}) });
    }
  }
  return { ...mod, DriveVault: Recording };
});

afterEach(() => {
  made.length = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('pile declarations by source', () => {
  it('the pretend Drive declares piles', async () => {
    const { sources } = await buildSources('fake', 'default', 'instant');
    expect(sources.vault).toBeDefined();
    expect(made.filter((m) => !m.device)).toEqual([{ declarePiles: true }]);
  });

  it('the real source does not declare piles yet', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example');
    // Hermetic: nothing may reach a network.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const { sources } = await buildSources('real', 'default', 'instant');
    expect(sources.vault).toBeDefined();
    const app = made.filter((m) => !m.device);
    expect(app).toHaveLength(1);
    expect(app[0]?.declarePiles).not.toBe(true);
  });
});
