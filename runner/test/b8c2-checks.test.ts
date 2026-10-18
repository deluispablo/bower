/**
 * B8c2 reds through production main (TL-P4-50 Q3; TL-P4-38 appendix "Lint checks"; specs/b8-log/spec.md R24): the
 * appendix checks on Bower notes that need evidence b8b does not freeze: parser refusals, stale active projects, tag
 * rules against the folder's list, the type table's skipped rows, and originals no note links.
 */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import * as maintenance from '../src/index';
import * as providers from '../src/provider';
import { emptyManifest } from '../../src/data/spine/scripted';
import { renderHealth } from '../src/lint';
import { readTagList } from '../../src/data/contracts/tag-format';
import { readTypeTable } from '../../src/data/contracts/note-format';
import { serializeNote } from '../../src/data/contracts/note-format';
import { AT, redispatchCase, replySequence, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';
import { empty, observe, pacing, type Observation } from './b23-hot-observe';

const HEALTH = 'Bower health.md';
const GARDEN = 'Resources/Gardening';
const TAGS = '.bower/tags.json';
const TABLE = '.bower/type-table.json';
const RETRIEVAL = '.bower/retrieval.json';
const healthOf = (run: CaseRun): string[] => (run.after[HEALTH] ?? '').split('\n');
const about = (run: CaseRun, path: string): string => healthOf(run).filter((line) => (line.includes(`[[${path}]]`) || line.includes(`[[${path}|`))).join('\n');
/** A project note exactly as Bower writes one from its template (B6), with the given status and Timeline dates. */
const project = (status: string, dates: string[]): string => serializeNote({ template: 'project', byBower: true, status,
  summary: 'Alex is building a greenhouse.', tags: [], currentState: ['Alex has the frame.'],
  timeline: dates.map((date) => ({ date, text: 'Alex worked on the greenhouse.' })),
  properties: [
    { key: 'type', label: 'Type', value: 'project' },
    { key: 'created', label: 'Created', value: '2026-05-01' },
    { key: 'updated', label: 'Updated', value: '2026-05-01' },
    { key: 'source', label: 'Source', value: 'Garden bulletin' },
    { key: 'related', label: 'Related', value: 'Gardening', link: 'Gardening' },
  ],
  body: '## Goal\nFinish the greenhouse.\n\n## Next steps\n- [ ] Fit the glass.\n\n## Notes\n',
});

async function folder(edit: (files: Record<string, string>) => void = () => undefined) {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c17-b8-report-only-grammar'));
  edit(c.folder);
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const traffic: Observation[] = [];
  const press = (n: number): Promise<CaseRun> => runOnDrive(c, drive, root, { claude: replySequence([empty]),
    around: observe(drive, root, traffic), pacing, ...(n > 1 ? { request: { kind: 'tidy' as const, text: 'Check my notes again.' } } : {}) }, n);
  return { c, root, drive, traffic, press };
}

describe('B8c2 appendix checks on Bower notes through main', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AT);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const NEWER = `${GARDEN}/Seed plan`;
  const DAMAGED = `${GARDEN}/Bed plan`;
  it('AC25 b8c2-parser-diagnostics: a refused note is named with the parser\'s reason, never as unreadable', async () => {
    const base = await folder((files) => {
      files[`${NEWER}.md`] = '---\nsummary: Alex plans seeds.\nby: bower\nbower_format: ownership/9\n---\n\nSeeds. [[Gardening]]\n';
      files[`${DAMAGED}.md`] = '---\nsummary: Alex plans beds.\nby: bower\nbower_format: ownership/2\nbower_format: ownership/2\n---\n\nBeds. [[Gardening]]\n';
    });
    const run = await base.press(1);
    expect(run.code).toBe(0);
    expect(about(run, NEWER), 'the newer format is named as such').toMatch(/unsupported format/i);
    expect(about(run, DAMAGED), 'the damaged format is named as such').toMatch(/read safely/i);
    expect(about(run, NEWER) + about(run, DAMAGED), 'a refusal is not a failed read').not.toMatch(/could not read|next time/i);
  });
  it('AC25 guard: a refused note is never checked, so no orphan or clean claim', async () => {
    const base = await folder((files) => {
      files[`${NEWER}.md`] = '---\nsummary: Alex plans seeds.\nby: bower\nbower_format: ownership/9\n---\n\nSeeds. [[Gardening]]\n';
    });
    const run = await base.press(1);
    expect(healthOf(run).join('\n')).not.toMatch(/Nothing links to|No findings in the checked notes/i);
    expect(run.after[`${NEWER}.md`], 'report-only').toContain('ownership/9');
  });

  // AT is 2026-10-07: 2026-08-08 is exactly 60 days before it.
  it('AC26 b8c2-stale-projects: an active project quiet for more than 60 days of Timeline is reported', async () => {
    const base = await folder((files) => {
      files['Projects/Greenhouse/Greenhouse.md'] = project('active', ['2026-08-07', '2026-12-01', '2026-06-01']);
      files['Projects/Pond/Pond.md'] = project('active', ['2026-08-08', '2026-06-01']);
      files['Projects/Invalid/Invalid.md'] = project('active', ['2026-06-01']).replace('2026-06-01', '2026-02-30');
      files['Projects/Shed/Shed.md'] = project('active', []);
      files['Projects/Fence/Fence.md'] = project('done', ['2026-01-10']);
      files['Projects/Path/Path.md'] = '---\nsummary: Alex lays a path.\nstatus: active\ntype: project\n---\n\n## Timeline\n- 2026-01-10 · Alex started.\n';
    });
    const run = await base.press(1);
    expect(run.code).toBe(0);
    expect(about(run, 'Projects/Greenhouse/Greenhouse'), 'last Timeline activity 61 days ago').toMatch(/60 days/);
    expect(about(run, 'Projects/Pond/Pond'), 'exactly 60 days is not stale').not.toMatch(/60 days/);
    expect(about(run, 'Projects/Invalid/Invalid')).not.toMatch(/60 days/);
    expect(about(run, 'Projects/Shed/Shed'), 'no dated activity is unknown, never modifiedTime').not.toMatch(/60 days/);
    expect(about(run, 'Projects/Fence/Fence'), 'only active projects').not.toMatch(/60 days/);
    expect(about(run, 'Projects/Path/Path'), 'a person\'s note is never judged (Q3)').toBe('');
  });
  it('AC26 b8c2-old-evidence-rebuilt: evidence stored before b8c2 is rebuilt once, never trusted as complete', async () => {
    const base = await folder((files) => { files['Projects/Greenhouse/Greenhouse.md'] = project('active', ['2026-08-07']); });
    const first = await base.press(1);
    const id = Object.entries(first.pathsById).find(([, path]) => path === RETRIEVAL)?.[0] ?? '';
    const stored = JSON.parse(first.after[RETRIEVAL] ?? '{}') as { files: Record<string, { lint?: Record<string, unknown> }> };
    // b8b's evidence shape: links, a tag count and whether a summary exists, nothing more.
    for (const file of Object.values(stored.files)) {
      if (file.lint) file.lint = { links: file.lint.links, tags: file.lint.tags, summary: file.lint.summary };
    }
    await base.drive.writeText(id, JSON.stringify(stored), (await base.drive.get(id)).modifiedTime);
    base.traffic.length = 0;
    const second = await base.press(2);
    expect(about(second, 'Projects/Greenhouse/Greenhouse'), 'the stale finding survives an older evidence shape').toMatch(/60 days/);
    expect(base.traffic.filter((e) => e.media && e.path === 'Projects/Greenhouse/Greenhouse.md'), 'one read rebuilds it').toHaveLength(1);
  });

  const LOOSE = `${GARDEN}/Loose thought`;
  it('AC27 b8c2-tag-rules: tags off the folder\'s list, repeated or not in Bower\'s spelling are reported on Bower notes', async () => {
    const base = await folder((files) => {
      files[TAGS] = JSON.stringify({ v: 1, tags: ['home', 'garden', 'career'] });
      // A block list decodes like a flow list: no repeated tag is lost in the decode.
      files[`${GARDEN}/Beds.md`] = '---\nsummary: Alex keeps beds.\nby: bower\ntags:\n  - garden\n  - garden\n---\n\nBeds. [[Gardening]]\n';
      files[`${GARDEN}/Empty tags.md`] = '---\nsummary: Alex keeps empty tags.\nby: bower\ntags: ["", "", Garden Plots]\n---\n\n[[Gardening]]\n';
      files[`${GARDEN}/Plots.md`] = '---\nsummary: Alex keeps plots.\nby: bower\ntags: [Garden Plots]\n---\n\nPlots. [[Gardening]]\n';
    });
    const run = await base.press(1);
    expect(about(run, LOOSE), 'Loose thought carries a tag the list does not have').toMatch(/unlisted.*list|list.*unlisted/i);
    expect(about(run, `${GARDEN}/Beds`), 'a tag twice on one note').toMatch(/garden.*twice|twice.*garden|repeat/i);
    expect(about(run, `${GARDEN}/Plots`), 'a tag not in the one slug spelling (normalizeTag)').toMatch(/garden-plots/);
    expect(about(run, `${GARDEN}/Empty tags`)).toMatch(/repeat/i);
    expect(about(run, `${GARDEN}/Empty tags`)).toMatch(/spelling/i);
    expect(run.wire?.statuses.at(-1)?.phase, 'stored tags never refuse maintenance').toBe('done');
    expect(about(run, `${GARDEN}/Plot diary`), 'a person\'s tags are never judged (Q3, R24)').not.toMatch(/tag/i);
    expect(run.after[TAGS], 'report-only: the list is never grown or repaired by lint').toBe(JSON.stringify({ v: 1, tags: ['home', 'garden', 'career'] }));
  });
  it.each([null, '{ not json'])('AC27 guard: absent or unreadable list %s never calls tags off-list', async (list) => {
    const base = await folder((files) => { if (list !== null) files[TAGS] = list; });
    const run = await base.press(1);
    expect(healthOf(run).join('\n')).not.toMatch(/Tag not on your tag list|off the list/i);
  });

  it('AC27 health reads diagnostics without logging the default reader error again', () => {
    const text = '{ not json';
    const read = readTagList(text);
    expect(read.error).toBeDefined();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(read.error);
    vi.mocked(console.error).mockClear();
    const health = renderHealth({}, [], {}, { at: new Date(AT).toISOString(), sources: [{
      path: TAGS, file: { fileId: 'tags', name: 'tags.json', parents: ['system'], folder: false, modifiedTime: 'v1' },
      text, content: { encoding: 'utf8', size: text.length, sha256: 'a'.repeat(64), provenance: 'adapter-read', observedModifiedTime: 'v1' },
    }] });
    expect(health).not.toContain('Tag not on your tag list');
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([TAGS, TABLE].flatMap((path) => [403, 404, 503].map((status) => ({ path, status }))))(
    'AC27/AC28 $path transport $status is unavailable, never absent or malformed', async ({ path, status }) => {
      const base = await folder((files) => {
        files[TAGS] = JSON.stringify({ v: 1, tags: [] });
        files[TABLE] = '{ not json';
      });
      expect((await base.press(1)).code).toBe(0);
      base.traffic.length = 0;
      // Isolate declaration reads: planning has no work and has not already cached either input.
      vi.spyOn(providers, 'providerFor').mockImplementation((_name, _drive, run) => async ({ taken }) =>
        emptyManifest(run.rootId, { runId: run.runId, requestId: taken.id, scope: taken.scope, allowWeb: run.allowWeb, requestedAt: taken.at }));
      let attempts = 0;
      const around = (fetch: typeof globalThis.fetch) => observe(base.drive, base.root, base.traffic)(async (input, init = {}) => {
        const last = base.traffic.at(-1);
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.origin === 'https://www.googleapis.com' && url.searchParams.get('alt') === 'media'
          && last?.media && last.path === path && (init.method ?? 'GET') === 'GET') {
          attempts++;
          if (status === 404 && attempts === 1) {
            const file = (await base.drive.listAll(base.root)).find((f) => base.drive.pathOf(f.id, base.root) === path);
            if (!file) throw new Error('The listed source must exist before it disappears');
            await base.drive.trash(file.id);
          }
          return new Response(JSON.stringify({ error: { code: status, message: 'Made-up input unavailable',
            errors: [{ reason: status === 403 ? 'forbidden' : status === 404 ? 'notFound' : 'backendError' }] } }), { status });
        }
        return fetch(input, init);
      });
      const run = await runOnDrive(base.c, base.drive, base.root, { around, pacing,
        admission: { v: 1, id: 'input-failure', rootId: base.root, scope: 'all', at: AT + 1, piles: [], journal: [] },
        claude: async () => { throw new Error('An idle check must not model'); } }, 2);
      expect(attempts).toBeGreaterThan(status === 503 ? 1 : 0);
      expect(run.code, vi.mocked(console.error).mock.calls.flat().map(String).join('\n')).toBe(0);
      expect(run.wire?.statuses.at(-1)?.phase, vi.mocked(console.error).mock.calls.flat().map(String).join('\n')).toBe('done');
      const lines = healthOf(run);
      const label = path === TAGS ? /tag list/i : /list of types/i;
      expect(lines.filter((line) => /unavailable/i.test(line) && label.test(line))).toHaveLength(1);
      expect(lines.join('\n')).not.toMatch(path === TAGS ? /Tag not on your tag list/ : /used the standard ones|skipped \d+ types?/i);
      expect(lines.join('\n')).toMatch(path === TAGS ? /used the standard ones/ : /Tag not on your tag list/);
      if (status !== 404) expect(run.after[path]).toBe(base.c.folder[path]);
      else expect(run.after[path]).toBeUndefined();
      const replay = await redispatchCase(base.c, run, 3, { pacing,
        claude: async () => { throw new Error('Replay must not model'); } });
      expect(replay.code).toBe(0);
      expect(replay.after[HEALTH]).toBe(run.after[HEALTH]);
    });

  it('AC28 b8c2-type-table-diagnostics: skipped and unreadable type tables are reported, the bytes untouched', async () => {
    const row = readTypeTable(null).table.rows[0];
    const skipped = JSON.stringify({ v: 1, rows: [row, { id: 'broken' }, row] });
    const one = await folder((files) => { files[TABLE] = skipped; });
    const first = await one.press(1);
    expect(healthOf(first).join('\n'), 'one invalid and one repeated row').toMatch(/skipped 2 types?/i);
    expect(first.after[TABLE]).toBe(skipped);
    const two = await folder((files) => { files[TABLE] = '{ not json'; });
    const second = await two.press(1);
    expect(healthOf(second).join('\n'), 'an unreadable table: the standard types are used').toMatch(/could not read your list of types.*used the standard ones/i);
    expect(second.after[TABLE]).toBe('{ not json');
  });

  it('AC29 b8c2-unlinked-originals: a file beside Bower notes that no note links or binds is reported', async () => {
    const base = await folder((files) => {
      files[`${GARDEN}/Seed photo.jpg`] = 'made-up image bytes';
      files[`${GARDEN}/Soil test.pdf`] = 'made-up pdf bytes';
      files[`${GARDEN}/Soil test.md`] = '---\nsummary: Alex tested the soil.\nby: bower\noriginal: Soil test.pdf\n---\n\nSoil. [[Gardening]]\n';
      files[`${GARDEN}/Bed sketch.pdf`] = 'made-up pdf bytes';
      files[`${GARDEN}/Sketches.md`] = '---\nsummary: Alex sketches beds.\nby: bower\n---\n\nSee [[Bed sketch.pdf]]. [[Gardening]]\n';
      files['Areas/Photos/Soil test.pdf'] = 'another soil test';
      files['Areas/Photos/Photos.md'] = '---\nsummary: Alex keeps photos.\nby: bower\n---\n';
      files['Areas/Personal/Beach.jpg'] = 'made-up image bytes';
    });
    const run = await base.press(1);
    expect(run.code).toBe(0);
    expect(about(run, `${GARDEN}/Seed photo.jpg`), 'no note links or binds it').toMatch(/link/i);
    expect(about(run, `${GARDEN}/Soil test.pdf`), 'bound by its companion note\'s original').toBe('');
    expect(about(run, `${GARDEN}/Bed sketch.pdf`), 'linked').toBe('');
    expect(about(run, 'Areas/Photos/Soil test.pdf'), 'original binds only its sibling').toMatch(/link/i);
    expect(about(run, 'Areas/Personal/Beach.jpg'), 'a folder with no Bower note is the person\'s own').toBe('');
  });
  it('AC26 cached dates cross day 60 without reading the unchanged project again', async () => {
    const path = 'Projects/Pond/Build';
    const base = await folder((files) => { files[`${path}.md`] = project('active', ['2026-08-08']); });
    const first = await base.press(1);
    expect(about(first, path)).not.toMatch(/60 days/);
    base.traffic.length = 0;
    const second = await runOnDrive(base.c, base.drive, base.root, { admission: { v: 1, id: 'next-day', rootId: base.root, scope: 'all', at: AT + 86400000, piles: [], journal: [] },
      around: observe(base.drive, base.root, base.traffic), pacing }, 2);
    expect(second.code).toBe(0);
    expect(about(second, path)).toMatch(/60 days/);
    expect(base.traffic.filter((e) => e.media && e.path === `${path}.md`)).toHaveLength(0);
  });

  it('AC26/R-c8 replay freezes admission day, tag list and type-table diagnostics', async () => {
    const path = 'Projects/Pond/Pond';
    const base = await folder((files) => {
      files[`${path}.md`] = project('active', ['2026-08-08']);
      files[TAGS] = JSON.stringify({ v: 1, tags: ['garden'] });
      files[TABLE] = '{ not json';
    });
    let stopped = false;
    const around = (fetch: typeof globalThis.fetch) => observe(base.drive, base.root, base.traffic)(async (input, init = {}) => {
      const last = base.traffic.at(-1);
      if (last?.path === HEALTH && ['POST', 'PATCH'].includes(init.method ?? 'GET')) {
        stopped = true;
        throw new TypeError('Made-up connection lost before health is sent');
      }
      return fetch(input, init);
    });
    const first = await runOnDrive(base.c, base.drive, base.root, { around, claude: replySequence([empty]), pacing }, 1);
    expect(stopped).toBe(true);
    expect(first.after[HEALTH]).toBeUndefined();
    for (const [path, text] of [[TAGS, JSON.stringify({ v: 1, tags: ['home', 'garden', 'career', 'unlisted'] })], [TABLE, JSON.stringify(readTypeTable(null).table)]]) {
      const file = (await base.drive.listAll(base.root)).find((f) => base.drive.pathOf(f.id, base.root) === path);
      if (!file || text === undefined) throw new Error('Fixture source is missing');
      await base.drive.writeText(file.id, text, file.modifiedTime);
    }
    vi.setSystemTime(AT + 10 * 86400000);
    const recovered = await redispatchCase(base.c, first, 2, { pacing, claude: async () => { throw new Error('Replay must not model'); } });
    expect(recovered.code).toBe(0);
    expect(about(recovered, path)).not.toMatch(/60 days/);
    expect(about(recovered, LOOSE)).toMatch(/Tag not on your tag list/);
    expect(recovered.after[HEALTH]).toMatch(/used the standard ones/);
  });

  it.each(['move', 'linked', 'original-alone', 'companion-alone', 'together', 'bin'] as const)('AC29 %s follows settled identities and sibling bindings', async (kind) => {
    const path = `${GARDEN}/Seed photo.jpg`;
    const destination = 'Areas/Photos';
    const base = await folder((files) => {
      files[path] = 'made-up image bytes';
      if (kind === 'linked') files[`${GARDEN}/Link.md`] = `See [[${path}]].\n`;
      if (['original-alone', 'companion-alone', 'together'].includes(kind)) {
        files[`${GARDEN}/Photo note.md`] = '---\nsummary: Alex keeps a photo.\nby: bower\noriginal: Seed photo.jpg\n---\n';
      }
      if (kind === 'companion-alone') files[`${destination}/Seed photo.jpg`] = 'another photo';
      files[`${destination}/Photos.md`] = '---\nsummary: Alex keeps photos.\nby: bower\n---\n';
    });
    const listing = await base.drive.listAll(base.root);
    const file = listing.find((f) => base.drive.pathOf(f.id, base.root) === path);
    const parent = listing.find((f) => base.drive.pathOf(f.id, base.root) === destination);
    if (!file || !parent) throw new Error('Fixture original and destination are missing');
    const moved = kind === 'companion-alone' ? [`${GARDEN}/Photo note.md`]
      : kind === 'together' ? [path, `${GARDEN}/Photo note.md`] : [path];
    // Supply a deterministic plan; main still validates, applies and renders the settled effects.
    const maintain = maintenance.withMaintenance;
    vi.spyOn(maintenance, 'withMaintenance').mockImplementation(async (drive, manifest, ...rest) => {
      const places = moved.map((path) => {
        const f = listing.find((f) => base.drive.pathOf(f.id, base.root) === path);
        if (!f) throw new Error('Fixture move source is missing');
        return { path, file: { fileId: f.id, name: f.name, parents: f.parents, folder: false, modifiedTime: f.modifiedTime } };
      });
      return maintain(drive, { ...manifest, capture: { ...manifest.capture, places: [...manifest.capture.places, ...places,
        { file: { fileId: parent.id, name: parent.name, parents: parent.parents, folder: true,
          modifiedTime: parent.modifiedTime }, path: destination }] }, operations: [...manifest.operations,
        ...places.map(({ file: before }, i) => ({ operationId: `original-disposition-${i}`, ordinal: manifest.operations.length + i, dependsOn: [],
          effect: kind === 'bin' ? { kind: 'bin' as const, before, capturedChildIds: [] }
            : { kind: 'move' as const, before, parent: { fileId: parent.id }, name: before.name, properties: {} } }))] }, ...rest);
    });
    const run = await base.press(1);
    expect(run.code).toBe(0);
    for (const path of moved) expect(run.after[path]).toBeUndefined();
    if (kind === 'bin') {
      expect(about(run, path)).toBe('');
      expect(healthOf(run)).toContain('- Binned: Seed photo was moved to the Bin.');
      expect(run.after[HEALTH]).not.toContain(`[[${path}`);
    } else {
      expect(run.after[`${destination}/Seed photo.jpg`]).toBe(kind === 'companion-alone' ? 'another photo' : 'made-up image bytes');
      if (kind === 'move' || kind === 'original-alone') expect(about(run, `${destination}/Seed photo.jpg`)).toMatch(/Not linked/);
      else expect(about(run, `${destination}/Seed photo.jpg`)).toBe('');
      if (kind === 'companion-alone') expect(about(run, path)).toMatch(/Not linked/);
      else expect(about(run, path)).toBe('');
      if (kind === 'linked') expect(about(run, `${GARDEN}/Link`)).not.toMatch(/Broken link/);
      if (kind === 'companion-alone' || kind === 'together') expect(run.after[`${destination}/Photo note.md`]).toContain('original: Seed photo.jpg');
    }
  });

});
