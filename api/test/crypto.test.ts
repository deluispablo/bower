import { describe, expect, it } from 'vitest';

import {
  CryptoError,
  base64UrlDecode,
  base64UrlEncode,
  decrypt,
  encrypt,
  importEncryptionKey,
  timingSafeEqual,
} from '../src/crypto.js';
import type { CryptoErrorCode } from '../src/crypto.js';

/** Standard base64 of `length` random bytes, the format of `TOKEN_ENC_KEY`. */
function randomBase64Key(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function newKey(): Promise<CryptoKey> {
  return importEncryptionKey(randomBase64Key());
}

/** Resolves to the `CryptoError` code the promise rejects with. */
async function cryptoErrorCode(
  promise: Promise<unknown>,
): Promise<CryptoErrorCode> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof CryptoError) return err.code;
    throw err;
  }
  throw new Error('Expected a CryptoError, but the promise resolved');
}

/** Flips one bit of one byte in a base64url-encoded part. */
function flipByte(part: string, index = 0): string {
  const bytes = base64UrlDecode(part);
  bytes[index] = (bytes[index] ?? 0) ^ 0x01;
  return base64UrlEncode(bytes);
}

function splitEnvelope(envelope: string): [string, string, string] {
  const parts = envelope.split('.');
  expect(parts).toHaveLength(3);
  return parts as [string, string, string];
}

describe('base64url', () => {
  it('round-trips bytes without padding', () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63, 1]);
    const encoded = base64UrlEncode(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(base64UrlDecode(encoded)).toEqual(bytes);
  });

  it('rejects padding, standard alphabet and non-canonical input', () => {
    expect(() => base64UrlDecode('AA==')).toThrow(TypeError);
    expect(() => base64UrlDecode('+/8')).toThrow(TypeError);
    expect(() => base64UrlDecode('A')).toThrow(TypeError);
    expect(() => base64UrlDecode('AB')).toThrow(TypeError);
  });
});

describe('importEncryptionKey', () => {
  it('imports a 32-byte key as non-extractable AES-GCM', async () => {
    const key = await newKey();
    expect(key.algorithm.name).toBe('AES-GCM');
    expect(key.extractable).toBe(false);
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
  });

  it.each([
    ['16 bytes', randomBase64Key(16)],
    ['31 bytes', randomBase64Key(31)],
    ['33 bytes', randomBase64Key(33)],
    ['empty', ''],
    ['not base64', 'not a key!'],
  ])('rejects a key that is %s', async (_label, value) => {
    expect(await cryptoErrorCode(importEncryptionKey(value))).toBe('bad_key');
  });
});

describe('encrypt / decrypt', () => {
  it('round-trips ASCII, unicode and empty strings', async () => {
    const key = await newKey();
    for (const plain of [
      'refresh-token-example',
      'Alex: café, 日本語, 🐦',
      '',
    ]) {
      expect(await decrypt(await encrypt(plain, key), key)).toBe(plain);
    }
  });

  it('produces a v1 envelope with a 12-byte IV', async () => {
    const key = await newKey();
    const [version, iv, ciphertext] = splitEnvelope(
      await encrypt('secret', key),
    );
    expect(version).toBe('v1');
    expect(base64UrlDecode(iv)).toHaveLength(12);
    // 6 bytes of plaintext plus the 16-byte GCM tag.
    expect(base64UrlDecode(ciphertext)).toHaveLength(6 + 16);
  });

  it('uses a fresh IV, so equal plaintexts encrypt differently', async () => {
    const key = await newKey();
    const first = await encrypt('same text', key);
    const second = await encrypt('same text', key);
    expect(first).not.toBe(second);
    expect(splitEnvelope(first)[1]).not.toBe(splitEnvelope(second)[1]);
  });

  it('rejects tampered ciphertext', async () => {
    const key = await newKey();
    const [version, iv, ciphertext] = splitEnvelope(
      await encrypt('secret', key),
    );
    const tampered = [version, iv, flipByte(ciphertext)].join('.');
    expect(await cryptoErrorCode(decrypt(tampered, key))).toBe(
      'decrypt_failed',
    );
  });

  it('rejects a tampered GCM tag', async () => {
    const key = await newKey();
    const [version, iv, ciphertext] = splitEnvelope(
      await encrypt('secret', key),
    );
    const lastByte = base64UrlDecode(ciphertext).length - 1;
    const tampered = [version, iv, flipByte(ciphertext, lastByte)].join('.');
    expect(await cryptoErrorCode(decrypt(tampered, key))).toBe(
      'decrypt_failed',
    );
  });

  it('rejects a tampered IV', async () => {
    const key = await newKey();
    const [version, iv, ciphertext] = splitEnvelope(
      await encrypt('secret', key),
    );
    const tampered = [version, flipByte(iv), ciphertext].join('.');
    expect(await cryptoErrorCode(decrypt(tampered, key))).toBe(
      'decrypt_failed',
    );
  });

  it('rejects the wrong key', async () => {
    const envelope = await encrypt('secret', await newKey());
    expect(await cryptoErrorCode(decrypt(envelope, await newKey()))).toBe(
      'decrypt_failed',
    );
  });

  it('rejects malformed envelopes', async () => {
    const key = await newKey();
    const [, iv, ciphertext] = splitEnvelope(await encrypt('secret', key));
    const shortIv = base64UrlEncode(new Uint8Array(8));
    const shortCiphertext = base64UrlEncode(new Uint8Array(15));

    const malformed = [
      ['wrong version', `v2.${iv}.${ciphertext}`],
      ['missing version', `.${iv}.${ciphertext}`],
      ['two parts', `v1.${iv}`],
      ['four parts', `v1.${iv}.${ciphertext}.extra`],
      ['empty string', ''],
      ['invalid base64url IV', `v1.${iv.slice(0, -1)}+.${ciphertext}`],
      ['padded ciphertext', `v1.${iv}.${ciphertext}==`],
      ['IV of the wrong length', `v1.${shortIv}.${ciphertext}`],
      ['ciphertext shorter than a tag', `v1.${iv}.${shortCiphertext}`],
    ] as const;

    for (const [label, envelope] of malformed) {
      expect(await cryptoErrorCode(decrypt(envelope, key)), label).toBe(
        'malformed_envelope',
      );
    }
  });
});

describe('timingSafeEqual', () => {
  it('is true for equal strings', () => {
    expect(timingSafeEqual('bower-key-example', 'bower-key-example')).toBe(
      true,
    );
    expect(timingSafeEqual('', '')).toBe(true);
    expect(timingSafeEqual('clé 🔑', 'clé 🔑')).toBe(true);
  });

  it('is false for different strings of the same length', () => {
    expect(timingSafeEqual('bower-key-example', 'bower-key-examplf')).toBe(
      false,
    );
    expect(timingSafeEqual('aaaa', 'baaa')).toBe(false);
  });

  it('is false for strings of different lengths', () => {
    expect(timingSafeEqual('bower-key', 'bower-key-example')).toBe(false);
    expect(timingSafeEqual('bower-key-example', 'bower-key')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
    // Same number of characters, different number of UTF-8 bytes.
    expect(timingSafeEqual('e', 'é')).toBe(false);
  });
});
