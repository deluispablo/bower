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
import { AT, lastJson } from './corpus-run';
import { paging } from './drive-v3';
import * as support from './b1-planning-support';
import { HUB, PERSONAL, candidates, fileIntent, report, run, seedState, select, setup, type Frame } from './b1-planning-support';

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
    const r = await run(b, [selected, intent], { beforeReply: async (turn, frame) => {
      if (turn !== 1) return;
      selected.items = selected.items.flatMap((item) => { const wants = candidates(frame, item.itemId).slice(0, 1); return wants.length ? [{ ...item, wants }] : []; });
      intent.things = intent.things.filter((t) => selected.items.some((i) => i.itemId === t.fileId));
    } });
    expect(r.code).toBe(0);
    expect(r.frames[0]?.prompt ?? '', 'no cut marker in what the model reads').not.toMatch(/index cut|folders cut/);
    expect(((context(r.frames[0]).map ?? []) as MapRow[]).filter((row) => /\/Topic \d+$/.test(row.path)), 'every topic folder has its row').toHaveLength(60);
    expect(report(r).filed, 'every thing has a candidate and is filed').toHaveLength(25);
  }, 120_000);
});
