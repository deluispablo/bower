/**
 * qa-prod-5-F2: the ranking reads each note's own words. A note's body words are its version's lint evidence (`terms`,
 * v2), the request ranking reads them, a request's ranking is not bounded before the provider's cut, and what that cut
 * leaves out is counted in the `selection:` row and said in Bower's limit line. Harness: b1-planning-support and
 * qa-prod-3-F1's `candidatesOf`. Made-up folders and figures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Sync } from '../../src/data/contracts/hashes';
import { serializeNote } from '../../src/data/contracts/note-format';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { AT } from './corpus-run';
import { paging } from './drive-v3';
import { candidates, empty, media, note, run, setup, type Base } from './b1-planning-support';

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
/** The candidate hashes of one source's `selection:` row, with their tags (qa-prod-3-F1's `candidatesOf`). */
function tagged(r: R, source: string): string[] {
  const m = / candidates=(\S+) /.exec(rowOf(r, source) ?? '');
  expect(m, `a selection row for the source: ${rowOf(r, source)}`).not.toBeNull();
  return m?.[1] === 'none' ? [] : (m?.[1] ?? '').split(',');
}
const candidatesOf = (r: R, source: string): string[] => tagged(r, source).map((c) => c.split(':')[0] ?? '');
const cutOf = (r: R, source: string): number => Number(/ cut=(\d+) /.exec(rowOf(r, source) ?? '')?.[1]);
const name = (path: string): string => path.split('/').at(-1)?.replace(/\.md$/, '') ?? '';

const REQUEST = 'List every invoice and due I have to pay before 1 December, with the amount and the date for each.';
/** The request's query after stop words and the window expansion from 18 October (Ruling 1, qa-prod-3-F1). */
const QUERY = new Set(['list', 'every', 'invoice', 'due', 'i', 'have', 'pay', 'before', '1', 'december', 'amount', 'date', 'each', 'october', 'november']);
const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** A saved link's note, written as the saved-link branch writes it (`scripted.ts`). */
const linkNote = (slug: string, words: string): string => serializeNote({ summary: `Saved from example.com/${slug}.`,
  properties: [{ key: 'source', label: 'Source', value: `https://example.com/${slug}` }], tags: [], currentState: [], body: words,
  original: `${slug.split('/').at(-1) ?? 'link'}.url`, timeline: [{ date: '2 Oct', text: 'Saved by you, filed by Bower.', source: `example.com/${slug}` }], byBower: true });

const ROWING = 'Areas/Clubs/Saltmere Rowing Club winter dues.md';
const SWIM = 'Areas/Health/Saltmere Swimming Club card renewal.md';
const ROWING_SUMMARY = 'Saved from example.com/saltmere-rowing/winter-dues.';
const SWIM_SUMMARY = 'Membership card for the Saltmere Swimming Club.';
const NOISE = ['ant', 'bee', 'cat', 'dog', 'eel', 'fox', 'gnu', 'hen', 'ibis', 'jay', 'koi', 'lynx'];
const SHED = Object.fromEntries(NOISE.map((n) => [`Projects/Shed/Shed ${n}.md`, note(`Alex will have to do the ${n} shelf with care.`)]));
const AC1_FOLDER = {
  [ROWING]: linkNote('saltmere-rowing/winter-dues', 'Saltmere Rowing Club winter dues, 60 pounds, due 15 November'),
  [SWIM]: note(SWIM_SUMMARY, 'Card renewal due 28 November, fee 45 pounds.\n'),
  ...SHED,
};

async function request(folder: Record<string, string>, text = REQUEST) {
  const b = await setup({ folder, journal: [{ kind: 'request', text }] });
  return { b, id: b.admission.journal[0]?.fileId ?? '' };
}
const select = (b: Base, id: string, to: string, wants: string[]) =>
  ({ items: [{ itemId: id, kind: 'unknown', destination: b.id(to), wants }], asks: [] });
const doc = (id: string, to: string, title: string, body: string) =>
  ({ ...empty, documents: [{ requestId: id, to, title, summary: 'Alex asked for this list.', body }] });
const go = (b: Base, replies: unknown[], admission = b.admission, press = 1) => run(b, replies, { admission: { ...admission, at: RUN }, press });

