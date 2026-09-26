import { env as testEnv } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { base64UrlDecode, base64UrlEncode } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import {
  AES128GCM_HEADER_BYTES,
  PUSH_TTL_SECONDS,
  sendPush,
  subscriptionId,
} from '../src/push.js';
import type { PushPayload } from '../src/push.js';
import { runPushPayload } from '../src/runner.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { listPushSubs, putPushSub, putUser } from '../src/store.js';
import type { PushSubscription } from '../src/types.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types`), so the
 * bindings from `wrangler.toml` and `vitest.config.ts` are asserted once.
 * Their VAPID keys are placeholders; tests that send generate a real pair.
 */
const baseEnv = testEnv as unknown as Env;
const kv = baseEnv.BOWER_KV;

const API = 'https://api.example.com';
const PAYLOAD: PushPayload = {
  title: 'Bower',
  body: '2 files processed',
  url: '/',
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function isKeyPair(value: CryptoKey | CryptoKeyPair): value is CryptoKeyPair {
  return 'privateKey' in value;
}

async function generatePair(
  algorithm: { name: string; namedCurve: string },
  usages: string[],
): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey(algorithm, true, usages);
  if (!isKeyPair(pair)) throw new Error('expected a key pair');
  return pair;
}

async function rawPublic(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(
    (await crypto.subtle.exportKey('raw', key)) as ArrayBuffer,
  );
}

/** A fresh operator VAPID pair, in the format `gen-vapid` prints. */
async function vapidEnv(): Promise<Env> {
  const pair = await generatePair({ name: 'ECDSA', namedCurve: 'P-256' }, [
    'sign',
    'verify',
  ]);
  const jwk = (await crypto.subtle.exportKey(
    'jwk',
    pair.privateKey,
  )) as JsonWebKey;
  if (jwk.d === undefined) throw new Error('expected d');
  return {
    ...baseEnv,
    VAPID_PUBLIC_KEY: base64UrlEncode(await rawPublic(pair.publicKey)),
    VAPID_PRIVATE_KEY: jwk.d,
  };
}

/** A browser's side of a subscription: its keys, kept to decrypt with. */
interface Subscriber {
  sub: PushSubscription;
  privateKey: CryptoKey;
  uaPublic: Uint8Array;
  auth: Uint8Array;
}

async function subscriber(endpoint: string): Promise<Subscriber> {
  const pair = await generatePair({ name: 'ECDH', namedCurve: 'P-256' }, [
    'deriveBits',
  ]);
  const uaPublic = await rawPublic(pair.publicKey);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    sub: {
      id: await subscriptionId(endpoint),
      endpoint,
      keys: {
        p256dh: base64UrlEncode(uaPublic),
        auth: base64UrlEncode(auth),
      },
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    privateKey: pair.privateKey,
    uaPublic,
    auth,
  };
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: string | Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: typeof info === 'string' ? encoder.encode(info) : info,
    },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * The receiving browser's side of RFC 8291, written independently of
 * `push.ts`: parse the `aes128gcm` header, redo ECDH and the HKDFs with the
 * subscriber's private key, decrypt, strip the padding delimiter.
 */
async function decrypt(body: Uint8Array, to: Subscriber): Promise<unknown> {
  const salt = body.slice(0, 16);
  const recordSize = new DataView(body.buffer, body.byteOffset).getUint32(16);
  expect(recordSize).toBe(4096);
  const idLength = body[20] ?? 0;
  expect(idLength).toBe(65);
  const asPublic = body.slice(21, 21 + idLength);
  const ciphertext = body.slice(21 + idLength);

  const asKey = await crypto.subtle.importKey(
    'raw',
    asPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asKey } as SubtleCryptoDeriveKeyAlgorithm,
      to.privateKey,
      256,
    ),
  );
  const keyInfo = new Uint8Array([
    ...encoder.encode('WebPush: info\0'),
    ...to.uaPublic,
    ...asPublic,
  ]);
  const ikm = await hkdf(to.auth, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, [
    'decrypt',
  ]);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      ciphertext,
    ),
  );
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  expect(padded[end]).toBe(0x02);
  return JSON.parse(decoder.decode(padded.slice(0, end))) as unknown;
}

interface Sent {
  url: string;
  headers: Headers;
  body: Uint8Array;
}

