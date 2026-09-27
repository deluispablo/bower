import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { requestIdFrom } from '../src/security.js';

interface HealthResponseBody {
  ok: boolean;
  version: string;
}

describe('GET /health', () => {
  it('reports ok and a version, echoing the given request id', async () => {
    const response = await SELF.fetch('http://example.com/health', {
      headers: { 'x-request-id': 'test-request-id' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('test-request-id');

    const body = await response.json<HealthResponseBody>();
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe('string');
  });

  it('generates a request id when the caller sends none', async () => {
    const response = await SELF.fetch('http://example.com/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('request id', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it('keeps a client id of 1 to 64 safe characters', () => {
    expect(requestIdFrom('abc.DEF_123-x')).toBe('abc.DEF_123-x');
    expect(requestIdFrom('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it('replaces a missing, empty, long or unsafe id with a UUID', () => {
    const bad = [undefined, '', 'a'.repeat(65), 'two words', 'a/b', '<b>'];
    for (const value of bad) {
      expect(requestIdFrom(value)).toMatch(UUID);
    }
  });

  it('never echoes an oversized header', async () => {
    const response = await SELF.fetch('http://example.com/health', {
      headers: { 'x-request-id': 'x'.repeat(5000) },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toMatch(UUID);
  });
});
