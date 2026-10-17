/** learned-lines-no-link through production main: a learned line cites no note, so Bower's link check finds none there. */
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ABOUT_SECTIONS } from '../../src/data/contracts/observations';
import { ABOUT_REGIONS, parseOwnership } from '../../src/data/contracts/ownership-format';
import { parseTimelineLine, timelineLine } from '../../src/data/contracts/timeline-line';
import type { RunReport } from '../../src/data/contracts/types';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { frameOf, replySequence, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const ABOUT = 'About me.md';
const HEALTH = 'Bower health.md';
const LEDGER = '.bower/observations.jsonl';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
/** One fact from the person's words (cited `[[Your words]]` before this task) and one from a document (`[[Source]]`). */
const BEANS = { v: 1, kind: 'observation', eventId: 'event-beans', factId: 'beans', date: '2026-10-05', section: 'about-you',
  text: 'I grow beans on the north plot.', category: 'biography', source: { fileId: 'words-beans', sha256: sha('I grow beans on the north plot.\n') },
  origin: { kind: 'words', runId: 'history-run', captureId: sha('history-run'), pileId: 'pile-beans' } } as const;
const SHED = { v: 1, kind: 'observation', eventId: 'event-shed', factId: 'shed', date: '2026-10-06', section: 'about-working-on',
  text: 'I am building a shed by the north plot.', category: 'activity', source: { fileId: 'file-shed', sha256: sha('Shed plan.\n') },
  origin: { kind: 'document', runId: 'history-run', captureId: sha('history-run'), subject: 'Alex' } } as const;
const FACTS = [BEANS, SHED];
const PERSONAL = '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\n## My words\n\nI keep my own notes here.\n\n';
type Seeded = { readonly date: string; readonly text: string; readonly section: string; readonly origin: { readonly kind: string } };
/** About me as Bower wrote it before this task: each learned line cites `[[Your words]]` or `[[Source]]`. */
const cited = (facts: readonly Seeded[]) => PERSONAL + '## What Bower has learned\n' + ABOUT_REGIONS.map((region) => `<!-- bower:ownership/2 begin ${region} -->\n`
  + `### ${ABOUT_SECTIONS[region].label}\n` + facts.filter((f) => f.section === region).map((f) => timelineLine({ date: f.date, text: f.text,
    source: f.origin.kind === 'words' ? 'Your words' : 'Source' }) + '\n').join('') + `<!-- bower:ownership/2 end ${region} -->\n`).join('');
const UNCITED = FACTS.map((f) => ({ date: f.date, text: f.text, source: null }));
const NOTHING = { kind: 'tidy-intent', v: 1, things: [] };

/** Bower's learned section of About me: every region's lines. */
function learned(text: string | undefined): string[] {
  const bytes = new TextEncoder().encode(text ?? '');
  const owned = parseOwnership(bytes);
  return ABOUT_REGIONS.flatMap((region) => {
    const span = 'payloads' in owned ? owned.payloads?.[region] : undefined;
    return span ? new TextDecoder().decode(bytes.subarray(span.start, span.end)).split('\n').filter((line) => line.startsWith('- ')) : [];
  });
}
const report = (run: CaseRun): RunReport | undefined => (run.lastRun as { run?: { report?: RunReport } } | null)?.run?.report;
const written = (run: CaseRun) => [...report(run)?.created ?? [], ...report(run)?.updated ?? []].map((row) => row.path);
/** main exits 0 for a failure the Worker accepted, so a finished run is one whose last status is done. */
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;

/** A made-up folder with these facts cited in About me; each press is an instructions run through main with a scripted model. */
/** What the model reads of About me (c12-prefix: in the run context), kept while each call runs. */
type Shown = { aboutMe?: { learned: { text: string } } };
async function folder(facts: readonly Seeded[] = FACTS) {
  const c: LoadedCase = { id: 'learned-lines-no-link', capability: 'C05', title: 'Alex keeps learned facts', covers: 'model', source: 'new',
    scope: 'instructions', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [],
    journal: [{ kind: 'request', text: 'Update these notes.' }], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [ABOUT]: cited(facts), [LEDGER]: facts.map((f) => JSON.stringify(f)).join('\n') + '\n' } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const aboutId = (await drive.listAll(root)).find((file) => drive.pathOf(file.id, root) === ABOUT)?.id;
  const inputs: Shown[] = [];
  const replies = replySequence([NOTHING]);
  const claude: ClaudeSpawn = async (call) => { inputs.push(frameOf<Shown>(call)); return replies(call); };
  let presses = 0;
  const press = () => runOnDrive(c, drive, root, { claude, pacing: { baseMs: 0, sleep: async () => {} } }, ++presses);
  return { drive, aboutId, inputs, press };
}

it('AC1 learned-lines-uncited: a run over learned lines citing [[Your words]] or [[Source]] rewrites them once, uncited', async () => {
  const f = await folder();
  const writes = vi.spyOn(f.drive, 'writeText');
  const run = await f.press();
  expect(phase(run)).toBe('done');
  const lines = learned(run.after[ABOUT]);
  expect(lines.filter((line) => line.includes('[[')), 'no learned line cites a note').toEqual([]);
  expect(lines.map(parseTimelineLine), 'the same dates and words, in the same order').toEqual(UNCITED);
  expect(run.after[ABOUT]?.startsWith(PERSONAL + '## What Bower has learned\n'), 'the person\'s part stays as it was').toBe(true);
  expect(writes.mock.calls.filter(([id]) => id === f.aboutId), 'About me is written once').toHaveLength(1);
});

it('AC2 learned-lines-uncited-position-4: the model sees the learned lines with no citation', async () => {
  const f = await folder();
  expect(phase(await f.press())).toBe('done');
  const shown = f.inputs.flatMap((frame) => {
    return frame.aboutMe ? [frame.aboutMe.learned.text] : [];
  });
  expect(shown.length, 'the run shows About me to the model').toBeGreaterThan(0);
  expect(shown.filter((text) => text.includes('[[')), 'position 4 cites no note').toEqual([]);
  expect(shown[0]?.split('\n').map(parseTimelineLine)).toEqual(UNCITED);
});

it('AC3 learned-lines-health: the next run finds no broken link in About me; the run after writes neither file', async () => {
  const f = await folder();
  const first = await f.press();
  expect(phase(first)).toBe('done');
  const second = await f.press();
  expect(phase(second)).toBe('done');
  expect(second.after[HEALTH], 'Bower\'s health note lists no broken link in About me').not.toContain('Broken link in [[About me]]');
  expect(second.after[ABOUT], 'About me is not rewritten again').toBe(first.after[ABOUT]);
  expect(written(second)).not.toContain(ABOUT);
  const ids = Object.entries(second.pathsById).filter(([, path]) => path === ABOUT || path === HEALTH).map(([id]) => id);
  expect(ids).toHaveLength(2);
  const writes = vi.spyOn(f.drive, 'writeText');
  const creates = vi.spyOn(f.drive, 'createText');
  const third = await f.press();
  expect(phase(third)).toBe('done');
  expect(writes.mock.calls.filter(([id]) => ids.includes(id)), 'the run after writes neither About me nor the health note').toEqual([]);
  expect(creates.mock.calls.filter(([, name]) => name === ABOUT || name === HEALTH)).toEqual([]);
  expect(written(third).filter((path) => path === ABOUT || path === HEALTH)).toEqual([]);
  expect([third.after[ABOUT], third.after[HEALTH]]).toEqual([second.after[ABOUT], second.after[HEALTH]]);
});

it('AC7 learned-lines-words-with-a-link: words that end in a link are shown as said, and the section is still rewritten', async () => {
  const words = 'I keep my seed notes · [[Garden]]';
  const NOTES = { ...BEANS, eventId: 'event-notes', factId: 'notes', date: '2026-10-06', text: words,
    source: { fileId: 'words-notes', sha256: sha(`${words}\n`) }, origin: { ...BEANS.origin, pileId: 'pile-notes' } };
  const f = await folder([BEANS, NOTES]);
  const run = await f.press();
  expect(phase(run), 'no refused projection').toBe('done');
  expect(learned(run.after[ABOUT]), 'the person\'s words are kept as said: nothing added, nothing cut')
    .toEqual([BEANS, NOTES].map((x) => timelineLine({ date: x.date, text: x.text })));
});
