/**
 * B8c reds through production main (TL-P4-50 Q3, Q4; specs/b8-log/spec.md R24, R26): notes past the 4,096-byte prefix,
 * the 200-note cap on lint's own reads, older retrieval files without lint data, and the Bower-note checks that need no
 * new evidence (dated names, duplicate summaries, summary validation). b8c-unreadable: a note Drive refuses for good is
 * recorded 'unreadable' for its version and named as such until it changes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { AT, replySequence, runOnDrive, runScripted, scoreCase, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';
import { empty, observe, pacing, type Observation } from './b23-hot-observe';
import { lintEvidenceOk, type MaintenanceNote } from '../../src/data/contracts/run-manifest';
import { renderHealth } from '../src/lint';

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
  /** Note paths whose content reads Drive refuses for good (403 forbidden, a permanent answer in transport.ts). */
  const refused = new Set<string>();
  const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => {
    let seen = traffic.length;
    return observe(drive, root, traffic)(async (input, init = {}) => {
      const last = traffic.length > seen ? traffic.at(-1) : undefined;
      seen = traffic.length;
      if (last?.media && refused.has(last.path)) {
        return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refused read', errors: [{ reason: 'forbidden' }] } }), { status: 403 });
      }
      return fetch(input, init);
    });
  };
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
  const idOf = (run: CaseRun, path: string): string => Object.entries(run.pathsById).find(([, p]) => p === path)?.[0] ?? '';
  return { c, drive, root, traffic, refused, press, forgetLint, noteReads, idOf };
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

  // b8c-unreadable: Loose thought is a Bower note with a missing summary, four tags and no inbound link, so a read of it
  // would give three findings; refused, it gives only its own line.
  const couldNotRead = (place: string): string => `- Could not read [[${place}|${place.slice(place.lastIndexOf('/') + 1)}]]: Bower will try again when it changes.`;
  it('AC1 b8c-unreadable-line: a note Drive refuses for good is named as could not read, never as waiting', async () => {
    const base = await folder();
    base.refused.add(`${LOOSE}.md`);
    const run = await base.press(1);
    expect(run.code, 'one refused note never fails the run').toBe(0);
    expect(base.noteReads().filter((path) => path === `${LOOSE}.md`).length, 'Drive was asked for it').toBeGreaterThan(0);
    expect(lineAbout(run, LOOSE), 'its one line says Bower could not read it and when it tries again').toEqual([couldNotRead(LOOSE)]);
    expect(lines(run).join('\n'), 'the other notes are still checked').toContain('Missing plan');
    expect(lines(run).join('\n'), 'its links are unknown, so no orphan or clean claim').not.toMatch(/Nothing links to|No findings in the checked notes/);
  });
  it('AC2 b8c-unreadable-decided: the refusal is kept for that version; the next run reads nothing and writes nothing new', async () => {
    const base = await folder();
    base.refused.add(`${LOOSE}.md`);
    const first = await base.press(1);
    const id = base.idOf(first, `${LOOSE}.md`);
    const stored = JSON.parse(first.after[RETRIEVAL] ?? '{}') as { files: Record<string, { version?: string; lint?: unknown }> };
    expect(stored.files[id]?.lint, 'retrieval records the refusal as its lint evidence').toBe('unreadable');
    expect(stored.files[id]?.version, 'tied to the version Drive refused').toBe((await base.drive.get(id)).modifiedTime);
    // Readable again, but unchanged: the evidence for this version is decided, so the cap slot stays free.
    base.refused.clear();
    base.traffic.length = 0;
    const second = await base.press(2);
    expect(second.code).toBe(0);
    expect(base.noteReads().filter((path) => path === `${LOOSE}.md`), 'an unchanged refused version is never asked for again').toEqual([]);
    expect(second.after[HEALTH], 'the same health note').toBe(first.after[HEALTH]);
    expect(lineAbout(second, LOOSE)).toEqual([couldNotRead(LOOSE)]);
  });
  it('AC2 b8c-unreadable-hub-decided: a refused hub (no stored type) is not asked for again while it is unchanged', async () => {
    const base = await folder();
    const hub = `${GARDEN}/Gardening.md`;
    base.refused.add(hub);
    const first = await base.press(1);
    expect(base.noteReads().filter((path) => path === hub).length, 'Drive was asked for it').toBeGreaterThan(0);
    expect(lineAbout(first, `${GARDEN}/Gardening`)).toEqual([couldNotRead(`${GARDEN}/Gardening`)]);
    base.refused.clear();
    base.traffic.length = 0;
    const second = await base.press(2);
    expect(second.code).toBe(0);
    expect(base.noteReads().filter((path) => path === hub), 'an unchanged refused hub is never asked for again').toEqual([]);
    expect(lineAbout(second, `${GARDEN}/Gardening`)).toEqual([couldNotRead(`${GARDEN}/Gardening`)]);
  });
  it('AC3 guard: once the note changes, Bower reads its new version and checks it', async () => {
    const base = await folder();
    base.refused.add(`${LOOSE}.md`);
    const first = await base.press(1);
    const id = base.idOf(first, `${LOOSE}.md`);
    base.refused.clear();
    const before = await base.drive.get(id);
    await base.drive.writeText(id, `${first.after[`${LOOSE}.md`] ?? ''}Alex adds a thought about mint.\n`, before.modifiedTime);
    base.traffic.length = 0;
    const second = await base.press(2);
    expect(second.code).toBe(0);
    expect(base.noteReads().filter((path) => path === `${LOOSE}.md`).length, 'the new version is read').toBeGreaterThan(0);
    const about = lineAbout(second, LOOSE).join('\n');
    expect(about, 'checked now').not.toMatch(/could not read|- Waiting: /i);
    expect(about, 'its findings return').toMatch(/Missing summary|Too many tags/);
  });
  it('AC1 b8c-unreadable-edited-map: a refused new version of an indexed Bower map finishes without a whole read', async () => {
    const hub = `${GARDEN}/Gardening`;
    const base = await folder((files) => {
      files[`${hub}.md`] = '---\nsummary: Alex keeps gardening information here.\nby: bower\ntype: moc\n---\n\n# Gardening\n\n- [[Plot diary]]\n';
    });
    const warm = await base.press(1);
    expect(warm.code).toBe(0);
    const id = base.idOf(warm, `${hub}.md`);
    const stored = JSON.parse(warm.after[RETRIEVAL] ?? '{}') as { files: Record<string, MaintenanceNote> };
    expect(stored.files[id], 'the previous version was indexed as a Bower map').toMatchObject({ owner: 'bower', type: 'moc' });
    const changed = `${warm.after[`${hub}.md`]}\nAlex adds a gardening thought.\n`;
    const edited = await base.drive.writeText(id, changed, (await base.drive.get(id)).modifiedTime);
    base.refused.add(`${hub}.md`);
    base.traffic.length = 0;
    const refused = await base.press(2);
    expect(refused.code, 'a refused map does not fail maintenance').toBe(0);
    expect(refused.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(base.noteReads().filter((path) => path === `${hub}.md`), 'only the refused prefix, never a whole read').toHaveLength(1);
    expect(refused.after[`${hub}.md`], 'the edited map stays exact').toBe(changed);
    expect(lineAbout(refused, hub)).toEqual([couldNotRead(hub)]);
    const saved = JSON.parse(refused.after[RETRIEVAL] ?? '{}') as { files: Record<string, MaintenanceNote> };
    expect(saved.files[id]).toMatchObject({ version: edited.modifiedTime, lint: 'unreadable' });
    base.refused.clear();
    base.traffic.length = 0;
    const next = await base.press(3);
    expect(next.code).toBe(0);
    expect(base.noteReads().filter((path) => path === `${hub}.md`), 'the refused version stays decided').toEqual([]);
    expect(next.after[HEALTH]).toBe(refused.after[HEALTH]);
  });
  // A Project or Area hub also feeds hot's Current focus, so hot's source selection must not read a refused one again.
  const HOT = '.bower/hot.md';
  const hubCase = async (area: string) => {
    const place = `${area}/Orchard/Orchard`;
    const base = await folder((files) => {
      files[`${place}.md`] = '---\nsummary: Alex keeps orchard plans here.\nby: bower\ntype: moc\n---\n\n# Orchard\n\n- [[Plot diary]]\n\n## Timeline\n- 2026-10-05 · Alex pruned the pear trees.\n';
    });
    const warm = await base.press(1);
    expect(warm.code).toBe(0);
    expect(warm.after[HOT] ?? '', 'warm: the hub is in hot\'s current focus').toContain(`${place}`);
    const id = base.idOf(warm, `${place}.md`);
    const edit = async (text: string): Promise<void> => { await base.drive.writeText(id, text, (await base.drive.get(id)).modifiedTime); };
    await edit(`${warm.after[`${place}.md`]}\nAlex adds an orchard thought.\n`);
    base.refused.add(`${place}.md`);
    return { base, place, edit };
  };
  it.each(['Projects', 'Areas'])('AC1 b8c-unreadable-hot-completes: an edited %s hub Drive refuses for good never stops the run', async (area) => {
    const { base, place } = await hubCase(area);
    base.traffic.length = 0;
    const run = await base.press(2);
    expect(run.code, 'the refused hub does not abort maintenance').toBe(0);
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(lineAbout(run, place)).toEqual([couldNotRead(place)]);
  });
  it.each(['Projects', 'Areas'])('AC1 b8c-unreadable-hot-retry: a retry through hot declaration makes zero reads of the refused %s hub and keeps its line', async (area) => {
    const { base, place } = await hubCase(area);
    const first = await base.press(2);
    expect(first.code).toBe(0);
    // Another note changes, so the retry is not idle and hot declares its sources again.
    const other = base.idOf(first, `${GARDEN}/Plot diary.md`);
    await base.drive.writeText(other, `${first.after[`${GARDEN}/Plot diary.md`]}\nAlex waters the beans.\n`, (await base.drive.get(other)).modifiedTime);
    base.traffic.length = 0;
    const retry = await base.press(3);
    expect(retry.code).toBe(0);
    expect(base.noteReads().filter((path) => path === `${place}.md`), 'zero reads of the refused version').toEqual([]);
    expect(lineAbout(retry, place)).toEqual([couldNotRead(place)]);
    expect(retry.after[HOT] ?? '', 'hot is rebuilt without the refused hub').not.toContain(place);
  });
  it('AC3 b8c-unreadable-hot-recovery: once the refused hub changes to a readable version it returns to current focus', async () => {
    const { base, place, edit } = await hubCase('Projects');
    const refused = await base.press(2);
    expect(refused.code).toBe(0);
    base.refused.clear();
    await edit(`${refused.after[`${place}.md`]}\nAlex plants a pear tree.\n`);
    const back = await base.press(3);
    expect(back.code).toBe(0);
    expect(lineAbout(back, place).join('\n')).not.toMatch(/could not read/i);
    expect(back.after[HOT] ?? '', 'back in hot\'s current focus').toContain(place);
  });
  it('AC4 b8c-unreadable-contract: one rule for stored lint evidence accepts \'unreadable\' and nothing else new', () => {
    expect(lintEvidenceOk('unreadable'), 'a manifest and retrieval accept the refusal record').toBe(true);
    for (const other of ['refused', 'Unreadable', '', null]) expect(lintEvidenceOk(other), String(other)).toBe(false);
    expect(lintEvidenceOk({ links: [], tags: 0, summary: true }), 'read evidence as before').toBe(true);
  });
  it('AC1 b8c-unreadable-duplicate-title: an unread note sharing a title keeps its duplicate-name finding and names itself by place', () => {
    const unreadable: unknown = 'unreadable';
    const note = (path: string, lint: unknown): MaintenanceNote => ({ path, version: '2026-10-01T09:00:00.000Z', summary: 'Alex keeps a diary.',
      coverage: { kind: 'prefix', bytes: 100 }, lint: lint as MaintenanceNote['lint'] });
    const a = `${GARDEN}/Plot diary`;
    const b = 'Projects/Plot diary';
    const notes = [note(`${a}.md`, unreadable), note(`${b}.md`, { links: [], tags: 1, summary: true })];
    const out = renderHealth(Object.fromEntries(notes.map((n, i) => [`id${i}`, n])), notes.map((n) => n.path),
      Object.fromEntries(notes.map((n, i) => [`id${i}`, { path: n.path }]))).split('\n').filter((line) => line.startsWith('- '));
    expect(out, 'the could-not-read line, then the duplicate-name finding').toEqual([
      `- Could not read [[${a}]]: Bower will try again when it changes.`,
      `- Duplicate name: [[${b}]] and [[${a}]] share the name Plot diary, so a link to Plot diary may open either.`,
    ]);
  });
  it('AC5 b8c-unreadable-render: the could-not-read line follows the waiting lines, and an unread note blocks orphan claims', () => {
    // Typed loosely so the red compiles on the base, where lint holds read evidence only.
    const unreadable: unknown = 'unreadable';
    const bower = (path: string, extra: Partial<MaintenanceNote> = {}): MaintenanceNote => ({ path, version: '2026-10-01T09:00:00.000Z',
      summary: `Alex keeps ${path}.`, coverage: { kind: 'prefix', bytes: 100 }, owner: 'bower', lint: { links: ['Gardening'], tags: 1, summary: true }, ...extra });
    const health = (notes: MaintenanceNote[]): string[] => {
      const byId = Object.fromEntries(notes.map((n, i) => [`id${i}`, n]));
      return renderHealth(byId, notes.map((n) => n.path), Object.fromEntries(notes.map((n, i) => [`id${i}`, { path: n.path }])))
        .split('\n').filter((line) => line.startsWith('- '));
    };
    const hub = bower(`${GARDEN}/Gardening.md`, { lint: { links: ['Plot diary'], tags: 1, summary: true } });
    // Mint has no inbound link among the read notes; Plot diary, unread, may link to it.
    const mint = bower(`${GARDEN}/Mint.md`);
    const diary = bower(`${GARDEN}/Plot diary.md`, { lint: unreadable as MaintenanceNote['lint'], summary: '(no summary)', owner: undefined });
    expect(health([hub, mint, diary]), 'only the unread note\'s line; no orphan claim on an incomplete graph').toEqual([couldNotRead(`${GARDEN}/Plot diary`)]);
    const seeds = bower(`${GARDEN}/Seed list.md`, { lint: undefined });
    const broken = bower(`${GARDEN}/Beds.md`, { lint: { links: ['Gardening', 'Missing plan'], tags: 1, summary: true } });
    expect(health([hub, mint, diary, seeds, broken]), 'waiting, then could not read, then findings').toEqual([
      `- Waiting: [[${GARDEN}/Seed list|Seed list]]. Bower will check it next time.`,
      couldNotRead(`${GARDEN}/Plot diary`),
      `- Broken link in [[${GARDEN}/Beds|Beds]]: no note is called Missing plan.`,
    ]);
  });
  it('corpus-fix-b8 AC2: every useful former oracle requirement is executed', async () => {
    const CORPUS = resolve(import.meta.dirname, '../../testing/corpus');
    const B8 = ['c17-b8-settled-recovery', 'c17-b8-report-only-grammar', 'c17-b8-bounded-encoding', 'c17-b8-findings-refresh'];
    const c = await loadCase(resolve(CORPUS, 'c17-b8-report-only-grammar'));
    const scripted = await runScripted(c);
    expect(scripted.code).toBe(0);
    expect(scoreCase(c, scripted).unmet, 'report-only-grammar meets its expectations').toEqual([]);
    const base = await folder();
    const run = await base.press(1);
    expect(run.code).toBe(0);
    expect(lines(run).filter((line) => line.startsWith('- ')), 'one personal broken link and the three Bower-note checks on Loose thought').toEqual([
      '- Broken link in [[Resources/Gardening/Plot diary|Plot diary]]: no note is called Missing plan.',
      '- Missing summary: [[Resources/Gardening/Loose thought|Loose thought]] has no summary, so nothing says what it is at a glance.',
      '- Too many tags: [[Resources/Gardening/Loose thought|Loose thought]] has 4; Bower keeps 3 at most.',
      '- Nothing links to [[Resources/Gardening/Loose thought|Loose thought]].',
    ]);
    expect(B8.filter((id) => existsSync(resolve(CORPUS, id, 'oracle.json'))), 'the hand oracles live in the B8 runner tests').toEqual([]);
    const row = (file: string, id: string): string | undefined => readFileSync(file, 'utf8').split('\n').find((line) => line.startsWith(`| ${id} |`));
    expect(B8.map((id) => row(resolve(CORPUS, 'README.md'), id))).toEqual([
      '| c17-b8-settled-recovery | C17 / B8 | model | TL-P4-39 F3/U3; run with a refused hub edit and a lost log response; the health note is created once and the month logs only applied work |',
      '| c17-b8-report-only-grammar | C17 / B8 | model | TL-P4-39 B8; links outside fences, orphan, missing summary and tag overflow; personal bytes protected |',
      '| c17-b8-bounded-encoding | C17 / B8 | model | TL-P4-39 F14; delimiter-rich name appended to an existing month, with no annual log |',
      '| c17-b8-findings-refresh | C17 / B8 | model | TL-P4-41 feed/cache; supported personal edit clears a finding, third check has no health write |',
    ]);
    expect(B8.map((id) => row(resolve(CORPUS, '../fixtures/p4-method-rubric-changes.md'), id))).toEqual([
      '| c17-b8-settled-recovery | changed | Points 1–8: fit the notice, preserve its original/history, link the useful source note, and report/log only applied outcomes; the refused hub edit grants no success, the health note is created once, and recovery after a lost log response makes no duplicate fact, note or line (F3/U3; corpus-fix-b8 AC3). |',
      '| c17-b8-report-only-grammar | agrees | Points 1–8: useful diagnostics reuse Bower health and the actual graph, never fill personal metadata, rewrite notes, repair links, invent related links or teach tags; semantic reads stay bounded and only the health create is reported (R2/U3). |',
      '| c17-b8-bounded-encoding | changed | Points 1–8: clear filing fits Gardening with a grounded linked note and unchanged original; reversible fields appended to the existing month keep its earlier line and preserve primary outcomes without schema growth, an annual log, fabricated facts or visible internal-file rows (F14; corpus-fix-b8 AC1). |',
      '| c17-b8-findings-refresh | changed | Points 1–8: the supported personal edit remains exact, fresh evidence clears the actual defect, and unchanged diagnostics produce no false update; no redundant note, personal metadata adoption, policy, repair, log line or month file (F3/F10/U3; corpus-fix-b8 AC3). |',
    ]);
    expect(B8.map((id) => (JSON.parse(readFileSync(resolve(CORPUS, id, 'case.json'), 'utf8')) as { source: string }).source)).toEqual(B8.map(() => 'new (TL-P4-39 B8, F3/F14/U3; TL-P4-41 to TL-P4-50); runs through main in the B8 runner tests'));
  });
});
