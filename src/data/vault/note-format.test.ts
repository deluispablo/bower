import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as summaryFormat from '../contracts/note-format';
import type { NoteFile } from '../contracts/note-format';
import { NOTES } from '../demo/notes';
import { BowerError } from '../types';
import { noteRefusal, parseNote, serializeNote, toggleTaskInText } from './note-format';
import { applyChanges } from '../contracts/note-edit';
import type { Change } from '../contracts/run-manifest';
import { resolverFor } from '../../features/note/resolve';

// Explicit creation intent keeps the legacy serializer readable without templating stored notes on a read.
type B6Template = 'source' | 'concept' | 'project' | 'area' | 'moc';
const b6Note = (template: B6Template): NoteFile & { template: B6Template } => ({
  template, byBower: true, summary: 'Alex records grounded gardening facts.', status: template === 'moc' ? 'evergreen' : 'active',
  tags: ['gardening'], properties: [
    { key: 'type', label: 'Type', value: template },
    { key: 'created', label: 'Created', value: '2026-10-10' },
    { key: 'updated', label: 'Updated', value: '2026-10-10' },
    { key: 'source', label: 'Source', value: 'Garden bulletin' },
    { key: 'related', label: 'Related', value: 'Gardening', link: 'Gardening' },
  ], original: template === 'source' ? 'Garden bulletin.txt' : undefined,
  currentState: ['Alex grows mint.'], body: 'Alex grows mint. See [[Gardening]].',
  timeline: [{ date: '2026-10-10', text: 'Alex saved the bulletin.', source: 'Garden bulletin' }],
});
const b6FormatControl = (): void => {
  const raw = serializeNote(summaryNote('Alex grows mint.'));
  expect(parseNote('Legacy.md', raw).body).toBe('Alex keeps these words.');
  expect(parseNote('Legacy.md', raw).byBower).toBe(true);
};

it('B6a fix 1: populated Project Area and MOC sections survive into the app display model', () => {
  const cases: { template: B6Template; sections: [string, string][] }[] = [
    { template: 'project', sections: [
      ['Goal', 'Alex grows enough mint for tea.'], ['Next steps', '- [ ] Alex plants mint.'],
      ['Current state', '- Alex has a pot.'], ['Notes', 'Alex keeps the pot indoors.'],
      ['Timeline', '- 10 Oct · Alex started the project.'],
    ] },
    { template: 'area', sections: [
      ['Standard to maintain', 'Alex keeps the mint watered.'], ['Current state', '- Alex checks the soil.'],
      ['Notes', 'Alex waters in the morning.'], ['Timeline', '- 10 Oct · Alex checked the mint.'],
    ] },
    { template: 'moc', sections: [
      ['Overview', 'Alex collects gardening ideas here.'], ['Notes', 'Read [[Gardening]] for mint care.'],
      ['Sources', 'Alex saved the garden bulletin.'],
    ] },
  ];
  for (const { template, sections } of cases) {
    const raw = serializeNote({ ...b6Note(template), body: sections.map(([heading, text]) => `## ${heading}\n${text}`).join('\n\n') });
    const note = parseNote('Gardening.md', raw);
    // NoteScreen renders body, currentState and timeline; raw ownership payloads alone are not display evidence.
    const display = [note.body, ...note.currentState, ...note.timeline.map((entry) => entry.text)].join('\n');
    for (const [heading, text] of sections) {
      expect(raw, `${template}: ${heading} is populated on disk`).toContain(text);
      const visible = heading === 'Current state' ? text.replace(/^- /, '')
        : heading === 'Timeline' ? text.split(' · ')[1] ?? text : text;
      expect.soft(display, `${template}: ${heading} must be visible in NoteScreen's model`).toContain(visible);
    }
  }
});

