import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSources, readSource } from './choose';

afterEach(() => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});

describe('choosing where the data comes from', () => {
  it('the demo when nothing says otherwise', () => {
    expect(readSource()).toBe('demo');
  });

  it('the query wins over storage, and is kept for the tab', () => {
    sessionStorage.setItem('bower:demo:source', 'demo');
    history.replaceState(null, '', '/?source=fake');
    expect(readSource()).toBe('fake');
    history.replaceState(null, '', '/');
    expect(readSource()).toBe('fake');
  });

  it('real only with VITE_API_URL and no query', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example');
    expect(readSource()).toBe('real');
    history.replaceState(null, '', '/?source=demo');
    expect(readSource()).toBe('demo');
  });

  it('an unknown source is the demo', () => {
    history.replaceState(null, '', '/?source=everything');
    expect(readSource()).toBe('demo');
  });

  it('fake sources answer tree()', async () => {
    const { sources, world } = await buildSources('fake', 'default', 'instant');
    expect(world).toBeUndefined();
    expect((await sources.vault.tree()).map((n) => n.name)).toContain('Projects');
    expect((await sources.session.current())?.name).toBe('Alex');
  });

  it('the fake offline scenario answers offline', async () => {
    const { sources } = await buildSources('fake', 'offline', 'instant');
    await expect(sources.vault.tree()).rejects.toMatchObject({ code: 'offline' });
  });

  it('the demo comes with its world', async () => {
    const { world } = await buildSources('demo', 'default', 'instant');
    expect(world).toBeDefined();
  });
});
