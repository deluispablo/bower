import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, ApiError, getMe, logout } from '../src/api.js';

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

describe('getMe', () => {
  it('parses the { email, vault, quota, needsReauth } shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        email: 'you@example.com',
        vault: {
          folderId: 'FOLDER_ID',
          inboxFolderId: 'INBOX_FOLDER_ID',
          name: 'Notes',
        },
        quota: { used: 1, limit: 5 },
        needsReauth: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const me = await getMe();

    expect(me).toEqual({
      email: 'you@example.com',
      vault: {
        folderId: 'FOLDER_ID',
        inboxFolderId: 'INBOX_FOLDER_ID',
        name: 'Notes',
      },
      quota: { used: 1, limit: 5 },
      needsReauth: false,
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/me$/);
  });

  it('throws an ApiError with status 401 when signed out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, {
        error: { code: 'unauthenticated', message: 'Not signed in' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMe()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'unauthenticated',
    });
  });
});

describe('logout', () => {
  it('resolves without throwing on a 204 response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(logout()).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/logout$/);
    expect(init.method).toBe('POST');
  });
});
