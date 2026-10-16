import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseOwnership, togglePersonalTask } from './ownership-format';
import type { Owner, OwnershipFailure } from './ownership-format';

interface Fixture {
  id: string; input_file: string; input_sha256: string; input_utf8_bytes: number;
  expected_status: 'plain' | 'legacy' | 'v2' | 'invalid';
  recovery_kind: string; expected_personal_task_labels?: string[];
  personal_utf8_span?: [number, number]; personal_raw?: string;
  expected_payload_utf8_spans?: Record<Owner, [number, number]>;
  toggle_expected_file?: string; toggle_expected_sha256?: string;
  toggle_request?: { index: number; label: string; previous_done: boolean; requested_done: boolean };
}
const base = 'testing/fixtures/';
const folder = `${base}ownership-fixtures-final/`;
const manifestBytes = readFileSync(`${folder}manifest.json`);
const fixtures = (JSON.parse(manifestBytes.toString('utf8')) as { fixtures: Fixture[] }).fixtures;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (file: string) => new Uint8Array(readFileSync(folder + file));
const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
const request = { index: 0, label: 'Personal task', previousDone: false, done: true };
const rich = () => decode(bytesOf('v2-rich.md'));

it('B5a contracts: profile has its own ownership mark beside the four old payloads', () => {
  const old = rich();
  expect(parseOwnership(encode(old)).status).toBe('v2');
  const profile = '## Profile\nAlex uses TypeScript, according to [[Alex CV]].\n';
  const text = old + '<!-- bower:ownership/2 begin profile -->\n' + profile
    + '<!-- bower:ownership/2 end profile -->\n';
  const own = parseOwnership(encode(text));
  expect(own.status).toBe('v2');
  if (own.status !== 'v2') return;
  const payloads: Readonly<Record<string, { start: number; end: number } | undefined>> = own.payloads;
  const region = payloads.profile;
  expect(region).toBeDefined();
  if (region) expect(decode(encode(text).subarray(region.start, region.end))).toBe(profile);
  const previous = parseOwnership(encode(old));
  if (previous.status === 'v2') {
    for (const owner of ['current', 'personal', 'timeline', 'bower-note'] as const) {
      expect(own.payloads[owner]).toEqual(previous.payloads[owner]);
    }
  }
  expect(parseOwnership(encode(text.replace('end profile', 'end current')))).toEqual({
    status: 'invalid', reason: 'damaged-boundary',
  });
});
function framed(personal: string): string {
  return '---\nbower_format: ownership/2\n---\n'
    + '<!-- bower:ownership/2 begin current -->\n- [ ] Protected task\n<!-- bower:ownership/2 end current -->\n'
    + `<!-- bower:ownership/2 begin personal -->\n${personal}<!-- bower:ownership/2 end personal -->\n`
    + '<!-- bower:ownership/2 begin timeline -->\n<!-- bower:ownership/2 end timeline -->\n'
    + '<!-- bower:ownership/2 begin bower-note -->\n<!-- bower:ownership/2 end bower-note -->\n';
}

it('B6a templates: b6-project-next-steps-owned frames Goal and Next steps outside personal tasks', () => {
  const control = encode(framed('- [ ] Personal task\n'));
  expect(parseOwnership(control).status).toBe('v2');
  expect(togglePersonalTask(control, request).kind).toBe('changed');
  const base = framed('- [ ] Personal task\n').replace('bower_format: ownership/2', 'bower_format: ownership/2\nby: bower\ntype: project');
  const raw = base + '<!-- bower:ownership/2 begin goal -->\n## Goal\nRepair the greenhouse.\n<!-- bower:ownership/2 end goal -->\n'
    + '<!-- bower:ownership/2 begin next-steps -->\n## Next steps\n- [ ] Fit the stated replacement pane.\n<!-- bower:ownership/2 end next-steps -->\n';
  const source = encode(raw);
  const parsed = parseOwnership(source);
  expect(parsed.status, 'Goal and Next steps must be declared Bower payloads').toBe('v2');
  if (parsed.status !== 'v2') return;
  const payloads = parsed.payloads as Readonly<Record<string, { start: number; end: number }>>;
  for (const [region, text] of [['goal', '## Goal\nRepair the greenhouse.\n'],
    ['next-steps', '## Next steps\n- [ ] Fit the stated replacement pane.\n']]) {
    const at = payloads[region ?? ''];
    expect(at, region).toBeDefined();
    if (at) expect(decode(source.subarray(at.start, at.end))).toBe(text);
  }
  expect(parsed.tasks.map((task) => task.label)).toEqual(['Personal task']);
  const toggled = togglePersonalTask(source, request);
  expect(toggled.kind).toBe('changed');
  if (toggled.kind === 'changed') expect(decode(toggled.bytes)).toBe(raw.replace('[ ] Personal task', '[x] Personal task'));
  expect(togglePersonalTask(source, { ...request, index: 1, label: 'Fit the stated replacement pane.' })).toEqual({ kind: 'refused', reason: 'task-not-found' });
});

