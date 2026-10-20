import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { intentOf, type Seen } from '../src/claude';
import { empty, note, reply, report, run, select, setup, phaseAwareClaude, type Base } from './b1-planning-support';
import { frameOf, runOnDrive, runWithClaude } from './corpus-run';
import { SYSTEM } from '../../src/data/vault/layout';

/** The value, or a failed test when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('expected a value');
  return value;
}

const HOME = 'Resources/Finance';
const HUB = `${HOME}/Finance.md`;
const BUDGET = 'Resources/Budget.md';
const OTHER = 'Resources/Other.md';
const file = (fileId: string, name: string) => ({ fileId, name, parents: ['inbox'], modifiedTime: '2026-10-07T09:00:00Z' });
function context() {
  const taken: AdmissionManifest = { v: 1, id: 'admission', rootId: 'root', scope: 'all', at: 0, journal: [], piles: [
    { pileId: 'invoice-pile', anchor: null, declaration: null, items: [file('invoice', 'Invoice.txt')] },
    { pileId: 'bicycle-pile', anchor: null, declaration: null, items: [file('bicycle', 'Bicycle.txt')] },
    { pileId: 'words-pile', anchor: file('words-folder', 'Words'), declaration: null, items: [] },
  ] };
  const seen: Seen = { notes: new Set([HUB, BUDGET, OTHER]), folders: new Set([HOME]), words: '', shownNotes: '',
    files: new Map([[HUB, 'hub'], [BUDGET, 'budget'], [OTHER, 'other']]),
    noteTexts: new Map([[HUB, 'Invoice history.'], [BUDGET, 'Bicycle budget.'], [OTHER, 'Other history.']]),
    texts: new Map([['invoice', 'Total 10. Payment pending.'], ['bicycle', 'Bicycle budget.']]),
    pileWords: new Map(), bowerNotes: new Set([HUB, BUDGET, OTHER]),
    types: [{ id: 'invoice', match: ['invoice'], template: 'source', properties: { reference: { type: 'text' } }, table: [] }],
  };
  return { taken, deferred: [], seen };
}
type Context = ReturnType<typeof context>;
const invoice = (body = 'Invoice total is 10.') => ({ fileId: 'invoice', to: HOME, name: 'Invoice.txt',
  note: { name: 'Invoice.md', summary: 'An invoice awaiting payment.', body } });
const proposal = (body?: string) => ({ ...empty, things: [invoice(body)] });
const check = (c: Context, value: unknown) => intentOf(value, c, c.seen);
const passes = (c: Context, value: unknown) => expect(check(c, value)).toMatchObject({ ok: true });
const refuses = (c: Context, value: unknown, figure = '900') => {
  const got = check(c, value);
  expect(got).toMatchObject({ ok: false, kind: 'numbers' });
  if (!got.ok) expect(got.why).toContain(`"${figure}"`);
};
function words(c: Context, pile: string, text: string) {
  c.seen.pileWords = new Map([[pile, text]]);
  c.seen.words = text;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('unrelated bicycle amount cannot ground invoice', () => {
  const c = context(); words(c, 'bicycle-pile', 'Bicycle budget 900.');
  passes(c, proposal()); refuses(c, proposal('Invoice total is 900.'));
});
it.each(['filename', 'rule'])('unrelated rule and filename cannot ground a date: %s', (where) => {
  const c = context();
  if (where === 'filename') must(must(c.taken.piles[1]).items[0]).name = 'Budget 2027.txt';
  else c.seen.rules = 'Keep bicycle plans for 2027.';
  refuses(c, proposal('Due in 2027.'), '2027');
});
it('attached context stays attached', () => {
  const c = context(); const value = proposal('Invoice reference is 900.');
  words(c, 'invoice-pile', 'This invoice has reference 900.'); passes(c, value);
  words(c, 'bicycle-pile', 'This invoice has reference 900.'); refuses(c, value);
});
it.each(['Timeline', 'Current state'])('destination note grounds its own update, not another note’s update: %s', (field) => {
  const c = context(); c.seen.noteTexts = new Map([[HUB, 'Retained reference 900.']]); c.seen.shownNotes = 'Retained reference 900.';
  const value = (path: string) => ({ ...proposal(), ...(field === 'Timeline'
    ? { lines: [{ note: path, text: 'Reference is 900.', cites: 'invoice' }] }
    : { states: [{ note: path, lines: ['Reference is 900.'], cites: 'invoice' }] }) });
  passes(c, value(HUB)); refuses(c, value(OTHER));
});
it.each(['Budget', 'Budget 2027. Annual'])('linked note cannot ground a different sentence: %s', (name) => {
  const c = context(); const path = `Resources/${name}.md`;
  c.seen.notes = new Set([path]); c.seen.files = new Map([[path, 'budget']]); c.seen.noteTexts = new Map([[path, '900']]); c.seen.shownNotes = '900';
  refuses(c, proposal(`Invoice total is 900. See also [[${name}]]: bicycle plans.`));
  // A sentence that starts with a link still ends the one before it.
  refuses(c, proposal(`Invoice total is 900. [[${name}]] allocates 900 for bicycles.`));
  passes(c, proposal(`[[${name}]] allocates 900 for bicycles.`));
  passes(c, proposal(`See also [[${name}]]: bicycle plans.`));
});
it.each(['body', 'summary'])('attributed figure passes in its citation sentence: %s', (field) => {
  const c = context(); c.seen.noteTexts = new Map([[BUDGET, 'Bicycle budget 900.'], [OTHER, 'Reserve 800.']]);
  const text = 'The [[Budget]] allocates 900 for bicycles and [[Other]] reserves 800.';
  passes(c, { ...empty, things: [{ ...invoice(), note: { ...invoice().note, [field]: text } }] });
});
it.each(['summary', 'Timeline', 'Current state'])('words-only figures stay with their pile: %s', (field) => {
  const c = context();
  const line = { note: HUB, text: 'Reference recorded as 900.', cites: 'words-pile' };
  const value = { ...empty, ...(field === 'summary' ? { notes: [{ pileId: 'words-pile', to: HOME, name: 'Reminder.md', summary: 'Reference recorded as 900.' }] }
    : { lines: [line], ...(field === 'Current state' ? { states: [{ note: HUB, lines: ['Reference is 900.'], cites: 'words-pile' }] } : {}) }) };
  words(c, 'words-pile', 'Please remember the reference number 900 for the payment.'); passes(c, value);
  words(c, 'bicycle-pile', 'Please remember the reference number 900 for the payment.');
  // Keep the required Timeline citation valid without letting it mask the state assertion.
  if (field === 'Current state') line.text = 'Reference recorded.';
  refuses(c, value);
});
function contradiction(c: Context) {
  c.seen.files = new Map([...c.seen.files ?? [], ['Resources/Earlier.txt', 'earlier']]);
  c.seen.noteTexts = new Map([[HUB, note('Invoice history.', 'Earlier terms: [[Earlier.txt]].', true)]]);
  return { ...proposal(), lines: [{ note: HUB, text: 'The invoice gives 10; earlier terms give 20.', cites: 'invoice', marker: 'contradiction', alsoCites: ['Resources/Earlier.txt'] }] };
}
it('contradiction uses both supplied sources', () => {
  const c = context(); const value = contradiction(c); c.seen.texts = new Map([...c.seen.texts ?? [], ['earlier', 'Earlier total 20.']]);
  passes(c, value);
});
it('unavailable secondary text supplies no figures', () => {
  const c = context(); const value = contradiction(c); refuses(c, value, '20');
});
it('numeric retained state survives source departure', () => {
  const c = context(); c.taken.piles = []; c.seen.texts = new Map();
  c.seen.noteTexts = new Map([[HUB, 'Retained reference 900.']]); c.seen.shownNotes = 'Retained reference 900.';
  // brain-05: a state with no source needs the person's answer about its note (a yes to Write it).
  c.seen.answered = new Set([HUB, OTHER]);
  passes(c, { ...empty, states: [{ note: HUB, lines: ['Reference is 900.'] }] });
  refuses(c, { ...empty, states: [{ note: OTHER, lines: ['Reference is 900.'] }] });
});
it('retry source eligibility supplies no new figure', () => {
  const c = context(); c.taken.piles = []; c.seen.texts = new Map(); c.seen.retrySources = new Set(['departed']);
  refuses(c, { ...empty, lines: [{ note: HUB, text: 'Reference is 900.', cites: 'departed' }] });
});
it('exact stored numeric line needs no original reread', () => {
  const c = context(); c.taken.piles = []; c.seen.texts = new Map();
  c.seen.presentLines = new Set([JSON.stringify([HUB, 'Reference is 900.', 'departed'])]);
  passes(c, { ...empty, lines: [{ note: HUB, text: 'Reference is 900.', cites: 'departed' }] });
});
it.each([undefined, ''])('missing aggregate words cannot bypass grounding: %s', (aggregate) => {
  const c = context(); c.seen.words = aggregate; refuses(c, proposal('Invoice total is 900.'));
});
it('keyed pile context survives omitted aggregate words', () => {
  const c = context(); words(c, 'invoice-pile', 'Reference 900.'); delete c.seen.words;
  passes(c, proposal('Reference is 900.'));
  words(c, 'bicycle-pile', 'Reference 900.'); delete c.seen.words; refuses(c, proposal('Reference is 900.'));
});
it('missing pile entry and unreadable text invent no evidence', () => {
  const c = context(); c.seen.texts = new Map(); c.seen.words = 'Reference 900.';
  words(c, 'invoice-pile', 'Reference 900.'); passes(c, proposal('Reference is 900.'));
  c.seen.pileWords = new Map(); refuses(c, proposal('Reference is 900.'));
});
it('cut notices supply no figures while fully read originals remain source bound', () => {
  const c = context(); c.seen.texts = new Map([['invoice', 'Payment pending.\n[cut here: 900 more characters not shown]']]);
  refuses(c, proposal('Reference is 900.'));
  c.seen.originals = new Map([['invoice', 'Reference 900.']]); passes(c, proposal('Reference is 900.'));
  c.seen.originals = new Map([['bicycle', 'Reference 900.']]); refuses(c, proposal('Reference is 900.'));
});
const fields = ['body', 'summary', 'properties', 'Timeline', 'Current state'] as const;
it.each(fields)('foreign figures cannot ground sibling outputs: %s', (field) => {
  const c = context();
  const value = field === 'Timeline' ? { ...proposal(), lines: [{ note: HUB, text: 'Reference 900.', cites: 'invoice' }] }
    : field === 'Current state' ? { ...proposal(), states: [{ note: HUB, lines: ['Reference 900.'], cites: 'invoice' }] }
    : { ...empty, things: [{ ...invoice(), note: { ...invoice().note, ...(field === 'properties'
      ? { typeRow: 'invoice', properties: { reference: '900' } } : { [field]: 'Reference 900.' }) } }] };
  c.seen.texts = new Map([['invoice', 'Total 10. Reference 900.']]); passes(c, value);
  c.seen.texts = new Map([['invoice', 'Total 10.'], ['bicycle', 'Reference 900.']]);
  words(c, 'bicycle-pile', 'Reference 900.'); refuses(c, value);
  c.seen.words = ''; c.seen.pileWords = new Map();
  must(c.taken.piles[0]).items.push(...must(c.taken.piles[1]).items); c.taken.piles.splice(1, 1); refuses(c, value);
});
it('body citations cannot supply figures to properties or summaries', () => {
  const c = context(); c.seen.noteTexts = new Map([[BUDGET, 'Bicycle budget 900.']]); c.seen.shownNotes = 'Bicycle budget 900.';
  for (const extra of [{ summary: 'Invoice total 900.' }, { typeRow: 'invoice', properties: { reference: '900' } }]) {
    refuses(c, { ...empty, things: [{ ...invoice(), note: { ...invoice().note, body: 'The [[Budget]] allocates 900 for bicycles.', ...extra } }] });
  }
});
it('numeric note name remains linkable', () => {
  const c = context(); const path = 'Resources/Budget 2027.md'; c.seen.notes = new Set([path]); c.seen.files = new Map([[path, 'budget']]);
  c.seen.noteTexts = new Map([[path, 'Bicycle plans.']]);
  passes(c, proposal('See also [[Budget 2027]]: bicycle plans.'));
});
it.each(['body', 'summary'])('sentence segmentation never splits inside a wikilink: %s', (field) => {
  const c = context(); const path = 'Resources/Budget 2027. Annual.md';
  c.seen.notes = new Set([path]); c.seen.files = new Map([[path, 'budget']]);
  c.seen.noteTexts = new Map([[path, 'Bicycle plans. Allocation 900.']]);
  const value = (text: string) => ({ ...empty, things: [{ ...invoice(), note: { ...invoice().note, [field]: text } }] });
  passes(c, value('See also [[Budget 2027. Annual]]: bicycle plans.'));
  passes(c, value('See also [[Budget 2027. Annual|Bicycle plans. Allocation 900]]: bicycle plans.'));
  refuses(c, value('See also [[Budget 2027. Annual|Bicycle plans. Due in 2027]]: bicycle plans.'), '2027');
  refuses(c, value('Due in 2027. See also [[Budget 2027. Annual]]: bicycle plans.'), '2027');
  refuses(c, value('Invoice total is 900. See also [[Budget 2027. Annual]]: bicycle plans.'));
});
it.each(['Due in 2027. See also [[Budget 2027]]: bicycle plans.', 'See also [[Budget 2027|2027 plans]]: bicycle plans.'])('citation-name digits cannot ground prose: %s', (body) => {
  const c = context(); const path = 'Resources/Budget 2027.md'; c.seen.notes = new Set([path]); c.seen.files = new Map([[path, 'budget']]);
  c.seen.noteTexts = new Map([[path, 'Bicycle plans.']]); c.seen.shownNotes = `${path}\nBicycle plans.`;
  refuses(c, proposal(body), '2027');
});
it('a fenced citation supplies no figures', () => {
  const c = context(); c.seen.noteTexts = new Map([[BUDGET, 'Bicycle budget 900.']]); c.seen.shownNotes = 'Bicycle budget 900.';
  refuses(c, proposal('```\nThe [[Budget]] allocates 900.\n```'));
});

async function fixture() {
  return setup({ folder: { [HUB]: note('Finance invoice and bicycle payment history.', 'Payment history.\n\n## Timeline\n', true) },
    inbox: [{ line: 'File the invoice with Finance.', files: ['Invoice.txt'] }, { line: 'Bicycle budget 900.', files: ['Bicycle.txt'] }],
    inboxFiles: { 'Invoice.txt': 'Total 10. Payment pending.', 'Bicycle.txt': 'Bicycle budget 900.' } });
}
function liveReply(base: Base, figure: number) {
  return { ...empty, things: base.sources.map((s) => ({ fileId: s.itemId, to: HOME, name: s.name,
    note: { name: s.name.replace('.txt', '.md'), summary: 'A payment record.', body: s.name === 'Invoice.txt' ? `Invoice total is ${figure}.` : 'Bicycle budget 900.' } })) };
}
it('numeric refusal accepts a corrected retry', async () => {
  const base = await fixture(); const result = await run(base, [select(base, [], HOME), liveReply(base, 900), liveReply(base, 10)]);
  expect(result.frames, result.errors).toHaveLength(3); expect(result.frames[2]?.call.input).toMatch(/Your reply was refused: .*"900"/);
  expect(result.errors).toContain('(numbers)'); expect(result.code).toBe(0);
  expect(result.after[`${HOME}/Invoice.md`]).toContain('Invoice total is 10.');
});
it('repeated numeric refusal holds its pile while unrelated work completes', async () => {
  const base = await fixture(); const result = await run(base, [select(base, [], HOME), liveReply(base, 900), liveReply(base, 900)]);
  expect(result.frames, result.errors).toHaveLength(3); expect(result.frames[2]?.call.input).toMatch(/Your reply was refused: .*"900"/);
  expect(result.errors).toContain('(numbers)'); expect(result.code).toBe(0);
  expect(result.after[`${HOME}/Invoice.md`]).toBeUndefined(); expect(result.after[`${HOME}/Bicycle.md`]).toContain('Bicycle budget 900.');
  const source = must(base.sources.find((s) => s.name === 'Invoice.txt')).itemId;
  const path = must(result.pathsById[source]); expect(path).toMatch(/^Inbox\//); expect(result.after[path]).toBe('Total 10. Payment pending.');
  expect(result.events.filter((e) => ['POST', 'PATCH', 'DELETE'].includes(e.method) && e.path === path)).toEqual([]);
  const manifest = JSON.parse(Object.entries(result.after).find(([p]) => /\/manifest-[^/]+\.json$/.test(p))?.[1] ?? '{}');
  expect(manifest.waiting).toHaveLength(1); expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(report(result).filed).toHaveLength(1);
  expect(report(result).setAside).toEqual([expect.objectContaining({ why: "Bower couldn't tidy this up yet. Try again." })]);
  const pile = must(base.admission.piles.find((p) => p.items.some((item) => item.fileId === source)));
  for (const item of [...pile.items, ...(pile.anchor ? [pile.anchor] : [])]) {
    const heldPath = must(result.pathsById[item.fileId]);
    expect(heldPath).toMatch(/^Inbox\//);
    expect(result.events.filter((e) => ['POST', 'PATCH', 'DELETE'].includes(e.method) && e.path === heldPath)).toEqual([]);
  }
});
it('numeric repeated line remains a no-op after source departure', async () => {
  const base = await fixture(); const source = must(base.sources.find((s) => s.name === 'Invoice.txt')).itemId;
  const line = { note: HUB, text: 'Invoice total is 10.', cites: source };
  const first = await run(base, [select(base, [], HOME), { ...empty, things: liveReply(base, 10).things.map((thing) => thing.fileId === source ? { fileId: source, to: HOME, name: 'Invoice.txt' } : thing), lines: [line] }]);
  expect(first.code, first.errors).toBe(0);
  expect(first.after[HUB]).toContain('Invoice total is 10.');
  const calls: string[] = [];
  const again = await runOnDrive(base.c, base.drive, base.root, { request: { kind: 'tidy', text: 'Update Finance only if needed.' },
    claude: phaseAwareClaude((_call, _step, _attempt, phase) => { calls.push(phase); return reply({ ...empty, lines: [line] }); }) }, 2);
  expect(again.code, JSON.stringify({ errors: vi.mocked(console.error).mock.calls, before: first.after[HUB], source: first.pathsById[source] })).toBe(0); expect(calls).toEqual(['selection', 'execution']); expect(again.after[HUB]).toBe(first.after[HUB]);
});
it('numeric consent retry preserves the approved change', async () => {
  const path = 'Areas/Home/Garden plot.md'; const sourceName = 'Water butt update.txt';
  const base = await setup({ fixture: 'c05-note-not-written-by-bower' }); const c = base.c;
  delete c.presses; c.expected = {};
  c.inboxFiles[sourceName] += '\nReplacement capacity 900 litres.';
  const state = 'The replacement holds 900 litres.';
  c.presses = [{ between: [{ kind: 'answer', question: { kind: 'state', note: path }, yes: true }] }, { request: { kind: 'tidy', text: 'Update Garden plot.' } }];
  const calls: string[] = [];
  const result = await runWithClaude(c, phaseAwareClaude((call, step, _attempt, phase) => {
    calls.push(`${step}:${phase}`);
    const ctx = frameOf(call) as { piles: Array<{ things: Array<{ name: string; fileId: string }> }> };
    const source = ctx.piles.flatMap((p) => p.things).find((t) => t.name === sourceName)?.fileId;
    return reply(step === 0 ? { ...empty, things: [{ fileId: source, to: 'Areas/Home', name: sourceName }],
      lines: [{ note: path, text: state, cites: source }], states: [{ note: path, lines: [state], cites: source }] }
      : { ...empty, states: [{ note: path, lines: [state] }] });
  }));
  const runs = [...result.runs ?? [], result];
  expect(runs[0]?.after[SYSTEM.questions]).toContain(state);
  expect(runs[1]?.after[path]).toContain(`- ${state}`); expect(result.after[path]).toBe(runs[1]?.after[path]);
  expect(result.after[SYSTEM.questions]).not.toContain('"kind":"state"');
  expect(calls.filter((call, index) => calls.indexOf(call) !== index)).toEqual([]);
});
