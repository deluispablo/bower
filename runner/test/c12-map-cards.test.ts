/**
 * C12 map, part 2 (c12-map-cards, rethink 4.1 and 4.6, section 6): the model sees one map of the folder in place of
 * `index` and `indexed`. The run context (prompt file) holds L1, the folder map: one row per folder under the main
 * folders with its id, path, count of notes, hub and most common types and tags. The call text (stdin) holds L2, the
 * candidate cards: one deduplicated `cards` list, each source naming its at most 12 candidates by id. Nothing is cut at
 * 800 notes. Hierarchical maps after RAPTOR (arXiv:2401.18059) and aider's repo map (a ranked map within a token budget,
 * https://aider.chat/docs/repomap.html). Made-up folders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeModelInput } from '../src/model-input';
import { tmpdir } from 'node:os';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import type { LoadedCase } from '../src/corpus';
import { AT, lastJson, runOnDrive, seedCase, splitPrompt } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';
import * as support from './b1-planning-support';
import { HUB, PERSONAL, candidates, phaseAwareClaude, reply, fileIntent, folder, note, report, run, seedState, select, setup, type Frame, type Item } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

type MapRow = { id: string; path: string; notes: number; hub?: { id: string; path: string; summary: string }; types?: string[]; tags?: string[] };
type Card = Record<string, unknown> & { id: string; path: string };
/** The run context's JSON line (in the prompt file) and the call text's (stdin). */
const context = (f: Frame | undefined): Record<string, unknown> => {
  const below = (f?.prompt ?? '').split('\n__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__\n')[1] ?? '';
  return JSON.parse(below.split('\n').find((l) => l.startsWith('{')) ?? '{}') as Record<string, unknown>;
};
const call = (f: Frame | undefined): Record<string, unknown> => lastJson<Record<string, unknown>>(f?.call.input ?? '{}');
const MAIN = ['Projects', 'Areas', 'Resources', 'Archive'];

describe('L1, the folder map (c12-map-cards)', () => {
  it('AC1 c12-map-cards-l1: one map row per folder under the main folders replaces index, indexed, folders and foldersById', async () => {
    const b = await setup(); await seedState(b);
    const r = await run(b, [select(b, [b.id(HUB)]), fileIntent(b)]);
    expect(r.frames.length, 'the run reached the model').toBeGreaterThan(0);
    const shown = { ...context(r.frames[0]), ...call(r.frames[0]) };
    for (const key of ['index', 'indexed', 'folders', 'foldersById']) expect(shown, `no ${key} beside the map`).not.toHaveProperty(key);
    const map = context(r.frames[0]).map as MapRow[] | undefined;
    const folders = [...(await b.drive.listAll(b.root))].flatMap((f) => {
      const path = f.folder ? b.ix.pathOf(f.id) : undefined;
      return path && MAIN.includes(path.split('/')[0] ?? '') ? [path] : [];
    }).sort();
    expect(map?.map((row) => row.path), 'one row per folder, in path order').toEqual(folders);
    expect(map?.find((row) => row.path === 'Projects/Remote search')).toEqual({ id: b.id('Projects/Remote search'),
      path: 'Projects/Remote search', notes: 1, hub: { id: b.id(HUB), path: HUB, summary: 'Alex records remote developer offers.' } });
    expect(map?.find((row) => row.path === 'Resources/Careers'), 'a folder whose notes name no hub has none')
      .toEqual({ id: b.id('Resources/Careers'), path: 'Resources/Careers', notes: 1 });
  });
});

