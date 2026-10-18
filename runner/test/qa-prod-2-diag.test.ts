/**
 * qa-prod-2-diag: the timing output says, per source, what the provider offered the model and what it picked, as
 * hashed ids only (OWASP Logging Cheat Sheet, "data to exclude": no path, name, request word or token reaches a log).
 * Row: `selection: source=<h> candidates=<h:tag,...|none> cut=<n> wants=<h,...|none> required=<n>/<5, or 10 for a request> destination=<h|none> of=<i|none> new=<0|1>`.
 * `cut` counts only the provider's own final cut of its merged list (`VaultIndex.neighbourhood` already bounds itself at 12).
 * Made-up folders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Sync } from '../../src/data/contracts/hashes';
import { AT, redispatchCase } from './corpus-run';
import { paging } from './drive-v3';
import { HUB, PERSONAL, candidates, fileIntent, folder, note, phaseAwareClaude, run, select, setup, empty, type Base, type Item } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

const h = (id: string): string => sha256Sync(id).slice(0, 6);
type Printed = { consoleLines: string[] };
const lines = (r: Printed): string[] => r.consoleLines.flatMap((l) => l.split('\n'));
const selections = (r: Printed): string[] => lines(r).filter((l) => l.startsWith('selection:'));
const SHAPE = /^selection: source=([0-9a-f]{6}) candidates=(none|[0-9a-f]{6}:(?:p|f|n\d+)(?:,[0-9a-f]{6}:(?:p|f|n\d+))*) cut=(\d+) wants=(none|[0-9a-f]{6}(?:,[0-9a-f]{6})*) required=(\d+)\/(?:5|10) destination=([0-9a-f]{6}|none) of=(\d+|none) new=([01])$/;
interface Row { ids: string[]; tags: string[]; cut: number; wants: string[]; required: number; destination: string; of: string; isNew: string }
/** The row for one source: its fixed syntax is itself asserted. */
function rowFor(r: Printed, source: string): Row {
  const line = selections(r).find((l) => l.startsWith(`selection: source=${h(source)} `));
  const m = SHAPE.exec(line ?? '');
  expect(m, `a well-formed selection row for the source: ${line}`).not.toBeNull();
  const [, , cands = 'none', cut = '', wants = 'none', required = '', destination = '', of = '', isNew = ''] = m ?? [];
  const parts = cands === 'none' ? [] : cands.split(',');
  return { ids: parts.map((c) => c.split(':')[0] ?? ''), tags: parts.map((c) => c.split(':')[1] ?? ''), cut: Number(cut),
    wants: wants === 'none' ? [] : wants.split(','), required: Number(required), destination, of, isNew };
}
/** Four loose files with different words (equal text is a duplicate, never a source), all about the same offers. */
const FILES = ['Offer.txt', 'Second.txt', 'Third.txt', 'Fourth.txt'];
const four = { inbox: FILES.map((f) => ({ line: '', files: [f] })),
  inboxFiles: Object.fromEntries(FILES.map((f) => [f, `Alex received a remote developer offer. Alex records applications and offers: ${f}.\n`])) };
const OMITTED ={ wants: [], required: 0, destination: 'none', of: 'none', isNew: '0' };
const journalIds = (b: Base): string[] => b.admission.journal.map((j) => j.fileId);
const Q = { text: 'Is this right?', yes: 'Yes', no: 'No' };
/** The folder's own id for each candidate, as hashes in order (the offered ids of the first call). */
const offered = (r: { frames: Parameters<typeof candidates>[0][] }, source: string): string[] => candidates(r.frames[0], source).map(h);
const parentsOf = (b: Base, id: string): readonly string[] => b.ix.byId(id)?.parents ?? [];

const DUES = Object.fromEntries(['1', '3', '9', '12', '20', '24', '28'].map((d) => [`Areas/Home/Dues ${d} Nov.md`, note(`Alex pays dues on ${d} November.`)]));
const DUES_FOLDER = { 'Areas/Home/Home.md': note('Alex runs the home.', '# Home\n'), ...DUES,
  'Areas/Home/Checklist before 1 December.md': note('Alex lists dues before 1 December.',
    'Pay [[Dues 1 Nov]], [[Dues 3 Nov]], [[Dues 9 Nov]] and [[Dues 12 Nov]].\n') };
const DUES_REQUEST = 'Pay or do everything before 1 December: dues checklist.';

