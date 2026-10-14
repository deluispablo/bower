import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { parseNote, serializeNote } from '../../src/data/contracts/note-format';
import { empty, manifest, note, report, run, select, setup, type Base } from './b1-planning-support';
import { replySequence, runWithClaude } from './corpus-run';
import { VaultIndex } from '../../src/data/vault/vault-index';

// B9b (TL-P4-50 B9 Q1-Q5): a reply line may carry one closed marker and one extra bound source; Bower checks both,
// writes the plain text through the existing Timeline append, and refuses anything else before any write.
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const TARGET = 'Projects/Garden visit/Visit.md';
const EARLIER = 'Projects/Garden visit/Earlier notice.txt';
const LOOSE = 'Projects/Garden visit/Unlinked leaflet.txt';
const SOURCE = 'Garden notice.txt';
const TEXT = 'The garden may close if heavy rain is forecast; no decision has been made.';
const body = '# Visit\n\n## My thoughts\nAlex keeps the booking.\n\n## Timeline\n- 2026-10-02 · The booking remains open. · [[Earlier notice.txt]]\n';

async function fixture(person = false, { folder = {}, links = '' }: { folder?: Record<string, string>; links?: string } = {}) {
  const base = await setup({ folder: { [TARGET]: note('Alex records a garden visit.', body.replace('Alex keeps the booking.', `Alex keeps the booking.${links}`), !person),
    [EARLIER]: 'The booking remains open.', [LOOSE]: 'Opening hours for the season.', ...folder },
  inbox: [{ line: 'Update Visit from the garden notice.', files: [SOURCE] }],
  inboxFiles: { [SOURCE]: TEXT } });
  if (person) {
    // A request that names the note: C05's one consented append on a person's note.
    await base.drive.createText(base.id('.bower/changes'), 'b9-request.json', JSON.stringify({ v: 1, id: 'b9-request', device: 'device-1', at: Date.UTC(2026, 9, 7, 9), kind: 'request', what: 'Update Visit', text: 'Update Visit from the garden notice.' }));
    const admitted = await planAdmission(fakeRead(base.drive), base.root, { scope: 'all', clock: () => Date.UTC(2026, 9, 7, 9), newId: () => 'b9-admission' });
    expect(admitted.kind).toBe('manifest');
    if (admitted.kind === 'manifest') base.admission = admitted.manifest;
  }
  return base;
}
function intent(base: Base, line: Record<string, unknown>) {
  return { ...empty, things: [{ fileId: base.sources[0]?.itemId, to: 'Projects/Garden visit', name: SOURCE }],
    lines: [{ note: TARGET, text: TEXT, cites: base.sources[0]?.itemId, ...line }] };
}
async function execute(line: Record<string, unknown>, person = false) {
  const base = await fixture(person);
  return { base, result: await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), intent(base, line)]) };
}
const added = (base: Base, after: string | undefined) => parseNote(TARGET, after ?? '').timeline.slice(parseNote(TARGET, base.c.folder[TARGET] ?? '').timeline.length);

it('AC7 control: an ordinary line through main is one sourced Timeline line', async () => {
  const { base, result } = await execute({});
  expect(result.code).toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(added(base, result.after[TARGET])).toEqual([{ date: '2026-10-07', text: TEXT, source: SOURCE }]);
});

it.each([
  ['uncertain', {}, `Uncertain: ${TEXT}`],
  ['uncertain with a source', { alsoCites: [EARLIER] }, `Uncertain: ${TEXT} (also from [[Earlier notice.txt]])`],
  ['inferred', { text: 'The visit may be affected; the booking has not been cancelled.' }, 'The visit may be affected; the booking has not been cancelled. (inferred)'],
  ['contradiction', { text: 'The earlier notice keeps the booking open; the later one may close the garden.', alsoCites: [EARLIER] },
    'Contradiction: The earlier notice keeps the booking open; the later one may close the garden. (also from [[Earlier notice.txt]])'],
])('AC7 b9-marker-materialized: a %s line is written as its plain text with its terminal source', async (name, extra, text) => {
  const marker = name.split(' ')[0];
  const { base, result } = await execute({ marker, ...extra });
  expect(result.code, 'a valid marker reply is accepted on the first execution call').toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(added(base, result.after[TARGET])).toEqual([{ date: '2026-10-07', text, source: SOURCE }]);
  expect(result.after[EARLIER]).toBe(base.c.folder[EARLIER]);
  expect(report(result).questions).toEqual([]);
  // The run's updated row says the line as the note shows it: the label kept, the citation as its words.
  const rows = (result.lastRun as { run?: { report?: { updated?: Array<{ path: string; what: string }> } } })?.run?.report?.updated ?? [];
  expect(rows.filter((row) => row.path === TARGET).map((row) => row.what)).toEqual([text.replace(/\[\[([^\]]+)\]\]/, '$1')]);
  // The reference is not downloaded: it is bound from the link the note already shows.
  const earlier = base.id(EARLIER);
  expect(result.traffic.filter((t) => t.method === 'GET' && !t.range && t.url.pathname === `/drive/v3/files/${earlier}` && t.url.searchParams.get('alt') === 'media')).toEqual([]);
});

