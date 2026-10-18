/**
 * qa-prod-6-F3: a request never ranks Bower's earlier results (a derived note is no evidence of its own), unless the
 * request names one, and a limited document's summary says some may be missing. Harness: qa-prod-5-F2's (b1-planning-support,
 * qa-prod-3-F1's `candidatesOf`). Made-up folders and figures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Sync } from '../../src/data/contracts/hashes';
import { serializeNote } from '../../src/data/contracts/note-format';
import { resultNoteKey } from '../../src/data/spine/scripted';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { AT } from './corpus-run';
import { paging } from './drive-v3';
import { empty, note, run, setup, type Base } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

const RUN = Date.UTC(2026, 9, 18, 9);
const h = (id: string): string => sha256Sync(id).slice(0, 6);
type R = Awaited<ReturnType<typeof run>>;
const rowOf = (r: R, source: string): string | undefined =>
  r.consoleLines.flatMap((l) => l.split('\n')).find((l) => l.startsWith(`selection: source=${h(source)} `));
function tagged(r: R, source: string): string[] {
  const m = / candidates=(\S+) /.exec(rowOf(r, source) ?? '');
  expect(m, `a selection row for the source: ${rowOf(r, source)}`).not.toBeNull();
  return m?.[1] === 'none' ? [] : (m?.[1] ?? '').split(',');
}
const candidatesOf = (r: R, source: string): string[] => tagged(r, source).map((c) => c.split(':')[0] ?? '');
const cutOf = (r: R, source: string): number => Number(/ cut=(\d+) /.exec(rowOf(r, source) ?? '')?.[1]);
const name = (path: string): string => path.split('/').at(-1)?.replace(/\.md$/, '') ?? '';
const summaryOf = (text: string | undefined): string | undefined => /^summary: (.*)$/m.exec(text ?? '')?.[1];
const refusals = (): string[][] => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => { const m = /was refused \((\w+)\): (.*); asking once more/.exec(line); return m ? [[m[1] ?? '', m[2] ?? '']] : []; });

const REQUEST = 'List every invoice and due I have to pay before 1 December, with the amount and the date for each.';
const linkNote = (slug: string, words: string): string => serializeNote({ summary: `Saved from example.com/${slug}.`,
  properties: [{ key: 'source', label: 'Source', value: `https://example.com/${slug}` }], tags: [], currentState: [], body: words,
  original: `${slug.split('/').at(-1) ?? 'link'}.url`, timeline: [{ date: '2 Oct', text: 'Saved by you, filed by Bower.', source: `example.com/${slug}` }], byBower: true });

const DUES_TO = 'Areas/Home';
const LINKS = [
  ['Areas/Clubs/Saltmere Rowing Club winter dues.md', 'saltmere-rowing/winter-dues', 'Saltmere Rowing Club winter dues, 60 pounds, due 15 November', 'due 15 November, 60 pounds'],
  ['Areas/Home/Brightpane window cleaning invoice 1042.md', 'brightpane/invoice-1042', 'Window cleaning, 25 pounds, due 20 November', 'due 20 November, 25 pounds'],
  ['Areas/Clubs/Ferrowick Community Choir autumn subs.md', 'ferrowick-choir/autumn-subs', 'Choir autumn subs, 30 pounds, due 24 November', 'due 24 November, 30 pounds'],
] as const;
const WORDS = [
  ['Areas/Home/Ferrowick Library lost book invoice.md', 'Lost library book, due 9 November.', 'due 9 November'],
  ['Areas/Home/Saltmere Allotment Society plot 14 renewal notice.md', 'Plot 14 renewal, due 4 November.', 'due 4 November'],
  ['Areas/Home/Saltmere council garden waste permit renewal.md', 'Garden waste permit renewal, due 30 November.', 'due 30 November'],
] as const;
const SIX = [...LINKS.map(([path]) => path), ...WORDS.map(([path]) => path)];
const NOISE = ['ant', 'bee', 'cat', 'dog', 'eel', 'fox', 'gnu', 'hen', 'ibis', 'jay', 'koi', 'lynx'];
const SIX_FOLDER = {
  ...Object.fromEntries(LINKS.map(([path, slug, words]) => [path, linkNote(slug, words)])),
  ...Object.fromEntries(WORDS.map(([path, summary]) => [path, note(summary)])),
  'Areas/Home/Larkspur Plumbing invoice 4471.md': note('Plumbing repair, due 28 October.'),
};
const HAVE_SHED = Object.fromEntries(NOISE.map((n) => [`Projects/Shed/Shed ${n}.md`, note(`Alex will have to do the ${n} shelf with care.`)]));
const SIX_BODY = [...LINKS.map(([path, , , said]) => `- [[${name(path)}]]: ${said}.`), ...WORDS.map(([path, , said]) => `- [[${name(path)}]]: ${said}.`)].join('\n');

/** An earlier Bower result note: a dense dues checklist, as the document branch writes one. */
const EARLIER = [1, 2, 3, 4, 5].map((k) => `${DUES_TO}/Earlier dues list ${k}.md`);
const resultNote = (k: number): string => serializeNote({ template: 'document', summary: `Invoices and dues to pay, list ${k}.`, tags: [],
  currentState: [], timeline: [{ date: '2026-10-07', text: 'Written for a request you made.' }], byBower: true,
  properties: [{ key: 'created', label: 'Created', value: '2026-10-07' }, { key: 'updated', label: 'Updated', value: '2026-10-07' }],
  body: `- Invoice due ${k} November: pay the amount by that date.\n- Due ${k + 10} November: pay the amount on the date.\n- Invoice due ${k + 20} November, amount and date noted.\n` });