describe('ownership/2 raw byte authority', () => {
  it('pins the adopted grammar and every independent canonical bundle byte', () => {
    expect(hash(readFileSync(`${base}bower-protected-ownership-final.md`))).toBe('ddef33a37b440b69a3d402a0df58481147df2ba0e8b656e5f39548ff4256b3a2');
    expect(hash(manifestBytes)).toBe('f673c51e6bb7b0f9e335d2283f5f9203fa1a428d3158799c1df96777354d76fa');
    const sums = readFileSync(`${folder}SHA256SUMS`, 'utf8').trim().split('\n');
    expect(sums).toHaveLength(32);
    for (const line of sums) {
      const [expected, original] = line.split(/\s+/);
      const name = original?.slice((original.lastIndexOf('/') + 1));
      const path = name === 'bower-protected-ownership-final.md' ? base + name : folder + name;
      expect(hash(readFileSync(path)), name).toBe(expected);
    }
    expect(fixtures).toHaveLength(18);
    expect(fixtures.filter((f) => f.toggle_request)).toHaveLength(7);
  });

  it.each(fixtures)('classifies $id and trusts only the independently authored raw spans', (fixture) => {
    const bytes = bytesOf(fixture.input_file); const original = bytes.slice();
    expect(hash(bytes)).toBe(fixture.input_sha256); expect(bytes.length).toBe(fixture.input_utf8_bytes);
    const parsed = parseOwnership(bytes);
    // TL-P4-41 addendum 8 overrides only this pinned fixture's outside-prose expectation, not its evidence bytes.
    const outsideFixture = fixture.id === 'invalid-outside-content';
    expect(parsed.status).toBe(outsideFixture ? 'v2' : fixture.expected_status);
    if (parsed.status === 'invalid') {
      expect(parsed.reason).toBe(fixture.recovery_kind);
      expect(parsed).not.toHaveProperty('personal'); expect(parsed).not.toHaveProperty('payloads'); expect(parsed).not.toHaveProperty('tasks');
      expect(togglePersonalTask(bytes, request)).toEqual({ kind: 'refused', reason: fixture.recovery_kind });
    } else {
      if (fixture.expected_personal_task_labels) expect(parsed.tasks.map((t) => t.label)).toEqual(outsideFixture ? ['Personal task'] : fixture.expected_personal_task_labels);
      if (outsideFixture && parsed.status === 'v2') {
        const outside = { start: bytes.length - encode('- [ ] Unclaimed task\n').length, end: bytes.length };
        expect(decode(bytes.slice(outside.start, outside.end))).toBe('- [ ] Unclaimed task\n');
        expect(Object.values(parsed.payloads).every((span) => span.end <= outside.start)).toBe(true);
        expect(parsed.tasks.every((task) => task.checkboxByte < outside.start)).toBe(true);
        expect(togglePersonalTask(bytes, { ...request, index: 1, label: 'Unclaimed task' }))
          .toEqual({ kind: 'refused', reason: 'task-not-found' });
        const changed = togglePersonalTask(bytes, request);
        expect(changed.kind).toBe('changed');
        if (changed.kind === 'changed') expect(changed.bytes.slice(outside.start, outside.end)).toEqual(bytes.slice(outside.start, outside.end));
      }
      if (fixture.personal_utf8_span) expect([parsed.personal.start, parsed.personal.end]).toEqual(fixture.personal_utf8_span);
      if (fixture.personal_raw !== undefined) expect(decode(bytes.slice(parsed.personal.start, parsed.personal.end))).toBe(fixture.personal_raw);
      if (parsed.status === 'v2' && fixture.expected_payload_utf8_spans) {
        for (const [owner, span] of Object.entries(fixture.expected_payload_utf8_spans)) {
          const actual = parsed.payloads[owner as Owner]; expect([actual.start, actual.end], owner).toEqual(span);
        }
      }
    }
    expect(bytes).toEqual(original);
  });

  it.each(fixtures.filter((f) => f.toggle_request))('writes only the canonical requested checkbox in $id and restores exact original bytes', (fixture) => {
    const r = fixture.toggle_request;
    if (!r || !fixture.toggle_expected_file) throw new Error('The independent fixture lacks its request.');
    const input = bytesOf(fixture.input_file); const original = input.slice();
    const changed = togglePersonalTask(input, { index: r.index, label: r.label, previousDone: r.previous_done, done: r.requested_done });
    expect(changed.kind).toBe('changed');
    if (changed.kind !== 'changed') return;
    const expected = bytesOf(fixture.toggle_expected_file);
    expect(hash(expected)).toBe(fixture.toggle_expected_sha256);
    expect(changed.bytes).toEqual(expected); expect(changed).toMatchObject({ label: r.label, done: r.requested_done });
    const different = Array.from(input.keys()).filter((i) => changed.bytes[i] !== input[i]);
    expect(different).toHaveLength(1); const at = different[0] ?? -1;
    expect(input[at]).toBe(32); expect(changed.bytes[at]).toBe(120);
    expect(input).toEqual(original);
    const back = togglePersonalTask(changed.bytes, { index: r.index, label: r.label, previousDone: true, done: false });
    expect(back.kind).toBe('changed'); if (back.kind === 'changed') expect(back.bytes).toEqual(input);
  });

  it('retains the initial BOM as protected prefix and shifts every v2 byte span by three', () => {
    const parsed = parseOwnership(bytesOf('v2-bom.md')); expect(parsed.status).toBe('v2');
    if (parsed.status !== 'v2') return;
    expect(parsed.payloads).toEqual({ current: { start: 115, end: 216 }, personal: { start: 297, end: 354 }, timeline: { start: 436, end: 478 }, 'bower-note': { start: 562, end: 601 } });
    const result = togglePersonalTask(bytesOf('v2-bom.md'), request); expect(result.kind).toBe('changed');
    if (result.kind === 'changed') expect(Array.from(result.bytes.slice(0, 3))).toEqual([239, 187, 191]);
  });

  it.each([
    ['long backticks and indented closer', '   ````markdown\n<!-- bower:ownership/2 end personal -->\n- [ ] Example\n   ````` \t\n'],
    ['tilde info and mixed closer', '~~~ info `allowed`\n```\n<!-- bower:ownership/2 begin current -->\n- [ ] Example\n~~~~\t\n'],
    ['short closer does not close', '````\n```\n<!-- bower:ownership/2 end personal -->\n- [ ] Example\n````\n'],
    ['escaped marker stays literal', '\\<!-- bower:ownership/2 end personal -->\n'],
  ])('uses the same fence grammar for framing and task indexing: %s', (_name, prefix) => {
    const input = encode(framed(prefix + '- [ ] Personal task\n'));
    const parsed = parseOwnership(input); expect(parsed.status).toBe('v2');
    if (parsed.status !== 'invalid') expect(parsed.tasks.map((t) => t.label)).toEqual(['Personal task']);
    const result = togglePersonalTask(input, request); expect(result.kind).toBe('changed');
    if (result.kind === 'changed') expect(decode(result.bytes)).toBe(framed(prefix + '- [x] Personal task\n'));
  });

  it.each(['    ```\n', '> ```\n', '- ```\n', '```bad`info\n'])('does not treat quoted, list, four-space or bad-info fence text as a control fence: %j', (prefix) => {
    const parsed = parseOwnership(encode(framed(prefix + '- [ ] Personal task\n')));
    expect(parsed.status).toBe('v2'); if (parsed.status !== 'invalid') expect(parsed.tasks.map((t) => t.label)).toEqual(['Personal task']);
  });

  it.each([
    ['trailing marker whitespace', rich().replace('begin current -->', 'begin current --> ')],
    ['nested block', rich().replace('Protected prose.', '<!-- bower:ownership/2 begin personal -->')],
    ['mismatched version', rich().replace('end current -->', 'ownership/3 end current -->')],
    ['lone CR', rich().replace('Protected prose.', 'Protected\rprose.')],
    ['duplicate declared version', rich().replace('summary:', 'bower_format: ownership/3\nsummary:')],
    ['wrong opt-in spacing', rich().replace('bower_format: ownership/2', 'bower_format:  ownership/2')],
  ])('refuses damaged framing without publishing any writable range: %s', (_name, text) => {
    const input = encode(text); const original = input.slice();
    expect(parseOwnership(input)).toEqual({ status: 'invalid', reason: 'damaged-boundary' });
    expect(togglePersonalTask(input, request)).toEqual({ kind: 'refused', reason: 'damaged-boundary' });
    expect(input).toEqual(original);
  });

  // TL-P4-41 addendum 8: complete frames leave trailing prose as an untouchable byte span, not task authority.
  it('keeps unclaimed trailing text byte for byte without publishing a writable range or task authority', () => {
    const outsideText = 'Unclaimed\n';
    const input = encode(rich() + outsideText); const original = input.slice();
    const outside = { start: encode(rich()).length, end: input.length };
    const parsed = parseOwnership(input);
    expect(parsed.status).toBe('v2');
    if (parsed.status !== 'v2') return;
    expect(input.slice(outside.start, outside.end)).toEqual(encode(outsideText));
    expect(Object.values(parsed.payloads).every((span) => span.end <= outside.start)).toBe(true);
    expect(parsed.tasks.map((task) => task.label)).toEqual(['Personal task']);
    expect(parsed.tasks.every((task) => task.checkboxByte < outside.start)).toBe(true);
    expect(togglePersonalTask(input, { ...request, index: 1, label: 'Unclaimed' }))
      .toEqual({ kind: 'refused', reason: 'task-not-found' });
    const changed = togglePersonalTask(input, request);
    expect(changed.kind).toBe('changed');
    if (changed.kind === 'changed') expect(changed.bytes).toEqual(encode(rich().replace('[ ] Personal task', '[x] Personal task') + outsideText));
    expect(input).toEqual(original);
  });

  it('preserves mixed endings, decomposed Unicode, numbered task bytes and subarray offsets', () => {
    const text = framed('Cafe\u0301 🪶\r\n  2. [ ] Personal task\r\n');
    const padded = encode('prefix' + text + 'suffix'); const input = padded.subarray(6, padded.length - 6); const original = padded.slice();
    const result = togglePersonalTask(input, request); expect(result.kind).toBe('changed');
    if (result.kind === 'changed') expect(decode(result.bytes)).toBe(text.replace('2. [ ]', '2. [x]'));
    expect(padded).toEqual(original);
  });

  it('excludes empty v2 labels and refuses absent or changed task identity before splicing', () => {
    const input = encode(framed('- [ ]   \n- [ ] Personal task\n'));
    const parsed = parseOwnership(input); expect(parsed.status).toBe('v2');
    if (parsed.status !== 'invalid') expect(parsed.tasks.map((t) => [t.index, t.label])).toEqual([[0, 'Personal task']]);
    for (const index of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 1]) expect(togglePersonalTask(input, { ...request, index })).toEqual({ kind: 'refused', reason: 'task-not-found' });
    expect(togglePersonalTask(input, { ...request, label: 'Protected task' })).toEqual({ kind: 'refused', reason: 'task-changed' });
    expect(togglePersonalTask(input, { ...request, previousDone: true })).toEqual({ kind: 'refused', reason: 'task-changed' });
  });

  // One byte table per note: every span of a legacy note is where the text says it is, in bytes, whatever the line
  // endings and however wide the characters before it (the table replaced a prefix re-encode per span).
  it.for([['LF', '\n'], ['CRLF', '\r\n']] as const)('legacy spans are byte-exact with %s and wide characters', ([, eol]) => {
    const lines = [
      '---', 'by: bower', 'note: caf\u00e9 \u{1F426}', '---', '## Current state', '- one \u00f1', '', 'Alex wrote \u65e5\u672c\u8a9e here.',
      '- [ ] Task \u{1F331}', '', '## Timeline', '- 2026-10-09 \u00e9 done', '', "## Bower's note", 'Hello \u{1F426}.', '',
    ];
    const text = lines.join(eol);
    const bytes = encode(text);
    const parsed = parseOwnership(bytes);
    expect(parsed.status).toBe('legacy');
    if (parsed.status === 'invalid') return;
    const slice = (span: { start: number; end: number } | null) => (span ? decode(bytes.slice(span.start, span.end)) : null);
    expect(slice(parsed.layout.front)).toBe(['by: bower', 'note: caf\u00e9 \u{1F426}', ''].join(eol));
    expect(slice(parsed.layout.current)).toBe(['## Current state', '- one \u00f1', ''].join(eol));
    expect(slice(parsed.personal)).toBe(['Alex wrote \u65e5\u672c\u8a9e here.', '- [ ] Task \u{1F331}', ''].join(eol));
    expect(slice(parsed.layout.timeline)).toBe(['## Timeline', '- 2026-10-09 \u00e9 done', '', ''].join(eol));
    expect(slice(parsed.layout.bowerNote)).toBe(["## Bower's note", 'Hello \u{1F426}.', ''].join(eol));
    expect(decode(bytes.slice(0, parsed.layout.frontEnd))).toBe(lines.slice(0, 4).join(eol) + eol);
    expect(parsed.tasks[0]?.label).toBe('Task \u{1F331}');
  });

  it('retains legacy fence/empty task indexing, unterminated frontmatter and legacy BOM behavior', () => {
    const legacy = encode('---\nby: bower\n---\n```\n- [ ] Example\n```\n- [ ] \n- [ ] Personal task\n');
    const parsed = parseOwnership(legacy); expect(parsed.status).toBe('legacy');
    if (parsed.status !== 'invalid') expect(parsed.tasks.map((t) => [t.index, t.label])).toEqual([[0, 'Example'], [2, 'Personal task']]);
    const result = togglePersonalTask(legacy, { ...request, index: 2 }); expect(result.kind).toBe('changed');
    if (result.kind === 'changed') expect(decode(result.bytes)).toBe(decode(legacy).replace('[ ] Personal task', '[x] Personal task'));
    for (const text of ['---\nbower_format: ownership/2\n- [ ] Personal task\n', '\ufeffJust my words.\n- [ ] Personal task\n']) {
      const value = parseOwnership(encode(text)); expect(value.status).toBe('plain');
      if (value.status !== 'invalid') expect(value.personal).toEqual({ start: 0, end: encode(text).length });
    }
    // A byte-order mark before a closed front matter is not text (bom-front-matter): the note reads as legacy, its
    // task indexed as without the mark.
    const marked = parseOwnership(encode('\ufeff---\nby: bower\n---\n- [ ] Personal task\n'));
    expect(marked.status).toBe('legacy');
    if (marked.status !== 'invalid') expect(marked.tasks.map((t) => [t.index, t.label])).toEqual([[0, 'Personal task']]);
  });

  it('reparses each new source instead of accepting cached span authority', () => {
    const bytes = bytesOf('v2-rich.md'); const parsed = parseOwnership(bytes); expect(parsed.status).toBe('v2');
    if (parsed.status !== 'v2') return;
    // Public derived results never authorize a write; each write reparses its actual supplied bytes.
    const changedSource = encode(rich().replace('begin personal -->', 'begin unknown -->'));
    const refused = togglePersonalTask(changedSource, request);
    expect(refused).toEqual({ kind: 'refused', reason: 'damaged-boundary' satisfies OwnershipFailure });
    expect(togglePersonalTask(encode(framed('')), request)).toEqual({ kind: 'refused', reason: 'task-not-found' });
  });

  it('copies raw Uint8Array subclasses rather than sharing their slice-backed source', () => {
    const input = readFileSync(folder + 'v2-rich.md');
    const original = new Uint8Array(input);
    const result = togglePersonalTask(input, request);
    expect(new Uint8Array(input)).toEqual(original);
    expect(result.kind).toBe('changed');
    if (result.kind === 'changed') {
      expect(result.bytes).toEqual(bytesOf('v2-rich.toggle-expected.md'));
      result.bytes.fill(0);
      expect(new Uint8Array(input)).toEqual(original);
    }
  });
});


