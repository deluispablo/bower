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
    ['an unindented begin marker', `${BODY}\n<!-- bower:ownership/2 begin personal -->`],
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

  it.each([
    ['a fenced heading and marker', `${BODY}\n\n\`\`\`markdown\n## My notes\n<!-- bower:ownership/2 end document -->\n\`\`\``],
    ['a quoted heading', `${BODY}\n\n> ## Timeline`], ['an indented heading', `${BODY}\n\n    ## Current state`],
    ['an escaped marker', `${BODY}\n\n\\<!-- bower:ownership/2 end document -->`], ['an escaped heading', `${BODY}\n\n\\## My notes`],
    ['a heading of another level', `${BODY}\n\n### Timeline`],
    ['an indented marker', `${BODY}\n\n    <!-- bower:ownership/2 end document -->`],
  ])('AC5 c08-document-format-example-text: a body with %s is ordinary text, written and read back whole', (_name, body) => {
    const text = serializeNote(document(body));
    expect(span(text, 'document')).toBe(`${body}\n`);
    expect(parseNote('Shortlist comparison.md', text).body).toBe(`${body}\n\n## My notes\n`);
  });

  it('AC3 c08-document-format-personal-headings: personal Document, Current state and Timeline headings keep their text and task ownership', () => {
    const mine = '## Document\nMy own reading.\n- [ ] Mine one\n## Current state\n- [ ] Mine two\n## Timeline\nMy dates.\n```md\n## Timeline\n- [ ] Example\n```\n- [ ] Mine three\n';
    const text = EXPECTED.replace(frame('personal', '## My notes\n\n'), frame('personal', `## My notes\n\n${mine}`)).replace(`${BODY}\n`, `${BODY}\n- [ ] Bower's step\n`);
    const note = parseNote('Shortlist comparison.md', text);
    expect(note.body).toBe(`${BODY}\n- [ ] Bower's step\n\n## My notes\n${mine.trimEnd()}`);
    expect(note.timeline.map((t) => t.text)).toEqual(['Written for a request you made.']);
    // The display counts every checkbox line, a fenced example too; only a real one in My notes is the person's.
    expect(note.taskRegions).toEqual(['bower', 'personal', 'personal', 'bower', 'personal']);
    for (const index of [0, 3]) expect(() => toggleTaskInText(text, index)).toThrow('Bower keeps this line unchanged.');
    for (const [index, label] of [[1, 'Mine one'], [2, 'Mine two'], [4, 'Mine three']] as const) {
      expect(toggleTaskInText(text, index).text, label).toBe(text.replace(`- [ ] ${label}`, `- [x] ${label}`));
    }
    expect(() => toggleTaskInText(text, 5)).toThrow();
  });

  it('AC4 c08-document-format-task-regions: displayed taskRegions follow mixed tasks, fenced examples and empty labels', () => {
    const body = `${BODY}\n\n- [ ] Bower one\n- [ ]   \n\`\`\`\n- [ ] Example\n\`\`\`\n- [x] Bower two`;
    const mine = '## My notes\n\n- [ ]   \n```\n- [ ] Example\n```\n- [ ] Mine\n';
    const text = serializeNote(document(body)).replace(frame('personal', '## My notes\n\n'), frame('personal', mine));
    expect(parseNote('Shortlist comparison.md', text).taskRegions).toEqual(['bower', 'bower', 'bower', 'bower', 'bower', 'bower', 'personal']);
    expect(() => toggleTaskInText(text, 0)).toThrow('Bower keeps this line unchanged.');
    expect(toggleTaskInText(text, 6).text).toBe(text.replace('- [ ] Mine', '- [x] Mine'));
  });

  it.each([
    ['whitespace', '  \n\n  Lead and trail  \n\n\n'], ['CRLF', 'First line\r\nSecond line\r\n\r\n| a | b |\r\n'],
    ['literal headings', '```\n## My notes\n## Timeline\n```\n   ## Document'], ['tabs and trailing spaces', '\tIndented\t \nTrailing   '],
  ])('AC1 c08-document-format-verbatim: a %s body is written byte for byte', (_name, body) => {
    expect(span(serializeNote(document(body)), 'document')).toBe(`${body}\n`);
  });

  it('AC2 c08-document-format-independent-regions: a document inside a project, and goal regions inside a document, are damaged', () => {
    const goal = '<!-- bower:ownership/2 begin goal -->\n## Goal\n\n<!-- bower:ownership/2 end goal -->\n';
    const nextSteps = '<!-- bower:ownership/2 begin next-steps -->\n## Next steps\n\n<!-- bower:ownership/2 end next-steps -->\n';
    const project = EXPECTED.replace(frame('document', `${BODY}\n`), `${goal}\n${nextSteps}\n${frame('document', `${BODY}\n`)}`);
    const documented = EXPECTED.replace(frame('document', `${BODY}\n`), `${frame('document', `${BODY}\n`)}\n${goal}\n${nextSteps}`);
    expect(parseOwnership(new TextEncoder().encode(project)).status).toBe('invalid');
    expect(parseOwnership(new TextEncoder().encode(documented)).status).toBe('invalid');
    expect(parseOwnership(new TextEncoder().encode(EXPECTED)).status, 'the plain twin').toBe('v2');
  });
});
