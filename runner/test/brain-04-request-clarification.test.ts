/**
 * brain-04: a request whose words do not establish the changes is asked about once, on its map's "question" (B12d's
 * request question, `q-request-<record id>`), never in "asks": nothing changes until a yes, a yes applies only the part the
 * question froze, and a stale, declined or taken-back clarification grants nothing (rulings
 * specs/brain-audit/brain-04-rulings.md). The question's text ends with Bower's own words for the frozen changes, so it
 * names what a yes does. Prior art: Aliannejadi et al., SIGIR 2019 (ask when the request leaves the intent unclear);
 * OWASP LLM06 "Excessive Agency" (a human approves the exact action); the B12d frozen part. Made-up folders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WAITING_WHY } from '../../src/data/contracts/run-manifest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { AT } from './corpus-run';
import { fileIntent, folder as base, report, run, setup, type Base } from './b1-planning-support';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const FIN = 'Areas/Finance';
const INVOICES = [`${FIN}/Invoice one.md`, `${FIN}/Invoice two.md`, `${FIN}/Invoice three.md`];
const LATER = `${FIN}/Invoice four.md`;
const AMOUNTS = [120, 340, 75];
const TABLE = { v: 1, rows: [{ id: 'invoice', match: ['invoice'], template: 'source', properties: { amount: { type: 'number' }, payment: { type: 'text' } }, table: ['amount', 'payment'] }] };
const invoice = (i: number) => `---\nby: bower\ntype: invoice\nsummary: An invoice Alex received.\npayment: sent\namount: ${AMOUNTS[i] ?? 60}\n---\n\n## Notes\nAn invoice for Alex.\n`;
const CLEAN = 'Clean up my invoices.';
const ORGANIZE = 'Organize my invoices; each amount should read 999999.';
const prop = (key: string, value: unknown) => ({ kind: 'property', key, mode: 'set', value });
const PAID = prop('payment', 'paid');
const AUDIT = prop('amount', 999999);
const ASK = { text: 'Tidy your invoices?', yes: 'Tidy them', no: 'Leave them' };

type Q = { id: string; text: string; yes: string; no: string; askedAt: number; request?: { id: string; ops: unknown[]; members: string[]; total: number } };
const questions = (r: { after: Record<string, string> }): Q[] => (JSON.parse(r.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Q[] }).questions;
const firstRefusal = (r: { errors: string }) => /was refused \((\w+)\)/.exec(r.errors)?.[1];
const front = (text: string | undefined, key: string) => new RegExp(`^${key}: (.*)$`, 'm').exec(text ?? '')?.[1];
const pending = (r: { after: Record<string, string> }, record: string) => `${SYSTEM.changes}/${record}.json` in r.after;

async function folder(words: string, extra: Record<string, string> = {}) {
  const b = await setup({ journal: [{ kind: 'request', text: words }], folder: { ...base, ...extra,
    [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2),
    [`${FIN}/Finance.md`]: `---\nsummary: Alex keeps money matters here.\n---\n\n# Finance\n`,
    ...Object.fromEntries(INVOICES.map((p, i) => [p, invoice(i)])) } });
  const requestId = b.admission.journal[0]?.fileId ?? '';
  expect(requestId, 'the request is admitted').not.toBe('');
  return { b, requestId };
}
type F = Awaited<ReturnType<typeof folder>>;
const selection = ({ b, requestId }: F) => ({ items: [
  { itemId: requestId, kind: 'unknown', destination: b.id(FIN), wants: [] },
  ...b.sources.map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: b.id('Projects/Remote search'), wants: [] })),
], asks: [] });
const set = (b: Base) => ({ type: 'invoice', folderId: b.id(FIN), recursive: false, where: { op: 'eq', property: 'payment', value: 'sent' } });
/** The inbox pile filed, and the request's map with `body`. */
const mapReply = ({ b, requestId }: F, body: Record<string, unknown>, title = 'Invoices') => ({ ...fileIntent(b), maps: [{ requestId, title, set: set(b), ...body }] });