it('B6a fix 1: quoted tags and Original filenames round-trip and resolve for template and legacy notes', () => {
  const filename = 'Garden "mint".txt';
  const path = `Resources/Gardening/${filename}`;
  const resolve = resolverFor([{ type: 'file', name: filename, path, created: 0, modified: 0 }], []);
  expect(resolve(filename), 'The real Original resolver accepts the actual filename').toBe(path);
  const source = { ...b6Note('source'), tags: ['2026', 'on'], original: filename };
  const legacy: NoteFile = { ...source, template: undefined };
  for (const [kind, input] of [['template', source], ['legacy', legacy]] as const) {
    const note = parseNote('Garden source.md', serializeNote(input));
    expect.soft(note.tags, `${kind}: tags preserve their exact string values`).toEqual(['2026', 'on']);
    expect.soft(note.original, `${kind}: the filename decodes escaped quotes`).toBe(filename);
    // NoteScreen passes note.original directly to this resolver for its Original property link.
    expect.soft(resolve(note.original ?? ''), `${kind}: Original still opens the filed file`).toBe(path);
  }
});
const b6Shapes: { template: B6Template; sections: string[] }[] = [
  { template: 'source', sections: ['Summary', 'Key points', 'Related', 'Transcript'] },
  { template: 'concept', sections: ['Current state', 'Notes', 'Related', 'Timeline'] },
  { template: 'project', sections: ['Goal', 'Next steps', 'Current state', 'Notes', 'Timeline'] },
  { template: 'area', sections: ['Standard to maintain', 'Current state', 'Notes', 'Timeline'] },
  { template: 'moc', sections: ['Overview', 'Notes', 'Sources'] },
];
it.each(b6Shapes)('B6a templates: b6-five-template-shapes serializes $template through note-format', ({ template, sections }) => {
  b6FormatControl();
  const raw = serializeNote(b6Note(template));
  const parsed = parseNote('Gardening.md', raw);
  expect(parsed).toMatchObject({ byBower: true, summary: 'Alex records grounded gardening facts.', tags: ['gardening'] });
  for (const key of ['type', 'created', 'updated', 'source', 'related']) {
    expect(parsed.properties.some((p) => p.key === key), key).toBe(true);
  }
  expect(parsed.summary.length).toBeLessThanOrEqual(200);
  expect(parsed.tags.length).toBeLessThanOrEqual(3);
  expect(raw.match(/^## .+$/gm)).toEqual(sections.map((section) => `## ${section}`));
  if (template === 'moc') {
    expect(parsed.status).toBe('evergreen');
    for (const region of ['moc-overview', 'moc-figures', 'moc-members']) {
      expect(raw).toContain(`<!-- bower:ownership/2 begin ${region} -->`);
      expect(raw).toContain(`<!-- bower:ownership/2 end ${region} -->`);
    }
  }
  if (template === 'project') expect(raw).not.toMatch(/^due:/m);
});

it('B6a templates: b6-source-absent-url omits missing url and creates Source without a generic Timeline', () => {
  b6FormatControl();
  const absent = serializeNote(b6Note('source'));
  expect(absent).toContain('original: Garden bulletin.txt');
  expect(absent).not.toMatch(/^url:/m);
  expect(absent).not.toMatch(/https?:\/\//);
  const supplied = b6Note('source');
  supplied.properties.push({ key: 'url', label: 'Url', value: 'https://example.com/garden' });
  const present = serializeNote(supplied);
  expect(parseNote('Source.md', present).properties.find((p) => p.key === 'url')?.value).toBe('https://example.com/garden');
  expect(absent).not.toContain('## Timeline');
  expect(absent).not.toContain('## Current state');
});

it.each(['source', 'moc'])('B6a templates: legacy %s note with a Timeline stays readable and unrewritten', (type) => {
  b6FormatControl();
  const raw = `---\nsummary: Alex keeps old gardening history.\nby: bower\ntype: ${type}\n---\n\nOld words with [[Gardening]].\n\n## Timeline\n- 2 Oct · Saved the old bulletin. · [[Garden bulletin]]\n`;
  const parsed = parseNote('Legacy.md', raw);
  expect(parsed.timeline).toEqual([{ date: '2 Oct', text: 'Saved the old bulletin.', source: 'Garden bulletin' }]);
  expect(parsed.body).toBe('Old words with [[Gardening]].');
  expect(serializeNote(parsed)).toBe(raw);
});

it.each([
  { point: 'a 201-character summary', summary: 'x'.repeat(201), tags: ['gardening'] },
  { point: 'a multiline summary', summary: 'Alex grows mint.\nAlex grows thyme.', tags: ['gardening'] },
  { point: 'four tags', summary: 'Alex grows mint.', tags: ['gardening', 'mint', 'herbs', 'reference'] },
])('B6a templates: b6-five-template-shapes refuses $point on an explicit template write', ({ summary, tags }) => {
  b6FormatControl();
  const control = b6Note('concept');
  control.summary = 'x'.repeat(200);
  control.tags = ['gardening', 'mint', 'herbs'];
  expect(() => serializeNote(control)).not.toThrow();
  const note = b6Note('concept');
  note.summary = summary;
  note.tags = tags;
  expect(() => serializeNote(note), 'Explicit template creation uses the shared strict metadata bounds').toThrow(BowerError);
});

// B2a: YAML 1.2.2 §§5.7, 7.3.1–7.3.3. Exact scalar fixtures are independent of the reader/writer.
// https://yaml.org/spec/1.2.2/#73-flow-scalar-styles
const summaryNote = (summary: string, byBower = true): NoteFile => ({
  summary, byBower, properties: [], tags: [], currentState: [], timeline: [], body: 'Alex keeps these words.',
});
const summaryRaw = (scalar: string): string => `---\nsummary: ${scalar}\nby: bower\n---\nAlex keeps these words.\n`;
const summaryBytes = (summary: string): Uint8Array => new TextEncoder().encode(summary);
const summaryControl = (): void => {
  const summary = 'Alex keeps a gardening note.';
  const raw = serializeNote(summaryNote(summary));
  expect(raw.split('\n')[1]).toBe(`summary: ${summary}`);
  expect(parseNote('Synthetic.md', raw).summary).toBe(summary);
};
// A new export must fail an assertion at HEAD, rather than fail module loading or TypeScript.
const summaryValidator = (): ((value: string) => unknown) => {
  const candidate: unknown = Reflect.get(summaryFormat, 'validSummary');
  expect(candidate, 'note-format must export validSummary').toBeTypeOf('function');
  return typeof candidate === 'function' ? candidate as (value: string) => unknown : () => false;
};

it('B5a contracts: declared projection keeps four ordered columns and retains other note properties', () => {
  summaryControl();
  const raw = '---\nby: bower\ntype: offer\nstatus: active\nsummary: An offer.\ntags: [career]\n'
    + 'created: 2026-10-10\nupdated: 2026-10-10\nsource: [[Alex CV]]\nrelated: [[Career]]\n'
    + 'hours: 32\nrole: Developer\nsalary: 48000 EUR\nposted: 2026-10-10\nstage: new\n---\nAlex keeps these words.\n';
  const note = parseNote('Resources/Offer.md', raw);
  expect(note.properties.find((property) => property.key === 'hours')?.value).toBe('32');
  const candidate: unknown = Reflect.get(summaryFormat, 'tableProperties');
  expect(candidate, 'note-format must export tableProperties').toBeTypeOf('function');
  const project = candidate as (value: typeof note, row: { table: string[] }) => typeof note.properties;
  const before = structuredClone(note);
  expect(project(note, { table: ['role', 'salary', 'posted', 'stage'] })).toEqual(
    ['role', 'salary', 'posted', 'stage'].map((key) => note.properties.find((property) => property.key === key)),
  );
  expect(project(note, { table: ['hours', 'role'] }).map((property) => property.key)).toEqual(['hours', 'role']);
  expect(note).toEqual(before);
  expect(note.body).toBe('Alex keeps these words.');
});

// Quote every casing, including mixed case, for consumers using either YAML schema.
const yaml11SummaryValues = [
  ...['yes', 'no', 'on', 'off', 'y', 'n'].flatMap((value) =>
    Array.from({ length: 2 ** value.length }, (_, mask) => [...value]
      .map((letter, index) => mask & (1 << index) ? letter.toUpperCase() : letter).join(''))),
  '0b11', '1_000', '12:30', '0o17',
];

const summaryQuotingRows: { point: string; value: string; scalar: string }[] = [
  { point: 'colon-space', value: 'Mulch: collection tomorrow.', scalar: '"Mulch: collection tomorrow."' },
  { point: 'space-hash', value: 'Collection at #amber.', scalar: '"Collection at #amber."' },
  { point: 'leading spaces', value: '  Alex keeps this.', scalar: '"  Alex keeps this."' },
  { point: 'trailing spaces', value: 'Alex keeps this.  ', scalar: '"Alex keeps this.  "' },
  { point: 'double quote', value: 'Alex said "keep it".', scalar: '"Alex said \\"keep it\\"."' },
  { point: 'single quote', value: "Alex's note.", scalar: '"Alex\'s note."' },
  { point: 'backslash', value: 'Keep \\notes\\today.', scalar: '"Keep \\\\notes\\\\today."' },
  ...[...'-?:,[]{}#&*!|>\'"%@`'].map((indicator) => ({
    point: `leading indicator ${indicator}`, value: `${indicator}Alex`, scalar: JSON.stringify(`${indicator}Alex`),
  })),
  ...['true', 'false', 'True', 'FALSE', 'null', 'Null', 'NULL', '~', '123', '-123', '+123', '1.5', '1e3',
    '0x1f', '0o17', '.inf', '-.inf', '.NaN', '2026-10-10'].map((value) => ({
    point: `typed-looking ${value}`, value, scalar: `"${value}"`,
  })),
  ...yaml11SummaryValues.map((value) => ({
    point: `YAML 1.1/1.2 string ${value}`, value, scalar: `"${value}"`,
  })),
];

it.each(summaryQuotingRows)('B2a summary: 1 $point: writes one escaped double-quoted scalar', ({ value, scalar }) => {
  summaryControl();
  const raw = serializeNote(summaryNote(value));
  expect(raw.split('\n').filter((line) => line.startsWith('summary:'))).toEqual([`summary: ${scalar}`]);
  expect(raw.split('\n').slice(0, 5)).toEqual(['---', `summary: ${scalar}`, 'by: bower', '---', '']);
  expect(summaryBytes(parseNote('Synthetic.md', raw).summary)).toEqual(summaryBytes(value));
});

it('B2a summary: 1 plain controls: keeps safe YAML text plain and unchanged', () => {
  for (const summary of ['Alex keeps a note.', 'café 日本語 🙂 e\u0301', 'time 12:30', 'amber#label',
    'inside [brackets], {braces}', 'https://example.com/path']) {
    const raw = serializeNote(summaryNote(summary));
    expect(raw.split('\n')[1]).toBe(`summary: ${summary}`);
    expect(parseNote('Synthetic.md', raw).summary).toBe(summary);
  }
});

const summaryDecodingRows = [
  { point: 'escaped double quote', scalar: '"Alex said \\"keep it\\"."', text: 'Alex said "keep it".' },
  { point: 'escaped backslash', scalar: '"Keep \\\\notes\\\\today."', text: 'Keep \\notes\\today.' },
  { point: 'doubled single quote', scalar: "'Alex''s note.'", text: "Alex's note." },
  { point: 'multiple doubled single quotes', scalar: "'''Alex'' keeps ''notes''.'", text: "'Alex' keeps 'notes'." },
  ...[
    ['0', '\0'], ['a', '\u0007'], ['b', '\b'], ['t', '\t'], ['n', '\n'], ['v', '\v'], ['f', '\f'],
    ['r', '\r'], ['e', '\u001b'], [' ', ' '], ['/', '/'], ['N', '\u0085'], ['_', '\u00a0'],
    ['L', '\u2028'], ['P', '\u2029'], ['x41', 'A'], ['u03A9', 'Ω'], ['U0001F642', '🙂'],
  ].map(([escape, text]) => ({ point: `YAML escape ${escape}`, scalar: `"before\\${escape}after"`, text: `before${text}after` })),
];

it.each(summaryDecodingRows)('B2a summary: 2 $point: decodes quoted text exactly', ({ scalar, text }) => {
  summaryControl();
  expect(parseNote('Synthetic.md', summaryRaw('"Alex keeps a note."')).summary).toBe('Alex keeps a note.');
  expect(parseNote('Synthetic.md', summaryRaw("'Alex keeps a note.'")).summary).toBe('Alex keeps a note.');
  expect(summaryBytes(parseNote('Synthetic.md', summaryRaw(scalar)).summary)).toEqual(summaryBytes(text));
});

it('B2a summary: 2 legacy fixtures: keeps old parsed summary bytes and personal text', () => {
  summaryControl();
  // Frozen source shapes from the pre-entry note-format tests, plus the old plain reader's type/comment cases.
  const fixtures = [
    { raw: '# Loose\n\nSome thoughts about [[Lemon tart]].\n- [ ] try it', text: '', body: '# Loose\n\nSome thoughts about [[Lemon tart]].\n- [ ] try it' },
    { raw: '---\nsummary: "A note: with a colon"\ntags:\n  - flat\n  - shortlist\nagent: \'Kittiwake Lettings\'\n---\nbody', text: 'A note: with a colon', body: 'body' },
    { raw: '---\nsummary: s\nagent: [[Kittiwake Lettings]]\n---\nbody', text: 's', body: 'body' },
    { raw: '---\r\nsummary: Legacy café 🪶\r\nby: bower\r\n---\r\nbody', text: 'Legacy café 🪶', body: 'body' },
    ...['true', 'null', '123', 'a # comment stays', 'x: y', '"unfinished', "'unfinished", '"literal\\q"'].map((scalar) => ({
      raw: summaryRaw(scalar), text: scalar === '"literal\\q"' ? 'literal\\q' : scalar, body: 'Alex keeps these words.',
    })),
  ];
  for (const { raw, text, body } of fixtures) {
    const parsed = parseNote('Synthetic.md', raw);
    expect(summaryBytes(parsed.summary)).toEqual(summaryBytes(text));
    expect(parsed.body).toBe(body);
  }
  for (const [path, seed] of Object.entries(NOTES)) {
    expect(summaryBytes(parseNote(path, serializeNote({ ...seed, byBower: true })).summary)).toEqual(summaryBytes(seed.summary));
  }
});

const legacyPlainSummaryRows = [
  { point: 'literal Unicode escape', scalar: 'a\\u0041b' },
  { point: 'literal doubled apostrophe', scalar: "Alex''s note." },
];
it.each(legacyPlainSummaryRows)('B2a summary: 2 legacy $point: plain values parse exactly as before', ({ scalar }) => {
  summaryControl();
  expect(parseNote('Synthetic.md', summaryRaw(scalar)).summary).toBe(scalar);
});

const storedQuotedSummaryRows = [
  { point: 'recognized Unicode escape', scalar: '"a\\u0041b"', text: 'aAb' },
  { point: 'doubled apostrophe', scalar: "'Alex''s note.'", text: "Alex's note." },
];
const untouchedSummaryRaw = (scalar: string): string =>
  ['---', `summary: ${scalar}`, '---', '', 'Alex keeps these words.', ''].join('\n');

it.each(storedQuotedSummaryRows)('B2a summary: 2 person note $point: untouched round trip keeps note bytes', ({ scalar, text }) => {
  summaryControl();
  for (const control of ['Alex keeps a note.', '"A note: with a colon"']) {
    const raw = untouchedSummaryRaw(control);
    const parsed = parseNote('Personal.md', raw);
    expect(parsed.byBower).toBe(false);
    expect(summaryBytes(serializeNote(parsed))).toEqual(summaryBytes(raw));
  }
  const raw = untouchedSummaryRaw(scalar);
  const parsed = parseNote('Personal.md', raw);
  expect(parsed.byBower).toBe(false);
  // Quoted reads decode per YAML; an untouched person's note retains its stored bytes.
  // The packet owns the serializer boundary, with existing-note edits outside this entry.
  expect(parsed.summary).toBe(text);
  expect(summaryBytes(serializeNote(parsed))).toEqual(summaryBytes(raw));
});

const quotedSummaryLineBreakRows = [
  ['NEL', '\u0085'], ['line separator', '\u2028'], ['paragraph separator', '\u2029'],
].flatMap(([point, lineBreak]) => ['"', "'"].map((quote) => ({
  point: `${point} ${quote === '"' ? 'double' : 'single'} quotes`,
  scalar: `${quote}a${lineBreak}b${quote}`, text: `a${lineBreak}b`,
})));

it.each(quotedSummaryLineBreakRows)('B2a summary: 2 existing $point: reads text without surrounding quotes', ({ scalar, text }) => {
  summaryControl();
  expect(parseNote('Synthetic.md', summaryRaw('"aAb"')).summary).toBe('aAb');
  expect(parseNote('Synthetic.md', summaryRaw("'aAb'")).summary).toBe('aAb');
  // Stored text remains readable even though one-line validation refuses it for new writes.
  expect(parseNote('Synthetic.md', summaryRaw(scalar)).summary).toBe(text);
  const validSummary = summaryValidator();
  expect(validSummary('aAb')).toBe(true);
  expect(validSummary(text)).toBe(false);
});

it('B2a summary: 3 generated one-line strings: round-trips exact text within 200 characters', () => {
  summaryControl();
  const glyph = fc.oneof(
    fc.integer({ min: 0x20, max: 0x7e }).map((code) => String.fromCodePoint(code)),
    fc.constantFrom('é', '日', 'Ω', '🙂', '🪶', '\u0301', '\u00a0'),
  );
  const generated = fc.sample(fc.array(glyph, { maxLength: 100 }).map((parts) => parts.join('')), { seed: 422003, numRuns: 500 });
  const examples = [...generated, '', 'Mulch: collection at #amber.', 'Alex said "keep \\notes".', '  café 日本語 🙂 e\u0301  ',
    'x'.repeat(200), '🙂'.repeat(100), ' '.repeat(200)];
  for (const summary of examples) {
    expect(summary.length).toBeLessThanOrEqual(200);
    const raw = serializeNote(summaryNote(summary));
    expect(parseNote('Synthetic.md', raw).summary, JSON.stringify(summary)).toBe(summary);
  }
});

it('B2a summary: 3 generated lone surrogates: validSummary refuses ill-formed UTF-16', () => {
  summaryControl();
  const validSummary = summaryValidator();
  const surrounding = fc.array(fc.constantFrom('a', 'é', '日', '🙂', '\u0301'), { maxLength: 40 });
  const generated = fc.sample(fc.tuple(surrounding, fc.integer({ min: 0xd800, max: 0xdfff }), surrounding),
    { seed: 422004, numRuns: 500 });
  for (const [before, code, after] of generated) {
    const control = `${before.join('')}🙂${after.join('')}`;
    expect(validSummary(control)).toBe(true);
    expect(parseNote('Synthetic.md', serializeNote(summaryNote(control))).summary).toBe(control);
    const summary = `${before.join('')}${String.fromCharCode(code)}${after.join('')}`;
    expect(summary.length).toBeLessThanOrEqual(200);
    expect(validSummary(summary), JSON.stringify(summary)).toBe(false);
  }
});

const summaryAcceptRows = [
  { point: 'ordinary text', value: 'Alex keeps a note.' },
  { point: 'Unicode and emoji', value: 'café 日本語 🙂 e\u0301' },
  { point: 'YAML punctuation', value: 'Mulch: #amber; "keep" \\notes.' },
  { point: 'edge spaces', value: '  Alex keeps this.  ' },
  { point: '200-character bound', value: 'x'.repeat(200) },
  { point: 'bound counts untrimmed text', value: ` ${'x'.repeat(198)} ` },
  { point: 'Unicode at existing string bound', value: '🙂'.repeat(100) },
];
it.each(summaryAcceptRows)('B2a summary: 4 $point: validSummary accepts valid one-line text', ({ value }) => {
  summaryControl();
  const validSummary = summaryValidator();
  expect(validSummary('Alex keeps a note.')).toBe(true);
  expect(validSummary(value)).toBe(true);
  expect(parseNote('Synthetic.md', serializeNote(summaryNote(value))).summary).toBe(value);
});

const summaryRefuseRows = [
  { point: 'empty', value: '' }, { point: 'only spaces', value: '   ' }, { point: 'only nonbreaking spaces', value: '\u00a0\u00a0' },
  { point: '201-character bound', value: 'x'.repeat(201) },
  { point: 'over bound before trimming', value: ` ${'x'.repeat(199)} ` },
  { point: 'Unicode over existing string bound', value: '🙂'.repeat(101) },
  ...[0xd800, 0xdbff, 0xdc00, 0xdfff].map((code) => ({
    point: `lone surrogate U+${code.toString(16).toUpperCase()}`, value: `a${String.fromCharCode(code)}b`,
  })),
  ...[['LF', '\n'], ['CR', '\r'], ['CRLF', '\r\n'], ['NEL', '\u0085'], ['line separator', '\u2028'], ['paragraph separator', '\u2029']]
    .map(([point, lineBreak]) => ({ point: `${point} never folded`, value: `Alex${lineBreak}keeps a note.` })),
  ...Array.from({ length: 32 }, (_, code) => ({ point: `control U+${code.toString(16).padStart(4, '0')}`, value: `Alex${String.fromCharCode(code)}keeps a note.` })),
  ...Array.from({ length: 33 }, (_, index) => {
    const code = 0x7f + index;
    return { point: `control U+${code.toString(16).padStart(4, '0')}`, value: `Alex${String.fromCharCode(code)}keeps a note.` };
  }),
];
it.each(summaryRefuseRows)('B2a summary: 4 $point: validSummary refuses invalid text', ({ value }) => {
  summaryControl();
  const validSummary = summaryValidator();
  expect(validSummary('Alex keeps a note.')).toBe(true);
  expect(validSummary('x'.repeat(200))).toBe(true);
  expect(validSummary(value)).toBe(false);
});

it('B2a summary: 5 Q2 scope controls: preserves absent personal metadata and Rules count summary', () => {
  summaryControl();
  const personal = parseNote('Personal.md', '# My notes\nAlex keeps these words.');
  expect(personal).toMatchObject({ summary: '', byBower: false, properties: [], body: '# My notes\nAlex keeps these words.' });
  expect(serializeNote(personal)).not.toMatch(/^summary:/m);
  const withSummary = parseNote('Personal.md', '---\nsummary: Alex keeps this.\n---\nPersonal words.');
  expect(parseNote('Personal.md', serializeNote(withSummary))).toMatchObject({ summary: 'Alex keeps this.', byBower: false, body: 'Personal words.' });
  const rules = summaryNote('2 rules, 1 waiting.');
  expect(parseNote('Rules.md', serializeNote(rules)).summary).toBe('2 rules, 1 waiting.');
  expect(parseNote('Rules.md', serializeNote(summaryNote('My own rules.'))).summary).toBe('My own rules.');
  for (const path of ['.bower/index.md', '.bower/hot.md', '.bower/log.md']) {
    const raw = '# Generated view\nAlex keeps a note.\n';
    expect(parseNote(path, raw)).toMatchObject({ summary: '', byBower: false, properties: [], body: raw.trimEnd() });
  }
});

describe('the note file format', () => {
  it('round-trips every demo note', () => {
    for (const [path, seed] of Object.entries(NOTES)) {
      const { links: _seedLinks, title: _seedTitle, ...want } = seed;
      const { links: _links, title: _title, path: back, ...got } = parseNote(path, serializeNote({ ...seed, byBower: true }));
      expect(back).toBe(path);
      expect(got).toEqual({ ...want, byBower: true });
    }
  });

  it('keeps who wrote it', () => {
    const seed = Object.values(NOTES)[0];
    if (!seed) throw new Error('no notes');
    expect(parseNote('a.md', serializeNote({ ...seed, byBower: false })).byBower).toBe(false);
  });

  it('a note with no frontmatter is all body', () => {
    const n = parseNote('Resources/Ideas/Loose.md', '# Loose\n\nSome thoughts about [[Lemon tart]].\n- [ ] try it');
    expect(n.title).toBe('Loose');
    expect(n.body).toBe('# Loose\n\nSome thoughts about [[Lemon tart]].\n- [ ] try it');
    expect(n.summary).toBe('');
    expect(n.properties).toEqual([]);
    expect(n.currentState).toEqual([]);
    expect(n.timeline).toEqual([]);
    expect(n.byBower).toBe(false);
    expect(n.links).toEqual(['Lemon tart']);
  });

  it('a property [[link]] sets link', () => {
    const n = parseNote('x.md', '---\nsummary: s\nagent: [[Kittiwake Lettings]]\n---\nbody');
    expect(n.properties).toEqual([{ key: 'agent', label: 'Agent', value: 'Kittiwake Lettings', link: 'Kittiwake Lettings' }]);
  });

  it('labels come from the key, with a few named ones', () => {
    const n = parseNote('x.md', '---\nnext: 1 Mar\nmove_in: 1 Dec\n---\n');
    expect(n.properties.map((p) => p.label)).toEqual(['Next due', 'Move in']);
  });
});

describe('ticking a task', () => {
  const tasks = [
    { line: '- [ ] First task 🧭  ', label: 'First task 🧭  ', done: true },
    { line: '\t* [x] Second task — café', label: 'Second task — café', done: false },
    { line: '  12. [ ] Third task: 日本語', label: 'Third task: 日本語', done: true },
  ] as const;
  const personal = ['Intro café 🪶 e\u0301.', tasks[0].line, 'Prose [ ] stays verbatim.', tasks[1].line, tasks[2].line, 'Trailing spaces   '];
  const prefix = ['---', 'summary: "A café 🪶 note: keep this"', 'by: bower', 'custom:   spacing stays  ', '---', '', '## Current state', '- [ ] Protected current state', '- Bower maintained summary.', ''];
  const suffix = ['', '## Timeline', '- Today · [ ] Protected history · [[Another note]]', '', "## Bower's note", '- [ ] Protected Bower note', ''];
  const fixtures = (['LF', 'CRLF', 'mixed'] as const).flatMap((ending) => (['protected', 'plain'] as const).map((kind) => {
    const lines = kind === 'protected' ? [...prefix, ...personal, ...suffix] : ['\uFEFFPlain note 🪶', '', ...personal, 'Last prose without a final newline.'];
    const raw = lines.map((line, i) => line + (i === lines.length - 1 ? '' : ending === 'LF' ? '\n' : ending === 'CRLF' || i % 3 !== 1 ? '\r\n' : '\n')).join('');
    return { ending, kind, raw };
  }));

  it.each(fixtures)('toggling a personal task preserves every other source byte ($ending, $kind)', ({ raw }) => {
    for (const [index, task] of tasks.entries()) {
      const changed = task.line.replace(task.done ? '[ ]' : '[x]', task.done ? '[x]' : '[ ]');
      const expected = raw.replace(task.line, changed);
      const out = toggleTaskInText(raw, index);
      expect(out).toEqual({ text: expected, label: task.label, done: task.done });
      expect(new TextEncoder().encode(out.text)).toEqual(new TextEncoder().encode(expected));
      expect(toggleTaskInText(out.text, index)).toEqual({ text: raw, label: task.label, done: !task.done });
    }
  });

  it('toggling a personal task preserves every other source byte (missing task is refused)', () => {
    for (const { raw } of fixtures) {
      expect(() => toggleTaskInText(raw, tasks.length)).toThrow('That line is no longer in the note.');
      expect(() => toggleTaskInText(raw, -1)).toThrow('That line is no longer in the note.');
    }
  });

  it('toggling a personal task preserves every other source byte (protected checkboxes are refused)', () => {
    const raw = [...prefix, ...suffix].join('\r\n');
    expect(() => toggleTaskInText(raw, 0)).toThrow('That line is no longer in the note.');
  });

  it('toggling a personal task preserves every other source byte (identical labels select the requested checkbox)', () => {
    const before = `${prefix.join('\r\n')}\r\n- [ ] Repeat 🪶\r\n`;
    const after = suffix.join('\r\n');
    const raw = `${before}- [ ] Repeat 🪶${after}`;
    const out = toggleTaskInText(raw, 1);
    expect(out).toEqual({ text: `${before}- [x] Repeat 🪶${after}`, label: 'Repeat 🪶', done: true });
    expect(toggleTaskInText(out.text, 1).text).toBe(raw);
  });

  const text = serializeNote({
    summary: 's',
    properties: [],
    tags: [],
    currentState: ['- [ ] not a task here'],
    body: 'Intro\n\n- [ ] first\n- [x] second\n  - [ ] third',
    timeline: [{ date: '1 Oct', text: '- [ ] not this either' }],
    byBower: true,
  });

  it('toggleTaskInText flips only the n-th body task and returns its label', () => {
    const out = toggleTaskInText(text, 1);
    expect(out).toMatchObject({ label: 'second', done: false });
    const n = parseNote('x.md', out.text);
    expect(n.body).toBe('Intro\n\n- [ ] first\n- [ ] second\n  - [ ] third');
    expect(toggleTaskInText(text, 2)).toMatchObject({ label: 'third', done: true });
  });

  it('toggleTaskInText ignores tasks in Current state and Timeline', () => {
    const out = toggleTaskInText(text, 0);
    const n = parseNote('x.md', out.text);
    expect(n.currentState).toEqual(['- [ ] not a task here']);
    expect(n.timeline[0]?.text).toBe('- [ ] not this either');
    expect(n.body.startsWith('Intro\n\n- [x] first')).toBe(true);
  });

  it('a task index past the end is refused', () => {
    expect(() => toggleTaskInText(text, 9)).toThrow(/no longer/);
  });
});

describe('notes written elsewhere (Obsidian)', () => {
  it('reads block-list tags and quoted values', () => {
    const n = parseNote('x.md', '---\nsummary: "A note: with a colon"\ntags:\n  - flat\n  - shortlist\nagent: \'Kittiwake Lettings\'\n---\nbody');
    expect(n.summary).toBe('A note: with a colon');
    expect(n.tags).toEqual(['flat', 'shortlist']);
    expect(n.properties).toEqual([{ key: 'agent', label: 'Agent', value: 'Kittiwake Lettings' }]);
  });

  it('ticks a task in a numbered list, as the screen counts it', () => {
    const out = toggleTaskInText('---\nsummary: s\n---\n\n1. [ ] first\n2. [ ] second', 1);
    expect(out).toMatchObject({ label: 'second', done: true });
    expect(out.text).toContain('2. [x] second');
  });
});

describe('more YAML from elsewhere', () => {
  it('reads a list that is not indented', () => {
    expect(parseNote('x.md', '---\ntags:\n- flat\n- shortlist\n---\nbody').tags).toEqual(['flat', 'shortlist']);
  });
});


describe('protected sections retain prose and tasks outside the personal body', () => {
  const paragraph = 'Alex keeps café 🪶 notes here.  ';
  const personal = '## My notes\n- [ ] Personal task 🪶  ';
  const raw = [
    '---', 'bower_format: ownership/2', 'summary: Synthetic note', 'by: bower', 'contact: you@example.com', '---', '',
    '<!-- bower:ownership/2 begin current -->', '## Current state', paragraph, '', '- [ ] Protected task',
    '<!-- bower:ownership/2 end current -->', '<!-- bower:ownership/2 begin personal -->', personal,
    '<!-- bower:ownership/2 end personal -->', '<!-- bower:ownership/2 begin timeline -->', '## Timeline',
    '- 5 Oct · Protected history · [[Another note]]', '<!-- bower:ownership/2 end timeline -->',
    '<!-- bower:ownership/2 begin bower-note -->', "## Bower's note", 'Protected explanation.',
    '<!-- bower:ownership/2 end bower-note -->', '',
  ].join('\n');
  const fixtures = [
    { name: 'LF', source: raw },
    { name: 'CRLF', source: raw.replace(/\n/g, '\r\n') },
    { name: 'mixed endings', source: raw.split('\n').map((line, i, lines) => line + (i === lines.length - 1 ? '' : i % 2 ? '\r\n' : '\n')).join('') },
    { name: 'BOM', source: `\ufeff${raw}` },
  ];

  it.each(fixtures)('reads only the personal payload and derives protected display ($name)', ({ source }) => {
    const note = parseNote('Synthetic.md', source);
    expect(note.body).toBe(personal);
    expect(note.currentState).toEqual([paragraph, '[ ] Protected task']);
    expect(note.timeline).toEqual([{ date: '5 Oct', text: 'Protected history', source: 'Another note' }]);
    expect(note.bowerNote).toEqual({ text: 'Protected explanation.', source: 'notes' });
    expect(note.properties).toEqual([{ key: 'contact', label: 'Contact', value: 'you@example.com' }]);
    expect(note.summary).toBe('Synthetic note');
    expect(note.byBower).toBe(true);
    expect(note.links).toEqual(['Another note']);
  });

  it.each(fixtures)('changes only the personal checkbox byte ($name)', ({ source }) => {
    const expected = source.replace('- [ ] Personal task', '- [x] Personal task');
    const changed = toggleTaskInText(source, 0);
    expect(changed).toEqual({ text: expected, label: 'Personal task 🪶  ', done: true });
    const before = new TextEncoder().encode(source);
    const after = new TextEncoder().encode(changed.text);
    expect(after).toHaveLength(before.length);
    expect([...after].filter((byte, i) => byte !== before[i])).toEqual([120]);
    expect(toggleTaskInText(changed.text, 0).text).toBe(source);
    for (const index of [-1, 1, 2, 0.5, NaN]) {
      expect(() => toggleTaskInText(source, index)).toThrow(BowerError);
    }
  });

  it('does not infer ownership from headings inside payloads', () => {
    const body = '## Current state\n- [ ] Personal task 🪶  \n## Timeline\nPersonal prose.';
    const source = raw.replace(personal, body).replace('## Current state\n' + paragraph, paragraph);
    const note = parseNote('Synthetic.md', source);
    expect(note.body).toBe(body);
    expect(note.currentState).toEqual([paragraph, '[ ] Protected task']);
    expect(toggleTaskInText(source, 0).text).toBe(source.replace('- [ ] Personal task', '- [x] Personal task'));
  });

  it('uses parser task indices across fenced examples and empty labels', () => {
    const body = [
      '## My notes', '```markdown', '<!-- bower:ownership/2 end personal -->', '- [ ] Example only', '```',
      '\\<!-- bower:ownership/2 begin personal -->', '- [ ]   ', '- [ ] Personal task 🪶  ',
    ].join('\n');
    const source = raw.replace(personal, body);
    expect(parseNote('Synthetic.md', source).body).toBe(body);
    expect(toggleTaskInText(source, 0).text).toBe(source.replace('- [ ] Personal task', '- [x] Personal task'));
    expect(() => toggleTaskInText(source, 1)).toThrow(BowerError);
  });

  it('has no personal task when its payload is empty', () => {
    const source = raw.replace(personal + '\n', '');
    expect(parseNote('Synthetic.md', source).body).toBe('');
    expect(() => toggleTaskInText(source, 0)).toThrow(BowerError);
  });

  const invalid = [
    { name: 'missing end marker', source: raw.replace('<!-- bower:ownership/2 end current -->\n', '') },
    { name: 'unsupported version', source: raw.replace('bower_format: ownership/2', 'bower_format: ownership/3') },
    { name: 'duplicate declaration', source: raw.replace('summary:', 'bower_format: ownership/2\nsummary:') },
    { name: 'unclosed fence', source: raw.replace(personal, '```\n' + personal) },
    { name: 'lone CR', source: raw.replace(paragraph, paragraph + '\rX') },
  ];
  it.each(invalid)('refuses reading and task edits for $name', ({ source }) => {
    const before = new TextEncoder().encode(source);
    expect(() => parseNote('Synthetic.md', source)).toThrow(BowerError);
    expect(() => toggleTaskInText(source, 0)).toThrow(BowerError);
    expect(new TextEncoder().encode(source)).toEqual(before);
  });

  // TL-P4-41 addendum 8: outside prose is readable but its task-shaped bytes have no task authority.
  it('reads unclaimed content and refuses task edits in its untouchable span', () => {
    const outside = 'Outside text\n- [ ] Unclaimed task';
    const source = raw + outside;
    const before = new TextEncoder().encode(source);
    expect(parseNote('Synthetic.md', source)).toEqual(parseNote('Synthetic.md', raw));
    // Index 0 is the framed personal task; index 1 would be the outside task if prose were wrongly indexed.
    expect(() => toggleTaskInText(source, 1)).toThrow(BowerError);
    expect(toggleTaskInText(source, 0).text).toBe(raw.replace('- [ ] Personal task', '- [x] Personal task') + outside);
    expect(new TextEncoder().encode(source)).toEqual(before);
  });

  it('preserves the legacy ambiguity and ordinary My notes heading', () => {
    const body = 'Protected-looking prose.\n- [ ] Disputed task\n## My notes\n- [ ] Personal task';
    const source = '---\nsummary: Legacy\n---\n## Current state\n- Protected bullet\n' + body + '\n## Timeline\n- 5 Oct · History';
    expect(parseNote('Synthetic.md', source).body).toBe(body);
    expect(parseNote('Synthetic.md', source).currentState).toEqual(['Protected bullet']);
    expect(toggleTaskInText(source, 0).text).toBe(source.replace('[ ] Disputed', '[x] Disputed'));
    expect(toggleTaskInText(source, 1).text).toBe(source.replace('[ ] Personal', '[x] Personal'));
  });

  it('keeps marker-looking text without frontmatter wholly personal', () => {
    const source = raw.slice(raw.indexOf('<!--'));
    expect(parseNote('Synthetic.md', source).body).toBe(source.replace(/\n+$/, ''));
    expect(toggleTaskInText(source, 0).text).toBe(source.replace('[ ] Protected', '[x] Protected'));
  });

  it('does not activate ownership/2 serialization', () => {
    const serialized = serializeNote(parseNote('Synthetic.md', raw));
    expect(serialized).not.toContain('bower_format:');
    expect(serialized).not.toContain('<!-- bower:ownership');
  });
});

// note-read-review-1, Minor 7: a refusal is told by its typed cause, never by its words.
describe('a note Bower refuses to parse', () => {
  const refusal = (text: string): unknown => {
    try {
      parseNote('Inbox/Pile/Pile note.md', text);
    } catch (e) {
      return e;
    }
    throw new Error('not refused');
  };
  it('carries why in its cause', () => {
    const newer = refusal('---\nbower_format: ownership/9\n---\nWords\n');
    const damaged = refusal('---\nbower_format: ownership/2\n---\nWords\n');
    expect(newer).toMatchObject({ name: 'BowerError', cause: { kind: 'note-refused', refusal: 'newer' } });
    expect(damaged).toMatchObject({ name: 'BowerError', cause: { kind: 'note-refused', refusal: 'damaged' } });
    expect([noteRefusal(newer), noteRefusal(damaged)]).toEqual(['newer', 'damaged']);
  });
  it('is never told by its words alone', () => {
    expect(noteRefusal(new BowerError('unknown', 'This note uses an unsupported format.'))).toBeNull();
    expect(noteRefusal(new BowerError('unknown', 'This note cannot be read safely.'))).toBeNull();
  });
});


describe('b5-typed-property-bounds', () => {
  const row = { id: 'offer', match: ['job offer'], template: 'source', properties: {
    role: { type: 'text' }, skills: { type: 'list' }, hours: { type: 'number' }, salary: { type: 'money' },
    posted: { type: 'date' }, stage: { type: 'enum', values: Array.from({ length: 20 }, (_, i) => `stage-${i}`) },
  }, table: ['role', 'hours', 'salary', 'posted'] };
  const good = { role: 'x'.repeat(200), skills: Array.from({ length: 10 }, () => 'x'.repeat(200)),
    hours: 1e15, salary: { amount: 123.4567, currency: 'EUR' }, posted: '2024-02-29', stage: 'stage-19' };
  it('control: all six types at their ruled boundaries validate', () => {
    expect(summaryFormat.typeRowOk(row)).toBe(true);
    expect(summaryFormat.propertyValuesOk(row, good)).toBe(true);
    expect(summaryFormat.propertyValuesOk(row, { ...good, hours: -1e15 })).toBe(true);
  });
  it.each([
    ['number above positive bound', { hours: 1e15 + 1 }],
    ['number below negative bound', { hours: -1e15 - 1 }],
    ['money five decimals', { salary: { amount: 123.45678, currency: 'EUR' } }],
    ['undeclared property', { invented: 'Alex' }],
    ['text 201', { role: 'x'.repeat(201) }],
    ['list 11', { skills: Array.from({ length: 11 }, () => 'Alex') }],
    ['list item 201', { skills: ['x'.repeat(201)] }],
    ['infinity', { hours: Infinity }], ['NaN', { hours: NaN }],
    ['non-ISO currency', { salary: { amount: 48, currency: 'ZZZ' } }],
    ['missing currency', { salary: { amount: 48 } }],
    ['impossible date', { posted: '2026-02-29' }],
    ['date with time', { posted: '2026-10-11T00:00:00Z' }],
    ['unknown enum value', { stage: 'stage-20' }],
  ])('rejects %s', (_name, invalid) => {
    expect(summaryFormat.propertyValuesOk(row, good)).toBe(true);
    expect(summaryFormat.propertyValuesOk(row, { ...good, ...invalid })).toBe(false);
  });
});

it('b5-landed-contract-compatibility: control B6a scalar serialization and legacy Timeline remain readable', () => {
  const source = b6Note('source');
  const text = serializeNote(source);
  expect(parseNote('Source.md', text)).toMatchObject({ byBower: true, summary: source.summary, timeline: [] });
  expect(text).not.toContain('## Timeline');
  expect(parseNote('Legacy.md', '---\ntype: source\n---\nAlex wrote this.\n\n## Timeline\n- 10 Oct · Alex saved a bulletin.'))
    .toMatchObject({ byBower: false, body: 'Alex wrote this.', timeline: [{ date: '10 Oct', text: 'Alex saved a bulletin.' }] });
});


it.each(['source', 'moc'])('b5-landed-contract-compatibility: control personal typed %s edits retain legacy bytes', (type) => {
  const raw = `---\ntype: ${type}\nsummary: Alex keeps a note.\n---\nSee [[Old]].\n\n## Timeline\n- 10 Oct · Kept by Alex.\n`;
  const change: Change = { kind: 'link-rewrite', recordIds: ['alex-change'], renames: [{ from: 'Old', to: 'New' }] };
  const edited = applyChanges(new TextEncoder().encode(raw), [change]);
  expect(edited.ok).toBe(true);
  if (edited.ok) expect(edited.text).toBe(raw.replace('[[Old]]', '[[New]]'));
  const owned = raw.replace('type:', 'by: bower\ntype:');
  if (type === 'source') expect(applyChanges(new TextEncoder().encode(owned), [change]).ok).toBe(false);
  expect(parseNote('Legacy.md', raw).timeline).toEqual([{ date: '10 Oct', text: 'Kept by Alex.' }]);
});
