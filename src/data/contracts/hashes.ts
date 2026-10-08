/**
 * Telling a file you already have: its SHA-256, worked out in the browser,
 * against `.bower/hashes.json`, which the runner keeps (hash → path).
 */
export async function sha256(b: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
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
  return [...new Uint8Array(out.buffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
