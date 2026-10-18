/**
 * Every PDF in the capability corpus is a real PDF (`corpus-offer-real-pdf`): a live run reads it with the runner's
 * own extraction (`extract`, unpdf), so a corpus PDF that is only text behind a `%PDF-1.4` header is filed with no
 * terms. A text PDF yields its text layer; a scan (`scan0001.pdf`) parses and has no text layer.
 */
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extract, pictureOf } from '../src/extract';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');

const isSof = (m: number): boolean => m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m);
const u16 = (bytes: Uint8Array, at: number): number => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);

/** ITU-T T.81 Annex B: SOI, segments (B.1.1.3) up to SOS, one frame header (B.2.2), tables before SOS, data, EOI. */
function jpegStructure(bytes: Uint8Array): void {
  expect([...bytes.subarray(0, 3)], 'SOI').toEqual([0xff, 0xd8, 0xff]);
  expect([...bytes.subarray(-2)], 'EOI').toEqual([0xff, 0xd9]);
  const markers: number[] = [];
  let at = 2; let sof = -1;
  for (;;) {
    expect(bytes[at], `segment at ${at}`).toBe(0xff);
    const marker = bytes[at + 1] ?? 0;
    const length = u16(bytes, at + 2);
    expect(length, `segment length at ${at}`).toBeGreaterThanOrEqual(2);
    expect(at + 2 + length, `segment end at ${at}`).toBeLessThanOrEqual(bytes.length);
    markers.push(marker);
    if (isSof(marker)) sof = at;
    at += 2 + length;
    if (marker === 0xda) break;
  }
  expect(markers.filter(isSof), 'one SOF').toHaveLength(1);
  expect({ height: u16(bytes, sof + 5) > 0, width: u16(bytes, sof + 7) > 0, components: [1, 3].includes(bytes[sof + 9] ?? 0) }).toEqual({ height: true, width: true, components: true });
  expect({ dqt: markers.includes(0xdb), dht: markers.includes(0xc4) }).toEqual({ dqt: true, dht: true });
  expect(bytes.length - 2 - at, 'entropy-coded data').toBeGreaterThan(0);
  expect(markers.filter((m) => (m >= 0xe1 && m <= 0xef) || m === 0xfe), 'no APP1-APP15 or COM').toEqual([]);
}

async function pdfsUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await pdfsUnder(full)));
    else if (entry.name.toLowerCase().endsWith('.pdf')) found.push(full);
  }
  return found.sort();
}

