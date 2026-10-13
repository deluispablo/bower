/**
 * Every PDF in the capability corpus is a real PDF (`corpus-offer-real-pdf`): a live run reads it with the runner's
 * own extraction (`extract`, unpdf), so a corpus PDF that is only text behind a `%PDF-1.4` header is filed with no
 * terms. A text PDF yields its text layer; a scan (`scan0001.pdf`) parses and has no text layer.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extract } from '../src/extract';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');

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
  it('every corpus PDF parses: a text PDF yields its text, a scan has no text layer', async () => {
    const pdfs = await pdfsUnder(ROOT);
    expect(pdfs.length).toBeGreaterThan(10);
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
    expect(offers.length).toBeGreaterThanOrEqual(4);
    for (const full of offers) {
      const shown = await extract('Offer_letter_final(2).pdf', new Uint8Array(await readFile(full)));
      expect({ path: relative(ROOT, full), text: shown.text }).toEqual({ path: relative(ROOT, full), text: expect.stringContaining('Salary 42,000 a year. Start 2 November.') });
    }
  });
});