async function dues() {
  const b = await setup({ folder: DUES_FOLDER, journal: [{ kind: 'request', text: DUES_REQUEST }] });
  const [request = ''] = journalIds(b);
  return { b, request };
}

describe('one selection row per source (qa-prod-2-diag)', () => {
  it('AC1 selection_line_per_source: a dues request over seven dated notes and an old checklist prints its row after the call lines', async () => {
    const { b, request } = await dues();
    const wants = ['1', '3', '9', '12'].map((d) => b.id(`Areas/Home/Dues ${d} Nov.md`));
    const r = await run(b, [{ items: [{ itemId: request, kind: 'unknown', destination: b.id('Areas/Home'), wants }], asks: [] }, empty]);
    expect(selections(r), 'the request and the unselected pile').toHaveLength(2);
    const all = lines(r);
    expect(all.findIndex((l) => l.startsWith('selection:')), 'after every model-call row').toBeGreaterThan(all.map((l) => l.startsWith('model-call:')).lastIndexOf(true));
    expect(r.consoleLines.filter((l) => l.includes('selection:')), 'in the one timing output, never a line of its own').toHaveLength(1);
    const row = rowFor(r, request);
    expect(candidates(r.frames[0], request).length, 'the checklist, the seven notes and the hub').toBe(9);
    expect(row.ids, 'the candidates in the order the model was offered them, as hashes').toEqual(offered(r, request));
    expect(row.tags, 'every one is neighbourhood, by its rank').toEqual(row.ids.map((_, i) => `n${i + 1}`));
    expect(row.cut, 'nine candidates: none cut').toBe(0);
  });

  it('AC2 selection_line_names_wants_and_place: wants, required, the destination hash and of=1 for the first candidate\'s folder', async () => {
    const { b, request } = await dues();
    const wants = ['1', '3', '9', '12'].map((d) => b.id(`Areas/Home/Dues ${d} Nov.md`));
    const r = await run(b, [{ items: [{ itemId: request, kind: 'unknown', destination: b.id('Areas/Home'), wants }], asks: [] }, empty]);
    expect(selections(r)).toHaveLength(2);
    expect(rowFor(r, request)).toMatchObject({ wants: wants.map(h), required: 5, destination: h(b.id('Areas/Home')), of: '1', isNew: '0' });
  });

  it('AC3 selection_line_carries_no_content: no path, name, request word, raw id or token; the model input is untouched', async () => {
    const { b, request } = await dues();
    const wants = [b.id('Areas/Home/Dues 1 Nov.md')];
    const created = { parentId: b.id('Areas'), name: 'Everything due in December' };
    const r = await run(b, [{ items: [{ itemId: request, kind: 'unknown', destination: created, wants }], asks: [] }, empty]);
    const rows = selections(r);
    expect(rows, 'rows exist before their absences mean anything').toHaveLength(2);
    const ids = [request, b.id('Areas/Home'), b.id('Areas'), wants[0] ?? '', ...candidates(r.frames[0], request)];
    for (const secret of ['Dues', 'Nov', 'Checklist', 'Home', 'December', 'dues checklist', 'Everything due', 'Areas/', '.md', 'made-up-token', 'Pay or do', ...ids])
      expect(rows.join('\n'), `row has no ${secret}`).not.toContain(secret);
    for (const frame of r.frames) {
      expect(frame.call.input, 'diagnostics stay outside the model input').not.toMatch(/selection: source=/);
      expect(frame.prompt).not.toMatch(/selection: source=/);
    }
    expect(rowFor(r, request)).toMatchObject({ isNew: '1', of: 'none', destination: h(b.id('Areas')) });
  });
});