it('b4a-composite-byte-append: parser exposes only the trailing marked regions', () => {
  const prefix = '\ufeff---\r\nsummary: "Alex: notes"\r\n---\r\nAlex keeps café and e\u0301.\r\n- [ ] Personal task\r\n';
  const regions = [['about-you', 'About you'], ['about-working-on', "What you're working on"],
    ['about-preferences', 'How you like things']] as const;
  const learned = '## What Bower has learned\r\n' + regions.map(([key, label]) =>
    `<!-- bower:ownership/2 begin ${key} -->\r\n### ${label}\r\n- [ ] Learned task\r\n<!-- bower:ownership/2 end ${key} -->\r\n`).join('');
  expect(parseOwnership(encode(prefix.slice(1))).status).toBe('legacy');
  expect(parseOwnership(encode(framed('Alex keeps these words.\n'))).status).toBe('v2');
  const bytes = encode(prefix + learned);
  const own = parseOwnership(bytes);
  expect.soft(own.status).not.toBe('invalid');
  // This is the existing parser's payload map, never a second marker scanner.
  const payloads = 'payloads' in own ? own.payloads as Readonly<Record<string, { start: number; end: number }>> : {};
  for (const [key, label] of regions) {
    const span = payloads[key];
    expect.soft(span, `${key} is a production ownership span`).toBeDefined();
    if (span) {
      expect(span.start).toBeGreaterThanOrEqual(encode(prefix).length);
      expect(decode(bytes.subarray(span.start, span.end))).toBe(`### ${label}\r\n- [ ] Learned task\r\n`);
    }
  }
  if (own.status !== 'invalid') expect.soft(own.tasks.map((task) => task.label)).toEqual(['Personal task']);
  for (const bad of [learned.replace('end about-you', 'end about-preferences'), learned + learned,
    learned.replace('<!-- bower:ownership/2 end about-preferences -->', '')]) {
    expect.soft(parseOwnership(encode(prefix + bad))).toEqual({ status: 'invalid', reason: 'damaged-boundary' });
  }
  const headingOnly = parseOwnership(encode(prefix + '## What Bower has learned\n### About you\nAlex writes this.\n'));
  expect(headingOnly).not.toHaveProperty('payloads.about-you');
  expect(bytes.subarray(0, encode(prefix).length)).toEqual(encode(prefix));
});

