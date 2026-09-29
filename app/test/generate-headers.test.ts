import { describe, expect, it } from 'vitest';

import { apiUrlWarning, buildHeaders } from '../scripts/generate-headers.mjs';

const API_URL = 'https://api.example.com';
const API_ORIGIN = 'https://api.example.com';

/** The value of the named directive inside a `Content-Security-Policy` line. */
function directive(headers: string, name: string): string | undefined {
  const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1];
  return csp
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
}

describe('buildHeaders', () => {
  it('throws when VITE_API_URL is set but not a URL', () => {
    expect(() =>
      buildHeaders({ apiUrl: 'not-a-url', googleApiKey: undefined }),
    ).toThrow(/VITE_API_URL/);
  });

  it("does not throw when VITE_API_URL is unset, and falls back to connect-src 'self' alone (matching api.ts's own same-origin default)", () => {
    const headers = buildHeaders({
      apiUrl: undefined,
      googleApiKey: undefined,
    });

    expect(directive(headers, 'connect-src')).toBe(
      `connect-src 'self' https://www.googleapis.com`,
    );
  });

  it('treats an empty VITE_API_URL the same as unset', () => {
    const headers = buildHeaders({ apiUrl: '', googleApiKey: undefined });

    expect(directive(headers, 'connect-src')).toBe(
      `connect-src 'self' https://www.googleapis.com`,
    );
  });

  it('puts the real API origin in connect-src, no placeholder left behind', () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: undefined });

    expect(directive(headers, 'connect-src')).toBe(
      `connect-src 'self' ${API_ORIGIN} https://www.googleapis.com`,
    );
    expect(headers).not.toMatch(/VITE_API_URL|__API|\{\{|<API/);
  });

  it("admits only Drive's preview host in frame-src, and keeps the Picker origin out of script-src, without an API key", () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: undefined });

    expect(directive(headers, 'script-src')).toBe(`script-src 'self'`);
    expect(directive(headers, 'frame-src')).toBe(
      `frame-src https://drive.google.com`,
    );
  });

  it('adds apis.google.com to script-src, and both the loader and the Picker dialog to frame-src, when a Picker key is set', () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: 'a-key' });

    expect(directive(headers, 'script-src')).toBe(
      `script-src 'self' https://apis.google.com`,
    );
    expect(directive(headers, 'frame-src')).toBe(
      `frame-src https://drive.google.com https://apis.google.com https://docs.google.com`,
    );
  });

  it("admits Google's image host in img-src, for Drive thumbnails, and nothing else remote", () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: 'a-key' });

    expect(directive(headers, 'img-src')).toBe(
      `img-src 'self' data: blob: https://*.googleusercontent.com`,
    );
  });

  it('never allows unsafe-inline for scripts', () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: 'a-key' });

    expect(directive(headers, 'script-src')).not.toMatch(/unsafe-inline/);
  });

  it('locks down frame-ancestors, object-src, base-uri and form-action', () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: undefined });

    expect(directive(headers, 'frame-ancestors')).toBe(
      `frame-ancestors 'none'`,
    );
    expect(directive(headers, 'object-src')).toBe(`object-src 'none'`);
    expect(directive(headers, 'base-uri')).toBe(`base-uri 'self'`);
    expect(directive(headers, 'form-action')).toBe(`form-action 'self'`);
  });

  it('sets HSTS, X-Frame-Options, Permissions-Policy and Referrer-Policy on /*', () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: undefined });
    const lines = headers.split('\n').map((line) => line.trim());

    expect(lines[0]).toBe('/*');
    expect(lines).toContain(
      'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
    );
    expect(lines).toContain('X-Frame-Options: DENY');
    expect(lines).toContain(
      'Permissions-Policy: camera=(), microphone=(), geolocation=()',
    );
    expect(lines).toContain('Referrer-Policy: strict-origin-when-cross-origin');
  });

  it('removes the default Access-Control-Allow-Origin header that Cloudflare Pages sets', () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: undefined });
    const lines = headers.split('\n').map((line) => line.trim());

    expect(lines).toContain('! Access-Control-Allow-Origin');
  });
});

describe('apiUrlWarning', () => {
  it('warns once when VITE_API_URL is unset or empty', () => {
    expect(apiUrlWarning(undefined)).toMatch(/VITE_API_URL/);
    expect(apiUrlWarning('')).toMatch(/VITE_API_URL/);
  });

  it('has nothing to warn about once VITE_API_URL is set', () => {
    expect(apiUrlWarning(API_URL)).toBeNull();
    // A value that isn't a URL is `buildHeaders`'s job to reject, not a warning.
    expect(apiUrlWarning('not-a-url')).toBeNull();
  });
});
