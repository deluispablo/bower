import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

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