it('AC7 b9-marker-prompt: the execution call tells the model the two optional fields', async () => {
  const { result } = await execute({});
  const prompt = result.frames[1]?.call.input ?? '';
  expect(prompt).toContain('"marker"');
  expect(prompt).toContain('"alsoCites"');
  for (const word of ['contradiction', 'uncertain', 'inferred']) expect(prompt).toContain(word);
});

it('AC8 b9-field-boundary: exactly 200 decorated characters pass whole; 201 refuse', async () => {
  const suffix = ' (inferred) (also from [[Earlier notice.txt]])';
  for (const size of [200, 201]) {
    const text = 'a'.repeat(size - suffix.length);
    const { base, result } = await execute({ marker: 'inferred', text, alsoCites: [EARLIER] });
    expect(result.code, `decorated text of ${size} characters`).toBe(size === 200 ? 0 : 1);
    if (size === 200) expect(added(base, result.after[TARGET])).toEqual([{ date: '2026-10-07', text: text + suffix, source: SOURCE }]);
    else {
      expect(result.after[TARGET]).toBe(base.c.folder[TARGET]);
      expect(result.frames[2]?.call.input).toMatch(/^Your reply was refused:/m);
    }
  }
  const prefix = 'Uncertain: ';
  const exact = await execute({ marker: 'uncertain', text: 'b'.repeat(200 - prefix.length) });
  expect(exact.result.code, 'a label counts toward the limit').toBe(0);
  expect(exact.result.frames).toHaveLength(2);
});

it('AC8 b9-field-boundary-keep: the limit holds with the citation named as a same-run keep renames it (attempt 2)', async () => {
  const OTHER = 'Projects/Garden visit/Second visit.md';
  const LONG = 'Projects/Garden visit/A much longer visit note.md';
  // The line goes on the kept note, which links the other note it keeps: the one note this press may edit.
  const PLAN = LONG;
  const BODY = '## My thoughts\nAlex keeps the sketchbook.\n\n## Timeline\n';
  const press = async (size: number) => {
    const base = await setup({ folder: { [LONG]: note('Alex records one visit.', BODY.replace('sketchbook.', 'sketchbook. See [[Second visit]].'), true),
      [OTHER]: note('Alex records the same visit.', BODY, true) },
    inbox: [{ line: 'Alex wants the two garden visit notes together.', files: [] }] });
    base.c.presses = [{ between: [{ kind: 'answer', question: { kind: 'pair', notes: [LONG, OTHER] }, yes: true }] }];
    const text = 'a'.repeat(size - ' (inferred) (also from [[Second visit]])'.length);
    const inputs: string[] = [];
    const spawn = replySequence([{ ...empty, asks: [{ notes: [LONG, OTHER], text: 'Keep one visit note?', yes: 'Write it', no: 'Keep mine' }] },
      { ...empty, keep: [{ kept: LONG, other: OTHER }], lines: [{ note: PLAN, text, marker: 'inferred', alsoCites: [OTHER] }] }]);
    const result = await runWithClaude(base.c, async (call) => { inputs.push(call.input); return spawn(call); });
    return { base, result, inputs, text };
  };
  // 200 characters as named now, 212 as the keep names the cited note: refused through the retry, nothing kept.
  const over = await press(200);
  expect(over.result.code).toBe(1);
  expect(over.inputs.find((input) => /^Your reply was refused:/m.test(input)), 'refused through the retry').toMatch(/characters/);
  expect(over.result.after[PLAN]).toBe(over.base.c.folder[PLAN]);
  expect(over.result.after[OTHER], 'the keep waits with the line').toBe(over.base.c.folder[OTHER]);
  // Control: 200 characters with the final name pass the reply check, and the keep goes through. (An answer-only run
  // writes no model line, so the line itself is not written here.)
  const fits = await press(188);
  expect(fits.inputs.find((input) => /^Your reply was refused:/m.test(input))?.match(/^Your reply was refused: .*$/m)?.[0]).toBeUndefined();
  expect(fits.result.code).toBe(0);
  expect(fits.result.after[OTHER], 'the keep went through').toBeUndefined();
  expect(parseNote(PLAN, fits.result.after[PLAN] ?? '').timeline.map((e) => e.text).join('\n')).not.toContain('[[Second visit]]');
});

