/**
 * bom-front-matter: a UTF-8 byte-order mark (U+FEFF) before a note's front matter is not part of the note's text, so
 * the one note parser (`parseOwnership`, read by `parseNote` and every note edit) frames the front matter exactly as
 * without the mark; the mark itself stays in the file. Made-up data only.
 */
import { describe, expect, it } from 'vitest';
import { applyChanges } from './note-edit';
import { parseNote } from './note-format';
import { parseOwnership } from './ownership-format';
import type { Change, EditEntry } from './run-manifest';

const BOM = '\ufeff';
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
const person = (eol: string): string =>
  ['---', "summary: Alex's garden plot.", 'status: active', 'tags: [home, garden]', 'planted: 2026-03-14', '---', 'Alex keeps a planting diary.', '', 'See [[Water butt]].', ''].join(eol);
const bower = (eol: string): string => ['---', 'summary: Lease', 'by: bower', '---', 'Notes.', ''].join(eol);
const append: Change = { kind: 'timeline-append', recordIds: ['2026-10-06T08-00-00.000Z-merge01'], entries: [{ date: '2026-10-06', text: 'Merged Lease draft', source: 'Lease draft' } satisfies EditEntry] };

describe('bom-front-matter: front matter after a byte-order mark', () => {
  it('AC1 bom-front-matter-note: the note page reads the same summary, details, tags, status and body as without the mark', () => {
    for (const eol of ['\n', '\r\n']) {
      const plain = parseNote('Areas/Home/Garden plot.md', person(eol));
      const marked = parseNote('Areas/Home/Garden plot.md', `${BOM}${person(eol)}`);
      expect.soft(marked, `eol=${JSON.stringify(eol)}`).toEqual(plain);
      // The control: without the mark the front matter is read (summary and body), so the comparison is meaningful.
      expect(plain.summary).toBe("Alex's garden plot.");
      expect(plain.body).toBe('Alex keeps a planting diary.\n\nSee [[Water butt]].');
    }
  });

  it('AC1 bom-front-matter-bower: a note whose front matter says by: bower is Bower\'s with or without the mark', () => {
    for (const eol of ['\n', '\r\n']) {
      expect.soft(parseNote('Lease.md', `${BOM}${bower(eol)}`).byBower, `eol=${JSON.stringify(eol)}`).toBe(true);
    }
  });

  it('AC2 bom-front-matter-spans: the parser frames the front matter and the body three bytes later, the mark outside both', () => {
    for (const eol of ['\n', '\r\n']) {
      const text = `${BOM}${person(eol)}`;
      const bytes = enc(text);
      const plain = parseOwnership(enc(person(eol)));
      const marked = parseOwnership(bytes);
      expect.soft(marked.status, `eol=${JSON.stringify(eol)}`).toBe(plain.status);
      if (marked.status === 'invalid' || plain.status === 'invalid' || !plain.layout.front) continue;
      expect.soft(marked.layout.front).toEqual({ start: plain.layout.front.start + 3, end: plain.layout.front.end + 3 });
      expect.soft(marked.layout.frontEnd).toBe(plain.layout.frontEnd + 3);
      if ('personal' in marked && 'personal' in plain && marked.personal && plain.personal) {
        expect.soft(dec(bytes.subarray(marked.personal.start, marked.personal.end))).toBe(dec(enc(person(eol)).subarray(plain.personal.start, plain.personal.end)));
      }
    }
  });

  it('AC3 bom-front-matter-region: a rules note with front matter, its own text and Bower\'s region shows only its own text', () => {
    const region = ['## Rules added in Bower', '<!-- bower:ownership/2 begin rules-added -->', '## Rules', '', '- Keep receipts together. <!-- since 2026-10-13 -->', '<!-- bower:ownership/2 end rules-added -->', ''];
    for (const eol of ['\n', '\r\n']) {
      const text = [`${BOM}---`, 'summary: mine', '---', 'Alex keeps paper letters for a year.', '', ...region].join(eol);
      const note = parseNote('Rules.md', text);
      expect.soft(note.body, `eol=${JSON.stringify(eol)}`).toBe('Alex keeps paper letters for a year.');
      expect.soft(note.summary).toBe('mine');
    }
  });

  it('AC4 bom-front-matter-write: Bower\'s edit of its own note keeps the mark and makes the same change as without it', () => {
    for (const eol of ['\n', '\r\n']) {
      const plain = applyChanges(enc(bower(eol)), [append]);
      expect(plain.ok, 'the control: the note without the mark takes the line').toBe(true);
      const marked = applyChanges(enc(`${BOM}${bower(eol)}`), [append]);
      expect.soft(marked, `eol=${JSON.stringify(eol)}`).toEqual(plain.ok ? { ok: true, text: `${BOM}${plain.text}`, bytes: enc(`${BOM}${plain.text}`) } : plain);
    }
  });

  it('R3 bom-front-matter-person-write: a person\'s marked note stays refused for Bower\'s edits, as without the mark', () => {
    expect(applyChanges(enc(`${BOM}${person('\n')}`), [append])).toEqual(applyChanges(enc(person('\n')), [append]));
  });

  it('R4 bom-front-matter-unchanged: a mark before plain text, an unterminated fence or a later rule keeps today\'s reading', () => {
    for (const text of ['Alex keeps a planting diary.\n', '---\nsummary: open\nwords\n', 'Intro.\n---\nmore\n']) {
      const plain = parseNote('Notes.md', text);
      const marked = parseNote('Notes.md', `${BOM}${text}`);
      expect.soft({ ...marked, body: marked.body.replace(/^\ufeff/, '') }, JSON.stringify(text)).toEqual(plain);
      expect.soft(parseOwnership(enc(`${BOM}${text}`)).status).toBe(parseOwnership(enc(text)).status);
    }
  });
});