describe('every source has a row, selected or not (qa-prod-2-diag)', () => {
  it('a words-only pile, a selected file, an omitted file and a source with no candidates', async () => {
    const b = await setup({ inbox: [{ line: 'Zzqx qqzv.', files: [] }, { line: '', files: ['Offer.txt'] }, { line: '', files: ['Second.txt'] }] });
    const [pile = '', offer = '', second = ''] = b.sources.map((s) => s.itemId);
    expect(b.sources[0]?.name, 'the first is words only').toBe('');
    const items: Item[] = [{ itemId: pile, kind: 'unknown', destination: b.id('Projects/Remote search'), wants: [] },
      { itemId: offer, kind: 'unknown', destination: b.id('Projects/Remote search'), wants: [b.id(HUB)] }];
    const r = await run(b, [{ items, asks: [] }, fileIntent(b)]);
    expect(selections(r).map((l) => /source=([0-9a-f]{6})/.exec(l)?.[1]), 'one row per source, in the source order').toEqual([pile, offer, second].map(h));
    expect(rowFor(r, pile), 'a words-only pile is hashed by its pile id; empty candidates say none').toMatchObject({ ids: [], cut: 0, wants: [], required: 1, destination: h(b.id('Projects/Remote search')), of: 'none' });
    expect(rowFor(r, offer)).toMatchObject({ wants: [h(b.id(HUB))], required: 1, of: String(1 + offered(r, offer).indexOf(h(b.id(HUB)))) });
    expect(rowFor(r, second), 'omitted: its candidates stay, nothing else').toMatchObject({ ...OMITTED, ids: offered(r, second) });
  });

  it('an ask-only selection keeps every source\'s candidates and selects nothing', async () => {
    const b = await setup({ inbox: [{ line: '', files: ['Offer.txt'] }, { line: '', files: ['Second.txt'] }] });
    const r = await run(b, [{ items: [], asks: [{ fileId: b.sources[0]?.itemId, ...Q }] }, { ...empty, asks: [{ fileId: b.sources[0]?.itemId, ...Q }] }]);
    expect(selections(r)).toHaveLength(2);
    for (const s of b.sources) expect(rowFor(r, s.itemId)).toMatchObject({ ...OMITTED, ids: offered(r, s.itemId) });
  });

  it('an item removed by the folder-map cut is omitted like an unselected one', async () => {
    const groups = Object.fromEntries(Array.from({ length: 160 }, (_, i) => {
      const name = `Group ${String(i).padStart(3, '0')}`;
      return [`Resources/${name}/${name}.md`, note(`Alex keeps remote offer group ${i} ${'x'.repeat(180)}.`)];
    }));
    const b = await setup({ folder: { ...folder, ...groups } });
    const selection = select(b);
    selection.items[0] = { ...selection.items[0] as Item, destination: { parentId: b.id('Projects/Remote search'), name: 'Missing remote offers' } };
    const r = await run(b, [selection, selection]);
    expect(selections(r)).toHaveLength(1);
    expect(rowFor(r, b.sources[0]?.itemId ?? '')).toMatchObject(OMITTED);
  });
});

describe('where the destination is (qa-prod-2-diag)', () => {
  it('first, later and shared folders, no match and a new folder', async () => {
    const b = await setup({ folder: { ...folder, 'Projects/Remote search/Offer log.md': note('Alex logs remote developer applications.') }, ...four });
    const dest = (path: string): string => b.id(path);
    const picks: Array<string | { parentId: string; name: string }> = [dest('Projects/Remote search'), dest('Resources/Careers'), dest('Resources/Gardening'),
      { parentId: dest('Projects'), name: 'Brand new offers' }];
    const items = b.sources.map((s, i): Item => ({ itemId: s.itemId, kind: 'unknown', destination: picks[i] ?? '', wants: [] }));
    const r = await run(b, [{ items, asks: [] }, fileIntent(b)]);
    expect(selections(r), r.errors).toHaveLength(4);
    const oracle = (source: string, folderId: string): string => {
      const at = candidates(r.frames[0], source).findIndex((id) => parentsOf(b, id).includes(folderId));
      return at < 0 ? 'none' : String(at + 1);
    };
    const [shared, later, none, created] = b.sources.map((s) => rowFor(r, s.itemId));
    const [one, two, three] = b.sources.map((s) => s.itemId);
    expect(candidates(r.frames[0], one ?? '').length, 'both folders offer notes').toBeGreaterThan(2);
    expect(shared?.of, 'the lowest candidate in the folder, two there').toBe(oracle(one ?? '', dest('Projects/Remote search')));
    expect(later?.of).toBe(oracle(two ?? '', dest('Resources/Careers')));
    expect(Math.min(Number(shared?.of), Number(later?.of)), 'one folder holds the first candidate, the other a later one').toBe(1);
    expect(Number(shared?.of) + Number(later?.of)).toBeGreaterThan(2);
    expect(none, 'a folder none of them is in').toMatchObject({ of: 'none', isNew: '0', destination: h(dest('Resources/Gardening')) });
    expect(oracle(three ?? '', dest('Resources/Gardening'))).toBe('none');
    expect(created, 'a new folder: its parent is hashed, no future id').toMatchObject({ of: 'none', isNew: '1', destination: h(dest('Projects')) });
    expect(JSON.stringify(created)).not.toContain('Brand');
  });
});