it('AC8 guard: 200 ordinary characters pass; 20 lines pass and 21 refuse', async () => {
  const { result } = await execute({ text: `Undecided. ${'a'.repeat(189)}` });
  expect(result.code).toBe(0);
  for (const count of [20, 21]) {
    const base = await fixture();
    const value = intent(base, {});
    value.lines = Array.from({ length: count }, (_, i) => ({ note: TARGET, cites: base.sources[0]?.itemId, text: `Undecided option ${String.fromCharCode(65 + i)}.` }));
    const lines = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), value]);
    expect(lines.code).toBe(count === 20 ? 0 : 1);
    if (count === 21) expect(lines.after[TARGET]).toBe(base.c.folder[TARGET]);
  }
});

it.each([
  ['an unknown marker', { marker: 'confirmed' }],
  ['a marker of the wrong type', { marker: ['uncertain'] }],
  ['a line separator', { marker: 'uncertain', text: 'Undecided.\u2028Next line.' }],
  ['a paragraph separator without a marker', { text: 'Undecided.\u2029Next paragraph.' }],
  ['a control character', { marker: 'uncertain', text: 'Undecided.\u0000' }],
  ['the Timeline separator', { marker: 'uncertain', text: 'Undecided · pending' }],
  ['a raw link', { marker: 'uncertain', text: 'Undecided [[Other]]' }],
  ['the label written by the model', { marker: 'uncertain', text: 'Uncertain: undecided.' }],
  ['an extra source without a marker', { alsoCites: [EARLIER] }],
  ['two extra sources', { marker: 'uncertain', alsoCites: [EARLIER, LOOSE] }, ' See [[Unlinked leaflet.txt]].'],
  ['an empty extra source list', { marker: 'uncertain', alsoCites: [] }],
  ['a contradiction with one source', { marker: 'contradiction' }],
  ['a basename', { marker: 'contradiction', alsoCites: ['Earlier notice.txt'] }],
  ['a file id', { marker: 'contradiction', alsoCites: ['$id'] }],
  ['a file the note does not link', { marker: 'contradiction', alsoCites: [LOOSE] }],
  ['a missing file', { marker: 'contradiction', alsoCites: ['Projects/Garden visit/Made up.txt'] }],
  ['a folder', { marker: 'contradiction', alsoCites: ['Projects/Garden visit'] }],
  ['the cited thing itself', { marker: 'contradiction', alsoCites: [`Inbox/${SOURCE}`] }, ` See [[${SOURCE}]].`],
  ['a reference with link syntax', { marker: 'uncertain', alsoCites: ['Projects/Garden visit/Earlier notice.txt|alias'] }],
  ['an inferred figure', { marker: 'inferred', text: 'The visit on 2026-10-02 may be affected.' }],
  ['empty marked text', { marker: 'uncertain', text: '' }],
  ['blank marked text', { marker: 'inferred', text: '   ' }],
  ['an invented figure', { marker: 'uncertain', text: 'The garden may close on 77 days.' }],
  ['a label without a marker', { text: 'Contradiction: the notices disagree.' }],
  ['a qualifier without a marker', { text: 'The visit may be affected. (inferred)' }],
] as Array<[string, Record<string, unknown>, string?]>)('AC9 b9-marker-refused: %s refuses before any write, through the retry', async (name, raw, links = '') => {
  // Round 2 (3): the extra reference of a cardinality or identity refusal is otherwise valid (linked, filed).
  const base = await fixture(false, { links });
  const line = { ...raw } as Record<string, unknown>;
  if (Array.isArray(line.alsoCites)) line.alsoCites = line.alsoCites.map((v: unknown) => (v === '$id' ? base.id(EARLIER) : v));
  const result = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), intent(base, line)]);
  expect(result.code).toBe(1);
  expect(result.after[TARGET]).toBe(base.c.folder[TARGET]);
  expect(manifest(result).operations).toEqual([]);
  expect(result.frames[2]?.call.input).toMatch(/^Your reply was refused:/m);
  // Refused by its own rule, not because the keys are unknown (today's only reason).
  if (name !== 'a marker of the wrong type') expect(result.frames[2]?.call.input, 'refused by the marker rules').not.toContain('a line with keys outside the intent');
});

