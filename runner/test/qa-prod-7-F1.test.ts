/**
 * qa-prod-7-F1: a request offers up to 40 ranked notes (`REQUEST_CARDS`) and may read 20 (`SELECTION_NOTES.request`), so a
 * list of every due cites them all; piles and things keep 12 and five. Harness: qa-prod-6-F3's (b1-planning-support,
 * qa-prod-3-F1's `candidatesOf`). Made-up folders and figures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Sync } from '../../src/data/contracts/hashes';
import { serializeNote } from '../../src/data/contracts/note-format';
import { REFUSALS } from '../src/claude';
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
const refusals = (): string[] => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => { const m = /was refused \((\w+)\): .*; asking once more/.exec(line); return m ? [m[1] ?? ''] : []; });
const linkNote = (slug: string, words: string): string => serializeNote({ summary: `Saved from example.com/${slug}.`,
  properties: [{ key: 'source', label: 'Source', value: `https://example.com/${slug}` }], tags: [], currentState: [], body: words,
  original: `${slug.split('/').at(-1) ?? 'link'}.url`, timeline: [{ date: '2 Oct', text: 'Saved by you, filed by Bower.', source: `example.com/${slug}` }], byBower: true });

const REQUEST = 'Make me a note listing every bill and due I have to pay before 1 December, with the date and the amount of each.';
const HOME = 'Areas/Home';
const LINKS = [
  ['Areas/Clubs/Saltmere Rowing Club winter dues.md', 'saltmere-rowing/winter-dues', 'Saltmere Rowing Club winter dues, 60 pounds, due 15 November'],
  ['Areas/Home/Brightpane window cleaning invoice 1042.md', 'brightpane/invoice-1042', 'Window cleaning, 25 pounds, due 20 November'],
  ['Areas/Clubs/Ferrowick Community Choir autumn subs.md', 'ferrowick-choir/autumn-subs', 'Choir autumn subs, 30 pounds, due 24 November'],
  ['Areas/Clubs/Marrowby Sailing Club winter fees.md', 'marrowby-sailing/winter-fees', 'Marrowby Sailing Club winter fees, 40 pounds, due 18 November'],
  ['Areas/Clubs/Friends of Saltmere Library membership.md', 'saltmere-library/membership', 'Friends of Saltmere Library membership, 12 pounds, due 26 November'],
] as const;
const WORDS = [
  ['Areas/Home/Ferrowick Library lost book invoice.md', 'Lost library book, due 9 November.'],
  ['Areas/Home/Saltmere Allotment Society plot 14 renewal notice.md', 'Plot 14 renewal, due 4 November.'],
  ['Areas/Home/Saltmere council garden waste permit renewal.md', 'Garden waste permit renewal, due 30 November.'],
  ['Areas/Home/Hollin Lane Dental check-up invoice 2207.md', 'Dental check-up invoice, 55 pounds, pay by 21 November.'],
  ['Areas/Home/Larkspur Gardening hedge trimming invoice 318.md', 'Hedge trimming invoice, 70 pounds, pay by 14 November.'],
  ['Areas/Home/Larkspur Plumbing invoice 4471.md', 'Plumbing repair, due 28 October.'],
] as const;
const SWIM = 'Areas/Health/Saltmere Swimming Club card renewal.md';
const DUES = [...LINKS.map(([path]) => path), ...WORDS.map(([path]) => path), SWIM];
const NOISE_NOTES: Array<readonly [string, string]> = [
  ...['ant', 'bee', 'cat', 'dog', 'eel', 'fox'].map((n) => [`Projects/Shed/Shed ${n}.md`, `Alex will have to fix the ${n} shelf; each one needs care.`] as const),
  ...[3, 6, 9, 12].map((d) => [`Projects/Flat/Flat viewing ${d} December.md`, `Make a note of every room at the flat viewing on ${d} December.`] as const),
  ...[2, 5, 8, 11].map((d, i) => [`Resources/Receipts/Bike receipt ${d} October.md`, `Paid ${d} October, amount ${20 + i} pounds.`] as const),
  ['Areas/Money/Budget.md', 'The amount I have each month for food and travel.'],
  ['Resources/Books/Reading list.md', 'Every book I have to read this year.'],
  ['Areas/Garden/Garden plans.md', 'Make a new bed each spring.'],
  ['Projects/Career/Career notes.md', 'Make a date with every mentor.'],
  ['Resources/Food/Recipe list.md', 'Make soup each week.'],
  ['Resources/Travel/Packing list.md', 'Every item I have to take.'],
  ['Resources/Travel/Holiday dates.md', 'The date of each trip in December.'],
  ['Areas/Health/Gym log.md', 'Each session I have done.'],
  ['Resources/Books/Book club.md', 'Make a note of each date we meet.'],
];
const NOISE = NOISE_NOTES.map(([path]) => path);
const FOLDER: Record<string, string> = {
  ...Object.fromEntries(LINKS.map(([path, slug, words]) => [path, linkNote(slug, words)])),
  ...Object.fromEntries(WORDS.map(([path, summary]) => [path, note(summary)])),
  [SWIM]: note('Membership card for the Saltmere Swimming Club.', 'Card renewal due 28 November, fee 45 pounds.\n'),
  ...Object.fromEntries(NOISE_NOTES.map(([path, summary]) => [path, note(summary)])),
};
const listBody = (paths: readonly string[]): string => paths.map((path) => `- [[${name(path)}]]: to pay before 1 December.`).join('\n');

async function request(folder: Record<string, string>) {
  const b = await setup({ folder, journal: [{ kind: 'request', text: REQUEST }] });
  return { b, id: b.admission.journal[0]?.fileId ?? '' };
}
const select = (b: Base, id: string, to: string, wants: string[]) =>
  ({ items: [{ itemId: id, kind: 'unknown', destination: b.id(to), wants }], asks: [] });
const doc = (id: string, to: string, title: string, body: string) =>
  ({ ...empty, documents: [{ requestId: id, to, title, summary: 'Alex asked for this list.', body }] });
const go = (b: Base, replies: unknown[]) => run(b, replies, { admission: { ...b.admission, at: RUN } });

describe('a request offers 40 notes and may read 20 (qa-prod-7-F1)', () => {
  it('AC1 twelve_dated_dues_all_offered: every due is among the 35 offered, none cut', async () => {
    expect(Object.keys(FOLDER), 'precondition: 12 dues and 23 other notes').toHaveLength(35);
    const { b, id } = await request(FOLDER);
    const r = await go(b, [select(b, id, HOME, []), empty]);
    const found = candidatesOf(r, id);
    for (const path of DUES) expect(found, `${name(path)} is offered`).toContain(h(b.id(path)));
    expect(cutOf(r, id), 'nothing cut').toBe(0);
    expect(found, 'all 35 offered').toHaveLength(35);
  });

  it('AC2 twelve_dues_read_and_cited: all twelve are wanted, read and cited', async () => {
    const { b, id } = await request(FOLDER);
    const r = await go(b, [select(b, id, HOME, DUES.map(b.id)), doc(id, HOME, 'Before December', listBody(DUES))]);
    expect(r.code).toBe(0);
    expect(rowOf(r, id)).toMatch(/ required=12\/20 /);
    const text = r.after[`${HOME}/Before December.md`] ?? '';
    for (const path of DUES) expect(text, `${name(path)} is cited`).toContain(`[[${name(path)}]]`);
    expect(text).not.toContain('Bower read');
    expect(r.frames[0]?.call.input).toContain('Use at most five notes per source and twenty per request');
    expect(REFUSALS.selectionWants).toContain('(twenty for a request)');
  });

  it('AC3 twenty_wants_accepted: the full twenty is read and says so', async () => {
    const twenty = [...DUES, ...NOISE.slice(0, 8)];
    const { b, id } = await request(FOLDER);
    const r = await go(b, [select(b, id, HOME, twenty.map(b.id)), doc(id, HOME, 'Before December', listBody(twenty))]);
    expect(r.code).toBe(0);
    expect(rowOf(r, id)).toMatch(/ required=20\/20 /);
    expect(r.after[`${HOME}/Before December.md`] ?? '').toContain('Bower read 20 of the 35 notes that may matter here, so some may be missing.');
  });

  it('AC3 twenty_one_refused: 21 wants are refused selectionKeys and nothing is written', async () => {
    const twentyOne = [...DUES, ...NOISE.slice(0, 9)];
    const { b, id } = await request(FOLDER);
    const wants = select(b, id, HOME, twentyOne.map(b.id));
    const r = await go(b, [wants, wants, doc(id, HOME, 'Before December', listBody(twentyOne))]);
    expect(r.code).toBe(1);
    expect(rowOf(r, id)).toBeUndefined();
    const home = (files: Record<string, string | undefined>) => Object.entries(files).filter(([path]) => path.startsWith(`${HOME}/`));
    expect(home(r.after), 'nothing written in Areas/Home').toEqual(home(FOLDER));
    expect(refusals()).toEqual(['selectionKeys']);
  });

  it('AC4 forty_offered_forty_one_counted: 40 fit, the 41st is counted and said', async () => {
    const due = (k: number): string => `Projects/Dues/Due ${k}.md`;
    for (const n of [40, 41]) {
      vi.mocked(console.error).mockClear();
      const folder = Object.fromEntries(Array.from({ length: n }, (_, i) => [due(i + 1), note(`Club fee due ${i + 1} November.`)]));
      const { b, id } = await request(folder);
      const ranked = b.ix.neighbourhood(REQUEST, Object.fromEntries(Object.entries(folder).map(([path, text]) => [b.id(path),
        { summary: /^summary: (.*)$/m.exec(text)?.[1] ?? '' }])), RUN);
      const three = ranked.slice(0, 3);
      const body = three.map((k) => { const d = /Due (\d+)/.exec(b.ix.pathOf(k) ?? '')?.[1]; return `- [[Due ${d}]]: club fee due ${d} November.`; }).join('\n');
      const r = await go(b, [select(b, id, 'Projects/Dues', three), doc(id, 'Projects/Dues', 'Club fees', body)]);
      expect(candidatesOf(r, id), `${n} notes: forty offered`).toHaveLength(40);
      expect(cutOf(r, id), `${n} notes: cut`).toBe(n - 40);
      const text = r.after['Projects/Dues/Club fees.md'] ?? '';
      if (n === 40) expect(text).not.toContain('Bower read');
      else expect(text).toContain(`${body}\n\nBower read 3 of the 41 notes that may matter here, so some may be missing.\n`);
    }
  });

  // guard
  it('AC5 guard piles_keep_twelve: a pile still offers 12 and may want five', async () => {
    const b = await setup({ folder: FOLDER, inbox: [{ line: 'Alex has to pay every bill and due before 1 December.', files: ['Dues.txt'] }],
      inboxFiles: { 'Dues.txt': 'Every bill and due to pay before 1 December, with the date and amount of each.\n' } });
    const pile = b.sources[0]?.itemId ?? '';
    const r = await go(b, [{ items: [{ itemId: pile, kind: 'unknown', destination: b.id(HOME), wants: [] }], asks: [] }, empty]);
    expect(candidatesOf(r, pile)).toHaveLength(12);
    expect(cutOf(r, pile)).toBe(0);
    expect(rowOf(r, pile)).toMatch(/ required=0\/5 /);
  });
});