describe('the required count is the validator\'s (qa-prod-2-diag)', () => {
  it('overlapping wants and the destination\'s hub count once; a hub adds itself; no hub adds nothing', async () => {
    const log = 'Projects/Remote search/Offer log.md';
    const b = await setup({ folder: { ...folder, [log]: note('Alex logs remote developer applications.') }, ...four });
    const rs = b.id('Projects/Remote search');
    const wants = [[b.id(HUB)], [b.id(log)], [b.id(log), b.id(HUB)], [b.id(PERSONAL)]];
    const items = b.sources.map((s, i): Item => ({ itemId: s.itemId, kind: 'unknown', destination: i === 3 ? b.id('Resources/Careers') : rs, wants: wants[i] ?? [] }));
    const r = await run(b, [{ items, asks: [] }, fileIntent(b)]);
    expect(selections(r)).toHaveLength(4);
    expect(b.sources.map((s) => rowFor(r, s.itemId).required), 'hub overlap 1, hub added 2, both 2, no hub 1').toEqual([1, 2, 2, 1]);
  });

  it('a want Drive refuses for good is not counted nor listed', async () => {
    const b = await setup();
    const changed = await b.drive.get(b.id(PERSONAL));
    await b.drive.writeText(changed.id, note('Alex records changed remote developer applications.', 'CHANGED\n'), changed.modifiedTime);
    const source = b.sources[0]?.itemId ?? '';
    const r = await run(b, [{ items: [{ itemId: source, kind: 'unknown', destination: b.id('Projects/Remote search'), wants: [changed.id] }], asks: [] }, fileIntent(b)], {
      around: (next) => async (input, init) => {
        const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        if (u.pathname === `/drive/v3/files/${changed.id}`) return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refused read', errors: [{ reason: 'forbidden' }] } }), { status: 403 });
        return next(input, init);
      } });
    expect(selections(r)).toHaveLength(1);
    expect(rowFor(r, source), 'only the hub is required').toMatchObject({ wants: [], required: 1 });
  });
});

