/** C08 document format: a request document is a Bower template note whose framed `document` region leads (c08-document-format AC1-AC6). */
import { describe, expect, it } from 'vitest';
import { bowerNoteRole, parseNote, serializeNote, toggleTaskInText, typeRowOk, type NoteFile } from './note-format';
import type { NoteTemplate } from './note-templates';
import { parseOwnership } from './ownership-format';

/** The template this task adds; widened through string so the file typechecks before it exists. */
const DOCUMENT = 'document' as string as NoteTemplate;
const BODY = [
  '# Shortlist comparison', '',
  'Cobble Row offers a shorter commute, while Larkspur Lane has the lower rent.', '',
  '| Flat | Rent | Commute | Deposit | Status |', '| --- | --- | --- | --- | --- |',
  '| [[Larkspur Lane flat]] | 1,450 a month | 24 min | 1,450 | viewing done |',
  '| [[Cobble Row flat]] | 1,580 a month | 18 min | Not stated | viewing booked |', '',
  '## Sources', '', '- [[Larkspur Lane flat]]', '- [[Cobble Row flat]]',
].join('\n');
const SUMMARY = 'Cobble Row has the shorter commute; its deposit is not stated.';
const document = (body = BODY): NoteFile => ({ template: DOCUMENT, byBower: true, summary: SUMMARY, tags: [], currentState: [], body,
  properties: [{ key: 'created', label: 'Created', value: '2026-10-16' }, { key: 'updated', label: 'Updated', value: '2026-10-16' }],
  timeline: [{ date: '2026-10-16', text: 'Written for a request you made.' }] });
/** The exact bytes Design notes give: front matter, the leading document region, then the four owner regions. */
const frame = (owner: string, text: string): string => `<!-- bower:ownership/2 begin ${owner} -->\n${text}<!-- bower:ownership/2 end ${owner} -->\n`;
const EXPECTED = ['---', `summary: ${SUMMARY}`, 'status: active', 'tags: []', 'by: bower', 'created: "2026-10-16"', 'updated: "2026-10-16"',
  'type: document', 'bower_format: ownership/2', 'bower_template: document', '---', '',
  frame('document', `${BODY}\n`), frame('current', ''), frame('personal', '## My notes\n\n'),
  frame('timeline', '## Timeline\n- 2026-10-16 · Written for a request you made.\n'), frame('bower-note', '')].join('\n');
const PLANS = '## My plans\n\nAlex wants to visit Cobble Row in daylight before choosing.\n- [ ] Ask about the deposit\n';
const withPlans = (text: string): string => text.replace(frame('personal', '## My notes\n\n'), frame('personal', `## My notes\n\n${PLANS}`));
const span = (text: string, region: string): string | null => {
  const bytes = new TextEncoder().encode(text);
  const own = parseOwnership(bytes);
  const at = own.status === 'invalid' ? undefined : (own.payloads as Record<string, { start: number; end: number }> | undefined)?.[region];
  return at ? new TextDecoder().decode(bytes.subarray(at.start, at.end)) : null;
};
const written = (): string => {
  try { return serializeNote(document()); } catch (error) { return `not written: ${String(error)}`; }
};

describe('c08-document-format', () => {
  it('AC1 c08-document-format-bytes: a document serializes to the exact bytes, with no source or related property', () => {
    expect(written()).toBe(EXPECTED);
  });

  it('AC2 c08-document-format-regions: the document region leads; My notes is the person\'s region; the Timeline follows', () => {
    const text = withPlans(EXPECTED);
    expect(parseOwnership(new TextEncoder().encode(text)).status).toBe('v2');
    expect(span(text, 'document')).toBe(`${BODY}\n`);
    expect(span(text, 'personal')).toBe(`## My notes\n\n${PLANS}`);
    expect(span(text, 'timeline')).toBe('## Timeline\n- 2026-10-16 · Written for a request you made.\n');
  });

  it('AC3 c08-document-format-projection: the app reads the document first, then My notes; it is Bower\'s, typed document', () => {
    const note = parseNote('Projects/Flat hunt/Shortlist comparison.md', EXPECTED);
    expect(note.body).toBe(`${BODY}\n\n## My notes\n`);
    expect(note.byBower).toBe(true);
    expect(note.properties.find((p) => p.key === 'type')?.value).toBe('document');
    expect(note.timeline.map((t) => t.text)).toEqual(['Written for a request you made.']);
    expect(bowerNoteRole(EXPECTED)).toBe('document');
  });

  it('AC4 c08-document-format-tasks: a task in My notes is the person\'s to tick; one in the document region is Bower\'s', () => {
    const text = withPlans(EXPECTED).replace(`${BODY}\n`, `${BODY}\n- [ ] Bower's own step\n`);
    let ticked: string;
    try { ticked = toggleTaskInText(text, 1).text; } catch (error) { ticked = String(error); }
    expect(ticked).toBe(text.replace('- [ ] Ask about the deposit', '- [x] Ask about the deposit'));
    expect(() => toggleTaskInText(text, 0)).toThrow('Bower keeps this line unchanged.');
  });

  it.each([
    ['a My notes heading', `${BODY}\n\n## My notes\nmine`], ['a Timeline heading', `${BODY}\n\n## Timeline\n- 2026-10-16 · Done.`],
    ['a Current state heading', `${BODY}\n\n## Current state\n- open`], ['an ownership marker', `${BODY}\n<!-- bower:ownership/2 end document -->`],
  ])('AC5 c08-document-format-unsafe-body: a body with %s is not written, beside the valid twin that is', (_name, body) => {
    expect(written(), 'the valid twin').toBe(EXPECTED);
    expect(() => serializeNote(document(body))).toThrow('Bower could not write this note safely.');
  });

  it('AC6 c08-document-format-reserved: a new type row may not declare the document template; a stored one still reads', () => {
    const row = { id: 'report', match: ['report'], template: 'document', properties: {}, table: [] };
    expect(typeRowOk(row)).toBe(false);
    expect(typeRowOk({ ...row, template: 'concept' }), 'the twin').toBe(true);
    expect(typeRowOk(row, true), 'stored rows stay lenient').toBe(true);
  });

  it('AC2 c08-document-format-leading-only: a document region after the Timeline is a damaged note, beside the leading twin', () => {
    const moved = EXPECTED.replace(frame('document', `${BODY}\n`) + '\n', '') + '\n' + frame('document', `${BODY}\n`);
    expect(parseOwnership(new TextEncoder().encode(EXPECTED)).status, 'the leading twin').toBe('v2');
    expect(parseOwnership(new TextEncoder().encode(moved)).status).toBe('invalid');
  });
});