const MAP = `${DUES_TO}/Dues register.md`;
const regions = { current: '', personal: 'PADDING\n', timeline: '', 'bower-note': '', 'moc-overview': '## Overview\nInvoice and due register.\n',
  'moc-figures': '## Figures\n1 note.\n', 'moc-members': `## Notes\n- [[${name(EARLIER[0] ?? '')}]]\n` };
const MAP_TEXT = '---\nsummary: Every invoice and due to pay, with the amount and date of each.\ntype: moc\nby: bower\nbower_format: ownership/2\n---\n\n'
  + Object.entries(regions).map(([owner, body]) => `<!-- bower:ownership/2 begin ${owner} -->\n${body}<!-- bower:ownership/2 end ${owner} -->\n`).join('\n');

const resultProps = async (paths: readonly string[]): Promise<Record<string, Record<string, string>>> =>
  Object.fromEntries(await Promise.all(paths.map(async (path, i) => [path, { by: 'bower', bowerNew: '1', bowerItem: await resultNoteKey(`earlier-${i + 1}`) }] as const)));

async function request(folder: Record<string, string>, text = REQUEST, props?: Record<string, Record<string, string>>) {
  const b = await setup({ folder, journal: [{ kind: 'request', text }], ...(props ? { props } : {}) });
  return { b, id: b.admission.journal[0]?.fileId ?? '' };
}
const select = (b: Base, id: string, to: string, wants: string[]) =>
  ({ items: [{ itemId: id, kind: 'unknown', destination: b.id(to), wants }], asks: [] });
const doc = (id: string, to: string, title: string, body: string, summary = 'Alex asked for this list.') =>
  ({ requestId: id, to, title, summary, body });
const docs = (...documents: Array<ReturnType<typeof doc>>) => ({ ...empty, documents });
const go = (b: Base, replies: unknown[], admission = b.admission, press = 1) => run(b, replies, { admission: { ...admission, at: RUN }, press });