it('AC10 control: a named ordinary C05 append on a person\'s note', async () => {
  const { base, result } = await execute({}, true);
  expect(result.code).toBe(0);
  expect(result.after[TARGET]).toBe(`${base.c.folder[TARGET]}- 2026-10-07 · ${TEXT} · [[${SOURCE}]]\n`);
  expect(result.props[TARGET] ?? {}).not.toHaveProperty('by');
});

it('AC10 b9-marker-person-refused: a marker on a person\'s note refuses; the same marker on Bower\'s note is written', async () => {
  const owned = await execute({ marker: 'uncertain' });
  expect(owned.result.code, 'the same structured intent is valid in a Bower region').toBe(0);
  expect(added(owned.base, owned.result.after[TARGET])).toEqual([{ date: '2026-10-07', text: `Uncertain: ${TEXT}`, source: SOURCE }]);
  for (const extra of [{ marker: 'uncertain' }, { marker: 'contradiction', alsoCites: [EARLIER] }]) {
    const personal = await execute(extra, true);
    expect(personal.result.code).toBe(1);
    expect(personal.result.after[TARGET]).toBe(personal.base.c.folder[TARGET]);
    expect(personal.result.frames[2]?.call.input).toMatch(/^Your reply was refused:/m);
  }
});

it('AC10 b9-marker-person-text: a note whose text no longer says Bower\'s refuses a marker, whatever Drive metadata says (attempt 2)', async () => {
  const base = await fixture(true);
  // The person removed `by: bower` from the text; the file's Drive properties still say Bower's.
  await base.drive.update(base.id(TARGET), { appProperties: { by: 'bower' } });
  const result = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), intent(base, { marker: 'uncertain' })]);
  expect(result.code).toBe(1);
  expect(result.after[TARGET]).toBe(base.c.folder[TARGET]);
  expect(manifest(result).operations, 'refused at the reply, before any effect').toEqual([]);
  expect(result.frames[2]?.call.input).toMatch(/^Your reply was refused:/m);
});

it('AC10 b9-marker-long-framed: a framed Bower note longer than its shown cut takes a marker; a link only past the cut still does not bind (attempt 3)', async () => {
  const filler = ` ${'Alex notes the garden paths and the benches by the pond. '.repeat(90)}`;
  const framed = (body: string) => serializeNote({ template: 'concept', byBower: true, summary: 'Alex records a garden visit.', status: 'active', tags: ['gardening'],
    properties: [{ key: 'type', label: 'Type', value: 'concept' }, { key: 'created', label: 'Created', value: '2026-10-02' },
      { key: 'updated', label: 'Updated', value: '2026-10-02' }, { key: 'source', label: 'Source', value: 'Garden bulletin' },
      { key: 'related', label: 'Related', value: 'Gardening', link: 'Gardening' }],
    currentState: ['Alex visits in spring.'], body, timeline: [{ date: '2026-10-02', text: 'The booking remains open.', source: 'Earlier notice.txt' }] });
  const raw = framed(`See [[Earlier notice.txt]].${filler} See [[Unlinked leaflet.txt]].`);
  expect(raw).toContain('bower_format: ownership/2');
  expect(raw.length, 'longer than the 4,000 characters shown').toBeGreaterThan(5_000);
  const owned = await marked({ folder: { [TARGET]: raw } }, { marker: 'uncertain', alsoCites: [EARLIER] });
  expect(owned.result.frames[1]?.call.input, 'the note is shown cut').toContain('[cut here: ');
  expect(/^Your reply was refused: (.*)$/m.exec(owned.result.frames[2]?.call.input ?? '')?.[1], 'a long Bower note takes a marked line').toBeUndefined();
  expect(owned.result.code).toBe(0);
  expect(owned.result.frames).toHaveLength(2);
  expect(parseNote(TARGET, owned.result.after[TARGET] ?? '').timeline.at(-1)).toEqual({ date: '2026-10-07', text: `Uncertain: ${TEXT} (also from [[Earlier notice.txt]])`, source: SOURCE });
  refused(await marked({ folder: { [TARGET]: raw } }, { marker: 'uncertain', alsoCites: [LOOSE] }));
});

