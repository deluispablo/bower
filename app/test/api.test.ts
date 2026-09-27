import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  apiFetch,
  ApiError,
  createVault,
  deleteAccount,
  getMe,
  getPushPublicKey,
  getStatus,
  isNotInvited,
  loginUrl,
  logout,
  selectVault,
  subscribePush,
  unsubscribePush,
  updateSettings,
} from '../src/api.js';

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

  it('carries retryAfter from a 429 quota body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(429, {
        error: { code: 'quota', message: 'Daily limit reached' },
        retryAfter: 12345,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiFetch('/process', { method: 'POST' }),
    ).rejects.toMatchObject({ code: 'quota', retryAfter: 12345 });
  });

  it('leaves retryAfter undefined when the body has none', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        error: { code: 'no_vault', message: 'No folder yet' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiFetch('/process', { method: 'POST' }),
    ).rejects.toMatchObject({ code: 'no_vault', retryAfter: undefined });
  });
});

describe('getStatus', () => {
  it('parses { run, stale }', async () => {
    const run = {
      state: 'running' as const,
      requestedAt: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:05.000Z',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { run, stale: false }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStatus()).resolves.toEqual({ run, stale: false });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/status$/);
  });

  it('parses a null run', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { run: null, stale: false }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStatus()).resolves.toEqual({ run: null, stale: false });
  });

  it('rejects with the unauthenticated ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, {
        error: { code: 'unauthenticated', message: 'Not signed in' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStatus()).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
  });
});

describe('getMe', () => {
  it('parses the { email, vault, quota, needsReauth, hasApiKey } shape', async () => {
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
        hasApiKey: true,
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
      hasApiKey: true,
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/me$/);
  });

  it('recognises the one-time { notInvited, email } answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { notInvited: true, email: 'you@example.com' }),
        ),
    );

    const me = await getMe();

    expect(isNotInvited(me)).toBe(true);
    expect(me).toEqual({ notInvited: true, email: 'you@example.com' });
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

describe('createVault', () => {
  it('sends { mode: "create" } and returns the parsed vault', async () => {
    const vault = {
      folderId: 'FOLDER_ID',
      inboxFolderId: 'INBOX_FOLDER_ID',
      name: 'Bower',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { vault }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createVault()).resolves.toEqual(vault);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/vault$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(JSON.parse(init.body as string)).toEqual({ mode: 'create' });
  });

  it('rejects with the folder_exists ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        error: { code: 'folder_exists', message: 'Already there' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createVault()).rejects.toMatchObject({
      status: 409,
      code: 'folder_exists',
    });
  });
});

describe('selectVault', () => {
  it('sends { mode: "select", folderId } and returns the parsed vault', async () => {
    const vault = {
      folderId: 'FOLDER_ID',
      inboxFolderId: 'INBOX_FOLDER_ID',
      name: 'Notes',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { vault }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(selectVault('FOLDER_ID')).resolves.toEqual(vault);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/vault$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      mode: 'select',
      folderId: 'FOLDER_ID',
    });
  });

  it('rejects with the bad_request ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: { code: 'bad_request', message: 'Folder not found' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(selectVault('FOLDER_ID')).rejects.toMatchObject({
      status: 400,
      code: 'bad_request',
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

describe('updateSettings', () => {
  it('sends the JSON body and parses { hasApiKey }', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { hasApiKey: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateSettings({ apiKey: 'sk-ant-test' });

    expect(result).toEqual({ hasApiKey: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/settings$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      apiKey: 'sk-ant-test',
    });
  });

  it('sends apiKey: null to clear a saved key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { hasApiKey: false }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateSettings({ apiKey: null });

    expect(result).toEqual({ hasApiKey: false });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ apiKey: null });
  });

  it('sends tourSeenAt alone, without an apiKey', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { hasApiKey: false }));
    vi.stubGlobal('fetch', fetchMock);

    await updateSettings({ tourSeenAt: '2026-09-27T10:00:00.000Z' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      tourSeenAt: '2026-09-27T10:00:00.000Z',
    });
  });
});

describe('deleteAccount', () => {
  it('resolves without throwing on a 204 response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteAccount()).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/me$/);
    expect(init.method).toBe('DELETE');
  });

  it('throws an ApiError on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, {
        error: { code: 'unauthenticated', message: 'Not signed in' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteAccount()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    });
  });
});

describe('getPushPublicKey', () => {
  it('parses { publicKey }', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { publicKey: 'PUBLIC_KEY' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPushPublicKey()).resolves.toEqual({
      publicKey: 'PUBLIC_KEY',
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/push\/public-key$/);
  });

  it('rejects with the config ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(500, {
        error: { code: 'config', message: 'Push is not configured' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPushPublicKey()).rejects.toMatchObject({
      status: 500,
      code: 'config',
    });
  });
});

describe('subscribePush', () => {
  it('sends { subscription: { endpoint, keys } } and resolves on 204', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const subscription: PushSubscriptionJSON = {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'P256DH_KEY', auth: 'AUTH_SECRET' },
    };

    await expect(subscribePush(subscription)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/push\/subscribe$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      subscription: {
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'P256DH_KEY', auth: 'AUTH_SECRET' },
      },
    });
  });

  it('ignores extra fields such as expirationTime', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await subscribePush({
      endpoint: 'https://push.example/abc',
      expirationTime: null,
      keys: { p256dh: 'P256DH_KEY', auth: 'AUTH_SECRET' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      subscription: {
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'P256DH_KEY', auth: 'AUTH_SECRET' },
      },
    });
  });

  it('throws without calling fetch when endpoint or keys are missing', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() => subscribePush({})).toThrow('Incomplete push subscription.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects with the bad_request ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: { code: 'bad_request', message: 'Bad endpoint' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      subscribePush({
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'P256DH_KEY', auth: 'AUTH_SECRET' },
      }),
    ).rejects.toMatchObject({ status: 400, code: 'bad_request' });
  });
});

describe('unsubscribePush', () => {
  it('sends { endpoint } and resolves on 204', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      unsubscribePush('https://push.example/abc'),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/push\/subscribe$/);
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body as string)).toEqual({
      endpoint: 'https://push.example/abc',
    });
  });

  it('rejects with the bad_request ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: { code: 'bad_request', message: 'Missing endpoint' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(unsubscribePush('')).rejects.toMatchObject({
      status: 400,
      code: 'bad_request',
    });
  });
});

describe('isNotInvited', () => {
  it('is false for a signed-in user', () => {
    expect(
      isNotInvited({
        email: 'you@example.com',
        vault: null,
        quota: { used: 0, limit: 5 },
        needsReauth: false,
        hasApiKey: false,
      }),
    ).toBe(false);
  });
});

describe('loginUrl', () => {
  it('asks for the account picker only when told to', () => {
    expect(loginUrl()).toMatch(/\/auth\/login$/);
    expect(loginUrl({ selectAccount: true })).toMatch(
      /\/auth\/login\?prompt=select_account$/,
    );
  });
});
