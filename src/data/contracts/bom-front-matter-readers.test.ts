/**
 * bom-front-matter-readers: a UTF-8 byte-order mark (U+FEFF) before a note's front matter is not part of its text, so
 * `frontValues` reads the same values as without the mark, as `parseOwnership` and `indexedFront` already do. Made-up data only.
 */
import { describe, expect, it } from 'vitest';
import { frontValues, indexedFront } from './note-format';

const BOM = '﻿';
const note = (eol: string): string =>
  ['---', "summary: Alex's garden plot.", 'by: bower', 'type: project', 'status: active', 'tags: [home, garden]', '---', 'Alex keeps a planting diary.', ''].join(eol);
const values = { summary: "Alex's garden plot.", by: 'bower', type: 'project', status: 'active', tags: '[home, garden]' };

describe('bom-front-matter-readers: frontValues after a byte-order mark', () => {
  it('the control: an unmarked note gives its front matter values', () => {
    for (const eol of ['\n', '\r\n']) expect(frontValues(note(eol)), `eol=${JSON.stringify(eol)}`).toEqual(values);
  });

  it('a marked note gives the values the unmarked one gives', () => {
    for (const eol of ['\n', '\r\n']) {
      expect.soft(frontValues(`${BOM}${note(eol)}`), `eol=${JSON.stringify(eol)}`).toEqual(frontValues(note(eol)));
    }
  });

  it('a marked note gives the values and the duplicate keys the unmarked one gives', () => {
    const doubled = (eol: string): string => ['---', 'status: active', 'type: project', 'status: done', '---', 'Alex.', ''].join(eol);
    for (const eol of ['\n', '\r\n']) {
      const plain = new Set<string>();
      const marked = new Set<string>();
      const expected = frontValues(doubled(eol), plain);
      expect(plain, `the control, eol=${JSON.stringify(eol)}`).toEqual(new Set(['status']));
      expect.soft(frontValues(`${BOM}${doubled(eol)}`, marked), `eol=${JSON.stringify(eol)}`).toEqual(expected);
      expect.soft(marked, `eol=${JSON.stringify(eol)}`).toEqual(plain);
    }
  });

  it('a marked note whose front matter is not all there is null, as the unmarked one is', () => {
    const cut = '---\nsummary: Alex\'s garden plot.\nby: bower\n';
    expect(frontValues(cut), 'the control').toBeNull();
    expect(frontValues(`${BOM}${cut}`)).toBeNull();
  });

  it('guard: indexedFront already reads a marked note as the unmarked one', () => {
    for (const eol of ['\n', '\r\n']) expect(indexedFront(`${BOM}${note(eol)}`), `eol=${JSON.stringify(eol)}`).toEqual(indexedFront(note(eol)));
  });
});
