/**
 * Web push to the user's devices when a run finishes, with Web Crypto only
 * (no dependency):
 *
 * - RFC 8291 message encryption: ECDH P-256 with the subscriber's `p256dh`
 *   key, HKDF-SHA-256 with its `auth` secret, AES-128-GCM, sent as a single
 *   RFC 8188 `aes128gcm` record.
 * - RFC 8292 VAPID: an ES256 JWT (`aud` = the push service's origin, `sub`
 *   = `VAPID_SUBJECT`) signed with `VAPID_PRIVATE_KEY`.
 *
 * Key formats, as `gen-vapid` prints them: `VAPID_PUBLIC_KEY` is the
 * base64url raw uncompressed P-256 point (65 bytes), `VAPID_PRIVATE_KEY`
 * the base64url 32-byte private scalar. Both are checked at first use and a
 * bad value is a `config` error.
 *
 * Nothing here logs an endpoint, a key or the payload: failures are logged
 * by HTTP status only.
 */

import { base64UrlDecode, base64UrlEncode } from './crypto.js';
import type { Env } from './env.js';
import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';
import { deletePushSub, listPushSubs } from './store.js';
import type { PushSubscription } from './types.js';

/** What the service worker receives, as JSON, in the push message. */
export interface PushPayload {
  title: string;
  body: string;
  /** App path to open when the notification is clicked. */
  url: string;
}

/**
 * Sends `payload` to every push subscription of `userId`. Never throws: a
 * failed push must not fail the caller (the runner's status report).
 */
export type SendPush = (
  env: Env,
  userId: string,
  payload: PushPayload,
  fetchImpl?: FetchLike,
) => Promise<void>;

/** How long the push service keeps an undelivered message: one day. */
export const PUSH_TTL_SECONDS = 86400;

/** Lifetime of a VAPID JWT; RFC 8292 allows at most 24 h. */
export const VAPID_JWT_LIFETIME_SECONDS = 12 * 60 * 60;

/** RFC 8188 record size advertised in the header. */
const RECORD_SIZE = 4096;
/** salt (16) + record size (4) + key id length (1) + key id (65). */
export const AES128GCM_HEADER_BYTES = 86;
const TAG_BYTES = 16;
/**
 * Push services only promise 4096 bytes of body (RFC 8030 §7.2): the
 * header, the tag and the 0x02 padding delimiter come out of that.
 */
const MAX_PLAINTEXT_BYTES = 4096 - AES128GCM_HEADER_BYTES - TAG_BYTES - 1;

const P256_POINT_BYTES = 65;
const P256_SCALAR_BYTES = 32;
const AUTH_SECRET_BYTES = 16;

const encoder = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Decodes base64url, tolerating the `=` padding some browsers add. */
function decodeKey(value: string): Uint8Array | undefined {
  try {
    return base64UrlDecode(value.replace(/=+$/, ''));
  } catch {
    return undefined;
  }
}

/** Whether `bytes` is an uncompressed P-256 point: 65 bytes, 0x04 first. */
function isUncompressedPoint(
  bytes: Uint8Array | undefined,
): bytes is Uint8Array {
  return bytes?.length === P256_POINT_BYTES && bytes[0] === 0x04;
}

/**
 * A subscriber's `p256dh` key, decoded, or `undefined` when it is not an
 * uncompressed P-256 point.
 */
export function decodeP256dh(value: string): Uint8Array | undefined {
  const bytes = decodeKey(value);
  return isUncompressedPoint(bytes) ? bytes : undefined;
}

/** A subscriber's `auth` secret, decoded, or `undefined` unless 16 bytes. */
export function decodeAuthSecret(value: string): Uint8Array | undefined {
  const bytes = decodeKey(value);
  return bytes?.length === AUTH_SECRET_BYTES ? bytes : undefined;
}

function configError(message: string, cause?: unknown): HttpError {
  return new HttpError(
    500,
    'config',
    message,
    cause === undefined ? undefined : { cause },
  );
}

/**
 * `VAPID_PUBLIC_KEY`, decoded; a `config` error unless it is base64url of
 * an uncompressed P-256 point.
 */
export function parseVapidPublicKey(value: string): Uint8Array {
  const bytes = decodeKey(value);
  if (!isUncompressedPoint(bytes)) {
    throw configError(
      'invalid VAPID_PUBLIC_KEY: must be base64url of a 65-byte uncompressed P-256 point',
    );
  }
  return bytes;
}

/** The operator's VAPID key pair, ready to sign with. */
export interface VapidKeys {
  /** `VAPID_PUBLIC_KEY`, as sent in the `k=` parameter. */
  publicKey: string;
  signingKey: CryptoKey;
}

/**
 * Imports `VAPID_PRIVATE_KEY` as an ES256 signing key (a JWK needs `x` and
 * `y` too, taken from `VAPID_PUBLIC_KEY`). A `config` error names the
 * offending variable.
 */
export async function importVapidKeys(
  env: Pick<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY'>,
): Promise<VapidKeys> {
  const publicBytes = parseVapidPublicKey(env.VAPID_PUBLIC_KEY);
  const d = decodeKey(env.VAPID_PRIVATE_KEY);
  if (d?.length !== P256_SCALAR_BYTES) {
    throw configError(
      'invalid VAPID_PRIVATE_KEY: must be base64url of a 32-byte P-256 private key',
    );
  }
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicBytes.slice(1, 33)),
    y: base64UrlEncode(publicBytes.slice(33, 65)),
    d: base64UrlEncode(d),
  };
  try {
    const signingKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    return { publicKey: base64UrlEncode(publicBytes), signingKey };
  } catch (err) {
    throw configError(
      'invalid VAPID_PRIVATE_KEY: does not form a P-256 key pair with VAPID_PUBLIC_KEY',
      err,
    );
  }
}