describe('L2, the candidate cards (c12-map-cards)', () => {
  it('AC2 c12-map-cards-l2: one deduplicated cards list; each source names at most 12 candidates by id', async () => {
    const b = await setup({ inbox: [{ line: '', files: ['Offer.txt', 'Second.txt'] }] }); await seedState(b);
    const r = await run(b, [select(b, [b.id(HUB)]), fileIntent(b)]);
    expect(r.frames.length, 'the run reached the model').toBeGreaterThan(0);
    expect(b.sources, 'two sources').toHaveLength(2);
    const cards = call(r.frames[0]).cards as Card[] | undefined;
    expect(Array.isArray(cards), 'the call text has one cards list').toBe(true);
    const ids = (cards ?? []).map((c) => c.id);
    expect(new Set(ids).size, 'each card once, however many sources share it').toBe(ids.length);
    const sources = call(r.frames[0]).sources as Array<{ itemId: string; candidates: unknown[] }>;
    for (const source of sources) {
      expect(source.candidates.every((id) => typeof id === 'string' && ids.includes(id)), 'a source names its candidates by card id').toBe(true);
      expect(source.candidates.length).toBeLessThanOrEqual(12);
    }
    for (const id of [b.id(HUB), b.id(PERSONAL)]) {
      expect(sources.filter((s) => s.candidates.includes(id)), 'both sources share the note').toHaveLength(2);
    }
    expect(cards?.find((c) => c.id === b.id(PERSONAL)), 'a card: id, path, summary (type and tags when known), no version or coverage')
      .toEqual({ id: b.id(PERSONAL), path: PERSONAL, summary: 'Alex records remote developer applications.' });
    expect(candidates(r.frames[0], b.sources[0]?.itemId ?? ''), 'a folder is a map row, not a candidate').not.toContain(b.id('Projects/Remote search'));
  });

  it('AC3 c12-map-cards-fingerprint: a source\'s candidate ids normalize by their cards\' paths, as one input', () => {
    const input = (n: string, f: string, h: string, i: string): string => [
      JSON.stringify({ map: [{ id: f, path: 'Projects/Plot', notes: 2, hub: { id: h, path: 'Projects/Plot/Plot.md', summary: 'Alex grows beans.' } }] }),
      JSON.stringify({ runId: 'run-1', cards: [{ id: n, path: 'Projects/Plot/Beans.md', summary: 'Alex sows beans.' }], sources: [{ itemId: i, candidates: [n] }] }),
    ].join('\n');
    const one = normalizeModelInput(input('note-a', 'folder-a', 'hub-a', 'item-a'));
    expect(normalizeModelInput(input('note-b', 'folder-b', 'hub-b', 'item-b')), 'other ids, the same input').toBe(one);
    expect(one, 'the reference keeps which note it names').toContain('"candidates":["Projects/Plot/Beans.md"]');
  });
});

describe('nothing is cut at 800 notes (c12-map-cards)', () => {
  it('AC4 c12-map-cards-no-cut: 800 notes in 60 folders and 25 things: no cut marker, every folder in the map, every thing filed', async () => {
    const large = support.largeFolder(800, 60, 25);
    const b = await setup(large); await seedState(b);
    const selected = select(b, [], large.to); const intent = fileIntent(b, large.to);
    // Each thing wants its first card and is filed into that card's folder, named by its map row: cards resolve.
    const placed = new Map<string, string>(); const unresolved: string[] = [];
    const r = await run(b, [selected, intent], { beforeReply: async (turn, frame) => {
      if (turn !== 1) return;
      const cards = (call(frame).cards ?? []) as Card[]; const rows = (context(frame).map ?? []) as MapRow[];
      for (const s of (call(frame).sources ?? []) as Array<{ itemId: string; candidates: unknown[] }>) {
        if (!s.candidates.length || s.candidates.some((id) => !cards.some((c) => c.id === id))) unresolved.push(s.itemId);
      }
      selected.items = selected.items.flatMap((item): Item[] => {
        const id = candidates(frame, item.itemId)[0]; const card = cards.find((c) => c.id === id);
        const row = rows.find((at) => card && at.path === card.path.slice(0, card.path.lastIndexOf('/')));
        if (!id || !row) return [];
        placed.set(item.itemId, row.path);
        return [{ ...item, wants: [id], destination: row.id }];
      });
      intent.things = intent.things.flatMap((t) => { const to = placed.get(t.fileId); return to ? [{ ...t, to }] : []; });
    } });
    expect(r.code).toBe(0);
    for (const [i, f] of r.frames.entries()) {
      expect(f.prompt, `call ${i + 1}: no cut marker in its prompt file or stdin`).not.toMatch(/index cut|folders cut/);
      expect(f.call.input, `call ${i + 1}: no cut marker in its stdin`).not.toMatch(/index cut|folders cut/);
    }
    expect(((context(r.frames[0]).map ?? []) as MapRow[]).filter((row) => /\/Topic \d+$/.test(row.path)), 'every topic folder has its row').toHaveLength(60);
    expect(unresolved, 'every source names at least one candidate, each a card').toEqual([]);
    expect(placed.size, 'every thing has a candidate whose folder is a map row').toBe(25);
    expect(report(r).filed, 'every thing has a candidate and is filed').toHaveLength(25);
    for (const [fileId, at] of placed) expect(r.pathsById[fileId], 'filed into its candidate\'s folder').toMatch(new RegExp(`^${at}/`));
  }, 120_000);
});