describe('tags and the cut (qa-prod-2-diag)', () => {
  it('one tag, p over f over n; a pinned profile in the neighbourhood keeps its rank for the others', async () => {
    const apple = 'Resources/Pins/Pin apple.md'; const zeta = 'Resources/Pins/Pin zeta.md'; const me = 'Resources/Me/Me profile.md';
    const b = await setup({ journal: [{ kind: 'request', text: 'Update pin apple.' }],
      folder: { [apple]: note('Pin apple note.'), [zeta]: note('Pin zeta note.'), [me]: note('Alex is ordinary.') } });
    for (const path of [apple, me]) await b.drive.update(b.id(path), { appProperties: { profile: 'cv', by: 'bower' } });
    const [request = ''] = journalIds(b);
    const r = await run(b, [{ items: [{ itemId: request, kind: 'unknown', destination: b.id('Resources/Pins'), wants: [] }], asks: [] }, empty]);
    expect(selections(r)).toHaveLength(2);
    const row = rowFor(r, request);
    expect(row.ids, 'pins, profiles, then the neighbourhood').toEqual([apple, me, zeta].map((p) => h(b.id(p))));
    expect(row.tags, 'apple is all three and is p; zeta is rank 2, apple keeping rank 1').toEqual(['p', 'f', 'n2']);
  });

  // 14 notes are a map (the folder's own, naming 12 or 11 more) plus members: map first, then members in its order.
  const MEMBERS = ['ant', 'bee', 'cat', 'dog', 'eel', 'fox', 'gnu', 'hen', 'ibis', 'jay', 'koi', 'lynx'];
  async function ledger(members: number, options: { matched?: boolean; original?: boolean } = {}) {
    const regions = { current: '', personal: 'PADDING\n', timeline: '', 'bower-note': '', 'moc-overview': '## Overview\nA ledger.\n', 'moc-figures': '## Figures\n0 notes.\n',
      'moc-members': `## Notes\n${MEMBERS.slice(0, members).map((m) => `- [[Item ${m}]]`).join('\n')}\n` };
    const moc = '---\nsummary: Zebra ledger index.\ntype: moc\nby: bower\nbower_format: ownership/2\n---\n\n'
      + Object.entries(regions).map(([owner, body]) => `<!-- bower:ownership/2 begin ${owner} -->\n${body}<!-- bower:ownership/2 end ${owner} -->\n`).join('\n');
    const b = await setup({ journal: [{ kind: 'request', text: 'Zebra ledger please.' }], folder: {
      'Resources/Ledger/Register.md': moc,
      ...Object.fromEntries(MEMBERS.slice(0, members).map((m) => [`Resources/Ledger/Item ${m}.md`, note(options.matched && m === 'ant' ? 'Zebra entry.' : `Entry ${m}.`)])),
      ...(options.original ? { 'Resources/Ledger/Zebra scan.txt': 'Made-up scan.\n' } : {}) } });
    const [request = ''] = journalIds(b);
    const r = await run(b, [{ items: [{ itemId: request, kind: 'unknown', destination: b.id('Resources/Ledger'), wants: [] }], asks: [] }, empty]);
    expect(selections(r), 'a row exists, beside the unselected pile\'s').toHaveLength(2);
    return { b, r, request, row: rowFor(r, request) };
  }

  it('R-overflow: exactly 12 eligible notes are cut=0 and 13 are cut=1; the map comes before its members', async () => {
    const twelve = await ledger(11);
    expect(twelve.row.ids).toHaveLength(12);
    expect(twelve.row.cut).toBe(0);
    expect(twelve.row.tags, 'rank order: the map, then its members').toEqual(Array.from({ length: 12 }, (_, i) => `n${i + 1}`));
    expect(twelve.row.ids[0], 'the map is first').toBe(h(twelve.b.id('Resources/Ledger/Register.md')));
    const thirteen = await ledger(12);
    expect(thirteen.row.ids).toHaveLength(12);
    expect(thirteen.row.cut).toBe(1);
  });

  it('R-overflow: a note both matched and a map member takes one slot, at its first rank', async () => {
    const { b, row } = await ledger(12, { matched: true });
    expect(new Set(row.ids).size, 'each note once').toBe(row.ids.length);
    expect(row.ids.slice(0, 2), 'the matched member, then the map').toEqual(['Resources/Ledger/Item ant.md', 'Resources/Ledger/Register.md'].map((p) => h(b.id(p))));
    expect(row.tags.slice(0, 3)).toEqual(['n1', 'n2', 'n3']);
    expect(row.cut, '13 distinct eligible notes').toBe(1);
  });

  it('R-overflow: a request\'s original adds a candidate at the next rank and no cut', async () => {
    const without = await ledger(12);
    const withOriginal = await ledger(12, { original: true });
    expect(withOriginal.row.cut, 'originals are not counted in the cut').toBe(without.row.cut);
    expect(withOriginal.row.ids, 'beside the 12 kept').toHaveLength(13);
    expect(withOriginal.row.ids.at(-1)).toBe(h(withOriginal.b.id('Resources/Ledger/Zebra scan.txt')));
    expect(withOriginal.row.tags.at(-1), 'its rank continues past the 13 notes, cut or not').toBe('n14');
  });

  it('R-overflow: more than 12 pins all survive, tagged p, with no cut', async () => {
    const names = ['apple', 'birch', 'cedar', 'daisy', 'elm', 'fig', 'grape', 'hazel', 'iris', 'juniper', 'kale', 'lemon', 'maple', 'nettle', 'olive'];
    const journal = [0, 3, 6, 9, 12].map((i) => ({ kind: 'request' as const, text: `Update ${names.slice(i, i + 3).map((n) => `pin ${n}`).join(', ')}.` }));
    const b = await setup({ journal, folder: Object.fromEntries(names.map((n) => [`Resources/Pins/Pin ${n}.md`, note(`Pin ${n} note.`)])) });
    const r = await run(b, [{ items: [], asks: [] }, empty]);
    expect(selections(r), 'one row for each of the five requests and the pile').toHaveLength(6);
    for (const id of journalIds(b)) {
      const row = rowFor(r, id);
      expect(row.ids, '15 pins, over the 12').toHaveLength(15);
      expect(new Set(row.tags)).toEqual(new Set(['p']));
      expect(row.cut).toBe(0);
    }
  });
});

