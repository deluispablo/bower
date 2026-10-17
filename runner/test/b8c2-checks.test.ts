/**
 * B8c2 reds through production main (TL-P4-50 Q3; TL-P4-38 appendix "Lint checks"; specs/b8-log/spec.md R24): the
 * appendix checks on Bower notes that need evidence b8b does not freeze: parser refusals, stale active projects, tag
 * rules against the folder's list, the type table's skipped rows, and originals no note links.
 */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { serializeNote } from '../../src/data/contracts/note-format';
import { AT, replySequence, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';
import { empty, observe, pacing, type Observation } from './b23-hot-observe';

const HEALTH = 'Bower health.md';
const GARDEN = 'Resources/Gardening';
const TAGS = '.bower/tags.json';
const TABLE = '.bower/type-table.json';
const RETRIEVAL = '.bower/retrieval.json';
const healthOf = (run: CaseRun): string[] => (run.after[HEALTH] ?? '').split('\n');
const about = (run: CaseRun, path: string): string => healthOf(run).filter((line) => line.includes(`[[${path}]]`)).join('\n');
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
  return { drive, traffic, press };
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
    expect(healthOf(run).join('\n')).not.toMatch(/orphan|No findings in the checked notes/i);
    expect(run.after[`${NEWER}.md`], 'report-only').toContain('ownership/9');
  });

  // AT is 2026-10-07: 2026-08-08 is exactly 60 days before it.
  it('AC26 b8c2-stale-projects: an active project quiet for more than 60 days of Timeline is reported', async () => {
    const base = await folder((files) => {
      files['Projects/Greenhouse/Greenhouse.md'] = project('active', ['2026-06-01', '2026-08-07']);
      files['Projects/Pond/Pond.md'] = project('active', ['2026-08-08']);
      files['Projects/Shed/Shed.md'] = project('active', []);
      files['Projects/Fence/Fence.md'] = project('done', ['2026-01-10']);
      files['Projects/Path/Path.md'] = '---\nsummary: Alex lays a path.\nstatus: active\ntype: project\n---\n\n## Timeline\n- 2026-01-10 · Alex started.\n';
    });
    const run = await base.press(1);
    expect(run.code).toBe(0);
    expect(about(run, 'Projects/Greenhouse/Greenhouse'), 'last Timeline activity 61 days ago').toMatch(/60 days/);
    expect(about(run, 'Projects/Pond/Pond'), 'exactly 60 days is not stale').not.toMatch(/60 days/);
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
      files[`${GARDEN}/Plots.md`] = '---\nsummary: Alex keeps plots.\nby: bower\ntags: [Garden Plots]\n---\n\nPlots. [[Gardening]]\n';
    });
    const run = await base.press(1);
    expect(about(run, LOOSE), 'Loose thought carries a tag the list does not have').toMatch(/unlisted.*list|list.*unlisted/i);
    expect(about(run, `${GARDEN}/Beds`), 'a tag twice on one note').toMatch(/garden.*twice|twice.*garden|repeat/i);
    expect(about(run, `${GARDEN}/Plots`), 'a tag not in the one slug spelling (normalizeTag)').toMatch(/garden-plots/);
    expect(about(run, `${GARDEN}/Plot diary`), 'a person\'s tags are never judged (Q3, R24)').not.toMatch(/tag/i);
    expect(run.after[TAGS], 'report-only: the list is never grown or repaired by lint').toBe(JSON.stringify({ v: 1, tags: ['home', 'garden', 'career'] }));
  });
  it('AC27 guard: without a tag list nothing is called off the list', async () => {
    const base = await folder();
    const run = await base.press(1);
    expect(healthOf(run).join('\n')).not.toMatch(/not on .*list|off the list/i);
  });

  it('AC28 b8c2-type-table-diagnostics: skipped and unreadable type tables are reported, the bytes untouched', async () => {
    const skipped = JSON.stringify({ v: 1, rows: [{ id: 'broken' }] });
    const one = await folder((files) => { files[TABLE] = skipped; });
    const first = await one.press(1);
    expect(healthOf(first).join('\n'), 'one row Bower could not read').toMatch(/type.*\b1\b|\b1\b.*type/i);
    expect(first.after[TABLE]).toBe(skipped);
    const two = await folder((files) => { files[TABLE] = '{ not json'; });
    const second = await two.press(1);
    expect(healthOf(second).join('\n'), 'an unreadable table: the standard types are used').toMatch(/type/i);
    expect(second.after[TABLE]).toBe('{ not json');
  });

  it('AC29 b8c2-unlinked-originals: a file beside Bower notes that no note links or binds is reported', async () => {
    const base = await folder((files) => {
      files[`${GARDEN}/Seed photo.jpg`] = 'made-up image bytes';
      files[`${GARDEN}/Soil test.pdf`] = 'made-up pdf bytes';
      files[`${GARDEN}/Soil test.md`] = '---\nsummary: Alex tested the soil.\nby: bower\noriginal: Soil test.pdf\n---\n\nSoil. [[Gardening]]\n';
      files[`${GARDEN}/Bed sketch.pdf`] = 'made-up pdf bytes';
      files[`${GARDEN}/Sketches.md`] = '---\nsummary: Alex sketches beds.\nby: bower\n---\n\nSee [[Bed sketch.pdf]]. [[Gardening]]\n';
      files['Areas/Photos/Beach.jpg'] = 'made-up image bytes';
    });
    const run = await base.press(1);
    expect(run.code).toBe(0);
    expect(about(run, `${GARDEN}/Seed photo.jpg`), 'no note links or binds it').toMatch(/link/i);
    expect(about(run, `${GARDEN}/Soil test.pdf`), 'bound by its companion note\'s original').toBe('');
    expect(about(run, `${GARDEN}/Bed sketch.pdf`), 'linked').toBe('');
    expect(about(run, 'Areas/Photos/Beach.jpg'), 'a folder with no Bower note is the person\'s own').toBe('');
  });
});