it('AC10 b9-marker-long-framed-front: a long framed note\'s shown front matter link binds an extra source (b9b2)', async () => {
  const GARDENING = 'Projects/Garden visit/Gardening.md';
  const filler = ` ${'Alex notes the garden paths and the benches by the pond. '.repeat(90)}`;
  const raw = serializeNote({ template: 'concept', byBower: true, summary: 'Alex records a garden visit.', status: 'active', tags: ['gardening'],
    properties: [{ key: 'type', label: 'Type', value: 'concept' }, { key: 'created', label: 'Created', value: '2026-10-02' },
      { key: 'updated', label: 'Updated', value: '2026-10-02' }, { key: 'source', label: 'Source', value: 'Garden bulletin' },
      { key: 'related', label: 'Related', value: 'Gardening', link: 'Gardening' }],
    currentState: ['Alex visits in spring.'], body: `Alex keeps the booking.${filler}`,
    timeline: [{ date: '2026-10-02', text: 'The booking remains open.', source: 'Earlier notice.txt' }] });
  expect(raw.length, 'longer than the 4,000 characters shown').toBeGreaterThan(5_000);
  expect(raw.split('---\n')[1], 'the only link to it is in the front matter').toContain('[[Gardening]]');
  // The template also lists it in a related region at the end, past the cut: only the front matter's is shown.
  expect(raw.indexOf('[[Gardening]]', raw.indexOf('[[Gardening]]') + 1), 'the other mention is past the cut').toBeGreaterThan(4_000);
  const { base, result } = await marked({ folder: { [TARGET]: raw, [GARDENING]: note('Alex keeps gardening notes.') } }, { marker: 'uncertain', alsoCites: [GARDENING] });
  const shown = (result.frames[1]?.value.notes as Array<{ path: string; text: string; cut: number }> | undefined)?.find((n) => n.path === TARGET);
  expect(shown?.cut, 'the note is cut where shown').toBeGreaterThan(0);
  expect(shown?.text.split('[[Gardening]]'), 'the front matter link is within the cut, once').toHaveLength(2);
  expect(/^Your reply was refused: (.*)$/m.exec(result.frames[2]?.call.input ?? '')?.[1], 'accepted on the first call').toBeUndefined();
  expect(result.code).toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(parseNote(TARGET, result.after[TARGET] ?? '').timeline.at(-1)).toEqual({ date: '2026-10-07', text: `Uncertain: ${TEXT} (also from [[Gardening]])`, source: SOURCE });
  expect(base.c.folder[GARDENING]).toBe(result.after[GARDENING]);
});

// b9b2 attempt 2: two sibling files may share one Drive name; Bower's paths tell them apart as "Earlier notice (2).txt",
// but the citation is written with the real name, so binding and the bound judge the real name.
async function twinned(links = '') {
  const base = await fixture(false, { links });
  const twin = await base.drive.createText(base.id('Projects/Garden visit'), 'Earlier notice.txt', 'Another notice.');
  const ix = VaultIndex.build(base.root, await base.drive.listAll(base.root));
  const second = [twin.id, base.id(EARLIER)].map((id) => ix.pathOf(id) ?? '').find((path) => path.includes('(2)')) ?? '';
  expect(second, 'the index tells the twins apart').toMatch(/Earlier notice \(2\)\.txt$/);
  return { base, second };
}

it('AC9 b9-reference-names: a bare name two sibling files share does not bind (b9b2, R3a)', async () => {
  const { base } = await twinned();
  const result = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), intent(base, { marker: 'uncertain', alsoCites: [EARLIER] })]);
  refused({ base, result });
});

it('AC8 b9-field-boundary: the bound counts the real name a twin is written with, not its "(2)" path (b9b2)', async () => {
  const path = 'Projects/Garden visit/Earlier notice (2).txt';
  const { base, second } = await twinned(` See [[${path}]].`);
  expect(second).toBe(path);
  const suffix = ' (inferred) (also from [[Earlier notice.txt]])';
  const text = 'a'.repeat(200 - suffix.length);
  const result = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), intent(base, { marker: 'inferred', text, alsoCites: [path] })]);
  expect(/^Your reply was refused: (.*)$/m.exec(result.frames[2]?.call.input ?? '')?.[1], 'accepted on the first call').toBeUndefined();
  expect(result.code).toBe(0);
  expect(added(base, result.after[TARGET])).toEqual([{ date: '2026-10-07', text: text + suffix, source: SOURCE }]);
});

