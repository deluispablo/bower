import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSource } from './choose';

const at = (hostname: string, search = ''): void => {
  vi.stubGlobal('location', { hostname, search, origin: `https://${hostname}`, href: `https://${hostname}/${search}` });
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('a deployed Bower opens the real folder', () => {
  it.each(['localhost', '127.0.0.1', '[::1]', 'foo.localhost'])('%s stays the demo', (host) => {
    vi.stubEnv('VITE_API_URL', '');
    at(host);
    expect(readSource()).toBe('demo');
  });

  it.each(['app.example.com', 'localhost.example.com', 'mylocalhost.com'])('%s is real with no query (the installed app starts at /)', (host) => {
    vi.stubEnv('VITE_API_URL', '');
    at(host);
    expect(readSource()).toBe('real');
  });

  it('?source=demo still opens the demo on a deployed host', () => {
    vi.stubEnv('VITE_API_URL', '');
    at('app.example.com', '?source=demo');
    expect(readSource()).toBe('demo');
  });

  it('an unknown source on a deployed host is the demo', () => {
    vi.stubEnv('VITE_API_URL', '');
    at('app.example.com', '?source=x');
    expect(readSource()).toBe('demo');
  });

  it('a value kept for the tab wins over the host', () => {
    vi.stubEnv('VITE_API_URL', '');
    sessionStorage.setItem('bower:demo:source', 'demo');
    at('app.example.com');
    expect(readSource()).toBe('demo');
  });

  it('with storage blocked, the host decides', () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    at('app.example.com');
    expect(readSource()).toBe('real');
    at('localhost');
    expect(readSource()).toBe('demo');
  });
});