describe('a request never ranks Bower\'s earlier results (qa-prod-6-F3)', () => {
  const EARLIER_FOLDER = Object.fromEntries(EARLIER.map((path, i) => [path, resultNote(i + 1)]));

  it('AC1 earlier_results_are_not_candidates: five dues checklists Bower wrote take no slot and are not counted', async () => {
    const folder = { ...SIX_FOLDER, ...HAVE_SHED, ...EARLIER_FOLDER };
    const { b, id } = await request(folder, REQUEST, await resultProps(EARLIER));
    const r = await go(b, [select(b, id, DUES_TO, SIX.map(b.id)), docs(doc(id, DUES_TO, 'Before December', SIX_BODY))]);
    const found = candidatesOf(r, id);
    for (const path of EARLIER) expect(found, `${name(path)} is no candidate`).not.toContain(h(b.id(path)));
    for (const path of SIX) expect(found, `${name(path)} is offered`).toContain(h(b.id(path)));
    // R5: the six dues, Larkspur and the 12 Shed notes compete; the five results are not counted as cut.
    const of = Object.keys(folder).length - EARLIER.length;
    expect(found, 'twelve offered').toHaveLength(12);
    expect(cutOf(r, id), 'cut leaves the results out').toBe(of - 12);
    expect(r.code).toBe(0);
    expect(r.after[`${DUES_TO}/Before December.md`] ?? '', '"of" leaves the results out').toMatch(new RegExp(`Bower read \\d+ of the ${of} notes that may matter here`));
  });

  it('AC1 R4 a matched map listing an earlier result does not bring it back', async () => {
    const { b, id } = await request({ ...SIX_FOLDER, ...EARLIER_FOLDER, [MAP]: MAP_TEXT }, REQUEST, await resultProps(EARLIER));
    const r = await go(b, [select(b, id, DUES_TO, []), empty]);
    const found = candidatesOf(r, id);
    for (const path of EARLIER) expect(found, `${name(path)} is no candidate`).not.toContain(h(b.id(path)));
    expect(found, 'the matched map is offered').toContain(h(b.id(MAP)));
    expect(cutOf(r, id), 'nothing else is cut').toBe(0);
  });

  it('AC2 own_result_not_offered_next_run: the document run 1 wrote is not offered to the same request again', async () => {
    const { b, id } = await request(SIX_FOLDER);
    const first = await go(b, [select(b, id, DUES_TO, SIX.map(b.id)), docs(doc(id, DUES_TO, 'Before December', SIX_BODY))]);
    expect(first.code, 'the first run completes').toBe(0);
    const written = (await b.drive.listAll(b.root)).find((f) => f.name === 'Before December.md');
    expect(written?.appProperties?.bowerItem, 'precondition: the engine wrote a result note').toMatch(/^result-/);
    const changes = b.ix.idOf(SYSTEM.changes) ?? '';
    const record = await b.drive.createText(changes, 'press-2.json', JSON.stringify({ v: 1, id: 'press-2', device: 'device-1', at: AT + 2,
      kind: 'request', what: `Asked Bower: "${REQUEST}"`, text: REQUEST }));
    const admitted = await planAdmission(fakeRead(b.drive), b.root, { scope: 'all', clock: () => AT + 3, newId: () => 'qa-prod-6-F3-second' });
    expect(admitted.kind, 'the second request is admitted').toBe('manifest');
    if (admitted.kind !== 'manifest') return;
    const r = await go(b, [select(b, record.id, DUES_TO, []), empty], admitted.manifest, 2);
    const found = candidatesOf(r, record.id);
    expect(found, 'precondition: the dues are offered').toContain(h(b.id(SIX[0] ?? '')));
    expect(found, 'its own earlier result is not offered').not.toContain(h(written?.id ?? ''));
  });

  it('AC3 guard named_result_still_pinned: a request naming the result offers it as a pin', async () => {
    const DOC = `${DUES_TO}/Before December.md`;
    const { b, id } = await request({ ...SIX_FOLDER, [DOC]: resultNote(1) }, 'Add the new dues to Before December, with the amount and the date.', await resultProps([DOC]));
    const r = await go(b, [select(b, id, DUES_TO, []), empty]);
    expect(tagged(r, id), 'the named result is pinned').toContain(`${h(b.id(DOC))}:p`);
  });
});

const NEW_TEXT = 'a document whose title, summary or body breaks the note rules: a title of at most 48 characters with no slash, a summary of one line of at most 200 characters (178 when Bower read only some of the notes), a body of at most 16,000 characters with no My notes, Timeline or Current state heading';
const TAIL = ' Some may be missing.';
const sized = (n: number): string => `${'A'.repeat(n - 1)}.`;