it('frames rules-added with exact byte spans while retaining opaque trailing bytes', () => {
  const prefix = '\ufeffCafé and e\u0301.\r\n- [ ] Personal task\r\n';
  const payload = '## Rules\r\n- [ ] App rule\r\n';
  const region = `## Rules added in Bower\r\n<!-- bower:ownership/2 begin rules-added -->\r\n${payload}<!-- bower:ownership/2 end rules-added -->\r\n`;
  const suffix = '## Rules\r\n- [ ] Trailing task';
  const bytes = encode(prefix + region + suffix);
  const own = parseOwnership(bytes);
  expect(own.status).toBe('plain');
  if (own.status === 'invalid') return;
  const span = own.payloads?.['rules-added'];
  expect(span).toBeDefined();
  if (span) expect(decode(bytes.subarray(span.start, span.end))).toBe(payload);
  expect(own.tasks.map((task) => task.label)).toEqual(['Personal task']);
  for (const bad of [region + region, region.replace('end rules-added', 'end about-you'), region + '```\r\nunfinished']) {
    expect(parseOwnership(encode(prefix + bad))).toEqual({ status: 'invalid', reason: 'damaged-boundary' });
  }
  expect(parseOwnership(encode(`${prefix}\`\`\`md\r\n${region}\`\`\`\r\n`))).not.toHaveProperty('payloads.rules-added');
});
