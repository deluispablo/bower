/**
 * B8c reds through production main (TL-P4-50 Q3, Q4; specs/b8-log/spec.md R24, R26): notes past the 4,096-byte prefix,
 * the 200-note cap on lint's own reads, older retrieval files without lint data, and the Bower-note checks that need no
 * new evidence (dated names, duplicate summaries, summary validation).
 */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { AT, replySequence, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';
import { empty, observe, pacing, type Observation } from './b23-hot-observe';

const HEALTH = 'Bower health.md';
const GARDEN = 'Resources/Gardening';
const LOOSE = `${GARDEN}/Loose thought`;
const RETRIEVAL = '.bower/retrieval.json';
const bowerNote = (summary: string, body: string): string => `---\nsummary: ${summary}\nby: bower\n---\n\n## My thoughts\n${body}\n`;
const lines = (run: CaseRun): string[] => (run.after[HEALTH] ?? '').split('\n');
const lineAbout = (run: CaseRun, path: string): string[] => lines(run).filter((line) => line.includes(`[[${path}|`) || line.includes(`[[${path}]]`));

/** The b8b grammar fixture plus `edit`, seeded once; each press is a real main run on the same Drive. */
async function folder(edit: (files: Record<string, string>) => void = () => undefined) {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c17-b8-report-only-grammar'));
  edit(c.folder);
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const traffic: Observation[] = [];
  const around = observe(drive, root, traffic);
  const press = (n: number): Promise<CaseRun> => runOnDrive(c, drive, root, { claude: replySequence([empty]), around, pacing,
    ...(n > 1 ? { request: { kind: 'tidy' as const, text: 'Check my notes again.' } } : {}) }, n);
  /** An older retrieval file: what a Bower before b8b stored, the same files with no lint evidence. */
  const forgetLint = async (run: CaseRun): Promise<void> => {
    const id = Object.entries(run.pathsById).find(([, path]) => path === RETRIEVAL)?.[0] ?? '';
    const stored = JSON.parse(run.after[RETRIEVAL] ?? '{}') as { files: Record<string, Record<string, unknown>> };
    for (const file of Object.values(stored.files)) delete file.lint;
    await drive.writeText(id, JSON.stringify(stored), (await drive.get(id)).modifiedTime);
  };
  const noteReads = (): string[] => traffic.filter((e) => e.media && e.method === 'GET' && e.path.endsWith('.md') && !e.path.startsWith('.bower/')
    && e.path !== HEALTH).map((e) => e.path);
  return { c, drive, root, traffic, press, forgetLint, noteReads };
}

describe('B8c coverage and the Bower-note checks through main', () => {
  const pageSize = paging.size;
  beforeEach(() => {
    // Listing pages cost maintenance calls; 234 notes must discover in one run, as the cold-discovery suites set it.
    paging.size = 1000;
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AT);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { paging.size = pageSize; vi.useRealTimers(); vi.restoreAllMocks(); });

  const LONG = `${GARDEN}/Watering log`;
  const longNote = bowerNote('Alex logs watering.', `${'Alex waters the raised beds before work. '.repeat(140)}\nSee [[Lost seed list]] and [[Loose thought]].`);

  it('AC20 b8c-cut-note-read-whole: a note past 4,096 bytes is checked from its whole text', async () => {
    const base = await folder((files) => { files[`${LONG}.md`] = longNote; });
    expect(new TextEncoder().encode(longNote).length, 'the fixture is past the prefix').toBeGreaterThan(4096);
    const first = await base.press(1);
    expect(first.code).toBe(0);
    expect(lineAbout(first, LONG).join('\n'), 'the broken link past the prefix is found').toMatch(/broken link.*Lost seed list/i);
    expect(lineAbout(first, LONG).join('\n'), 'a whole read leaves the long note checked').not.toMatch(/- Waiting: /);
    // Its link to Loose thought counts in the inbound graph, and coverage is complete, so the orphan check runs.
    expect(lineAbout(first, LOOSE).join('\n')).not.toMatch(/Nothing links to/);
    expect(first.after[`${LONG}.md`], 'report-only').toBe(longNote);
  });
  it('AC20 guard: one whole read per version, none for an unchanged version', async () => {
    const base = await folder((files) => { files[`${LONG}.md`] = longNote; });
    const first = await base.press(1);
    expect(base.noteReads().filter((path) => path === `${LONG}.md`).length, 'at most the index prefix and one whole read').toBeLessThanOrEqual(2);
    base.traffic.length = 0;
    const second = await base.press(2);
    expect(second.code).toBe(0);
    expect(base.noteReads().filter((path) => path === `${LONG}.md`), 'the stored evidence of this version is reused').toEqual([]);
    expect(second.after[HEALTH], 'an unchanged check writes nothing new').toBe(first.after[HEALTH]);
  });
  it('AC20 control: a note within the prefix is checked from the prefix read alone', async () => {
    const base = await folder();
    const run = await base.press(1);
    expect(lines(run).join('\n')).toContain('Missing plan');
    expect(base.noteReads().filter((path) => path === `${GARDEN}/Plot diary.md`)).toHaveLength(1);
  });

  // A folder with more notes than one run checks after an older retrieval file (prep case 6, Q4).
  const BULK = 230;
  const bulk = (files: Record<string, string>): void => {
    for (let i = 0; i < BULK; i++) files[`Resources/Bulk/Entry ${String(i).padStart(3, '0')}.md`] = `Alex keeps entry ${i}. [[Plot diary]]\n`;
  };
  it('AC21 b8c-cap-200-older-retrieval: an older retrieval file is caught up 200 notes a run, honestly counted', async () => {
    const base = await folder(bulk);
    const first = await base.press(1);
    expect(first.code, 'the first run reads what its budget allows').toBe(0);
    // 234 notes need two runs to discover (300 Drive calls each); the older file is left behind by the run that completes.
    await base.forgetLint(await base.press(2));
    base.traffic.length = 0;
    const second = await base.press(3);
    expect(second.code, 'catching up never stops the run').toBe(0);
    expect(base.noteReads().length, 'lint reads at most 200 notes a run').toBeLessThanOrEqual(200);
    const health = lines(second);
    const total = BULK + 4;
    const left = health.filter((line) => /- Waiting: /.test(line));
    expect(left, 'each note left for next time is named, so the lines are the honest count').toHaveLength(total - 200);
    expect(left.join('\n'), 'a note the cap left is not claimed unreadable').not.toMatch(/could not read/i);
    expect(health.join('\n'), 'no orphan or clean claim on partial coverage').not.toMatch(/Nothing links to|No findings in the checked notes/);
    base.traffic.length = 0;
    const third = await base.press(4);
    expect(third.code).toBe(0);
    expect(base.noteReads().length, 'the next run reads only the notes still owed').toBe(total - 200);
    expect(lines(third).join('\n'), 'complete again').not.toMatch(/- Waiting: /);
    expect(lineAbout(third, LOOSE).join('\n'), 'the orphan check returns once coverage is complete').toMatch(/Nothing links to/);
  });
  it('AC21 control: an older retrieval file within the cap is caught up in one run', async () => {
    const base = await folder();
    const first = await base.press(1);
    await base.forgetLint(first);
    base.traffic.length = 0;
    const second = await base.press(2);
    expect(second.code).toBe(0);
    expect(base.noteReads().length, 'each note once').toBe(4);
    expect(second.after[HEALTH]).toBe(first.after[HEALTH]);
  });

  it('AC22 b8c-dated-names: a Bower note with a date in its name is reported; a person\'s is not', async () => {
    const dated = `${GARDEN}/2026-09-14 Harvest`;
    const personal = `${GARDEN}/2026-09-15 Seed swap`;
    const base = await folder((files) => {
      files[`${dated}.md`] = bowerNote('Alex harvested the beans.', 'Alex picked beans. [[Gardening]]');
      files[`${personal}.md`] = 'Alex swapped seeds. [[Gardening]]\n';
    });
    const run = await base.press(1);
    expect(lineAbout(run, dated).join('\n'), 'dates in the names of Bower notes are reported').toMatch(/date/i);
    expect(lineAbout(run, personal), 'a person\'s note gets no filename advice (Q3)').toEqual([]);
  });

  it('AC23 b8c-duplicate-summaries: two Bower notes with one summary give one finding naming both', async () => {
    const a = `${GARDEN}/Bean rows`;
    const b = `${GARDEN}/Pea rows`;
    const person = `${GARDEN}/Herb rows`;
    const base = await folder((files) => {
      files[`${a}.md`] = bowerNote('Alex grows climbing crops.', 'Beans. [[Gardening]]');
      files[`${b}.md`] = bowerNote('alex grows climbing crops. ', 'Peas. [[Gardening]]');
      files[`${person}.md`] = '---\nsummary: Alex grows climbing crops.\n---\n\nHerbs. [[Gardening]]\n';
    });
    const run = await base.press(1);
    const found = lines(run).filter((line) => /summary/i.test(line) && /same|duplicate|share/i.test(line));
    expect(found, 'one finding for the pair').toHaveLength(1);
    expect(found[0]).toContain(`[[${a}|`);
    expect(found[0]).toContain(`[[${b}|`);
    expect(found[0], 'a person\'s summary is never compared (Q3)').not.toContain(`[[${person}|`);
  });
  it('AC23 control: missing summaries are no shared summary', async () => {
    const base = await folder((files) => { files[`${GARDEN}/Bare.md`] = '---\nby: bower\n---\n\n## My thoughts\nBare. [[Gardening]]\n'; });
    const run = await base.press(1);
    expect(lines(run).filter((line) => /summary/i.test(line) && /same|duplicate|share/i.test(line))).toEqual([]);
  });

  it('AC24 b8c-summary-validation: a Bower note\'s summary over the one-line limit is reported', async () => {
    const long = `${GARDEN}/Compost`;
    const fine = `${GARDEN}/Mulch`;
    const base = await folder((files) => {
      files[`${long}.md`] = bowerNote(`Alex turns the compost ${'every week '.repeat(20)}and checks it.`, 'Compost. [[Gardening]]');
      files[`${fine}.md`] = bowerNote('Alex mulches the beds.', 'Mulch. [[Gardening]]');
      files[`${GARDEN}/Person long.md`] = `---\nsummary: Alex ${'writes a lot '.repeat(20)}here.\n---\n\nLong. [[Gardening]]\n`;
    });
    const run = await base.press(1);
    expect(lineAbout(run, long).join('\n'), 'the summary rule Bower writes by (validSummary) judges stored bytes').toMatch(/summary/i);
    expect(lineAbout(run, fine).filter((line) => /summary/i.test(line))).toEqual([]);
    expect(lineAbout(run, `${GARDEN}/Person long`), 'a person\'s note gets only broken links and duplicate names').toEqual([]);
  });
});
