/**
 * qa-prod-3-F1: a dated request finds notes dated in its window. "before|by|until <month>" in a request's words adds the
 * month names from the run month (UTC) to that month to its query (temporal query expansion, Berberich et al., ECIR 2010;
 * Obsidian Tasks' `due before`). Piles, things and undated requests are unchanged. Made-up folders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Sync } from '../../src/data/contracts/hashes';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { VaultIndex } from '../../src/data/vault/vault-index';
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
type Printed = { consoleLines: string[] };
/** The candidate hashes of one source's `selection:` row (qa-prod-2-diag's syntax). */
function candidatesOf(r: Printed, source: string): string[] {
  const line = r.consoleLines.flatMap((l) => l.split('\n')).find((l) => l.startsWith(`selection: source=${h(source)} `));
  const m = / candidates=(\S+) /.exec(line ?? '');
  expect(m, `a selection row for the source: ${line}`).not.toBeNull();
  return m?.[1] === 'none' ? [] : (m?.[1] ?? '').split(',').map((c) => c.split(':')[0] ?? '');
}

const SWIM = 'Areas/Health/Saltmere Swimming Club card renewal.md';
const NOISE = ['ant', 'bee', 'cat', 'dog', 'eel', 'fox', 'gnu', 'hen', 'ibis', 'jay', 'koi', 'lynx'];
const FOLDER = {
  [SWIM]: note('Card renewal due 28 November, fee 45 pounds.'),
  ...Object.fromEntries(NOISE.map((n) => [`Projects/Shed/Shed ${n}.md`, note(`Alex will have to do the ${n} shelf with care.`)])),
};
const REQUEST = 'Make me a checklist of everything I have to pay or do before 1 December, with the dates.';
const summaries = (b: Base, folder: Record<string, string>) =>
  Object.fromEntries(Object.entries(folder).map(([path, text]) => [b.id(path), { summary: /^summary: (.*)$/m.exec(text)?.[1] ?? '' }]));

async function request(text: string, folder: Record<string, string> = FOLDER) {
  const b = await setup({ folder, journal: [{ kind: 'request', text }] });
  const id = b.admission.journal[0]?.fileId ?? '';
  const r = await run(b, [{ items: [{ itemId: id, kind: 'unknown', destination: b.id('Areas/Health'), wants: [] }], asks: [] }, empty],
    { admission: { ...b.admission, at: RUN } });
  return { b, id, r };
}

describe('a dated request finds notes dated in its window (qa-prod-3-F1)', () => {
  it('AC1 dated_request_finds_note_in_window: the swimming card renewal is a candidate of the "before 1 December" request', async () => {
    const { b, id, r } = await request(REQUEST);
    expect(candidatesOf(r, id), 'the note due 28 November is offered').toContain(h(b.id(SWIM)));
  });
});

describe('the window wraps the year (qa-prod-3-F1)', () => {
  const at = (minute: number): string => `2026-10-01T09:${String(minute).padStart(2, '0')}:00.000Z`;
  function dated(notes: Array<[name: string, summary: string]>) {
    const files: DriveFile[] = [
      { id: 'areas', name: 'Areas', folder: true, parents: ['root'], modifiedTime: at(0), createdTime: at(0) },
      { id: 'dues', name: 'Dues', folder: true, parents: ['areas'], modifiedTime: at(0), createdTime: at(0) },
      ...notes.map(([name], i): DriveFile => ({ id: `n${i}`, name: `${name}.md`, folder: false, parents: ['dues'], modifiedTime: at(i + 1), createdTime: at(i + 1) })),
    ];
    return { ix: VaultIndex.build('root', files), meta: Object.fromEntries(notes.map(([, summary], i) => [`n${i}`, { summary }])) };
  }
  const { ix, meta } = dated([['Rates', 'Rates due 3 January.'], ['Licence', 'Licence due 14 March.'], ['Insurance', 'Insurance due 28 November.'],
    ['Boiler', 'Boiler service due 3 November.'], ['Bins', 'Bins due 20 October.']]);
  const near = (words: string): string[] => ix.neighbourhood(words, meta, RUN);

  it('AC2 window_wraps_the_year: "by 10 February" on 18 October reaches a note due 3 January', () => {
    expect(near('Pay the club by 10 February')).toContain('n0');
  });
  // guard
  it('AC2 guard: a note dated only 14 March is outside the window', () => {
    expect(near('Pay the club by 10 February')).not.toContain('n1');
  });
  // guard (October is also a word of the request)
  it('AC2: a target in the run month adds only that month', () => {
    const found = near('Pay the club by 30 October');
    expect(found, 'October is in').toContain('n4');
    expect(found, 'November is not').not.toContain('n3');
  });
  it('AC2: several windows add the union of their months', () => {
    const found = near('Pay the club before 1 December and until 10 February');
    expect(found).toContain('n2');
    expect(found).toContain('n0');
  });
  it('AC2: upper case behaves like lower case', () => {
    expect(near('Pay the club BEFORE 1 DECEMBER')).toEqual(near('Pay the club before 1 december'));
    expect(near('Pay the club BEFORE 1 DECEMBER')).toContain('n2');
  });
  // guard
  it('AC2 guard: a word between the trigger and the month, or an abbreviation, opens no window', () => {
    for (const words of ['done by hand 12 may', 'Pay the club before Dec', 'Pay the club before the 1st of December', 'you may'])
      expect(near(words), words).toEqual([]);
  });
});