/** A push service stand-in: records each request, answers `status(url)`. */
function pushService(status: (url: string) => number = () => 201): {
  sent: Sent[];
  fetchImpl: FetchLike;
} {
  const sent: Sent[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    const body = init?.body;
    if (!(body instanceof Uint8Array)) {
      return Promise.reject(new Error('expected a byte body'));
    }
    sent.push({ url: input, headers: new Headers(init?.headers), body });
    return Promise.resolve(new Response(null, { status: status(input) }));
  };
  return { sent, fetchImpl };
}

function parseAuthorization(header: string | null): { t: string; k: string } {
  const match = /^vapid t=([^,]+), k=(.+)$/.exec(header ?? '');
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error('not a vapid Authorization header');
  }
  return { t: match[1], k: match[2] };
}

describe('sendPush', () => {
  it('sends an RFC 8291 message the subscriber can decrypt, with the push headers', async () => {
    const env = await vapidEnv();
    const alice = await subscriber('https://push.example.test/sub/alice');
    await putPushSub(kv, 'push-user-1', alice.sub);
    const { sent, fetchImpl } = pushService();

    await sendPush(env, 'push-user-1', PAYLOAD, fetchImpl);

    expect(sent).toHaveLength(1);
    const [request] = sent;
    if (request === undefined) throw new Error('no request');
    expect(request.url).toBe(alice.sub.endpoint);
    expect(request.headers.get('TTL')).toBe(String(PUSH_TTL_SECONDS));
    expect(request.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(request.headers.get('Urgency')).toBe('normal');
    const plaintext = encoder.encode(JSON.stringify(PAYLOAD));
    // Header, plaintext, the 0x02 delimiter, the 16-byte tag.
    expect(request.body.length).toBe(
      AES128GCM_HEADER_BYTES + plaintext.length + 1 + 16,
    );
    expect(await decrypt(request.body, alice)).toEqual(PAYLOAD);
  });

  it('signs a VAPID JWT for the endpoint origin, verifiable with the public key', async () => {
    const env = await vapidEnv();
    const alice = await subscriber('https://push.example.test/sub/jwt');
    await putPushSub(kv, 'push-user-2', alice.sub);
    const { sent, fetchImpl } = pushService();
    const now = Math.floor(Date.now() / 1000);

    await sendPush(env, 'push-user-2', PAYLOAD, fetchImpl);

    const { t, k } = parseAuthorization(
      sent[0]?.headers.get('Authorization') ?? null,
    );
    expect(k).toBe(env.VAPID_PUBLIC_KEY);
    const [header, claims, signature] = t.split('.');
    if (
      header === undefined ||
      claims === undefined ||
      signature === undefined
    ) {
      throw new Error('malformed JWT');
    }
    expect(JSON.parse(decoder.decode(base64UrlDecode(header)))).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    });
    const parsed = JSON.parse(decoder.decode(base64UrlDecode(claims))) as {
      aud: string;
      sub: string;
      exp: number;
    };
    expect(parsed.aud).toBe('https://push.example.test');
    expect(parsed.sub).toBe(env.VAPID_SUBJECT);
    expect(parsed.exp).toBeGreaterThan(now);
    expect(parsed.exp).toBeLessThanOrEqual(now + 24 * 60 * 60 + 5);

    const publicKey = await crypto.subtle.importKey(
      'raw',
      base64UrlDecode(k),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlDecode(signature),
      encoder.encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it('deletes a subscription the push service reports gone (410)', async () => {
    const env = await vapidEnv();
    const alice = await subscriber('https://push.example.test/sub/gone');
    await putPushSub(kv, 'push-user-3', alice.sub);
    const { sent, fetchImpl } = pushService(() => 410);

    await sendPush(env, 'push-user-3', PAYLOAD, fetchImpl);

    expect(sent).toHaveLength(1);
    expect(await listPushSubs(kv, 'push-user-3')).toEqual([]);
  });

  it('deletes a subscription the push service does not know (404)', async () => {
    const env = await vapidEnv();
    const alice = await subscriber('https://push.example.test/sub/unknown');
    await putPushSub(kv, 'push-user-4', alice.sub);

    await sendPush(
      env,
      'push-user-4',
      PAYLOAD,
      pushService(() => 404).fetchImpl,
    );

    expect(await listPushSubs(kv, 'push-user-4')).toEqual([]);
  });

  it('keeps the subscription and does not throw on a 500', async () => {
    const env = await vapidEnv();
    const alice = await subscriber('https://push.example.test/sub/flaky');
    await putPushSub(kv, 'push-user-5', alice.sub);
    const { sent, fetchImpl } = pushService(() => 500);

    await expect(
      sendPush(env, 'push-user-5', PAYLOAD, fetchImpl),
    ).resolves.toBeUndefined();

    expect(sent).toHaveLength(1);
    expect(await listPushSubs(kv, 'push-user-5')).toEqual([alice.sub]);
  });

  it('does not throw when the push service is unreachable', async () => {
    const env = await vapidEnv();
    const alice = await subscriber('https://push.example.test/sub/offline');
    await putPushSub(kv, 'push-user-6', alice.sub);
    const fetchImpl: FetchLike = () => Promise.reject(new Error('offline'));

    await expect(
      sendPush(env, 'push-user-6', PAYLOAD, fetchImpl),
    ).resolves.toBeUndefined();
    expect(await listPushSubs(kv, 'push-user-6')).toHaveLength(1);
  });

  it('sends once per subscription, pruning only the dead one', async () => {
    const env = await vapidEnv();
    const phone = await subscriber('https://push.example.test/sub/phone');
    const laptop = await subscriber(
      'https://push.other.example.test/sub/laptop',
    );
    await putPushSub(kv, 'push-user-7', phone.sub);
    await putPushSub(kv, 'push-user-7', laptop.sub);
    const { sent, fetchImpl } = pushService((url) =>
      url === laptop.sub.endpoint ? 410 : 201,
    );

    await sendPush(env, 'push-user-7', PAYLOAD, fetchImpl);

    expect(sent.map((s) => s.url).sort()).toEqual(
      [phone.sub.endpoint, laptop.sub.endpoint].sort(),
    );
    const toLaptop = sent.find((s) => s.url === laptop.sub.endpoint);
    if (toLaptop === undefined) throw new Error('no request to laptop');
    expect(await decrypt(toLaptop.body, laptop)).toEqual(PAYLOAD);
    const aud = JSON.parse(
      decoder.decode(
        base64UrlDecode(
          parseAuthorization(toLaptop.headers.get('Authorization')).t.split(
            '.',
          )[1] ?? '',
        ),
      ),
    ) as { aud: string };
    expect(aud.aud).toBe('https://push.other.example.test');
    expect(await listPushSubs(kv, 'push-user-7')).toEqual([phone.sub]);
  });

  it('sends nothing and does not throw when the VAPID keys are invalid', async () => {
    const alice = await subscriber('https://push.example.test/sub/config');
    await putPushSub(kv, 'push-user-8', alice.sub);
    const { sent, fetchImpl } = pushService();

    // The fixture keys in vitest.config.ts are placeholders, not keys.
    await expect(
      sendPush(baseEnv, 'push-user-8', PAYLOAD, fetchImpl),
    ).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('does nothing without subscriptions', async () => {
    const { sent, fetchImpl } = pushService();
    await sendPush(baseEnv, 'push-user-none', PAYLOAD, fetchImpl);
    expect(sent).toHaveLength(0);
  });
});

describe('runPushPayload', () => {
  it('counts processed files, or says there was nothing, or that it failed', () => {
    const at = '2026-01-01T00:00:00.000Z';
    expect(
      runPushPayload({ state: 'done', requestedAt: at, processed: ['a', 'b'] }),
    ).toEqual({ title: 'Bower', body: '2 files processed', url: '/' });
    expect(
      runPushPayload({ state: 'done', requestedAt: at, processed: ['a'] }).body,
    ).toBe('1 file processed');
    expect(runPushPayload({ state: 'done', requestedAt: at }).body).toBe(
      'Nothing new to process',
    );
    expect(
      runPushPayload({ state: 'failed', requestedAt: at, error: 'x' }).body,
    ).toBe('Something went wrong');
  });
});

describe('runner status report', () => {
  it('pushes "2 files processed" when a run is reported done', async () => {
    const env = await vapidEnv();
    const userId = 'push-runner-user';
    await putUser(kv, {
      id: userId,
      email: 'you@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      encRefreshToken: 'v1.placeholder',
      vault: {
        folderId: 'FOLDER_ID',
        inboxFolderId: 'INBOX_FOLDER_ID',
        name: 'Bower',
      },
    });
    const alice = await subscriber('https://push.example.test/sub/runner');
    await putPushSub(kv, userId, alice.sub);
    const { sent, fetchImpl } = pushService();

    const response = await createApp({ fetchImpl }).request(
      `${API}/runner/vaults/${userId}/status`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.BOWER_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          state: 'done',
          processed: ['one.md', 'two.md'],
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    const [request] = sent;
    if (request === undefined) throw new Error('no request');
    expect(await decrypt(request.body, alice)).toEqual({
      title: 'Bower',
      body: '2 files processed',
      url: '/',
    });
  });
});

describe('push routes', () => {
  const ENDPOINT = 'https://push.example.test/sub/route';

  async function cookieFor(userId: string): Promise<string> {
    const token = await signSession({ userId }, baseEnv.SESSION_SECRET);
    return `${SESSION_COOKIE}=${token}`;
  }

  async function seedUser(userId: string): Promise<void> {
    await putUser(kv, {
      id: userId,
      email: `${userId}@example.com`,
      createdAt: '2026-01-01T00:00:00.000Z',
      encRefreshToken: 'v1.placeholder',
    });
  }

  async function call(
    method: string,
    path: string,
    body: unknown,
    cookie: string | null,
    env: Env = baseEnv,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      origin: env.APP_ORIGIN,
    };
    if (cookie !== null) headers.cookie = cookie;
    return createApp().request(
      `${API}${path}`,
      {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : typeof body === 'string'
              ? body
              : JSON.stringify(body),
      },
      env,
    );
  }

  it('stores a subscription under its endpoint hash, then deletes it', async () => {
    const userId = 'push-route-user-1';
    await seedUser(userId);
    const cookie = await cookieFor(userId);
    const alice = await subscriber(ENDPOINT);

    const subscribed = await call(
      'POST',
      '/push/subscribe',
      {
        subscription: {
          endpoint: ENDPOINT,
          expirationTime: null,
          keys: alice.sub.keys,
        },
      },
      cookie,
    );
    expect(subscribed.status).toBe(204);

    const stored = await listPushSubs(kv, userId);
    expect(stored).toHaveLength(1);
    const [sub] = stored;
    expect(sub).toEqual({
      id: await subscriptionId(ENDPOINT),
      endpoint: ENDPOINT,
      keys: alice.sub.keys,
      createdAt: expect.any(String) as unknown,
    });
    expect(sub?.id).toHaveLength(32);
    expect(await kv.get(`push:${userId}:${sub?.id ?? ''}`)).not.toBeNull();

    const removed = await call(
      'DELETE',
      '/push/subscribe',
      { endpoint: ENDPOINT },
      cookie,
    );
    expect(removed.status).toBe(204);
    expect(await listPushSubs(kv, userId)).toEqual([]);
  });

  it('answers 401 without a session', async () => {
    const alice = await subscriber(ENDPOINT);
    const subscribe = await call(
      'POST',
      '/push/subscribe',
      { subscription: { endpoint: ENDPOINT, keys: alice.sub.keys } },
      null,
    );
    expect(subscribe.status).toBe(401);
    const unsubscribe = await call(
      'DELETE',
      '/push/subscribe',
      { endpoint: ENDPOINT },
      null,
    );
    expect(unsubscribe.status).toBe(401);
  });

  it('answers 400 to a malformed subscription and stores nothing', async () => {
    const userId = 'push-route-user-2';
    await seedUser(userId);
    const cookie = await cookieFor(userId);
    const alice = await subscriber(ENDPOINT);

    const bodies: unknown[] = [
      'not json',
      [],
      {},
      { subscription: { endpoint: ENDPOINT } },
      {
        subscription: {
          endpoint: 'http://push.example.test/x',
          keys: alice.sub.keys,
        },
      },
      { subscription: { endpoint: 'not a url', keys: alice.sub.keys } },
      {
        subscription: {
          endpoint: ENDPOINT,
          keys: { p256dh: 'short', auth: alice.sub.keys.auth },
        },
      },
      {
        subscription: {
          endpoint: ENDPOINT,
          keys: { p256dh: alice.sub.keys.p256dh, auth: 'AAAA' },
        },
      },
    ];
    for (const body of bodies) {
      const response = await call('POST', '/push/subscribe', body, cookie);
      expect(response.status).toBe(400);
      const json = await response.json<{ error: { code: string } }>();
      expect(json.error.code).toBe('bad_request');
    }
    const missingEndpoint = await call('DELETE', '/push/subscribe', {}, cookie);
    expect(missingEndpoint.status).toBe(400);
    expect(await listPushSubs(kv, userId)).toEqual([]);
  });

  it('serves the VAPID public key', async () => {
    const env = await vapidEnv();
    const response = await call(
      'GET',
      '/push/public-key',
      undefined,
      null,
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: env.VAPID_PUBLIC_KEY });
  });

  it('answers a config error when the VAPID public key is not a key', async () => {
    const response = await call('GET', '/push/public-key', undefined, null);
    expect(response.status).toBe(500);
    const json = await response.json<{ error: { code: string } }>();
    expect(json.error.code).toBe('config');
  });
});