describe('corpus PDFs are valid PDFs', () => {
  it('corpus-delete-bench-cases AC3: PDF inventory remains valid after benchmark removal', async () => {
    const pdfs = await pdfsUnder(ROOT);
    expect(pdfs.map((full) => relative(ROOT, full)).filter((path) => /^bench-[1-5]-[^/]+\//.test(path))).toEqual([]);
    expect(pdfs.length).toBeGreaterThan(0);
    for (const full of pdfs) {
      const path = relative(ROOT, full);
      const name = path.split('/').at(-1) ?? '';
      const shown = await extract(name, new Uint8Array(await readFile(full)));
      if (/^scan\d+\.pdf$/.test(name)) {
        expect({ path, shown }).toEqual({ path, shown: { text: null, why: expect.stringContaining('scanned PDF with no text layer') } });
      } else {
        expect({ path, text: shown.text !== null && shown.text.trim().length > 0 }).toEqual({ path, text: true });
      }
    }
  });

  it('the offer letters carry their terms', async () => {
    const offers = (await pdfsUnder(ROOT)).filter((p) => p.endsWith('Offer_letter_final(2).pdf'));
    expect(offers.length).toBeGreaterThan(0);
    for (const full of offers) {
      const shown = await extract('Offer_letter_final(2).pdf', new Uint8Array(await readFile(full)));
      expect({ path: relative(ROOT, full), text: shown.text }).toEqual({ path: relative(ROOT, full), text: expect.stringContaining('Salary 42,000 a year. Start 2 November.') });
    }
  });

  it('corpus-fix-c15 AC2: image-only negative makes no readable-letter claim', async () => {
    const id = 'c15-image-only-pdf-asked';
    const path = join(ROOT, id, 'inbox/scan0001.pdf');
    expect(existsSync(path)).toBe(true);
    const bytes = new Uint8Array(await readFile(path));
    expect(await extract('scan0001.pdf', bytes)).toEqual({ text: null, why: expect.stringContaining('no text layer') });
    const raw = new TextDecoder('latin1').decode(bytes);
    expect({ image: raw.includes('/Subtype /Image'), font: raw.includes('/Font') }).toEqual({ image: true, font: false });
    const TEXT_CLAIM = /letter|\bOCR\b|\breads?\b|readab|legib/i;
    const c = JSON.parse(await readFile(join(ROOT, id, 'case.json'), 'utf8')) as { title: string; source: string };
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ asks?: Array<{ text: string }> }>;
    const rowOf = (text: string): string => text.split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';
    const readmeRow = rowOf(await readFile(join(ROOT, 'README.md'), 'utf8'));
    const logRow = rowOf(await readFile(resolve(ROOT, '../fixtures/p4-method-rubric-changes.md'), 'utf8'));
    expect({ readme: readmeRow !== '', log: logRow !== '' }).toEqual({ readme: true, log: true });
    const texts = [c.title, c.source, await readFile(join(ROOT, id, 'rubric.md'), 'utf8'), ...replies.flatMap((r) => (r.asks ?? []).map((a) => a.text)), readmeRow, logRow];
    expect(texts.filter((t) => TEXT_CLAIM.test(t))).toEqual([]);
    const expected = JSON.parse(await readFile(join(ROOT, id, 'expected.json'), 'utf8')) as { notes?: unknown };
    expect(expected.notes).toBeUndefined();
  });

  it('corpus-fix-c04 AC1: C04 binary inputs have valid content and synthetic provenance', async () => {
    const photo = new Uint8Array(await readFile(join(ROOT, 'c04-offer-and-flat/inbox/IMG_2301.jpg')));
    jpegStructure(photo);
    expect(pictureOf('IMG_2301.jpg', photo)).toEqual({ mediaType: 'image/jpeg' });
    expect(new TextDecoder('latin1').decode(photo)).not.toMatch(/Wrenfield|made-up photo/);
    const pdfs = ['c04-garden-newsletter/inbox/Community garden newsletter, autumn.pdf', 'c04-hardware-receipt/inbox/receipt-2026-09-14.pdf',
      'c04-offer-and-flat/inbox/Offer_letter_final(2).pdf', 'c04-offer-and-flat/inbox/Payslip_Aug.pdf'];
    for (const path of pdfs) {
      const bytes = new Uint8Array(await readFile(join(ROOT, path)));
      const raw = new TextDecoder('latin1').decode(bytes);
      const text = (await extract(path.split('/').at(-1) ?? '', bytes)).text ?? '';
      expect({ path, text: text.trim().length > 0, meta: ['/Info', '/Producer', '/Creator', '/Author'].filter((k) => raw.includes(k)) }).toEqual({ path, text: true, meta: [] });
      if (path.endsWith('Offer_letter_final(2).pdf')) expect(text).toContain('Salary 42,000 a year. Start 2 November.');
    }
    const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
    for (const id of ['c04-garden-newsletter', 'c04-hardware-receipt', 'c04-offer-and-flat']) {
      const { source } = JSON.parse(await readFile(join(ROOT, id, 'case.json'), 'utf8')) as { source: string };
      expect({ id, source }).not.toEqual({ id, source: expect.stringMatching(/bench|original/i) });
      const row = readme.split('\n').find((l) => l.startsWith(`| ${id} |`));
      expect({ id, row: row !== undefined && !row.includes('bench:') }).toEqual({ id, row: true });
    }
  });
});
