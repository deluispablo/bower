import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, ApiError } from '../src/api.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('resolves with the parsed body on a 2xx response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true, version: '1' }));
    vi.stubGlobal('fetch', fetchMock);

    const body = await apiFetch<{ ok: boolean; version: string }>('/health');

    expect(body).toEqual({ ok: true, version: '1' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>).Accept).toBe(
      'application/json',
    );
  });

  it('throws an ApiError built from the { error: { code, message } } shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, {
        error: { code: 'unauthorized', message: 'Sign in first.' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/health')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'unauthorized',
      message: 'Sign in first.',
    });
  });

  it('throws an ApiError with code "network" when the request itself fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/health')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'network',
    });
  });

  it('throws an ApiError with code "unexpected" when the response body is not JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('<html>not json</html>', { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/health')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'unexpected',
    });
  });

  it('is an instance of ApiError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(500, { error: { code: 'internal', message: 'Oops' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/health')).rejects.toBeInstanceOf(ApiError);
  });
});