/** The first tidy-up: the reply asks about the request on its map; the question is read back from the folder. */
async function asked(f: F, body: Record<string, unknown> = { ops: [PAID], question: ASK }, title?: string) {
  const r = await run(f.b, [selection(f), mapReply(f, body, title)]);
  expect(firstRefusal(r), 'R1: the question is accepted, not refused').toBeUndefined();
  const q = questions(r).find((x) => x.request !== undefined);
  expect(q, 'R1: one request question').toBeDefined();
  return { r, q: q as Q };
}
/** A later tidy-up on the same folder, after `lines` were added to the person's changes; `replies` get the new lines' file ids. */
async function later(f: F, press: number, lines: Array<Record<string, unknown>>, replies: (ids: string[]) => unknown[] = () => [EMPTY]) {
  const changes = f.b.ix.idOf(SYSTEM.changes) ?? '';
  const ids: string[] = [];
  for (const [i, line] of lines.entries()) ids.push((await f.b.drive.createText(changes, `later-${press}-${i}.json`, JSON.stringify({ v: 1, device: 'device-1', at: AT + press * 1000 + i, ...line }))).id);
  const admitted = await planAdmission(fakeRead(f.b.drive), f.b.root, { scope: 'instructions', clock: () => AT + press * 1000 + 500, newId: () => `brain-04-admission-${press}` });
  if (admitted.kind !== 'manifest') throw new Error(`Not admitted: ${admitted.cause}`);
  return run(f.b, replies(ids), { admission: admitted.manifest, press });
}
const EMPTY = { kind: 'tidy-intent', v: 1, things: [] };
const OTHER = { kind: 'request', what: 'Asked Bower: "Update these notes."', text: 'Update these notes.' };
/** The selection of a later run: each new request goes to Finance with no note. */
const selecting = (f: F, ids: readonly string[]) => ({ items: ids.map((itemId) => ({ itemId, kind: 'unknown', destination: f.b.id(FIN), wants: [] })), asks: [] });
const answer = (q: Q, yes: boolean, at: number = q.askedAt) => ({ id: `answer-${String(yes)}`, kind: 'answer', what: 'Answered a question', questionId: q.id, askedAt: at, answer: yes, text: yes ? 'yes' : 'no' });
const untouched = (r: { after: Record<string, string> }) => INVOICES.map((p, i) => r.after[p] === invoice(i));

describe('brain-04 AC1 clean up invoices asks without changing them', () => {
  it('one request question holding the frozen part; no note changes; the request waits', async () => {
    const f = await folder(CLEAN);
    const { r, q } = await asked(f);
    expect(questions(r).filter((x) => x.request !== undefined), 'R1: exactly one').toHaveLength(1);
    expect(q.id, 'R1: the request\'s question, by its record').toBe(`q-request-${q.request?.id ?? ''}`);
    expect(q.request?.ops, 'R1: the frozen change').toEqual([PAID]);
    expect(q.request?.members, 'R1: the three invoices of the set').toEqual(expect.arrayContaining(INVOICES.map((p) => f.b.id(p))));
    expect(q.request?.total).toBe(3);
    expect(untouched(r), 'R1: every invoice byte-identical').toEqual([true, true, true]);
    expect(pending(r, q.request?.id ?? ''), 'R1: the request waits for its answer').toBe(true);
    expect(report(r).filed, 'the inbox pile is filed').toHaveLength(1);
    expect(r.code).toBe(0);
  });

  it('a question carrying a figure the request never says is refused (brain-03 numbers) and asks nothing', async () => {
    const f = await folder(CLEAN);
    const bad = mapReply(f, { ops: [PAID, AUDIT], question: ASK });
    const r = await run(f.b, [selection(f), bad, bad]);
    expect(firstRefusal(r), 'R1: an invented figure is never asked about').toBe('numbers');
    expect(questions(r).filter((x) => x.request !== undefined)).toEqual([]);
    expect(untouched(r)).toEqual([true, true, true]);
  });
});

describe('brain-04 AC2 yes applies only the frozen change', () => {
  it('a yes writes payment on the asked invoices only, with no model; a later reply adding amount changes nothing', async () => {
    const f = await folder(CLEAN);
    const { q } = await asked(f);
    await f.b.drive.createText(f.b.ix.idOf(FIN) ?? '', 'Invoice four.md', invoice(3));
    const yes = await later(f, 2, [answer(q, true)]);
    expect(yes.frames, 'R2: no model call').toEqual([]);
    expect(INVOICES.map((p) => front(yes.after[p], 'payment')), 'R2: the frozen change on the asked invoices').toEqual(['paid', 'paid', 'paid']);
    expect(INVOICES.map((p) => front(yes.after[p], 'amount')), 'R2: amount unchanged').toEqual(AMOUNTS.map(String));
    expect(yes.after[LATER], 'R2: an invoice added after the question is not in the part').toBe(invoice(3));
    expect(questions(yes).filter((x) => x.request !== undefined), 'the question is settled').toEqual([]);
    expect(pending(yes, q.request?.id ?? ''), 'the request is done').toBe(false);
    // The next tidy-up's reply maps the answered request again, adding amount: it is no request of this run.
    const greedy = { ...EMPTY, maps: [{ requestId: f.requestId, title: 'Invoices', set: set(f.b), ops: [PAID, AUDIT], question: ASK }] };
    const next = await later(f, 3, [{ id: 'other-3', ...OTHER }], (ids) => [selecting(f, ids), greedy, greedy]);
    expect(firstRefusal(next), 'R2: the answered request is no request of this run').toBe('mapBinding');
    expect(INVOICES.map((p) => front(next.after[p], 'amount')), 'R2: the later reply changes no amount').toEqual(AMOUNTS.map(String));
    expect(questions(next).filter((x) => x.request !== undefined), 'R2: and asks nothing').toEqual([]);
  });
});