describe('a folder map past its bound (c12-map-cards)', () => {
  it('AC5 c12-map-cards-folders-cut: a map past 32,000 characters is cut in path order and marked, and a new folder waits', async () => {
    // 160 folders, each with its hub (the note named as its folder) and a long summary: about 50,000 characters of rows.
    const groups = Object.fromEntries(Array.from({ length: 160 }, (_, i) => {
      const name = `Group ${String(i).padStart(3, '0')}`;
      return [`Resources/${name}/${name}.md`, note(`Alex keeps remote offer group ${i} ${'x'.repeat(180)}.`)];
    }));
    const b = await setup({ folder: { ...folder, ...groups } }); await seedState(b);
    const selection = select(b);
    selection.items[0] = { ...selection.items[0] as Item, destination: { parentId: b.id('Projects/Remote search'), name: 'Missing remote offers' } };
    const r = await run(b, [selection, selection]);
    expect(r.frames.length, 'the run reached the model').toBeGreaterThan(0);
    const prompt = r.frames[0]?.prompt ?? '';
    expect(prompt, 'the old marker is gone').not.toContain('index cut');
    const { instructions } = splitPrompt(prompt);
    expect(instructions, 'the cut is said in words the model reads, outside the data').toContain('folders cut');
    expect(instructions, 'and says a missing folder proves nothing').toMatch(/no match does not mean no destination/);
    const map = (context(r.frames[0]).map ?? []) as MapRow[];
    const all = [...(await b.drive.listAll(b.root))].flatMap((f) => {
      const path = f.folder ? b.ix.pathOf(f.id) : undefined;
      return path && MAIN.includes(path.split('/')[0] ?? '') ? [path] : [];
    }).sort();
    expect(map.length, 'some rows are kept').toBeGreaterThan(0);
    expect(map.length, 'and some are cut').toBeLessThan(all.length);
    expect(JSON.stringify(map).length, 'the map keeps its own 32,000-character bound').toBeLessThanOrEqual(32_000);
    expect(map.map((row) => row.path), 'the kept rows are the first in path order').toEqual(all.slice(0, map.length));
    expect(Object.values(r.pathsById), 'a cut map cannot justify a new folder: the thing waits').not.toContain('Projects/Remote search/Missing remote offers');
  }, 120_000);
});

