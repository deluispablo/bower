import { describe, expect, it } from 'vitest';

import { buildHeaders } from '../scripts/generate-headers.mjs';

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
  it('throws instead of writing a placeholder when VITE_API_URL is missing', () => {
    expect(() =>
      buildHeaders({ apiUrl: undefined, googleApiKey: undefined }),
    ).toThrow(/VITE_API_URL/);
  });

  it('throws when VITE_API_URL is not a URL', () => {
    expect(() =>
      buildHeaders({ apiUrl: 'not-a-url', googleApiKey: undefined }),
    ).toThrow(/VITE_API_URL/);
  });

  it('puts the real API origin in connect-src, no placeholder left behind', () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: undefined });

    expect(directive(headers, 'connect-src')).toBe(
      `connect-src 'self' ${API_ORIGIN} https://www.googleapis.com`,
    );
    expect(headers).not.toMatch(/VITE_API_URL|__API|\{\{|<API/);
  });

  it('keeps the Picker origin out of script-src and frame-src without an API key', () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: undefined });

    expect(directive(headers, 'script-src')).toBe(`script-src 'self'`);
    expect(directive(headers, 'frame-src')).toBeUndefined();
  });

  it('adds apis.google.com to script-src and frame-src when a Picker key is set', () => {
    const headers = buildHeaders({ apiUrl: API_URL, googleApiKey: 'a-key' });

    expect(directive(headers, 'script-src')).toBe(
      `script-src 'self' https://apis.google.com`,
    );
    expect(directive(headers, 'frame-src')).toBe(
      `frame-src https://apis.google.com`,
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
    expect(lines).toContain('Referrer-Policy: no-referrer');
  });
});