// guard: all of AC3
describe('piles and plain requests are unchanged (qa-prod-3-F1)', () => {
  it('AC3 guard: without a run time, "due by 28 November" words rank as today', () => {
    const files: DriveFile[] = [
      { id: 'a', name: 'Areas', folder: true, parents: ['root'], modifiedTime: '2026-10-01T09:00:00.000Z', createdTime: '2026-10-01T09:00:00.000Z' },
      { id: 'n0', name: 'Bins.md', folder: false, parents: ['a'], modifiedTime: '2026-10-01T09:01:00.000Z', createdTime: '2026-10-01T09:01:00.000Z' },
      { id: 'n1', name: 'Gym.md', folder: false, parents: ['a'], modifiedTime: '2026-10-01T09:02:00.000Z', createdTime: '2026-10-01T09:02:00.000Z' },
    ];
    const ix = VaultIndex.build('root', files);
    const meta = { n0: { summary: 'Bins out 20 October.' }, n1: { summary: 'Gym fee due 28 November.' } };
    expect(ix.neighbourhood('Gym fee due by 28 November', meta)).toEqual(['n1']);
    expect(ix.neighbourhood('Gym fee due by 28 November', meta, RUN), 'the request window adds October').toEqual(['n1', 'n0']);
  });

  const OCTOBER = { ...FOLDER, 'Areas/Home/Bins collection.md': note('Bins collection due 20 October.') };
  it('AC3 guard: a pile whose words say "pay by 28 November" gets the candidates of the plain ranking', async () => {
    const words = 'Pay the swimming card by 28 November.';
    const b = await setup({ folder: OCTOBER, inbox: [{ line: words, files: [] }] });
    const pile = b.admission.piles[0]?.pileId ?? '';
    const r = await run(b, [{ items: [{ itemId: pile, kind: 'unknown', destination: b.id('Areas/Health'), wants: [] }], asks: [] }, empty],
      { admission: { ...b.admission, at: RUN } });
    const found = candidatesOf(r, pile);
    expect(found, 'the pile still finds the swimming note').toContain(h(b.id(SWIM)));
    expect(found, 'no window for a pile').not.toContain(h(b.id('Areas/Home/Bins collection.md')));
    expect(found).toEqual(b.ix.neighbourhood(words, summaries(b, OCTOBER)).map(h));
  });

  it('AC3 guard: a request with no before/by/until month gets the candidates of the plain ranking', async () => {
    const words = 'Make me a checklist of the swimming card renewal, with the dates.';
    const { b, id, r } = await request(words, OCTOBER);
    const found = candidatesOf(r, id);
    expect(found).not.toContain(h(b.id('Areas/Home/Bins collection.md')));
    expect(found).toEqual(b.ix.neighbourhood(words, summaries(b, OCTOBER)).map(h));
  });
});