it('AC11 guard b9-temporal-change: a dated change is ordinary sourced history, no label, no question', async () => {
  const { result } = await execute({ text: 'The opening hours changed for the later season.' });
  expect(result.code).toBe(0);
  expect(result.after[TARGET]).toContain('2026-10-07 · The opening hours changed for the later season. · [[Garden notice.txt]]');
  expect(result.after[TARGET]).not.toMatch(/Contradiction:|Uncertain:|\(inferred\)/);
  expect(report(result).questions).toEqual([]);
  expect(result.frames).toHaveLength(2);
});

// Round 1 of the b9b spec review (R3a, R21-R24).
const SEP = '\u2028';
it.each([
  ['a name another folder shares, linked by name', { folder: { 'Projects/Other/Earlier notice.txt': 'Another notice.' } }, [EARLIER], false],
  ['a name another folder shares, linked by its exact path', { folder: { 'Projects/Other/Earlier notice.txt': 'Another notice.' }, links: ' See [[Projects/Garden visit/Earlier notice.txt]].' }, [EARLIER], true],
  ['a linked name with the Timeline separator', { folder: { 'Projects/Garden visit/Earlier · notice.txt': 'x' }, links: ' See [[Earlier · notice.txt]].' }, ['Projects/Garden visit/Earlier · notice.txt'], false],
  ['a linked name with a line separator', { folder: { [`Projects/Garden visit/Earlier${SEP}notice.txt`]: 'x' }, links: ` See [[Earlier${SEP}notice.txt]].` }, [`Projects/Garden visit/Earlier${SEP}notice.txt`], false],
] as const)('AC9 b9-reference-names: %s (R3a, R21)', async (_name, options, alsoCites, ok) => {
  const base = await fixture(false, { folder: { ...options.folder }, links: 'links' in options ? options.links : '' });
  const result = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), intent(base, { marker: 'uncertain', alsoCites: [...alsoCites] })]);
  if (ok) {
    expect(result.code, 'an exact path link binds even when another folder shares the name').toBe(0);
    expect(added(base, result.after[TARGET])).toEqual([{ date: '2026-10-07', text: `Uncertain: ${TEXT} (also from [[Earlier notice.txt]])`, source: SOURCE }]);
    expect(result.frames).toHaveLength(2);
  } else {
    expect(result.code).toBe(1);
    expect(result.after[TARGET]).toBe(base.c.folder[TARGET]);
    expect(manifest(result).operations, 'refused at the reply, before any effect').toEqual([]);
    expect(result.frames[2]?.call.input).toMatch(/^Your reply was refused:/m);
    expect(result.frames[2]?.call.input).not.toContain('a line with keys outside the intent');
  }
});

it('AC9 b9-inferred-own-words: only the line\'s own words count as figures, not a cited file name (R22)', async () => {
  const base = await fixture(false, { folder: { 'Projects/Garden visit/Booking 2026.txt': 'The booking is open.' }, links: ' See [[Booking 2026.txt]].' });
  const result = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'),
    intent(base, { marker: 'inferred', text: 'The visit may be affected.', alsoCites: ['Projects/Garden visit/Booking 2026.txt'] })]);
  expect(result.code).toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(added(base, result.after[TARGET])).toEqual([{ date: '2026-10-07', text: 'The visit may be affected. (inferred) (also from [[Booking 2026.txt]])', source: SOURCE }]);
});

it.each([
  ['a basename, then the exact path', { alsoCites: ['Earlier notice.txt'] }, { alsoCites: [EARLIER] }, `Uncertain: ${TEXT} (also from [[Earlier notice.txt]])`],
  ['201 decorated characters, then 200', { text: 'a'.repeat(201 - 'Uncertain: '.length) }, { text: 'a'.repeat(200 - 'Uncertain: '.length) }, `Uncertain: ${'a'.repeat(189)}`],
])('AC9 b9-marker-retry-accepted: %s is written once after the retry (R24)', async (_name, bad, good, text) => {
  const base = await fixture();
  const result = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'),
    intent(base, { marker: 'uncertain', ...bad }), intent(base, { marker: 'uncertain', ...good })]);
  expect(result.code, 'the corrected marked reply is accepted').toBe(0);
  expect(result.frames).toHaveLength(3);
  expect(result.frames[2]?.call.input).toMatch(/^Your reply was refused:/m);
  expect(added(base, result.after[TARGET])).toEqual([{ date: '2026-10-07', text, source: SOURCE }]);
  const rows = (result.lastRun as { run?: { report?: { updated?: Array<{ path: string; what: string }> } } })?.run?.report?.updated ?? [];
  expect(rows.filter((row) => row.path === TARGET).map((row) => row.what)).toEqual([text.replace(/\[\[([^\]]+)\]\]/, '$1')]);
});

