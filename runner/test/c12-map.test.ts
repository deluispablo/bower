/**
 * C12 map, part 1 (c12-map, rethink 4.1 and 4.6, section 6): the planner's retrieval entries carry each note's links and
 * tags (the version's stored lint evidence, `LintEvidence.links` and `.tagList`, the one home of both), so the provider
 * reads no prefix for links; the neighbourhood ranks by BM25 over name, summary and tags (Robertson & Zaragoza 2009)
 * and offers at most 12 notes. Made-up folders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lintFacts } from '../../src/data/contracts/note-format';
import type { MaintenanceNote } from '../../src/data/contracts/run-manifest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { SYSTEM } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import { RunnerDrive } from '../src/drive';
import { refreshPlanning } from '../src/index';
import { RunnerToken } from '../src/token';
import { AT } from './corpus-run';
import { API, RUN_ID, TICKET, driveV3, paging } from './drive-v3';
import { HUB, candidates, fileIntent, folder, note, run, seedState, select, setup, type Base } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

/** A warm folder as maintenance leaves it: every stored entry with the lint evidence of its version. */
async function seedWithEvidence(base: Base): Promise<Record<string, MaintenanceNote>> {
  const state = await seedState(base);
  for (const [id, entry] of Object.entries(state.files)) {
    const lint = lintFacts(entry.path, await base.drive.readText(id), true);
    if (lint) entry.lint = lint;
  }
  const file = base.ix.file(SYSTEM.retrieval) ?? (await base.drive.listAll(base.root)).find((f) => f.name === 'retrieval.json');
  expect(file, 'the seeded retrieval file').toBeDefined();
  const stored = await base.drive.get(file?.id ?? '');
  await base.drive.writeText(stored.id, JSON.stringify(state), stored.modifiedTime);
  return state.files;
}

/** The runner's own refresh over the made-up wire, counting each note's Drive media reads. */
async function refreshed(base: Base) {
  const wire = driveV3(base.drive); wire.folderId = base.root;
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
  const out = await refreshPlanning(new RunnerDrive({ token, attempt: 1, fetch: wire.fetch, pacing: { baseMs: 0, sleep: async () => {} } }), base.root);
  const reads = (id: string): number => wire.requests.filter((r) => r.url.pathname.endsWith(`/files/${id}`) && r.url.searchParams.get('alt') === 'media').length;
  return { out, reads };
}

const traffic = (r: Awaited<ReturnType<typeof run>>, id: string) => r.traffic.filter((t) => t.method === 'GET'
  && t.url.pathname === `/drive/v3/files/${id}` && t.url.searchParams.get('alt') === 'media');

describe('retrieval entries carry links and tags (c12-map)', () => {
  it('AC1 c12-map-entries: the planner snapshot gives each note the links and tags of its version, with no read', async () => {
    const b = await setup({ folder: { ...folder,
      'Projects/Remote search/Primary.md': `---\nsummary: Alex tracks one remote developer offer.\ntags: [career, remote]\n---\n\n[[Applications]]\n`,
    } });
    const stored = await seedWithEvidence(b);
    const id = b.id('Projects/Remote search/Primary.md');
    const { out, reads } = await refreshed(b);
    expect(reads(id), 'an unchanged note is not read for its links or tags').toBe(0);
    const entry = out.snapshot[id] as MaintenanceNote & { lint?: { links: string[]; tagList?: string[] } };
    expect(entry.lint, 'the stored evidence of this version reaches the planner').toEqual(stored[id]?.lint);
    expect(entry.lint?.links).toEqual(['Applications']);
    expect(entry.lint?.tagList).toEqual(['career', 'remote']);
  });

  it('AC2 c12-map-no-link-reads: the provider reads no prefix for links; the one link hop comes from the stored entry', async () => {
    const b = await setup({ folder: { ...folder,
      'Projects/Remote search/Primary.md': note('Remote developer offer.', '[[One hop]]\n'),
      'Resources/Links/One hop.md': note('One linked evidence note.'),
    } });
    await seedWithEvidence(b);
    const primary = b.id('Projects/Remote search/Primary.md');
    const r = await run(b, [select(b, [primary]), fileIntent(b)]);
    expect(r.frames.length, 'the run reached the model').toBeGreaterThan(0);
    expect(candidates(r.frames[0], b.sources[0]?.itemId ?? ''), 'the link hop still reaches its note').toContain(b.id('Resources/Links/One hop.md'));
    const shown = r.frames[0]?.prompt ?? '';
    expect(shown, 'lint evidence never reaches the model input').not.toMatch(/"lint":/);
    expect(traffic(r, primary).filter((t) => !t.range), 'a selected note still gets its one full read').toHaveLength(1);
    expect(traffic(r, primary).filter((t) => t.range), 'no prefix read of a matched note for its links').toEqual([]);
    expect(traffic(r, b.id('Resources/Gardening/Garden plans.md')), 'an unrelated note is not read at all').toEqual([]);
  });
});

