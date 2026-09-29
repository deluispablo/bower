import { describe, expect, it } from 'vitest';

import { previewLines } from '../src/components/switcher.js';

describe('previewLines', () => {
  it('strips wikilinks and callout markers', () => {
    const text = [
      '> [!bower] Bower note',
      '',
      '- [[Lease agreement 2026.pdf#page=4|p. 4]]: Rent, deposit',
      '[[Offer letter, Northwind Data]]',
    ].join('\n');
    expect(previewLines(text)).toEqual([
      'Bower note',
      'p. 4: Rent, deposit',
      'Offer letter, Northwind Data',
    ]);
  });
});
