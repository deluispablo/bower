/**
 * The one place a digest is worked out: the app, the runner and the Worker all come here (TL-P4-14, c1-digest).
 * SHA-256 tells a file you already have apart (against `.bower/hashes.json`, which the runner keeps: hash → path);
 * MD5 is what Drive gives as a file's `md5Checksum`, so it is the sum a report is checked with.
 * SHA-256 is Web Crypto's `SubtleCrypto.digest` (https://developer.mozilla.org/docs/Web/API/SubtleCrypto/digest),
 * there in browsers, Workers and Node 20+ as `crypto.subtle` (https://nodejs.org/api/webcrypto.html).
 */

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

const SHA_K = Array.from({ length: 64 }, (_, i) => {
  // The first 32 bits of the cube roots of the first 64 primes (FIPS 180-4 §4.2.2).
  let n = 2;
  for (let seen = 0; ; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) prime = false;
    if (prime && seen++ === i) break;
  }
  return Math.floor((Math.cbrt(n) % 1) * 2 ** 32) >>> 0;
});

/**
 * The SHA-256 of `data`, hex, worked out at once (FIPS 180-4, https://csrc.nist.gov/pubs/fips/180-4/upd1/final) for the
 * few small stamps and fingerprints that cannot wait for Web Crypto's promise. Files use `sha256`.
 */
export function sha256Sync(data: Uint8Array | string): string {
  const bytes = bytesOf(data);
  const length = bytes.byteLength;
  const padded = new Uint8Array((((length + 8) >>> 6) + 1) * 64);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.byteLength - 8, Math.floor(length / 0x20000000), false);
  view.setUint32(padded.byteLength - 4, (length * 8) >>> 0, false);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64).fill(0);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let at = 0; at < padded.byteLength; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(at + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] ?? 0;
      const b = w[i - 2] ?? 0;
      w[i] = ((w[i - 16] ?? 0) + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + (w[i - 7] ?? 0) + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + (SHA_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((x, i) => (h[i] = ((h[i] ?? 0) + x) >>> 0));
  }
  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}

/** MD5's per-round shift amounts and sine constants (RFC 1321 §3.4, https://www.rfc-editor.org/rfc/rfc1321). */
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/**
 * The MD5 of `bytes`, as 32 lowercase hex digits: what Drive gives as a file's `md5Checksum`
 * (https://developers.google.com/workspace/drive/api/reference/rest/v3/files). The browser's Web Crypto has no MD5,
 * so this is RFC 1321 written out, synchronous so a writer can set it in the same request as the bytes it sends.
 * It tells Bower's own last write from a later change (TL-P4-10); it is no security boundary.
 */
export function md5Hex(bytes: Uint8Array): string {
  const length = bytes.byteLength;
  const padded = new Uint8Array((((length + 8) >>> 6) + 1) * 64);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.byteLength - 8, (length * 8) >>> 0, true);
  view.setUint32(padded.byteLength - 4, Math.floor(length / 0x20000000), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let at = 0; at < padded.byteLength; at += 64) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      const round = i >>> 4;
      const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const sum = (a + f + (MD5_K[i] ?? 0) + view.getUint32(at + g * 4, true)) >>> 0;
      const shift = MD5_S[round * 4 + (i % 4)] ?? 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((word, i) => out.setUint32(i * 4, word, true));
  return hex(new Uint8Array(out.buffer));
}

/** The sum a report is checked with, here and in the runner: the MD5 Drive gives as `md5Checksum` for the stored bytes. */
export const checksumOf = async (bytes: Uint8Array): Promise<string> => md5Hex(bytes);
