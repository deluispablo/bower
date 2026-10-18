/**
 * brain-14: a request may read ten notes and says when it read fewer (rulings 0-10, round 2). A request source may want
 * up to `SELECTION_NOTES.request` notes (pins, destination hub and profile counted); other sources keep five. No new call:
 * a request whose reading was limited gets Bower's one plain line, written by code (qa-prod-2 F15, qa-prod-3 F15).
 * Harness: b1-planning-support and qa-prod-3-F1's timers. Made-up folders and figures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Sync } from '../../src/data/contracts/hashes';
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
const line = (n: number, m: number): string => `Bower read ${n} of the ${m} notes that may matter here, so some may be missing.`;

const HOME = 'Areas/Home';
const HUB = `${HOME}/Home.md`;
const DAYS = [1, 3, 6, 9, 12, 15, 18, 20, 22, 24, 28];
const due = (d: number): string => `${HOME}/Dues ${d} Nov.md`;
const DUES = { [HUB]: note('Alex runs the home.', '# Home\n'), ...Object.fromEntries(DAYS.map((d) => [due(d), note(`Alex pays dues on ${d} November.`)])) };
const DUES_REQUEST = 'List all my dues in November with their dates.';

const FINANCE = 'Areas/Finance';
const INVOICES = Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map((x, i) =>
  [`${FINANCE}/Invoice ${x}.md`, note(`Invoice ${x} from the plumber, ${40 + i * 7} pounds, due ${2 + i * 4} November.`)]));
const INVOICE_REQUEST = 'Compare my six plumber invoices in one table.';

const SWIM = 'Areas/Health/Saltmere Swimming Club card renewal.md';
const BILLS = ['Water', 'Gas', 'Phone', 'Council', 'Garden'].map((k, i) => [`${HOME}/Bill ${k}.md`, 4 + i * 5] as const);
const DATED = { [HUB]: note('Alex runs the home.', '# Home\n'), [SWIM]: note('Card renewal due 28 November, fee 45 pounds.'),
  ...Object.fromEntries(BILLS.map(([path, d]) => [path, note(`${path.split('/').at(-1)?.replace('.md', '')} due ${d} November.`)])) };
const DATED_REQUEST = 'Make me a checklist of everything I have to pay or do before 1 December, with the dates.';

const LONGS = Array.from({ length: 7 }, (_, k) => `${HOME}/Long ${k + 1}.md`);
const LONG = { [HUB]: note('Alex runs the home.', '# Home\n'),
  ...Object.fromEntries(LONGS.map((path, k) => [path, note(`Alex keeps long house repair notes, part ${k + 1}.`, `${'Alex fixed a made-up hinge. '.repeat(200)}\n`)])) };
const LONG_REQUEST = 'Sum up my long house repair notes in one document.';

const name = (path: string): string => path.split('/').at(-1)?.replace(/\.md$/, '') ?? '';
type Sources = Array<{ itemId: string; candidates: Array<{ id: string; path: string }> }>;
type Notes = Array<{ path: string; text: string; cut: number }>;
type R = Awaited<ReturnType<typeof run>>;
const sourcesOf = (r: R, frame = 0): Sources => (r.frames[frame]?.value.sources as Sources | undefined) ?? [];
const candidatePaths = (r: R, id: string): string[] => sourcesOf(r).find((s) => s.itemId === id)?.candidates.map((c) => c.path) ?? [];
const notesOf = (r: R, frame: number): Notes => (r.frames[frame]?.value.notes as Notes | undefined) ?? [];
const selectionRow = (r: R, id: string): string | undefined =>
  r.consoleLines.flatMap((l) => l.split('\n')).find((l) => l.startsWith(`selection: source=${h(id)} `));
const done = (r: R): string[] => ((JSON.parse(r.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ done?: string }> }).done)
  .flatMap((d) => d.done ?? []);

async function request(folder: Record<string, string>, text: string) {
  const b = await setup({ folder, journal: [{ kind: 'request', text }] });
  return { b, id: b.admission.journal[0]?.fileId ?? '' };
}
const select = (b: Base, id: string, to: string, wants: string[]) =>
  ({ items: [{ itemId: id, kind: 'unknown', destination: b.id(to), wants }], asks: [] });
const doc = (id: string, to: string, title: string, body: string) =>
  ({ ...empty, documents: [{ requestId: id, to, title, summary: 'Alex asked for this list.', body }] });
const go = (b: Base, replies: unknown[]) => run(b, replies, { admission: { ...b.admission, at: RUN } });
const duesBody = (days: number[]): string => days.map((d) => `- [[Dues ${d} Nov]]: due ${d} November.`).join('\n');

describe('a request may read ten notes (brain-14)', () => {
  it('AC1 six-note comparison can obtain its sixth note', async () => {
    const { b, id } = await request(INVOICES, INVOICE_REQUEST);
    const paths = Object.keys(INVOICES);
    const body = paths.map((p, i) => `- [[${name(p)}]]: ${40 + i * 7} pounds, due ${2 + i * 4} November.`).join('\n');
    const r = await go(b, [select(b, id, FINANCE, paths.map(b.id)), doc(id, FINANCE, 'Plumber invoices', body)]);
    expect(candidatePaths(r, id), 'precondition: all six invoices are candidates').toEqual(expect.arrayContaining(paths));
    expect(notesOf(r, 1).map((n) => n.path), 'the execution input holds all six').toEqual(expect.arrayContaining(paths));
    expect(r.frames).toHaveLength(2);
    expect(r.code).toBe(0);
    const text = r.after[`${FINANCE}/Plumber invoices.md`] ?? '';
    for (const p of paths) expect(text).toContain(`[[${name(p)}]]`);
    expect(r.consoleLines.flatMap((l) => l.split('\n')).filter((l) => l.startsWith('model-call:')).map((l) => /kind=(\w+)/.exec(l)?.[1]))
      .toEqual(['selection', 'execution']);
  });

  it('AC2 a request reads up to ten notes', async () => {
    const { b, id } = await request(DUES, DUES_REQUEST);
    const nine = DAYS.slice(0, 9);
    const r = await go(b, [select(b, id, HOME, nine.map((d) => b.id(due(d)))), doc(id, HOME, 'November dues', duesBody(nine))]);
    expect(candidatePaths(r, id), 'precondition: 12 candidates').toHaveLength(12);
    expect(r.code).toBe(0);
    expect(selectionRow(r, id)).toMatch(/ required=10\/10 /);
  });

  // guard
  it('AC2 guard: eleven notes for a request are refused', async () => {
    const { b, id } = await request(DUES, DUES_REQUEST);
    const ten = DAYS.slice(0, 10);
    const r = await go(b, [select(b, id, HOME, ten.map((d) => b.id(due(d)))), doc(id, HOME, 'November dues', duesBody(ten))]);
    expect(candidatePaths(r, id), 'precondition: 12 candidates').toHaveLength(12);
    expect(r.code).toBe(1);
    expect(r.after[`${HOME}/November dues.md`]).toBeUndefined();
    expect(selectionRow(r, id)).toBeUndefined();
  });

  // guard
  it('AC2 guard: a pile still reads five', async () => {
    const b = await setup({ folder: DUES, inbox: [{ line: 'Alex pays dues in November.', files: ['Dues.txt'] }],
      inboxFiles: { 'Dues.txt': 'Alex pays dues in November.\n' } });
    const pile = b.sources[0]?.itemId ?? '';
    const six = DAYS.slice(0, 6).map((d) => b.id(due(d)));
    const r = await go(b, [{ items: [{ itemId: pile, kind: 'unknown', destination: b.id(HOME), wants: six }], asks: [] }, empty]);
    const offered = sourcesOf(r).find((s) => s.itemId === pile)?.candidates.map((c) => c.id) ?? [];
    expect(offered, 'precondition: the six are the pile\'s candidates').toEqual(expect.arrayContaining(six));
    expect(r.frames).toHaveLength(2);
    expect(r.code).toBe(1);
  });

  it('AC3 expansion cannot escape scope or loop', async () => {
    const { b, id } = await request(DUES, DUES_REQUEST);
    const six = DAYS.slice(0, 6);
    const ids = six.map((d) => b.id(due(d)));
    const r = await go(b, [select(b, id, HOME, [...ids, 'invented-id']), select(b, id, HOME, ids), doc(id, HOME, 'November dues', duesBody(six))]);
    expect(candidatePaths(r, id), 'precondition: 12 candidates').toHaveLength(12);
    expect(r.frames, 'the retry is accepted, then one execution').toHaveLength(3);
    expect(notesOf(r, 2).map((n) => n.path).sort()).toEqual([...six.map(due), HUB].sort());
    for (const f of r.frames.slice(1)) expect(f.call.input).not.toContain('invented-id');
    expect(r.code).toBe(0);
  });

  // guard
  it('AC3 guard: a note not offered to the request is refused', async () => {
    const garden = 'Resources/Gardening/Garden plans.md';
    const { b, id } = await request({ ...DUES, [garden]: note('Alex grows herbs.', 'GARDEN_BODY_TEXT\n') }, DUES_REQUEST);
    const wants = select(b, id, HOME, [b.id(garden)]);
    const r = await go(b, [wants, wants, doc(id, HOME, 'November dues', duesBody([1]))]);
    expect(candidatePaths(r, id), 'precondition: the garden note is not offered').not.toContain(garden);
    expect(r.code).toBe(1);
    for (const f of r.frames) expect(f.call.input).not.toContain('GARDEN_BODY_TEXT');
    expect(r.after[`${HOME}/November dues.md`]).toBeUndefined();
  });

  it('AC4 dated dues request reads past five', async () => {
    const { b, id } = await request(DATED, DATED_REQUEST);
    const six = [SWIM, ...BILLS.map(([p]) => p)];
    const body = [`- [[${name(SWIM)}]]: due 28 November.`, ...BILLS.map(([p, d]) => `- [[${name(p)}]]: due ${d} November.`)].join('\n');
    const r = await go(b, [select(b, id, HOME, six.map(b.id)), doc(id, HOME, 'Before December', body)]);
    expect(candidatePaths(r, id), 'precondition: all six are candidates').toEqual(expect.arrayContaining(six));
    expect(notesOf(r, 1).map((n) => n.path), 'the execution input holds all six').toEqual(expect.arrayContaining(six));
    const text = r.after[`${HOME}/Before December.md`] ?? '';
    for (const p of six) expect(text).toContain(`[[${name(p)}]]`);
    expect(text).not.toContain('Bower read');
  });
});

describe('a limited request says so (brain-14 AC5)', () => {
  it('AC5 capped document says so', async () => {
    const { b, id } = await request(DUES, DUES_REQUEST);
    const nine = DAYS.slice(0, 9);
    const r = await go(b, [select(b, id, HOME, nine.map((d) => b.id(due(d)))), doc(id, HOME, 'November dues', duesBody(nine))]);
    expect(candidatePaths(r, id), 'precondition: 12 candidates').toHaveLength(12);
    expect(r.after[`${HOME}/November dues.md`] ?? '').toContain(`${duesBody(nine)}\n\n${line(10, 12)}\n`);
  });

  it('AC5 guard: a capped answer says so', async () => {
    const { b, id } = await request(DUES, DUES_REQUEST);
    const nine = DAYS.slice(0, 9);
    const text = 'Your November dues start with [[Dues 1 Nov]]: it lists the first one.';
    const r = await go(b, [select(b, id, HOME, nine.map((d) => b.id(due(d)))), { ...empty, answers: [{ requestId: id, text }] }]);
    expect(candidatePaths(r, id), 'precondition: 12 candidates').toHaveLength(12);
    expect(done(r)).toContainEqual(`${text} ${line(10, 12)}`);
  });

  it('AC5 a wanted note that does not fit says so', async () => {
    const { b, id } = await request(LONG, LONG_REQUEST);
    const body = LONGS.slice(0, 5).map((p, k) => `- [[${name(p)}]]: part ${k + 1}.`).join('\n');
    // R3-2: five of the seven are wanted, so two other candidates stay unread beside the wanted notes that were cut.
    const r = await go(b, [select(b, id, HOME, LONGS.slice(0, 5).map(b.id)), doc(id, HOME, 'House repairs', body)]);
    const candidates = candidatePaths(r, id);
    expect(candidates, 'precondition: the seven and the hub are the 8 candidates').toEqual(expect.arrayContaining([...LONGS, HUB]));
    expect(candidates).toHaveLength(8);
    expect(notesOf(r, 1).some((n) => LONGS.slice(0, 5).includes(n.path) && n.cut > 0), 'precondition: a wanted note is cut').toBe(true);
    const text = r.after[`${HOME}/House repairs.md`] ?? '';
    const m = /\n\nBower read (\d+) of the 8 notes that may matter here, so some may be missing\.\n/.exec(text);
    expect(m, 'the limit line closes the document').not.toBeNull();
    const whole = notesOf(r, 1).filter((n) => n.cut === 0 && candidates.includes(n.path)).length;
    expect(Number(m?.[1])).toBe(whole);
    expect(whole).toBeLessThan(8);
    expect(text).toContain(`${body}\n\n${line(whole, 8)}\n`);
  });

  // guard (ruling R3-3)
  it('AC5 guard: a request whose only candidate is one long cut note adds no line', async () => {
    const only = `${HOME}/Long 1.md`;
    const { b, id } = await request({ [only]: note('Alex keeps long house repair notes.', `${'Alex fixed a made-up hinge. '.repeat(300)}\n`) }, LONG_REQUEST);
    const body = `- [[${name(only)}]]: the part that was shown.`;
    const r = await go(b, [select(b, id, HOME, [b.id(only)]), doc(id, HOME, 'House repairs', body)]);
    expect(candidatePaths(r, id), 'precondition: the one long note is the only candidate').toEqual([only]);
    expect(notesOf(r, 1).find((n) => n.path === only)?.cut, 'precondition: it is cut').toBeGreaterThan(0);
    const text = r.after[`${HOME}/House repairs.md`] ?? '';
    expect(text).toContain(body);
    expect(text).not.toContain('Bower read');
  });

  // guard
  it('AC5 guard: every wanted note read whole under ten adds no line', async () => {
    const { b, id } = await request(DUES, DUES_REQUEST);
    const four = DAYS.slice(0, 4);
    const r = await go(b, [select(b, id, HOME, four.map((d) => b.id(due(d)))), doc(id, HOME, 'November dues', duesBody(four))]);
    expect(r.code).toBe(0);
    const text = r.after[`${HOME}/November dues.md`] ?? '';
    expect(text).toContain(duesBody(four));
    expect(text).not.toContain('Bower read');
  });
});
