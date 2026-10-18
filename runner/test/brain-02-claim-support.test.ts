/**
 * brain-02 "Check quoted evidence" (specs/brain-audit/brain-02-rulings.md): an authored item's optional "quotes" must each
 * be word for word, after normalization, in that item's own evidence; a quote that is not is refused (`quote`), asked
 * again once, then held with its pile. Prior art: Anthropic, "Reduce hallucinations" (direct quotes, verify with
 * citations); Instructor, "Exact citations" (a substring validator, refused and retried). All names and figures are made up.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { intentOf, type Seen } from '../src/claude';
import { empty, note, reply, report, run, select, setup, phaseAwareClaude, type Base } from './b1-planning-support';
import { runOnDrive } from './corpus-run';

function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('expected a value');
  return value;
}

const HOME = 'Areas/Finance';
const HUB = `${HOME}/Finance.md`;
const HOUSE = 'Areas/Home/Home.md';
const SOURCE = 'Total 10. Payment pending.';
const FAKE = 'Payment approved.';
const TRUE = 'Payment pending.';
const SAID = 'Payment is pending.';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// ---- Through production main ----

const FOLDER = {
  [HUB]: note('Finance payments.', 'Alex pays the plumber monthly.\n\n## Timeline\n', true),
  [HOUSE]: note('Home upkeep.', 'Home upkeep.\n\n## Timeline\n', true),
};
async function invoiceBase(text = SOURCE, extra: Array<{ line: string; files: string[] }> = [], files: Record<string, string> = {}) {
  return setup({ folder: { ...FOLDER }, inbox: [{ line: 'File the invoice with Finance.', files: ['Invoice.txt'] }, ...extra],
    inboxFiles: { 'Invoice.txt': text, ...files } });
}
const invoiceId = (base: Base): string => must(base.sources.find((s) => s.name === 'Invoice.txt')).itemId;

type Field = 'thing note body' | 'words-note summary' | 'Timeline line' | 'Current state';
const FIELDS: Field[] = ['thing note body', 'words-note summary', 'Timeline line', 'Current state'];
async function baseFor(field: Field): Promise<Base> {
  return field === 'words-note summary' ? setup({ folder: { ...FOLDER }, inbox: [{ line: SOURCE, files: [] }] }) : invoiceBase();
}
function replyFor(field: Field, base: Base, quotes: string[] | undefined) {
  const q = quotes === undefined ? {} : { quotes };
  const id = must(base.sources[0]).itemId;
  if (field === 'words-note summary') return { ...empty, notes: [{ pileId: id, to: HOME, name: 'Payment.md', summary: SAID, ...q }] };
  if (field === 'thing note body') return { ...empty, things: [{ fileId: id, to: HOME, name: 'Invoice.txt', note: { name: 'Invoice.md', summary: 'An invoice.', body: SAID, ...q } }] };
  if (field === 'Timeline line') return { ...empty, things: [{ fileId: id, to: HOME, name: 'Invoice.txt' }], lines: [{ note: HUB, text: SAID, cites: id, ...q }] };
  return { ...empty, things: [{ fileId: id, to: HOME, name: 'Invoice.txt', note: { name: 'Invoice.md', summary: 'An invoice.', body: 'An invoice for the plumber.' } }],
    states: [{ note: HUB, lines: [SAID], cites: id, ...q }] };
}
const writtenAt = (field: Field): string => field === 'thing note body' ? `${HOME}/Invoice.md` : field === 'words-note summary' ? `${HOME}/Payment.md` : HUB;
const selectFor = (base: Base, field: Field) => select(base, field === 'Timeline line' || field === 'Current state' ? [base.id(HUB)] : [], HOME);

it.each(FIELDS)('AC1 fabricated quote is refused and retried once: %s', async (field) => {
  const base = await baseFor(field);
  const result = await run(base, [selectFor(base, field), replyFor(field, base, [FAKE]), replyFor(field, base, [TRUE])]);
  expect(result.frames, result.errors).toHaveLength(3);
  expect(result.errors, 'the first reply is refused with kind quote').toContain('(quote)');
  expect(result.frames[2]?.call.input, 'the retry input names the fabricated quote').toMatch(/Your reply was refused: .*"Payment approved\."/);
  expect(result.code).toBe(0);
  expect(result.after[writtenAt(field)], 'the note is written').toContain(SAID);
});

it('AC2 quote matches across spacing, case and line breaks', async () => {
  const base = await invoiceBase('Total 10.\nPayment\n   pending.');
  const result = await run(base, [selectFor(base, 'thing note body'), replyFor('thing note body', base, ['payment pending.'])]);
  expect(result.frames, result.errors).toHaveLength(2);
  expect(result.code).toBe(0);
});

function twoPiles() {
  return invoiceBase(SOURCE, [{ line: 'Bicycle budget 900.', files: ['Bicycle.txt'] }], { 'Bicycle.txt': 'Bicycle budget 900.' });
}
function bothFiled(base: Base, quotes: string[]) {
  return { ...empty, things: base.sources.map((s) => ({ fileId: s.itemId, to: HOME, name: s.name,
    note: s.name === 'Invoice.txt' ? { name: 'Invoice.md', summary: 'An invoice.', body: SAID, quotes }
      : { name: 'Bicycle.md', summary: 'A bicycle budget.', body: 'Bicycle budget 900.' } })) };
}
it('AC5 repeated quote refusal holds only its pile', async () => {
  const base = await twoPiles();
  const result = await run(base, [select(base, [], HOME), bothFiled(base, [FAKE]), bothFiled(base, [FAKE])]);
  expect(result.frames, 'no third model call').toHaveLength(3);
  expect(result.errors).toContain('(quote)');
  expect(result.code).toBe(0);
  expect(result.after[`${HOME}/Invoice.md`]).toBeUndefined();
  expect(result.after[`${HOME}/Bicycle.md`], 'the other pile is filed').toContain('Bicycle budget 900.');
  const manifest = JSON.parse(Object.entries(result.after).find(([p]) => /\/manifest-[^/]+\.json$/.test(p))?.[1] ?? '{}') as { waiting?: unknown[] };
  expect(manifest.waiting, 'the invoice pile waits in the manifest').toHaveLength(1);
  expect(report(result).filed).toHaveLength(1);
  expect(report(result).setAside).toEqual([expect.objectContaining({ why: "Bower couldn't tidy this up yet. Try again." })]);
  const path = must(result.pathsById[invoiceId(base)]);
  expect(path).toMatch(/^Inbox\//); expect(result.after[path]).toBe(SOURCE);
});

it('AC6 guard: a presentLines exact repeat carrying an unchecked quote stays a no-op', async () => {
  const base = await invoiceBase(); const source = invoiceId(base);
  const line = { note: HUB, text: SAID, cites: source };
  const first = await run(base, [select(base, [base.id(HUB)], HOME), { ...empty, things: [{ fileId: source, to: HOME, name: 'Invoice.txt' }], lines: [line] }]);
  expect(first.code, first.errors).toBe(0);
  expect(first.after[HUB]).toContain(SAID);
  const calls: string[] = [];
  const again = await runOnDrive(base.c, base.drive, base.root, { request: { kind: 'tidy', text: 'Update Finance only if needed.' },
    claude: phaseAwareClaude((_call, _step, _attempt, phase) => { calls.push(phase);
      return reply({ ...empty, lines: [{ ...line, quotes: ['Never written in any source at all.'] }] }); }) }, 2);
  expect(again.code, vi.mocked(console.error).mock.calls.flat().map(String).join('\n')).toBe(0);
  expect(calls, 'not refused: no retry').toEqual(['selection', 'execution']);
  expect(again.after[HUB]).toBe(first.after[HUB]);
});

const LEASE = 'The lease ends on 31 March.';
async function leaseBase() {
  const filler = 'Alex keeps the shared garden tidy every week. '.repeat(400);
  return setup({ folder: { ...FOLDER }, inbox: [{ line: 'File the lease with Finance.', files: ['Lease.txt'] }],
    inboxFiles: { 'Lease.txt': `The lease ends on 31 March\n\n${filler}\n` } });
}
const SYNOPSIS = { statements: [{ text: LEASE, parts: [1] }] };
const leaseReply = (base: Base, body: string, quote: string) => ({ ...empty, things: [{ fileId: must(base.sources[0]).itemId, to: HOME, name: 'Lease.txt',
  note: { name: 'Lease.md', summary: 'A lease.', body, quotes: [quote] } }] });
it('AC7 a synopsized file may be quoted from its synopsis', async () => {
  const base = await leaseBase();
  const result = await run(base, [SYNOPSIS, select(base, [], HOME), leaseReply(base, LEASE, LEASE)]);
  expect(String(result.frames[2]?.call.input), 'the planner sees the synopsis').toContain(`- ${LEASE}`);
  expect(result.frames, result.errors).toHaveLength(3);
  expect(result.code).toBe(0);
  expect(result.after[`${HOME}/Lease.md`]).toContain(LEASE);
});
it('AC7 a quote in neither the synopsis nor the original is refused as quote', async () => {
  const base = await leaseBase();
  const result = await run(base, [SYNOPSIS, select(base, [], HOME), leaseReply(base, 'The lease ends in spring.', 'The lease ends on 30 April.')]);
  expect(result.errors).toContain('(quote)');
});

// ---- The reply check alone ----

function context() {
  const file = (fileId: string, name: string) => ({ fileId, name, parents: ['inbox'], modifiedTime: '2026-10-07T09:00:00Z' });
  const taken: AdmissionManifest = { v: 1, id: 'admission', rootId: 'root', scope: 'all', at: 0, journal: [], piles: [
    { pileId: 'invoice-pile', anchor: null, declaration: null, items: [file('invoice', 'Invoice.txt')] },
    { pileId: 'bicycle-pile', anchor: null, declaration: null, items: [file('bicycle', 'Bicycle.txt')] },
  ] };
  const seen: Seen = { notes: new Set([HUB, HOUSE]), folders: new Set([HOME]), words: '', shownNotes: '',
    files: new Map([[HUB, 'hub'], [HOUSE, 'house']]),
    noteTexts: new Map([[HUB, 'Alex pays the plumber monthly.'], [HOUSE, 'Home upkeep.']]),
    texts: new Map([['invoice', SOURCE], ['bicycle', 'Bicycle budget 900.']]),
    pileWords: new Map(), bowerNotes: new Set([HUB, HOUSE]) };
  return { taken, deferred: [], seen };
}
type Context = ReturnType<typeof context>;
const thing = (body: string, quotes?: string[]) => ({ ...empty, things: [{ fileId: 'invoice', to: HOME, name: 'Invoice.txt',
  note: { name: 'Invoice.md', summary: 'An invoice.', body, ...(quotes ? { quotes } : {}) } }] });
const check = (c: Context, value: unknown) => intentOf(value, c, c.seen);
const passes = (c: Context, value: unknown) => expect(check(c, value)).toMatchObject({ ok: true });
const refused = (c: Context, value: unknown, kind = 'quote') => expect(check(c, value)).toMatchObject({ ok: false, kind });

it('AC3 quote cannot span a cut', () => {
  const c = context();
  c.seen.texts = new Map([['invoice', 'Alex sent the invoice for the plumber\n[cut here: 400 more characters not shown] and the payment is pending.']]);
  passes(c, thing(SAID, ['Alex sent the invoice for the plumber']));
  refused(c, thing(SAID, ['the plumber and the payment is pending']));
});
it('AC3 quote cannot come from another source', () => {
  const c = context();
  refused(c, thing(SAID, ['Bicycle budget 900.']));
});
it('AC3 quote under 12 characters, or a 6th quote, is refused', () => {
  const c = context();
  refused(c, thing(SAID, ['Total 10.']));
  passes(c, thing(SAID, Array.from({ length: 5 }, () => TRUE)));
  refused(c, thing(SAID, Array.from({ length: 6 }, () => TRUE)));
});
it('AC4 an update may quote the note it updates', () => {
  const c = context(); const quote = 'Alex pays the plumber monthly.';
  const on = (path: string) => ({ ...thing(SAID), lines: [{ note: path, text: 'Alex pays the plumber each month.', cites: 'invoice', quotes: [quote] }] });
  passes(c, on(HUB));
  refused(c, on(HOUSE));
});
it('AC6 guard: replies without quotes are checked as today', () => {
  const c = context();
  passes(c, thing(SAID));
  refused(c, thing('Invoice total is 900.'), 'numbers');
});