it.each(['things', 'states', 'asks'] as const)('AC9 guard b9-separator-scope: a separator in %s is checked as a space is, as today (R23)', async (field) => {
  const outcome = async (gap: string) => {
    const base = await fixture();
    const id = base.sources[0]?.itemId;
    const reply = field === 'asks'
      ? { ...empty, asks: [{ fileId: id, text: `File the garden${gap}notice?`, yes: 'Yes', no: 'No' }] }
      : field === 'states'
        ? { ...intent(base, {}), states: [{ note: TARGET, lines: [`The visit${gap}is confirmed.`], cites: id }] }
        : { ...empty, things: [{ fileId: id, to: 'Projects/Garden visit', name: SOURCE, responsibility: `garden${gap}visits`,
          note: { name: 'Garden notice.md', summary: `The garden${gap}may close.`, body: 'The garden may close if heavy rain is forecast.' } }] };
    const result = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), reply]);
    return { code: result.code, calls: result.frames.length };
  };
  expect(await outcome(SEP), 'the Timeline-only separator rule does not reach this field').toEqual(await outcome(' '));
});

// Round 2 of the b9b spec review: link grammar, visible evidence, primary evidence and pending renames.
const HOURS = 'Projects/Garden visit/Hours.md';
async function marked(options: { folder?: Record<string, string>; links?: string; wants?: string[] }, line: Record<string, unknown>) {
  const base = await fixture(false, options);
  const result = await run(base, [select(base, [TARGET, ...options.wants ?? []].map((path) => base.id(path)), 'Projects/Garden visit'), intent(base, line)]);
  return { base, result };
}
function refused({ base, result }: Awaited<ReturnType<typeof marked>>) {
  expect(result.code).toBe(1);
  expect(result.after[TARGET]).toBe(base.c.folder[TARGET]);
  expect(manifest(result).operations, 'refused at the reply, before any effect').toEqual([]);
  expect(result.frames[2]?.call.input).toMatch(/^Your reply was refused:/m);
  expect(result.frames[2]?.call.input).not.toContain('a line with keys outside the intent');
}

it('AC9 b9-reference-grammar: a reference the note links only inside a code fence is refused (round 2, R3)', async () => {
  refused(await marked({ links: '\n\n```\nSee [[Unlinked leaflet.txt]].\n```' }, { marker: 'uncertain', alsoCites: [LOOSE] }));
});

it.each([
  ['an alias', ' See [[Unlinked leaflet.txt|the leaflet]].', LOOSE, 'Unlinked leaflet.txt'],
  ['a heading link', ' See [[Hours#Opening]].', HOURS, 'Hours'],
  ['a block link', ' See [[Hours^opening]].', HOURS, 'Hours'],
])('AC9 b9-reference-grammar: %s binds to its file through main (round 2, R3)', async (_name, links, path, name) => {
  const { base, result } = await marked({ folder: { [HOURS]: note('Alex lists the opening hours.', '# Hours\n\n## Opening\nMornings only.\n') }, links },
    { marker: 'uncertain', alsoCites: [path] });
  expect(result.code).toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(added(base, result.after[TARGET])).toEqual([{ date: '2026-10-07', text: `Uncertain: ${TEXT} (also from [[${name}]])`, source: SOURCE }]);
});

it('AC9 b9-visible-evidence: a file linked only by another shown note is refused (round 2, R3)', async () => {
  const OTHER = 'Projects/Garden visit/Other visit.md';
  const shown = await marked({ folder: { [OTHER]: note('Alex records another visit.', '# Other visit\n\nSee [[Unlinked leaflet.txt]].\n', true) }, wants: [OTHER] },
    { marker: 'uncertain', alsoCites: [LOOSE] });
  expect(shown.result.frames[1]?.call.input, 'the other note was shown').toContain('See [[Unlinked leaflet.txt]].');
  refused(shown);
});