describe('a note\'s own words reach a request (qa-prod-5-F2)', () => {
  it('AC1 link_note_words_reach_request_candidates: the rowing link note and the swimming card are offered on their body words', async () => {
    for (const [path, summary] of [[ROWING, ROWING_SUMMARY], [SWIM, SWIM_SUMMARY]] as const)
      expect(words(`${name(path)} ${summary}`).filter((t) => QUERY.has(t)), `precondition: ${name(path)} shares no word by name or summary`).toEqual([]);
    const { b, id } = await request(AC1_FOLDER);
    const r = await go(b, [select(b, id, 'Areas/Health', []), empty]);
    const found = candidatesOf(r, id);
    expect(found, 'the rowing link note is offered').toContain(h(b.id(ROWING)));
    expect(found, 'the swimming card note is offered').toContain(h(b.id(SWIM)));
    // Ruling 10: both outrank the 12 Shed notes that still match "have" (on this fixture, n1 and n2 with cut=2).
    const places = tagged(r, id).filter((c) => [h(b.id(ROWING)), h(b.id(SWIM))].includes(c.split(':')[0] ?? '')).map((c) => c.split(':')[1]);
    expect(places, 'each dated note has its place in the row').toHaveLength(2);
    expect(cutOf(r, id), 'the Shed notes still compete: some are cut').toBeGreaterThan(0);
  });

  it('AC2 body_terms_survive_an_unchanged_run: a second request over the unchanged folder offers both again, reading neither', async () => {
    const { b, id } = await request(AC1_FOLDER);
    const first = await go(b, [select(b, id, 'Areas/Health', []), { ...empty, answers: [{ requestId: id, text: 'Bower found nothing more to list.' }] }]);
    expect(first.code, 'the first run completes').toBe(0);
    const changes = b.ix.idOf(SYSTEM.changes) ?? '';
    const record = await b.drive.createText(changes, 'press-2.json', JSON.stringify({ v: 1, id: 'press-2', device: 'device-1', at: AT + 2,
      kind: 'request', what: `Asked Bower: "${REQUEST}"`, text: REQUEST }));
    const admitted = await planAdmission(fakeRead(b.drive), b.root, { scope: 'all', clock: () => AT + 3, newId: () => 'qa-prod-5-F2-second' });
    expect(admitted.kind, 'the second request is admitted').toBe('manifest');
    if (admitted.kind !== 'manifest') return;
    expect(admitted.manifest.journal.map((j) => j.fileId), 'precondition: the new record is the one admitted').toEqual([record.id]);
    // A second run of its own (another run id) over the folder the first one left; its planning is what is checked.
    const r = await go(b, [select(b, record.id, 'Areas/Health', []), empty], admitted.manifest, 2);
    const found = candidatesOf(r, record.id);
    expect(found, 'the rowing link note is offered again').toContain(h(b.id(ROWING)));
    expect(found, 'the swimming card note is offered again').toContain(h(b.id(SWIM)));
    for (const path of [ROWING, SWIM]) expect(media(r, b.id(path), false), `no read of ${name(path)}`).toEqual([]);
  });

  it('R4-5 a JSON key word no longer pulls a note: a request ranks on its words, not its record\'s keys', async () => {
    const SEED = 'Resources/Garden/Seed swap.md';
    const SEED_SUMMARY = 'Seed swap with a neighbour.';
    const SEED_BODY = 'A kind neighbour shares seeds.\n';
    expect(words(`${name(SEED)} ${SEED_SUMMARY} ${SEED_BODY}`).filter((t) => QUERY.has(t)), 'precondition: the seed note shares no request word').toEqual([]);
    const { b, id } = await request({ [ROWING]: AC1_FOLDER[ROWING] ?? '', [SEED]: note(SEED_SUMMARY, SEED_BODY) });
    expect(await b.drive.readText(id), 'precondition: the record holds the key word').toContain('"kind"');
    const r = await go(b, [select(b, id, 'Areas/Clubs', []), empty]);
    const found = candidatesOf(r, id);
    expect(found, 'the rowing note is offered on the request words').toContain(h(b.id(ROWING)));
    expect(found, 'the seed note is not offered on the key "kind"').not.toContain(h(b.id(SEED)));
  });
});

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
const SIX_FOLDER = {
  ...Object.fromEntries(LINKS.map(([path, slug, words]) => [path, linkNote(slug, words)])),
  ...Object.fromEntries(WORDS.map(([path, summary]) => [path, note(summary)])),
  'Areas/Home/Larkspur Plumbing invoice 4471.md': note('Plumbing repair, due 28 October.'),
  ...Object.fromEntries(NOISE.map((n) => [`Projects/Shed/Shed ${n}.md`, note(`Alex will mend the ${n} shelf.`)])),
};