describe('a map\'s members (c12-map-cards)', () => {
  it('AC6 c12-map-cards-moc-members: a Bower map\'s card names its members by card id, in both calls', async () => {
    const map = 'Resources/Collection/Collection.md'; const member = 'Resources/Collection/Record.md';
    const regions = { current: '', personal: 'PADDING\n', timeline: '', 'bower-note': '', 'moc-overview': '## Overview\nA collection.\n',
      'moc-figures': '## Figures\n0 notes.\n', 'moc-members': '## Notes\n- [[Record]]\n' };
    const moc = '---\nsummary: Remote developer offers.\ntype: moc\nby: bower\nbower_format: ownership/2\n---\n\n'
      + Object.entries(regions).map(([owner, body]) => `<!-- bower:ownership/2 begin ${owner} -->\n${body}<!-- bower:ownership/2 end ${owner} -->\n`).join('\n');
    const b = await setup({ folder: { ...folder, [map]: moc, [member]: note('Ceramic glazing.') } }); await seedState(b);
    const r = await run(b, [select(b, [b.id(map)]), fileIntent(b)]);
    expect(r.frames, 'selection, then execution').toHaveLength(2);
    for (const [i, f] of r.frames.entries()) {
      const cards = (call(f).cards ?? []) as Card[];
      expect(cards.find((c) => c.id === b.id(map)), `call ${i + 1}: the map's card names its member`)
        .toEqual({ id: b.id(map), path: map, summary: 'Remote developer offers.', type: 'moc', members: [b.id(member)] });
      expect(cards.map((c) => c.id), `call ${i + 1}: the member is a card too`).toContain(b.id(member));
    }
  }, 60_000);
});

describe('the cap of 12 candidates a source (c12-map-cards)', () => {
  it('ruling 7: with more than 40 neighbours a pinned note is still a candidate, and the neighbour that would be 40th is not', async () => {
    const PIN = 'Resources/Views/The Alex.md';
    const offers = Object.fromEntries(Array.from({ length: 42 }, (_, i) => [`Projects/Offers/Offer ${String(i + 1).padStart(2, '0')}.md`, note(`Alex keeps remote offer record ${i + 1}.`)]));
    const words = 'Remote offer records: what does the Alex note say?';
    const c: LoadedCase = { id: 'c12-map-cards', capability: 'C09', title: 'Alex asks about offers', covers: 'model', source: 'new', scope: 'instructions',
      allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
      folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...offers, [PIN]: note('Alex has a quiet view.') } };
    const drive = fixedDrive(); const root = await seedCase(drive, c);
    const all = await drive.listAll(root); const idOf = (path: string): string => all.find((f) => drive.pathOf(f.id, root) === path)?.id ?? '';
    await drive.createText(idOf(SYSTEM.changes), 'press-1.json', JSON.stringify({ v: 1, id: 'press-1', device: 'device-1', at: AT + 1, kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
    const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => AT + 2, newId: () => 'c12-map-cards-admission' });
    if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
    const seen: Array<Record<string, unknown>> = [];
    const claude = phaseAwareClaude(async (spawned) => {
      const text = lastJson(spawned.input);
      seen.push(text);
      const sources = (text.sources ?? []) as Array<{ itemId: string }>;
      return reply({ items: sources.map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: idOf('Projects/Offers'), wants: [] })), asks: [] });
    }, () => ({ drive, root, admission: admission.manifest }), true);
    await runOnDrive(c, drive, root, { claude, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
      answerStart: { scope: 'instructions', requestId: 'c12-map-cards-run' } }, 1);
    const first = seen[0] ?? {};
    const sources = (first.sources ?? []) as Array<{ itemId: string; candidates: string[] }>;
    const cards = (first.cards ?? []) as Card[];
    const picked = (sources[0]?.candidates ?? []).flatMap((id) => cards.find((x) => x.id === id)?.path ?? []);
    expect(sources, 'the request is the one source').toHaveLength(1);
    expect(picked, 'at most 40 candidates').toHaveLength(40);
    expect(picked, 'the pinned note is a candidate').toContain(PIN);
    expect(picked.filter((p) => p.startsWith('Projects/Offers/')), 'the pin took a slot: 39 of the 42 neighbours').toHaveLength(39);
  }, 60_000);
});