describe('brain-04 AC3 stale or declined clarification grants nothing', () => {
  it('no answer: a repeated tidy-up keeps the one question and changes nothing', async () => {
    const f = await folder(CLEAN);
    const { r, q } = await asked(f);
    const again = await later(f, 2, [{ id: 'other-2', ...OTHER }], (ids) => [selecting(f, ids), EMPTY]);
    expect(again.frames.some((x) => x.prompt.includes(CLEAN)), 'R3: the held request is not shown again').toBe(false);
    expect(questions(again), 'R3: no duplicate question, the same asking').toEqual(questions(r));
    expect(untouched(again)).toEqual([true, true, true]);
    expect(pending(again, q.request?.id ?? '')).toBe(true);
  });

  it('a no writes nothing and settles the request', async () => {
    const f = await folder(CLEAN);
    const { q } = await asked(f);
    const no = await later(f, 2, [answer(q, false)]);
    expect(untouched(no), 'R3: a no grants nothing').toEqual([true, true, true]);
    expect(questions(no).filter((x) => x.request !== undefined)).toEqual([]);
    expect(pending(no, q.request?.id ?? ''), 'the request is settled').toBe(false);
  });

  it('a yes to another asking (stale askedAt) writes nothing; the question stays open', async () => {
    const f = await folder(CLEAN);
    const { q } = await asked(f);
    const stale = await later(f, 2, [answer(q, true, q.askedAt - 1)]);
    expect(untouched(stale), 'R3: a stale yes grants nothing').toEqual([true, true, true]);
    expect(questions(stale).map((x) => x.id), 'the question stays open').toEqual([q.id]);
    expect(pending(stale, q.request?.id ?? '')).toBe(true);
  });

  it('a request taken back and asked again in other words: a yes to the old question writes nothing', async () => {
    const f = await folder(CLEAN);
    const { q } = await asked(f);
    const record = q.request?.id ?? '';
    const changed = await later(f, 2, [{ id: 'back-2', kind: 'request', what: 'Took back the request', undoes: record },
      { id: 'new-2', kind: 'request', what: 'Asked Bower: "Tell me how many invoices I have."', text: 'Tell me how many invoices I have.' }, answer(q, true)],
      (ids) => [selecting(f, ids.slice(1, 2)), EMPTY]);
    expect(untouched(changed), 'R3: a taken-back request grants nothing').toEqual([true, true, true]);
    expect(questions(changed).filter((x) => x.request !== undefined)).toEqual([]);
  });
});

describe('brain-04 AC4 the question names the actual operation', () => {
  it('a map titled Organize invoices that sets amount to 999999 says so in Bower\'s words', async () => {
    const f = await folder(ORGANIZE);
    const { q } = await asked(f, { ops: [AUDIT], question: { text: 'Organize your invoices?', yes: 'Organize', no: 'Leave them' } }, 'Organize invoices');
    expect(q.text, 'R4: the model\'s words, then the change').toBe('Organize your invoices? A yes sets amount to 999999.');
    expect(q.request?.ops).toEqual([AUDIT]);
  });

  it('two changes are both named', async () => {
    const f = await folder(ORGANIZE);
    const { q } = await asked(f, { ops: [PAID, AUDIT], question: ASK });
    expect(q.text, 'R4: every frozen op').toBe('Tidy your invoices? A yes sets payment to paid and sets amount to 999999.');
  });

  it('AC4 tag_named_as_written: a tag is named as the write adds it, on one line', async () => {
    const f = await folder(CLEAN, { [SYSTEM.tags]: JSON.stringify({ v: 1, tags: ['finance-stuff'] }, null, 2) });
    const { q } = await asked(f, { ops: [{ kind: 'tag', mode: 'add', value: 'Finance Stuff\n' }], question: ASK });
    expect(q.text, 'R4: the normalized tag, no newline').toBe('Tidy your invoices? A yes adds the tag finance-stuff.');
    expect(q.request?.ops, 'the frozen tag is the one the text names').toEqual([{ kind: 'tag', mode: 'add', value: 'finance-stuff' }]);
  });

  for (const [name, body] of [
    ['a text too long to also name its change', { ops: [PAID], question: { ...ASK, text: `Tidy your invoices${' now'.repeat(44)}?` } }],
    ['a move', { ops: [{ kind: 'move', parentId: 'MOVE' }], question: ASK }],
  ] as const) {
    it(`${name} cannot be asked: refused askText twice, the request waits, nothing changes`, async () => {
      const f = await folder(ORGANIZE);
      const given = JSON.parse(JSON.stringify(body).replace('MOVE', f.b.id('Resources/Gardening'))) as Record<string, unknown>;
      const bad = mapReply(f, given);
      const r = await run(f.b, [selection(f), bad, bad]);
      expect(firstRefusal(r), 'R4: a question Bower cannot state').toBe('askText');
      expect(questions(r).filter((x) => x.request !== undefined)).toEqual([]);
      expect(untouched(r)).toEqual([true, true, true]);
      expect(report(r).setAside, 'R4: the request waits').toEqual([{ name: ORGANIZE, why: WAITING_WHY }]);
      expect(report(r).filed, 'the inbox pile is filed').toHaveLength(1);
      expect(r.code).toBe(0);
    });
  }
});