/**
 * The RFC 8292 VAPID JWT for one push service: ES256, `aud` = the
 * endpoint's origin, `exp` = `now` + 12 h, `sub` = the operator's contact.
 */
export async function vapidJwt(
  audience: string,
  subject: string,
  signingKey: CryptoKey,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = base64UrlEncode(
    encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  );
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: nowSeconds + VAPID_JWT_LIFETIME_SECONDS,
        sub: subject,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  // Web Crypto's ECDSA signature is r || s, exactly what JWS ES256 wants.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

function isKeyPair(value: CryptoKey | CryptoKeyPair): value is CryptoKeyPair {
  return 'privateKey' in value && 'publicKey' in value;
}

/**
 * Encrypts `plaintext` for one subscriber per RFC 8291, as a single
 * `aes128gcm` record: header (salt, record size, the sender's ephemeral
 * public key) followed by the ciphertext of `plaintext || 0x02` and its tag.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  uaPublic: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new RangeError('push payload too large');
  }
  const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
  const generated = await crypto.subtle.generateKey(ecdh, false, [
    'deriveBits',
  ]);
  if (!isKeyPair(generated)) throw new TypeError('expected an ECDH key pair');
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', generated.publicKey)) as ArrayBuffer,
  );
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, ecdh, false, []);
  // Workers' types spell this member `$public`; the runtime reads `public`.
  const deriveParams = {
    name: 'ECDH',
    public: uaKey,
  } as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(deriveParams, generated.privateKey, 256),
  );

  // RFC 8291 §3.3–3.4.
  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    encoder.encode('Content-Encoding: aes128gcm\0'),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    encoder.encode('Content-Encoding: nonce\0'),
    12,
  );

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, [
    'encrypt',
  ]);
  // A single, last record: the 0x02 delimiter and no further padding.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      concat(plaintext, new Uint8Array([0x02])),
    ),
  );

  const header = new Uint8Array(AES128GCM_HEADER_BYTES);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = P256_POINT_BYTES;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

/**
 * The id a subscription is stored under: base64url(SHA-256(endpoint)),
 * cut to 32 characters. The same endpoint always maps to the same id.
 */
export async function subscriptionId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(endpoint),
  );
  return base64UrlEncode(new Uint8Array(digest)).slice(0, 32);
}

/** Sends to one subscription; logs failures by status only, never throws. */
async function sendOne(
  env: Env,
  userId: string,
  sub: PushSubscription,
  plaintext: Uint8Array,
  vapid: VapidKeys,
  jwtFor: (audience: string) => Promise<string>,
  fetchImpl: FetchLike,
): Promise<void> {
  try {
    const uaPublic = decodeP256dh(sub.keys.p256dh);
    const authSecret = decodeAuthSecret(sub.keys.auth);
    if (uaPublic === undefined || authSecret === undefined) {
      console.error('push: stored subscription has malformed keys; skipped');
      return;
    }
    const body = await encryptPayload(plaintext, uaPublic, authSecret);
    const jwt = await jwtFor(new URL(sub.endpoint).origin);
    const response = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: {
        TTL: String(PUSH_TTL_SECONDS),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
        Urgency: 'normal',
      },
      body,
    });
    if (response.status === 404 || response.status === 410) {
      // The browser dropped this subscription: prune it.
      await deletePushSub(env.BOWER_KV, userId, sub.id);
      return;
    }
    if (!response.ok) {
      console.error(`push: send failed with status ${response.status}`);
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : 'unknown';
    console.error(`push: send failed (${name})`);
  }
}

/**
 * Encrypts `payload` (as JSON) for every subscription of `userId` and POSTs
 * it with a VAPID `Authorization`. A 404 or 410 from the push service
 * deletes that subscription; any other failure is logged by status and the
 * subscription kept. Never throws.
 */
export const sendPush: SendPush = async (
  env,
  userId,
  payload,
  fetchImpl = (input, init) => fetch(input, init),
) => {
  try {
    const subs = await listPushSubs(env.BOWER_KV, userId);
    if (subs.length === 0) return;

    const vapid = await importVapidKeys(env);
    const plaintext = encoder.encode(JSON.stringify(payload));
    const jwts = new Map<string, Promise<string>>();
    const jwtFor = (audience: string): Promise<string> => {
      let jwt = jwts.get(audience);
      if (jwt === undefined) {
        jwt = vapidJwt(audience, env.VAPID_SUBJECT, vapid.signingKey);
        jwts.set(audience, jwt);
      }
      return jwt;
    };

    await Promise.all(
      subs.map((sub) =>
        sendOne(env, userId, sub, plaintext, vapid, jwtFor, fetchImpl),
      ),
    );
  } catch (err) {
    if (err instanceof HttpError) {
      console.error(`push: ${err.code}: ${err.message}`);
    } else {
      const name = err instanceof Error ? err.name : 'unknown';
      console.error(`push: failed (${name})`);
    }
  }
};
