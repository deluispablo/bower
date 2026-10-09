/**
 * The one place a digest is worked out: the app, the runner and the Worker all come here (TL-P4-14, c1-digest).
 * SHA-256 tells a file you already have apart (against `.bower/hashes.json`, which the runner keeps: hash → path);
 * MD5 is what Drive gives as a file's `md5Checksum`, so it is the sum a write's answer is confirmed with.
 * SHA-256 is Web Crypto's `SubtleCrypto.digest` (https://developer.mozilla.org/docs/Web/API/SubtleCrypto/digest),
 * there in browsers, Workers and Node 20+ as `crypto.subtle` (https://nodejs.org/api/webcrypto.html).
 * Synchronous SHA-256 and MD5 use @noble/hashes (https://github.com/paulmillr/noble-hashes).
 */

import { sha256 as noblesha256 } from '@noble/hashes/sha2';
import { md5 as noblemd5 } from '@noble/hashes/legacy';

/** The MD5 of no bytes at all: every empty file has it, so it never says two files are the same. */
export const EMPTY_MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
/** The SHA-256 of no bytes at all. */
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const hex = (bytes: Uint8Array): string => [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
const bytesOf = (data: Uint8Array | string): Uint8Array => (typeof data === 'string' ? new TextEncoder().encode(data) : data);

/** The raw SHA-256 of `data` (a string is its UTF-8 bytes). */
export async function sha256Bytes(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = bytesOf(data);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()));
}

/** The SHA-256 of `data` as 64 lowercase hex digits. */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  return hex(await sha256Bytes(data));
}

/** The SHA-256 of a Blob, hex (a file already in hand). */
export async function sha256(b: Blob): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer())));
}

/**
 * The SHA-256 of `data`, hex, worked out at once (FIPS 180-4, https://csrc.nist.gov/pubs/fips/180-4/upd1/final) for the
 * few small stamps and fingerprints that cannot wait for Web Crypto's promise. Files use `sha256`.
 */
export function sha256Sync(data: Uint8Array | string): string {
  const bytes = bytesOf(data);
  return hex(noblesha256(bytes));
}

/**
 * The MD5 of `bytes`, as 32 lowercase hex digits: what Drive gives as a file's `md5Checksum`
 * (https://developers.google.com/workspace/drive/api/reference/rest/v3/files). The browser's Web Crypto has no MD5,
 * so this uses @noble/hashes, synchronous so a writer can set it in the same request as the bytes it sends.
 * It tells Bower's own last write from a later change (TL-P4-10); it is no security boundary.
 */
export function md5Hex(bytes: Uint8Array): string {
  return hex(noblemd5(bytes));
}
