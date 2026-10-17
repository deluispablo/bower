import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiBase, buildSources, readSource } from './choose';
import { OPEN_ELSEWHERE_TEXT, type PlaceGuard } from './session';
import type { Sources } from './sources';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
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

  it('real with VITE_API_URL and no query, even on localhost', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example');
    expect(readSource()).toBe('real');
    history.replaceState(null, '', '/?source=demo');
    expect(readSource()).toBe('demo');
  });

  it("the Worker is at the app's own origin when VITE_API_URL is unset", async () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(apiBase()).toBe(location.origin);
    history.replaceState(null, '', '/?source=real');
    expect(readSource()).toBe('real');
    const fetchFn = vi.fn(async (_url: RequestInfo | URL): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchFn);
    const { sources } = await buildSources('real', 'default', 'instant');
    await sources.session.current().catch(() => undefined);
    expect(fetchFn.mock.calls.map(([u]) => String(u))).toContain(`${location.origin}/me`);
    vi.stubEnv('VITE_API_URL', 'https://api.example');
    expect(apiBase()).toBe('https://api.example');
    if ('dispose' in sources && typeof sources.dispose === 'function') (sources as { dispose(): void }).dispose();
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

describe('every source has one active place per person', () => {
  /** The pretend leases this browser keeps: one per world and person, never an email. */
  const leases = (): string[] => Object.keys(localStorage).filter((k) => k.startsWith('bower:lease:')).sort();
  /** Another tab of this browser: a new place id. */
  const anotherTab = (): void => sessionStorage.removeItem('bower:place');
  const close = (...all: Sources[]): void => {
    for (const s of all) {
      if ('dispose' in s && typeof s.dispose === 'function') (s as { dispose(): void }).dispose();
      else (s.place as PlaceGuard | undefined)?.dispose();
    }
  };

  it('the demo has its own lease, and a second tab asks before taking over', async () => {
    const first = (await buildSources('demo', 'default', 'instant')).sources;
    expect(first.place).toBeDefined();
    expect(await first.place?.start()).toBe('active');
    expect(leases()).toEqual([expect.stringMatching(/^bower:lease:demo:[0-9a-f]{16,}$/)]);
    anotherTab();
    const second = (await buildSources('demo', 'default', 'instant')).sources;
    expect(await second.place?.start()).toBe('elsewhere');
    // The demo's doors are fenced: a blocked place changes nothing.
    await expect(second.runs.start('all')).rejects.toMatchObject({ message: OPEN_ELSEWHERE_TEXT });
    await second.place?.useHere();
    expect(second.place?.state()).toBe('active');
    await expect(first.runs.start('all')).rejects.toMatchObject({ message: OPEN_ELSEWHERE_TEXT });
    expect(first.place?.state()).toBe('elsewhere');
    close(first, second);
  });

  it('signing out of the demo lets its lease go, so the next tab opens without asking', async () => {
    const first = (await buildSources('demo', 'default', 'instant')).sources;
    expect(await first.place?.start()).toBe('active');
    await first.session.signOut();
    expect(first.place?.state()).toBe('starting');
    anotherTab();
    const second = (await buildSources('demo', 'default', 'instant')).sources;
    expect(await second.place?.start()).toBe('active');
    close(first, second);
  });

  it('the fake keys its lease by source and scenario, and its Worker fences a blocked place', async () => {
    const a = (await buildSources('fake', 'default', 'instant')).sources;
    expect(a.place).toBeDefined();
    expect(await a.place?.start()).toBe('active');
    const b = (await buildSources('fake', 'empty', 'instant')).sources;
    expect(await b.place?.start()).toBe('active');
    const demo = (await buildSources('demo', 'default', 'instant')).sources;
    expect(await demo.place?.start()).toBe('active');
    const keys = leases();
    expect(keys).toHaveLength(3);
    expect(keys.map((k) => k.replace(/[0-9a-f]{16,}$/, 'PERSON'))).toEqual(['bower:lease:demo:PERSON', 'bower:lease:fake:default:PERSON', 'bower:lease:fake:empty:PERSON']);
    expect(keys.join(' ')).not.toContain('example.com');
    anotherTab();
    const c = (await buildSources('fake', 'default', 'instant')).sources;
    expect(await c.place?.start()).toBe('elsewhere');
    await expect(c.runs.start('all')).rejects.toMatchObject({ message: OPEN_ELSEWHERE_TEXT });
    close(a, b, c, demo);
  });

  it('the real source holds a place and sends its epoch', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A pretend Worker: nothing reaches a network.
    const asked: { path: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const path = new URL(String(url)).pathname;
      const method = init?.method ?? 'GET';
      asked.push({ path, method, headers: { ...(init?.headers as Record<string, string> | undefined) }, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === '/me') return Response.json({ user: { name: 'Alex', email: 'you@example.com' }, folderId: null });
      if (path === '/session') return Response.json({ active: true, epoch: 7 });
      if (path === '/vault') return Response.json({ folderId: 'FOLDER_ID', found: true });
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchFn);
    const { sources } = await buildSources('real', 'default', 'instant');
    expect(sources.place).toBeDefined();
    expect(await sources.place?.start()).toBe('active');
    const session = asked.find((a) => a.path === '/session');
    expect(session?.body).toEqual({ place: (sources.place as PlaceGuard).place, action: 'check', gen: 0 });
    await sources.session.createFolder(() => undefined).catch(() => undefined);
    const write = asked.find((a) => a.path === '/vault');
    expect(write?.headers).toMatchObject({ 'x-bower-place': (sources.place as PlaceGuard).place, 'x-bower-epoch': '7' });
    expect(leases()).toEqual([]);
    close(sources);
  });
});