describe('the ranked neighbourhood (c12-map)', () => {
  it('AC3 c12-map-tags: a note found only by its tags is a candidate', async () => {
    const b = await setup({ folder: { ...folder,
      'Resources/Bees/Hive log.md': `---\nsummary: Alex writes what happened each week.\ntags: [beekeeping]\n---\n\nWeek one.\n`,
    }, inbox: [{ line: 'Alex joined a beekeeping course.', files: ['Course.txt'] }],
    inboxFiles: { 'Course.txt': 'Alex joined a beekeeping course.\n' } });
    await seedWithEvidence(b);
    const r = await run(b, [select(b), fileIntent(b)]);
    expect(r.frames.length, 'the run reached the model').toBeGreaterThan(0);
    expect(candidates(r.frames[0], b.sources[0]?.itemId ?? '')).toContain(b.id('Resources/Bees/Hive log.md'));
  });

  /** A made-up folder: Resources/Bees with `notes`, each modified at its own minute (later in the list is newer). */
  function bees(notes: Array<[name: string, summary: string]>) {
    const at = (minute: number): string => `2026-10-01T09:${String(minute).padStart(2, '0')}:00.000Z`;
    const files: DriveFile[] = [
      { id: 'resources', name: 'Resources', folder: true, parents: ['root'], modifiedTime: at(0), createdTime: at(0) },
      { id: 'bees', name: 'Bees', folder: true, parents: ['resources'], modifiedTime: at(0), createdTime: at(0) },
      ...notes.map(([name], i): DriveFile => ({ id: `n${i}`, name: `${name}.md`, folder: false, parents: ['bees'], modifiedTime: at(i + 1), createdTime: at(i + 1) })),
    ];
    return { ix: VaultIndex.build('root', files), meta: Object.fromEntries(notes.map(([, summary], i) => [`n${i}`, { summary }])) };
  }

  it('AC4 c12-map-rank: whole-word matches rank by BM25 over name, summary and tags, not by recency', () => {
    const { ix, meta } = bees([
      ['Inspection schedule', 'Alex plans the beehive inspection schedule.'],
      ['Honey', 'Alex sells beehive honey.'],
    ]);
    expect(ix.neighbourhood('beehive inspection schedule', meta)[0], 'the note matching more of the words comes first').toBe('n0');
    // Control: equal scores keep today's order, newest first.
    const tie = bees([['First', 'Alex keeps a beehive.'], ['Second', 'Alex keeps a beehive.']]);
    expect(tie.ix.neighbourhood('beehive', tie.meta)).toEqual(['n1', 'n0']);
  });

  it('AC5 c12-map-cap-12: the neighbourhood offers at most 12 notes, and a run shows at most 12 note candidates per source', async () => {
    const { ix, meta } = bees(Array.from({ length: 20 }, (_, i): [string, string] => [`Hive ${i}`, 'Alex keeps a beehive.']));
    expect(ix.neighbourhood('beehive', meta)).toHaveLength(12);

    const matching = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [
      `Projects/Remote search/Match ${String(i).padStart(2, '0')}.md`, note(`Remote developer offer ${i}.`),
    ]));
    const b = await setup({ folder: { ...folder, ...matching } });
    await seedWithEvidence(b);
    const r = await run(b, [select(b, [b.id(HUB)]), fileIntent(b)]);
    const notes = candidates(r.frames[0], b.sources[0]?.itemId ?? '').filter((id) => (b.ix.pathOf(id) ?? '').endsWith('.md'));
    expect(notes.length, 'the source has note candidates').toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(12);
  });
});
