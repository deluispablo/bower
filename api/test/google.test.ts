import { SignJWT, UnsecuredJWT, createLocalJWKSet, createRemoteJWKSet, customFetch, exportJWK, generateKeyPair } from 'jose';
import type { JWK, JWTVerifyGetKey } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { HttpError } from '../src/errors.js';
import { GOOGLE_JWKS_URL, verifyIdToken } from '../src/google.js';

const CLIENT = 'test-client';
const NONCE = 'test-nonce';
const ISSUER = 'https://accounts.google.com';
const ADDRESS = 'private.person@example.com';
const SUB = 'sub-secret-1234567890';

let signingKey: CryptoKey;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  signingKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'RS256', use: 'sig' };
  keys = createLocalJWKSet({ keys: [jwk] });
});

const claims = { email: ADDRESS, email_verified: true, nonce: NONCE };

function rs256(options: { aud?: string; expiresAt?: number; issuedAt?: number } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k' })
    .setSubject(SUB)
    .setIssuer(ISSUER)
    .setAudience(options.aud ?? CLIENT)
    .setIssuedAt(options.issuedAt ?? now)
    .setExpirationTime(options.expiresAt ?? now + 3600)
    .sign(signingKey);
}

async function refusal(token: string, k: JWTVerifyGetKey = keys): Promise<HttpError> {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await verifyIdToken(token, { clientId: CLIENT, nonce: NONCE, keys: k });
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    return err as HttpError;
  } finally {
    log.mockRestore();
  }
  throw new Error('the token was accepted');
}

/** Every message, stack and cause the error would put in the log. */
function everything(err: unknown): string {
  const seen = new Set<unknown>();
  const walk = (value: unknown): string => {
    if (typeof value !== 'object' || value === null) return String(value);
    if (seen.has(value)) return '';
    seen.add(value);
    const parts: string[] = [];
    if (value instanceof Error) parts.push(value.message, value.stack ?? '');
    for (const key of Object.getOwnPropertyNames(value)) parts.push(walk((value as Record<string, unknown>)[key]));
    return parts.join(' ');
  };
  return walk(err);
}

describe('ID token validation', () => {
  it('a good token gives the identity', async () => {
    const identity = await verifyIdToken(await rs256(), { clientId: CLIENT, nonce: NONCE, keys });
    expect(identity.sub).toBe(SUB);
  });

  it('refuses an expired ID token', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const err = await refusal(await rs256({ issuedAt: past - 60, expiresAt: past }));
    expect(err.code).toBe('signed-out');
  });

  it('refuses an HS256 token and an unsecured one', async () => {
    const now = Math.floor(Date.now() / 1000);
    const hs256 = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', kid: 'k' })
      .setSubject(SUB).setIssuer(ISSUER).setAudience(CLIENT).setIssuedAt(now).setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode('a-shared-secret-of-sufficient-length'));
    expect((await refusal(hs256)).code).toBe('signed-out');
    const none = new UnsecuredJWT(claims)
      .setSubject(SUB).setIssuer(ISSUER).setAudience(CLIENT).setIssuedAt(now).setExpirationTime(now + 3600)
      .encode();
    expect((await refusal(none)).code).toBe('signed-out');
  });

  it('logs only the error code when a token is refused, never the address or sub', async () => {
    const err = await refusal(await rs256({ aud: 'another-client' }));
    expect(err.code).toBe('signed-out');
    const text = everything(err);
    expect(text).toContain('ERR_JWT_CLAIM_VALIDATION_FAILED');
    expect(text).not.toContain(ADDRESS);
    expect(text).not.toContain('private.person');
    expect(text).not.toContain(SUB);
  });

  it('answers internal, not signed-out, when Google signing keys cannot be read', async () => {
    const unreachable = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
      [customFetch]: async () => {
        throw new Error('keys-unreachable');
      },
    });
    const err = await refusal(await rs256(), unreachable);
    expect(err.code).toBe('internal');
    expect(err.status).toBe(500);
    expect(everything(err)).toMatch(/outage/i);
  });

  it('answers internal when the key endpoint answers an error status', async () => {
    const down = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
      [customFetch]: async () => new Response('unavailable', { status: 503 }),
    });
    const err = await refusal(await rs256(), down);
    expect(err.code).toBe('internal');
  });
});
