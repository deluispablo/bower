import { describe, expect, it } from 'vitest';

import {
  base64UrlDecode,
  base64UrlEncode,
  base64UrlEncodeString,
} from '../src/crypto.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  SessionError,
  clearSessionCookie,
  readSessionCookie,
  sessionCookie,
  signSession,
  signToken,
  verifySession,
} from '../src/session.js';
import type { SessionErrorCode } from '../src/session.js';

const SECRET = 'test-session-secret-not-a-real-one';
const OTHER_SECRET = 'another-test-session-secret';
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** Resolves to the `SessionError` code the promise rejects with. */
async function sessionErrorCode(
  promise: Promise<unknown>,
): Promise<SessionErrorCode> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof SessionError) return err.code;
    throw err;
  }
  throw new Error('Expected a SessionError, but the promise resolved');
}

function splitToken(token: string): [string, string, string] {
  const parts = token.split('.');
  expect(parts).toHaveLength(3);
  return parts as [string, string, string];
}

function decodeJson(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as unknown;
}

function encodeJson(value: unknown): string {
  return base64UrlEncodeString(JSON.stringify(value));
}

describe('signSession / verifySession', () => {
  it('round-trips the userId with a 30-day expiry', async () => {
    const token = await signSession({ userId: 'user-123' }, SECRET, NOW);
    const session = await verifySession(token, SECRET, NOW);
    expect(session.userId).toBe('user-123');
    expect(session.exp).toBe(NOW / 1000 + 30 * 24 * 60 * 60);
    expect(SESSION_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it('defaults to the current time', async () => {
    const token = await signSession({ userId: 'user-123' }, SECRET);
    const { exp } = await verifySession(token, SECRET);
    const expected = Date.now() / 1000 + SESSION_TTL_SECONDS;
    expect(Math.abs(exp - expected)).toBeLessThan(5);
  });

  it('emits a compact HS256 JWS with iat and exp', async () => {
    const [header, payload] = splitToken(
      await signSession({ userId: 'user-123' }, SECRET, NOW),
    );
    expect(decodeJson(header)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decodeJson(payload)).toEqual({
      userId: 'user-123',
      gen: 0,
      sid: expect.any(String) as unknown,
      iat: NOW / 1000,
      exp: NOW / 1000 + SESSION_TTL_SECONDS,
    });
  });

  it('issues a new session id every time, even within the same second', async () => {
    const first = await signSession({ userId: 'user-123' }, SECRET, NOW);
    const second = await signSession({ userId: 'user-123' }, SECRET, NOW);
    expect(first).not.toBe(second);
  });

  it('round-trips the generation and iat; a token without gen reads as 0', async () => {
    const token = await signSession(
      { userId: 'user-123', gen: 4 },
      SECRET,
      NOW,
    );
    expect(await verifySession(token, SECRET, NOW)).toEqual({
      userId: 'user-123',
      gen: 4,
      iat: NOW / 1000,
      exp: NOW / 1000 + SESSION_TTL_SECONDS,
    });

    const legacy = await signToken(
      { userId: 'user-123' },
      SECRET,
      SESSION_TTL_SECONDS,
      NOW,
    );
    expect((await verifySession(legacy, SECRET, NOW)).gen).toBe(0);
  });

  it('rejects a session older than 30 days even when exp is later', async () => {
    const longLived = await signToken(
      { userId: 'user-123', gen: 0 },
      SECRET,
      SESSION_TTL_SECONDS * 2,
      NOW,
    );
    const lifetimeEnd = NOW + SESSION_TTL_SECONDS * 1000;
    expect(
      await sessionErrorCode(verifySession(longLived, SECRET, lifetimeEnd)),
    ).toBe('expired');
    await expect(
      verifySession(longLived, SECRET, lifetimeEnd - 1000),
    ).resolves.toMatchObject({ userId: 'user-123' });
  });

  it('rejects an altered payload', async () => {
    const [header, , signature] = splitToken(
      await signSession({ userId: 'user-123' }, SECRET, NOW),
    );
    const forged = encodeJson({
      userId: 'user-456',
      iat: NOW / 1000,
      exp: NOW / 1000 + 60,
    });
    expect(
      await sessionErrorCode(
        verifySession(`${header}.${forged}.${signature}`, SECRET, NOW),
      ),
    ).toBe('bad_signature');
  });

  it('rejects an altered signature', async () => {
    const [header, payload, signature] = splitToken(
      await signSession({ userId: 'user-123' }, SECRET, NOW),
    );
    const bytes = base64UrlDecode(signature);
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    const altered = `${header}.${payload}.${base64UrlEncode(bytes)}`;
    expect(await sessionErrorCode(verifySession(altered, SECRET, NOW))).toBe(
      'bad_signature',
    );
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signSession({ userId: 'user-123' }, OTHER_SECRET, NOW);
    expect(await sessionErrorCode(verifySession(token, SECRET, NOW))).toBe(
      'bad_signature',
    );
  });

  it('rejects an expired token, including exactly at exp', async () => {
    const token = await signSession({ userId: 'user-123' }, SECRET, NOW);
    const expiry = NOW + SESSION_TTL_SECONDS * 1000;
    expect(await sessionErrorCode(verifySession(token, SECRET, expiry))).toBe(
      'expired',
    );
    expect(
      await sessionErrorCode(verifySession(token, SECRET, expiry + 1000)),
    ).toBe('expired');
    await expect(
      verifySession(token, SECRET, expiry - 1000),
    ).resolves.toMatchObject({
      userId: 'user-123',
    });
  });

  it('rejects alg "none" and any algorithm other than HS256', async () => {
    const [, payload, signature] = splitToken(
      await signSession({ userId: 'user-123' }, SECRET, NOW),
    );
    const none = encodeJson({ alg: 'none', typ: 'JWT' });
    const hs512 = encodeJson({ alg: 'HS512', typ: 'JWT' });

    expect(
      await sessionErrorCode(verifySession(`${none}.${payload}.`, SECRET, NOW)),
    ).toBe('malformed');
    expect(
      await sessionErrorCode(
        verifySession(`${none}.${payload}.${signature}`, SECRET, NOW),
      ),
    ).toBe('unsupported_alg');
    expect(
      await sessionErrorCode(
        verifySession(`${hs512}.${payload}.${signature}`, SECRET, NOW),
      ),
    ).toBe('unsupported_alg');
  });

  it('rejects correctly signed tokens with a missing or invalid userId, iat, gen or exp', async () => {
    const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    async function signed(claims: unknown): Promise<string> {
      const input = `${header}.${encodeJson(claims)}`;
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(input),
      );
      return `${input}.${base64UrlEncode(new Uint8Array(signature))}`;
    }
    const exp = NOW / 1000 + 60;
    const iat = NOW / 1000;

    for (const claims of [
      { exp },
      { userId: 'user-123', exp },
      { userId: 'user-123', iat: '1', exp },
      { userId: 'user-123', iat, exp, gen: -1 },
      { userId: 'user-123', iat, exp, gen: 1.5 },
      { userId: 'user-123', iat, exp, gen: '1' },
      { userId: '', exp },
      { userId: 42, exp },
      { userId: 'user-123' },
      { userId: 'user-123', exp: '9999999999' },
      ['user-123'],
    ]) {
      expect(
        await sessionErrorCode(
          verifySession(await signed(claims), SECRET, NOW),
        ),
      ).toBe('malformed');
    }
  });

  it('rejects malformed tokens', async () => {
    const token = await signSession({ userId: 'user-123' }, SECRET, NOW);
    const [header, payload, signature] = splitToken(token);

    for (const malformed of [
      '',
      'not-a-token',
      `${header}.${payload}`,
      `${token}.extra`,
      `${header}..${signature}`,
      `${header}.${payload}.${signature}=`,
      `${base64UrlEncodeString('not json')}.${payload}.${signature}`,
      `${encodeJson('HS256')}.${payload}.${signature}`,
    ]) {
      expect(
        await sessionErrorCode(verifySession(malformed, SECRET, NOW)),
        malformed,
      ).toBe('malformed');
    }
  });
});

describe('session cookie helpers', () => {
  it('sets the cookie with the required attributes', () => {
    const cookie = sessionCookie(
      'header.payload.signature',
      SESSION_TTL_SECONDS,
    );
    expect(
      cookie.startsWith(`${SESSION_COOKIE}=header.payload.signature;`),
    ).toBe(true);
    const attributes = cookie.split('; ').slice(1);
    expect(attributes).toEqual([
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${SESSION_TTL_SECONDS}`,
    ]);
  });

  it('rejects an invalid Max-Age', () => {
    expect(() => sessionCookie('token', -1)).toThrow(RangeError);
    expect(() => sessionCookie('token', 1.5)).toThrow(RangeError);
  });

  it('clears the cookie with Max-Age=0 and the same attributes', () => {
    expect(clearSessionCookie()).toBe(
      `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    );
  });

  it('reads the session cookie among others', () => {
    expect(SESSION_COOKIE).toBe('bower_session');
    expect(readSessionCookie('bower_session=abc.def.ghi')).toBe('abc.def.ghi');
    expect(
      readSessionCookie('theme=dark; bower_session=abc.def.ghi; lang=en'),
    ).toBe('abc.def.ghi');
    expect(readSessionCookie('theme=dark;bower_session=abc.def.ghi')).toBe(
      'abc.def.ghi',
    );
  });

  it('returns undefined when the session cookie is absent or empty', () => {
    expect(readSessionCookie(undefined)).toBeUndefined();
    expect(readSessionCookie('')).toBeUndefined();
    expect(readSessionCookie('theme=dark; lang=en')).toBeUndefined();
    expect(
      readSessionCookie('xbower_session=abc; bower_session_old=def'),
    ).toBeUndefined();
    expect(readSessionCookie('bower_session=')).toBeUndefined();
  });
});
