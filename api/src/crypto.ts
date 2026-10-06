/**
 * Encryption at rest for secrets the Worker keeps in KV (refresh tokens,
 * BYOK API keys), plus the byte-level helpers shared with `session.ts`.
 *
 * Web Crypto only (`crypto.subtle`); no Node `crypto`.
 */

export type CryptoErrorCode =
  'malformed_envelope' | 'decrypt_failed' | 'bad_key';

/**
 * Thrown by `importEncryptionKey` and `decrypt`. `code` is stable and safe
 * to branch on; the message never contains key material or plaintext.
 */
export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CryptoError';
    this.code = code;
  }
}

const ENVELOPE_VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
/** AES-GCM appends a 16-byte authentication tag to every ciphertext. */
const TAG_BYTES = 16;

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]*$/;

function bytesToBinary(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary;
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes bytes as unpadded base64url (RFC 4648 §5). */
export function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes unpadded base64url strictly: only `A-Z a-z 0-9 - _`, no padding,
 * no whitespace, and only the canonical encoding of the bytes is accepted.
 * Throws `TypeError` on anything else; callers map it to their own error.
 */
export function base64UrlDecode(input: string): Uint8Array {
  if (!BASE64URL_RE.test(input) || input.length % 4 === 1) {
    throw new TypeError('Invalid base64url');
  }
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const bytes = binaryToBytes(atob(padded));
  // Reject non-canonical input (non-zero trailing bits), so one byte string
  // has exactly one accepted encoding.
  if (base64UrlEncode(bytes) !== input) {
    throw new TypeError('Invalid base64url');
  }
  return bytes;
}

/** Encodes a string as UTF-8, then as unpadded base64url. */
export function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

/**
 * Imports the operator's `TOKEN_ENC_KEY`: standard base64 (with padding)
 * of exactly 32 random bytes. Returns a non-extractable AES-256-GCM key
 * usable only to encrypt and decrypt. Throws `CryptoError('bad_key')`
 * otherwise.
 */
export async function importEncryptionKey(
  base64Key: string,
): Promise<CryptoKey> {
  if (!BASE64_RE.test(base64Key) || base64Key.length % 4 !== 0) {
    throw new CryptoError('bad_key', 'Encryption key is not valid base64');
  }
  const raw = binaryToBytes(atob(base64Key));
  if (raw.length !== KEY_BYTES) {
    throw new CryptoError(
      'bad_key',
      `Encryption key must be ${KEY_BYTES} bytes`,
    );
  }
  try {
    return await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
  } catch (err) {
    throw new CryptoError('bad_key', 'Encryption key could not be imported', {
      cause: err,
    });
  }
}

/**
 * Encrypts `plain` (UTF-8) with AES-GCM and returns the envelope
 * `v1.<iv>.<ciphertext>`: `iv` is a fresh random 12-byte nonce per call,
 * `ciphertext` is the AES-GCM output including its 16-byte tag, both
 * unpadded base64url. The version prefix leaves room to rotate the format.
 */
export async function encrypt(plain: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  return [
    ENVELOPE_VERSION,
    base64UrlEncode(iv),
    base64UrlEncode(new Uint8Array(ciphertext)),
  ].join('.');
}

function decodeEnvelopePart(part: string): Uint8Array {
  try {
    return base64UrlDecode(part);
  } catch (err) {
    throw new CryptoError(
      'malformed_envelope',
      'Envelope is not valid base64url',
      {
        cause: err,
      },
    );
  }
}

/**
 * Reverses `encrypt`. The envelope is parsed strictly (version `v1`, three
 * dot-separated parts, canonical base64url, 12-byte IV, ciphertext at least
 * one tag long) and authenticated by AES-GCM, so the result is either the
 * exact original plaintext or a thrown `CryptoError`: `malformed_envelope`
 * for a bad shape, `decrypt_failed` for tampering or the wrong key.
 */
export async function decrypt(
  envelope: string,
  key: CryptoKey,
): Promise<string> {
  const parts = envelope.split('.');
  if (parts.length !== 3) {
    throw new CryptoError(
      'malformed_envelope',
      'Envelope must have three parts',
    );
  }
  const [version, ivPart, ciphertextPart] = parts as [string, string, string];
  if (version !== ENVELOPE_VERSION) {
    throw new CryptoError('malformed_envelope', 'Unsupported envelope version');
  }
  const iv = decodeEnvelopePart(ivPart);
  const ciphertext = decodeEnvelopePart(ciphertextPart);
  if (iv.length !== IV_BYTES) {
    throw new CryptoError('malformed_envelope', `IV must be ${IV_BYTES} bytes`);
  }
  if (ciphertext.length < TAG_BYTES) {
    throw new CryptoError('malformed_envelope', 'Ciphertext is too short');
  }

  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
  } catch (err) {
    throw new CryptoError('decrypt_failed', 'Envelope could not be decrypted', {
      cause: err,
    });
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      plain,
    );
  } catch (err) {
    throw new CryptoError(
      'decrypt_failed',
      'Decrypted data is not valid UTF-8',
      {
        cause: err,
      },
    );
  }
}

/**
 * Constant-time string comparison for bearer keys. Uses workerd's
 * `crypto.subtle.timingSafeEqual` over the UTF-8 bytes. That call throws on
 * inputs of different lengths, so when lengths differ we still run one
 * full-length comparison (of `a` against itself) before returning false:
 * the time taken depends only on the lengths, never on the content.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const sameLength = aBytes.byteLength === bBytes.byteLength;
  const equal = crypto.subtle.timingSafeEqual(
    aBytes,
    sameLength ? bBytes : aBytes,
  );
  return sameLength && equal;
}