it('AC9 b9-visible-evidence: a link beyond the target\'s cut is refused; the same link within it binds (round 2, R3)', async () => {
  const filler = ` ${'Alex notes the garden paths and the benches by the pond. '.repeat(80)}`;
  refused(await marked({ links: `${filler} See [[Unlinked leaflet.txt]].` }, { marker: 'uncertain', alsoCites: [LOOSE] }));
  const within = await marked({ links: ` See [[Unlinked leaflet.txt]].${filler}` }, { marker: 'uncertain', alsoCites: [LOOSE] });
  expect(within.result.frames[1]?.call.input, 'the note is cut where shown').toContain('[cut here: ');
  expect(within.result.code, 'control: a link within the cut binds').toBe(0);
  expect(added(within.base, within.result.after[TARGET])).toEqual([{ date: '2026-10-07', text: `Uncertain: ${TEXT} (also from [[Unlinked leaflet.txt]])`, source: SOURCE }]);
});

it('AC9 b9-primary-evidence: a contradiction without a primary source is refused; an uncertain one is written (round 2, TL-P4-50 Q3)', async () => {
  // The thing is cited by an ordinary line too, so it needs no note of its own and only the marked line is judged.
  const both = async (line: Record<string, unknown>) => {
    const base = await fixture();
    const value = intent(base, {});
    value.lines.push({ note: TARGET, text: 'The notices disagree about the garden.', ...line } as (typeof value.lines)[number]);
    return { base, result: await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), value]) };
  };
  refused(await both({ marker: 'contradiction', alsoCites: [EARLIER] }));
  const { base, result } = await both({ marker: 'uncertain', alsoCites: [EARLIER] });
  expect(result.code, 'words-only evidence stays allowed for an uncertain line').toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(added(base, result.after[TARGET])).toEqual([{ date: '2026-10-07', text: TEXT, source: SOURCE },
    { date: '2026-10-07', text: 'Uncertain: The notices disagree about the garden. (also from [[Earlier notice.txt]])' }]);
});

it.each(['uncertain', 'inferred'])('AC9 b9-primary-evidence: a %s "New:" line without a citation behaves as an unmarked one (round 2)', async (marker) => {
  const text = 'New: the garden may close if heavy rain is forecast.';
  const outcome = async (line: Record<string, unknown>) => {
    const { result } = await marked({}, { text, cites: undefined, ...line });
    return { code: result.code, calls: result.frames.length, why: /^Your reply was refused: (.*)$/m.exec(result.frames[2]?.call.input ?? '')?.[1] ?? null };
  };
  const plain = await outcome({});
  expect(plain.code, 'the unmarked news line without a citation is refused today').toBe(1);
  expect(await outcome({ marker })).toEqual(plain);
});

it('AC9 b9-pending-rename: a citation under a same-run former name binds and is written with the new name (round 2, R18)', async () => {
  const base = await fixture();
  const FIRST = 'Projects/Garden visit/First notice.txt';
  await base.drive.update(base.id(EARLIER), { name: 'First notice.txt' });
  await base.drive.createText(base.id('.bower/changes'), 'b9-rename.json', JSON.stringify({ v: 1, id: 'b9-rename', device: 'device-1', at: Date.UTC(2026, 9, 7, 8),
    kind: 'rename', what: 'Renamed Earlier notice to First notice', from: EARLIER, path: FIRST }));
  const admitted = await planAdmission(fakeRead(base.drive), base.root, { scope: 'all', clock: () => Date.UTC(2026, 9, 7, 9), newId: () => 'b9-rename-admission' });
  expect(admitted.kind).toBe('manifest');
  if (admitted.kind === 'manifest') base.admission = admitted.manifest;
  expect(base.admission.journal, 'the rename is taken by this run').toHaveLength(1);
  const result = await run(base, [select(base, [base.id(TARGET)], 'Projects/Garden visit'), intent(base, { marker: 'uncertain', alsoCites: [EARLIER] })]);
  expect(result.code, 'the former path binds to the renamed file').toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(parseNote(TARGET, result.after[TARGET] ?? '').timeline).toEqual([{ date: '2026-10-02', text: 'The booking remains open.', source: 'First notice.txt' },
    { date: '2026-10-07', text: `Uncertain: ${TEXT} (also from [[First notice.txt]])`, source: SOURCE }]);
});
