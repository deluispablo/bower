// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from '../src/api.js';
import { driveFetch, getToken, invalidateToken } from '../src/drive.js';
import {
  SESSION_CHANNEL,
  SIGNED_OUT_KEY,
  announceSignOut,
  isSignedOutMessage,
  listenForSignOut,
  markSessionChecked,
  onUnauthorized,
  recheckSession,
  sessionCheckDue,
  watchVisibility,
} from '../src/session-guard.js';

/**
 * A stand-in for `BroadcastChannel` that, like the real one, delivers a
 * message to every other open channel object of the same name.
 */
class FakeChannel extends EventTarget {
  static open: FakeChannel[] = [];
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
    FakeChannel.open.push(this);
  }

  postMessage(data: unknown): void {
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) {
        other.dispatchEvent(new MessageEvent('message', { data }));
      }
    }
  }

  close(): void {
    FakeChannel.open = FakeChannel.open.filter((c) => c !== this);
  }
}

beforeEach(() => {
  FakeChannel.open = [];
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  onUnauthorized(null);
  invalidateToken();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('isSignedOutMessage', () => {
  it('accepts only the sign-out message', () => {
    expect(isSignedOutMessage({ type: 'signed-out' })).toBe(true);
    expect(isSignedOutMessage({ type: 'other' })).toBe(false);
    expect(isSignedOutMessage('signed-out')).toBe(false);
    expect(isSignedOutMessage(null)).toBe(false);
  });
});

describe('the sign-out message (AC1)', () => {
  it('reaches a listening tab over the channel', () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    const onSignedOut = vi.fn();
    const stop = listenForSignOut(onSignedOut);
    announceSignOut();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(FakeChannel.open.map((c) => c.name)).toEqual([SESSION_CHANNEL]);
    stop();
    expect(FakeChannel.open).toEqual([]);
  });

  it('ignores other messages on the channel', () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    const onSignedOut = vi.fn();
    const stop = listenForSignOut(onSignedOut);
    new FakeChannel(SESSION_CHANNEL).postMessage({ type: 'hello' });
    expect(onSignedOut).not.toHaveBeenCalled();
    stop();
  });

  it('falls back to the storage event without a channel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const target = new EventTarget();
    const onSignedOut = vi.fn();
    const stop = listenForSignOut(onSignedOut, target);
    target.dispatchEvent(
      new StorageEvent('storage', { key: 'other', newValue: '1' }),
    );
    target.dispatchEvent(
      new StorageEvent('storage', { key: SIGNED_OUT_KEY, newValue: null }),
    );
    expect(onSignedOut).not.toHaveBeenCalled();
    target.dispatchEvent(
      new StorageEvent('storage', { key: SIGNED_OUT_KEY, newValue: '1' }),
    );
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    stop();
    target.dispatchEvent(
      new StorageEvent('storage', { key: SIGNED_OUT_KEY, newValue: '2' }),
    );
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing in localStorage after announcing', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    announceSignOut();
    expect(setItem).toHaveBeenCalledWith(SIGNED_OUT_KEY, expect.any(String));
    expect(localStorage.getItem(SIGNED_OUT_KEY)).toBeNull();
  });
});

describe('a 401 (AC2)', () => {
  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  const unauthorized = { error: { code: 'unauthenticated', message: 'x' } };

  it('from the Worker is reported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, unauthorized)),
    );
    const handler = vi.fn();
    onUnauthorized(handler);
    await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('from the Worker is not reported for other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(500, { error: { code: 'boom', message: 'x' } }),
        ),
    );
    const handler = vi.fn();
    onUnauthorized(handler);
    await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('from Drive, with the session gone, drops the token and is reported', async () => {
    let sessionAlive = true;
    const fetchMock = vi.fn((input: string) => {
      if (input.includes('/drive/token')) {
        return Promise.resolve(
          sessionAlive
            ? jsonResponse(200, {
                accessToken: 'token-1',
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              })
            : jsonResponse(401, unauthorized),
        );
      }
      return Promise.resolve(
        sessionAlive
          ? jsonResponse(200, { id: 'FILE_ID' })
          : jsonResponse(401, { error: { message: 'x' } }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = vi.fn(() => {
      invalidateToken();
    });
    onUnauthorized(handler);

    await driveFetch('/drive/v3/files/FILE_ID');
    expect((await getToken()).accessToken).toBe('token-1');

    sessionAlive = false;
    await expect(driveFetch('/drive/v3/files/FILE_ID')).rejects.toMatchObject({
      status: 401,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    // The next read asks the Worker again instead of using a token.
    const before = fetchMock.mock.calls.length;
    await expect(getToken()).rejects.toMatchObject({ status: 401 });
    expect(String(fetchMock.mock.calls[before]?.[0])).toContain('/drive/token');
  });
});

describe('the session check (AC3)', () => {
  it('runs only when the last one is older than a minute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    markSessionChecked();
    const askMe = vi.fn(() => Promise.resolve({}));

    vi.advanceTimersByTime(30_000);
    expect(sessionCheckDue()).toBe(false);
    await recheckSession(askMe);
    expect(askMe).not.toHaveBeenCalled();

    vi.advanceTimersByTime(31_000);
    expect(sessionCheckDue()).toBe(true);
    await recheckSession(askMe);
    expect(askMe).toHaveBeenCalledTimes(1);
    // Just checked: not again right away.
    await recheckSession(askMe);
    expect(askMe).toHaveBeenCalledTimes(1);
  });

  it('re-checks when the tab comes back after more than a minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    markSessionChecked();
    const askMe = vi.fn(() => Promise.resolve({}));
    const visibility: { visibilityState: DocumentVisibilityState } = {
      visibilityState: 'visible',
    };
    const doc = Object.assign(new EventTarget(), visibility);
    const stop = watchVisibility(doc, () => {
      void recheckSession(askMe);
    });

    vi.advanceTimersByTime(20_000);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(askMe).not.toHaveBeenCalled();

    doc.visibilityState = 'hidden';
    vi.advanceTimersByTime(61_000);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(askMe).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(askMe).toHaveBeenCalledTimes(1);
    stop();
  });

  it('rejects on a 401 and carries on after any other failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    markSessionChecked(0);
    await expect(
      recheckSession(() =>
        Promise.reject(new ApiError(401, 'unauthenticated', 'x')),
      ),
    ).rejects.toMatchObject({ status: 401 });

    vi.advanceTimersByTime(61_000);
    await expect(
      recheckSession(() => Promise.reject(new ApiError(0, 'network', 'x'))),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
