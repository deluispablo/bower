import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { parseNote } from '../../src/data/contracts/note-format';
import { empty, manifest, note, report, run, select, setup, type Base } from './b1-planning-support';

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

async function fixture(person = false) {
  const base = await setup({ folder: { [TARGET]: note('Alex records a garden visit.', body, !person),
    [EARLIER]: 'The booking remains open.', [LOOSE]: 'Opening hours for the season.' },
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
  ['two extra sources', { marker: 'uncertain', alsoCites: [EARLIER, LOOSE] }],
  ['an empty extra source list', { marker: 'uncertain', alsoCites: [] }],
  ['a contradiction with one source', { marker: 'contradiction' }],
  ['a basename', { marker: 'contradiction', alsoCites: ['Earlier notice.txt'] }],
  ['a file id', { marker: 'contradiction', alsoCites: ['$id'] }],
  ['a file the note does not link', { marker: 'contradiction', alsoCites: [LOOSE] }],
  ['a missing file', { marker: 'contradiction', alsoCites: ['Projects/Garden visit/Made up.txt'] }],
  ['a folder', { marker: 'contradiction', alsoCites: ['Projects/Garden visit'] }],
  ['the cited thing itself', { marker: 'contradiction', alsoCites: [`Inbox/${SOURCE}`] }],
  ['a reference with link syntax', { marker: 'uncertain', alsoCites: ['Projects/Garden visit/Earlier notice.txt|alias'] }],
  ['an inferred figure', { marker: 'inferred', text: 'The visit on 2026-10-02 may be affected.' }],
  ['an invented figure', { marker: 'uncertain', text: 'The garden may close on 77 days.' }],
  ['a label without a marker', { text: 'Contradiction: the notices disagree.' }],
  ['a qualifier without a marker', { text: 'The visit may be affected. (inferred)' }],
])('AC9 b9-marker-refused: %s refuses before any write, through the retry', async (name, raw) => {
  const base = await fixture();
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

it('AC11 guard b9-temporal-change: a dated change is ordinary sourced history, no label, no question', async () => {
  const { result } = await execute({ text: 'The opening hours changed for the later season.' });
  expect(result.code).toBe(0);
  expect(result.after[TARGET]).toContain('2026-10-07 · The opening hours changed for the later season. · [[Garden notice.txt]]');
  expect(result.after[TARGET]).not.toMatch(/Contradiction:|Uncertain:|\(inferred\)/);
  expect(report(result).questions).toEqual([]);
  expect(result.frames).toHaveLength(2);
});
