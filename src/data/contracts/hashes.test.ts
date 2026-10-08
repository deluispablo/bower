import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as digest from './hashes';

const ROOT = join(__dirname, '..', '..', '..');
const enc = (t: string): Uint8Array => new TextEncoder().encode(t);

/** Every app, runner and Worker source file (tests are the independent oracle and may call Node's crypto). */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

const HOME = join(ROOT, 'src', 'data', 'contracts', 'hashes.ts');
const ALL = ['src', 'api/src', 'runner/src'].flatMap((d) => sources(join(ROOT, d))).filter((p) => p !== HOME);

describe('one digest module serves app, runner and Worker', () => {
  it('keeps SHA-256 (async and sync), MD5 and the empty-file constants in one place', async () => {
    expect(typeof digest.sha256Hex).toBe('function');
    expect(typeof digest.sha256Bytes).toBe('function');
    expect(typeof digest.sha256Sync).toBe('function');
    expect(digest.EMPTY_MD5).toBe(createHash('md5').update('').digest('hex'));
    expect(digest.EMPTY_SHA256).toBe(createHash('sha256').update('').digest('hex'));
    for (const t of ['', 'abc', 'Made-up words, longer than one block of sixty-four bytes, so the padding is exercised too.', 'é ü 日本']) {
      const want = createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');
      expect(await digest.sha256Hex(enc(t))).toBe(want);
      expect(await digest.sha256Hex(t)).toBe(want);
      expect(digest.sha256Sync(enc(t))).toBe(want);
      expect(digest.sha256Sync(t)).toBe(want);
      expect(Buffer.from(await digest.sha256Bytes(enc(t))).toString('hex')).toBe(want);
    }
  });

  it('the runner and the fake check a report with the same sum, the one Drive gives as md5Checksum', async () => {
    expect(typeof digest.checksumOf).toBe('function');
    const bytes = enc('{"v":1}');
    expect(await digest.checksumOf(bytes)).toBe(createHash('md5').update(bytes).digest('hex'));
    for (const file of ['runner/src/main.ts', 'src/data/fake/fake-run-service.ts']) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).toContain('checksumOf');
    }
  });

  it('no file outside hashes.ts calls a hash primitive or spells an empty-file constant', () => {
    const PRIMITIVE = /createHash|createHmac|subtle\s*\.\s*digest|0x67452301|d41d8cd98f00b204e9800998ecf8427e|e3b0c44298fc1c14/;
    const offenders = ALL.filter((p) => PRIMITIVE.test(readFileSync(p, 'utf8'))).map((p) => relative(ROOT, p));
    expect(offenders).toEqual([]);
  });

  it('hashes.ts has no hand-written hash', () => {
    const content = readFileSync(HOME, 'utf8');
    const HAND_WRITTEN = /const SHA_K|const MD5_S|const MD5_K|rotr\(|for \(let i = 0; i < 64; i\)/;
    expect(content, 'hashes.ts should not contain hand-written SHA-256 or MD5 implementations').not.toMatch(HAND_WRITTEN);
  });
});