describe('only an accepted selection is published (qa-prod-2-diag)', () => {
  const two = () => setup({ inbox: [{ line: '', files: ['Offer.txt'] }, { line: '', files: ['Second.txt'] }] });

  it('R-acceptance: a reply whose first source validates and second fails leaves nothing; the accepted one is logged', async () => {
    const b = await two();
    const [a = '', c = ''] = b.sources.map((s) => s.itemId);
    const refused = { items: [{ itemId: a, kind: 'unknown', destination: b.id('Projects/Remote search'), wants: [b.id(HUB)] },
      { itemId: c, kind: 'unknown', destination: { parentId: b.id('Projects'), name: 'Remote search' }, wants: [] }], asks: [] };
    const accepted = { items: [{ itemId: a, kind: 'unknown', destination: b.id('Resources/Careers'), wants: [] },
      { itemId: c, kind: 'unknown', destination: b.id('Projects/Remote search'), wants: [b.id(PERSONAL)] }], asks: [] };
    const r = await run(b, [refused, accepted, fileIntent(b)]);
    expect(r.frames.filter((f) => f.value.selection === undefined), 'two selection calls').toHaveLength(2);
    expect(selections(r), 'exactly the accepted rows').toHaveLength(2);
    expect(rowFor(r, a)).toMatchObject({ wants: [], destination: h(b.id('Resources/Careers')), required: 0 });
    expect(rowFor(r, c)).toMatchObject({ wants: [h(b.id(PERSONAL))], destination: h(b.id('Projects/Remote search')), required: 2 });
  });

  it('R-acceptance: a reply refused by its asks, after its items validated, leaves nothing', async () => {
    const b = await two();
    const [a = '', c = ''] = b.sources.map((s) => s.itemId);
    const items = (to: string, wants: string[]) => [a, c].map((itemId) => ({ itemId, kind: 'unknown', destination: b.id(to), wants }));
    const refused = { items: items('Projects/Remote search', [b.id(HUB)]), asks: [{ pileId: 'no-such-pile', ...Q }] };
    const r = await run(b, [refused, { items: items('Resources/Careers', []), asks: [] }, fileIntent(b)]);
    expect(r.frames.filter((f) => f.value.selection === undefined), 'refused once, then accepted').toHaveLength(2);
    expect(selections(r)).toHaveLength(2);
    expect(rowFor(r, a)).toMatchObject({ wants: [], destination: h(b.id('Resources/Careers')) });
  });

  it('R-lifetime: two refused selections leave both model-call rows and no selection row', async () => {
    const b = await setup();
    const r = await run(b, ['refused', 'refused']);
    expect(lines(r).filter((l) => l.startsWith('model-call:')), 'both calls are in the output').toHaveLength(2);
    expect(lines(r).some((l) => l.startsWith('timing:'))).toBe(true);
    expect(selections(r)).toEqual([]);
  });

  it('R-lifetime: once accepted, the rows survive a failing execution', async () => {
    const b = await setup();
    const r = await run(b, [select(b, [b.id(HUB)]), 'refused', 'refused']);
    expect(r.code, 'the execution failed').not.toBe(0);
    expect(selections(r), 'its selection row is still printed').toHaveLength(1);
    expect(rowFor(r, b.sources[0]?.itemId ?? '')).toMatchObject({ wants: [h(b.id(HUB))], required: 1 });
  });

  it('R-lifetime: recovery from the persisted manifest prints no selection row and calls no model', async () => {
    const b = await setup();
    let lost = false;
    const first = await run(b, [select(b), fileIntent(b)], { around: (next) => async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (lost && url.origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection lost');
      const response = await next(input, init);
      if (init?.method === 'PATCH' && url.searchParams.has('addParents')) { lost = response.ok; throw new TypeError('Made-up lost answer'); }
      return response;
    } });
    expect(lost, 'the move\'s reply was lost').toBe(true);
    expect(selections(first), 'the first attempt published its selection').toHaveLength(1);
    const calls = vi.fn();
    const spawn = phaseAwareClaude(() => { calls(); throw new Error('No model call on recovery.'); }, () => ({ drive: b.drive, root: b.root, admission: b.admission }), true);
    const at = vi.mocked(console.log).mock.calls.length;
    await redispatchCase(b.c, first, 2, { claude: spawn, pacing: { baseMs: 0, sleep: async () => {} } });
    const printed = vi.mocked(console.log).mock.calls.slice(at).flatMap((args) => args.map(String).join(' ').split('\n'));
    expect(calls).not.toHaveBeenCalled();
    expect(printed.some((l) => l.startsWith('timing:')), 'the recovery attempt still prints its timing').toBe(true);
    expect(printed.filter((l) => l.startsWith('selection:'))).toEqual([]);
  });
});