describe('every dated note fits or is counted (qa-prod-5-F2)', () => {
  it('AC3 six_dated_dues_all_offered: the six dues are offered, cited, and no limit line is added', async () => {
    const { b, id } = await request(SIX_FOLDER);
    const body = [...LINKS.map(([path, , , said]) => `- [[${name(path)}]]: ${said}.`), ...WORDS.map(([path, , said]) => `- [[${name(path)}]]: ${said}.`)].join('\n');
    const r = await go(b, [select(b, id, DUES_TO, SIX.map(b.id)), doc(id, DUES_TO, 'Before December', body)]);
    for (const path of SIX) expect(candidates(r.frames[0], id), `${name(path)} is offered`).toContain(b.id(path));
    expect(candidatesOf(r, id), 'the row lists what was offered').toEqual(candidates(r.frames[0], id).map(h));
    expect(cutOf(r, id), 'everything fits').toBe(0);
    expect(r.code).toBe(0);
    const text = r.after[`${DUES_TO}/Before December.md`] ?? '';
    for (const path of SIX) expect(text, `${name(path)} is cited`).toContain(`[[${name(path)}]]`);
    expect(text).not.toContain('Bower read');
  });

  it('AC4 overflow_is_counted_and_said: 15 matching notes offer 12, count 3 cut, and the document says 3 of 15', async () => {
    const due = (k: number): string => `Projects/Dues/Due ${k}.md`;
    const folder = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [due(i + 1), note(`Club fee due ${i + 1} November.`)]));
    const { b, id } = await request(folder);
    const ranked = b.ix.neighbourhood(REQUEST, Object.fromEntries(Object.entries(folder).map(([path, text]) => [b.id(path),
      { summary: /^summary: (.*)$/m.exec(text)?.[1] ?? '' }])), RUN);
    const three = ranked.slice(0, 3);
    const body = three.map((n) => { const k = /Due (\d+)/.exec(b.ix.pathOf(n) ?? '')?.[1]; return `- [[Due ${k}]]: club fee due ${k} November.`; }).join('\n');
    const r = await go(b, [select(b, id, 'Projects/Dues', three), doc(id, 'Projects/Dues', 'Club fees', body)]);
    expect(candidatesOf(r, id), 'twelve offered').toHaveLength(12);
    for (const n of three) expect(candidatesOf(r, id), 'precondition: the three wanted are offered').toContain(h(n));
    expect(cutOf(r, id), 'three counted as cut').toBe(3);
    expect(r.code).toBe(0);
    const text = r.after['Projects/Dues/Club fees.md'] ?? '';
    expect(text, 'the limit line closes the document').toContain(`${body}\n\nBower read 3 of the 15 notes that may matter here, so some may be missing.\n`);
  });
});

describe('a request\'s originals rank among originals (qa-prod-5-F2)', () => {
  // guard (R2-3, Round 3): notes holding the original's name words outscore it; it is still offered beside them.
  it('AC6 request_originals_rank_among_originals: the rowing club receipt is offered beside 12 better notes', async () => {
    const DAYS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
    const RECEIPT = 'Projects/Dues/Rowing club receipt.pdf';
    const folder = { ...Object.fromEntries(DAYS.map((d, i) => [`Projects/Dues/Bill ${d}.md`,
      note(`Alex keeps this bill ${d}.`, `Rowing club invoice, due ${d} November, ${20 + i} pounds\n`)])), [RECEIPT]: '%PDF-1.4 made-up receipt\n' };
    const { b, id } = await request(folder, `${REQUEST} and the rowing club`);
    const r = await go(b, [select(b, id, 'Projects/Dues', []), empty]);
    const found = candidatesOf(r, id);
    expect(found, 'the receipt is offered').toContain(h(b.id(RECEIPT)));
    const originals = found.filter((c) => b.ix.pathOf([...Object.keys(folder)].map(b.id).find((x) => h(x) === c) ?? '')?.endsWith('.md') === false);
    expect(originals.length, 'originals stay at most 12').toBeLessThanOrEqual(12);
  });
});