describe('a limited document\'s summary says some may be missing (qa-prod-6-F3)', () => {
  const due = (k: number): string => `Projects/Dues/Due ${k}.md`;
  const DUES = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [due(i + 1), note(`Club fee due ${i + 1} November.`)]));
  const limited = async (summaries: string[]) => {
    const { b, id } = await request(DUES);
    const ranked = b.ix.neighbourhood(REQUEST, Object.fromEntries(Object.entries(DUES).map(([path, text]) => [b.id(path),
      { summary: /^summary: (.*)$/m.exec(text)?.[1] ?? '' }])), RUN);
    const three = ranked.slice(0, 3);
    const body = three.map((n) => { const k = /Due (\d+)/.exec(b.ix.pathOf(n) ?? '')?.[1]; return `- [[Due ${k}]]: club fee due ${k} November.`; }).join('\n');
    const r = await go(b, [select(b, id, 'Projects/Dues', three), ...summaries.map((s) => docs(doc(id, 'Projects/Dues', 'Club fees', body, s)))]);
    expect(cutOf(r, id), 'precondition: the request is limited').toBe(3);
    return { r, body, text: r.after['Projects/Dues/Club fees.md'] ?? '' };
  };

  it('AC4 limited_summary_says_some_may_be_missing: the tail joins the summary; the body keeps its limit line', async () => {
    const { r, body, text } = await limited(['Club fees due in November.']);
    expect(r.code).toBe(0);
    expect(summaryOf(text), 'the stored summary says so').toBe(`Club fees due in November.${TAIL}`);
    expect(text, 'the limit line still closes the document').toContain(`${body}\n\nBower read 3 of the 15 notes that may matter here, so some may be missing.\n`);
  });

  it('AC4 a summary with no full stop gains one before the tail', async () => {
    const { text } = await limited(['Club fees due in November']);
    expect(summaryOf(text)).toBe(`Club fees due in November.${TAIL}`);
  });

  it('AC4 on a limited request 178 characters are accepted', async () => {
    const { r, text } = await limited([sized(178)]);
    expect(refusals(), 'no refusal').toEqual([]);
    expect(r.code).toBe(0);
    expect(summaryOf(text)).toBe(`${sized(178)}${TAIL}`);
  });

  it('AC4 on a limited request 179 characters are refused documentText with the summary clause naming 178', async () => {
    const { r, text } = await limited([sized(179), 'Club fees due in November.']);
    expect(refusals(), 'refused once, with the full documentText sentence').toEqual([['documentText', NEW_TEXT]]);
    expect(r.code).toBe(0);
    expect(summaryOf(text)).toBe(`Club fees due in November.${TAIL}`);
  });

  it('AC4 R3-2 an unlimited request in the same run as a limited one keeps its 200 bound', async () => {
    const SEED = 'Resources/Garden/Seed swap.md';
    const folder = { ...DUES, [SEED]: note('Seed swap with a neighbour.', 'A kind neighbour shares seeds.\n') };
    const b = await setup({ folder, journal: [{ kind: 'request', text: REQUEST }, { kind: 'request', text: 'Summarise the seed swap.' }] });
    const [dues = '', seed = ''] = b.admission.journal.map((j) => j.fileId);
    const ranked = b.ix.neighbourhood(REQUEST, Object.fromEntries(Object.entries(DUES).map(([path, text]) => [b.id(path),
      { summary: /^summary: (.*)$/m.exec(text)?.[1] ?? '' }])), RUN);
    const three = ranked.slice(0, 3);
    const body = three.map((n) => { const k = /Due (\d+)/.exec(b.ix.pathOf(n) ?? '')?.[1]; return `- [[Due ${k}]]: club fee due ${k} November.`; }).join('\n');
    const r = await go(b, [{ items: [{ itemId: dues, kind: 'unknown', destination: b.id('Projects/Dues'), wants: three },
      { itemId: seed, kind: 'unknown', destination: b.id('Resources/Garden'), wants: [b.id(SEED)] }], asks: [] },
    docs(doc(dues, 'Projects/Dues', 'Club fees', body, 'Club fees due in November.'), doc(seed, 'Resources/Garden', 'Seed swap notes', '- [[Seed swap]]: a neighbour shares seeds.', sized(179)))]);
    expect(cutOf(r, dues), 'precondition: the dues request is limited').toBeGreaterThan(0);
    expect(cutOf(r, seed), 'precondition: the seed request is not').toBe(0);
    expect(refusals(), 'no refusal').toEqual([]);
    expect(r.code).toBe(0);
    expect(summaryOf(r.after['Projects/Dues/Club fees.md']), 'the limited one gains the tail').toBe(`Club fees due in November.${TAIL}`);
    expect(summaryOf(r.after['Resources/Garden/Seed swap notes.md']), 'the unlimited one is kept as written').toBe(sized(179));
  });

  it('AC4 an unlimited request keeps its summary and accepts 200 characters', async () => {
    const { b, id } = await request(SIX_FOLDER);
    const r = await go(b, [select(b, id, DUES_TO, SIX.map(b.id)), docs(doc(id, DUES_TO, 'Before December', SIX_BODY, sized(200)))]);
    expect(cutOf(r, id), 'precondition: everything fits').toBe(0);
    expect(refusals(), 'no refusal').toEqual([]);
    expect(r.code).toBe(0);
    const text = r.after[`${DUES_TO}/Before December.md`] ?? '';
    expect(summaryOf(text), 'unchanged').toBe(sized(200));
    expect(text).not.toContain('Bower read');
  });
});
