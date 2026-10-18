/** prod1-answer-links (F7): a shown note's or original's path written in an answer's words is refused noteLink; the retry links it (rulings R1-R5). */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { replaceLinks } from '../../src/data/contracts/links';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const IDEAS_DIR = 'Resources/Ideas';
const DIARY = `${IDEAS_DIR}/Allotment diary.md`;
const IDEAS = `${IDEAS_DIR}/Ideas.md`;
const PLAN = 'Archive/Old plot/Plot plan.md';
const SEEDS = `${IDEAS_DIR}/Seed list.txt`;
const note = (summary: string, body: string) => `---\nsummary: ${summary}\nby: bower\n---\n\n${body}\n\n## Timeline\n- 2026-10-02 · Started the note.\n`;
const FILES: Record<string, string> = {
  [DIARY]: note('The allotment plot layout.', 'The plot has four beds and a shed by the gate.'),
  [IDEAS]: note('Ideas Alex keeps.', 'A list of ideas for the garden.'),
  [PLAN]: note('The old plot plan.', 'The old plot had two beds.'),
  [SEEDS]: 'Beans.\n',
};
const PLANT = 'What did I plant in the allotment this year?';
const SEED = 'What is on the seed list?';
const IDEA = 'What ideas do I have?';
const WHY = "a note or file path written in the answer's words: link each note or file you used as [[its name]], or [[its whole path]] when the name is shared";
const F7 = 'No note says what was planted this year; Resources/Ideas/Allotment diary.md only records the plot layout.';
const FIXED = 'No note says what was planted this year; [[Allotment diary]] only records the plot layout.';
const DROP = 'drops a request (noteLink): a note link to nothing in the folder; it waits for the next tidy-up.';
const empty = { kind: 'tidy-intent', v: 1, things: [] };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
  vi.setSystemTime(DAY);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

type Frame = Record<string, unknown> & { sources?: Array<{ itemId: string; candidates: Array<{ id: string; path?: string }> }> };
type Ctx = { asked: Record<string, string> };

/** One instructions press through main: each request as the app writes it, the selection wanting the named paths, then the given reply. */
async function press(words: string[], wants: string[], intent: (ctx: Ctx, attempt: number) => unknown): Promise<CaseRun> {
  const c: LoadedCase = { id: 'prod1-answer-links', capability: 'C09', title: 'Alex asks about the allotment', covers: 'model', source: 'new', scope: 'instructions',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...FILES } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  const asked: Record<string, string> = {};
  for (const [i, text] of words.entries()) {
    const file = await drive.createText(await id(SYSTEM.changes), `press-1-${i + 1}.json`, JSON.stringify({ v: 1,
      id: `press-1-${i + 1}`, device: 'device-1', at: DAY + 10 + i, kind: 'request', what: `Asked Bower: "${text}"`, text }));
    asked[text] = file.id;
  }
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => DAY + 19, newId: () => 'links-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const destination = await id(IDEAS_DIR);
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as Frame;
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination,
      wants: s.candidates.filter((x) => x.path !== undefined && wants.includes(x.path)).map((x) => x.id) })), asks: [] });
    return reply(intent({ asked }, attempt++));
  }, () => ({ drive, root, admission: admission.manifest }), true);
  return runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: 'links-run' }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-links' } }, 1);
}
const answer = (requestId: string | undefined, text: string) => ({ ...empty, answers: [{ requestId: requestId ?? '', text }] });
const done = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ text: string; done?: string }> }).done;
const doneFor = (run: CaseRun, words: string) => done(run).filter((r) => r.text === words).map((r) => r.done);
const waiting = (run: CaseRun, recordId: string) => Object.keys(run.after).some((p) => p.startsWith(`${SYSTEM.changes}/`) && !p.startsWith(`${SYSTEM.archive}/`) && p.endsWith(`${recordId}.json`));
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const errors = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String));
const refusals = () => errors().flatMap((line) => [.../was refused \((\w+)\): (.*); asking once more/.exec(line) ?? []].slice(1, 3));

describe('prod1-answer-links', () => {
  it.each([
    { name: 'the whole path with .md (F7)', words: PLANT, wants: [DIARY, IDEAS], first: F7, fixed: FIXED },
    { name: 'the whole path without .md', words: PLANT, wants: [DIARY, IDEAS], first: F7.replace('Allotment diary.md', 'Allotment diary'), fixed: FIXED },
    { name: 'the note\'s <name>.md', words: PLANT, wants: [DIARY, IDEAS], first: F7.replace(`${IDEAS_DIR}/`, ''), fixed: FIXED },
    { name: 'the whole path in capitals', words: PLANT, wants: [DIARY, IDEAS], first: F7.replace(DIARY, DIARY.toUpperCase()), fixed: FIXED },
    { name: 'a shown original\'s whole path', words: SEED, wants: [SEEDS], first: `${SEEDS} only lists beans.`, fixed: `[[${SEEDS}]] only lists beans.` },
  ])('AC1 known_note_path_in_answer_prose_requires_link: $name is refused noteLink; the linked retry is stored', async ({ words, wants, first, fixed }) => {
    const run = await press([words], wants, (ctx, attempt) => answer(ctx.asked[words], attempt ? fixed : first));
    expect(refusals().slice(0, 2)).toEqual(['noteLink', WHY]);
    expect(doneFor(run, words)).toEqual([fixed]);
  });

  it('AC2 same_answer_with_supported_readable_link_passes: the readable-link retry is stored exactly, with no shown path in its words', async () => {
    const run = await press([PLANT], [DIARY, IDEAS], (ctx, attempt) => answer(ctx.asked[PLANT], attempt ? FIXED : F7));
    expect(doneFor(run, PLANT)).toEqual([FIXED]);
    expect(replaceLinks(doneFor(run, PLANT)[0] ?? '', () => ' ')).not.toMatch(/allotment diary\.md|resources\/ideas/i);
    expect(phase(run)).toBe('done');
  });

  it('R4 two_refused_path_answers_drop_the_request: the existing drop line; the request waits and the other settles', async () => {
    const good = '[[Ideas]] holds the list.';
    const run = await press([PLANT, IDEA], [DIARY, IDEAS], (ctx) => ({ ...empty, answers: [{ requestId: ctx.asked[PLANT], text: F7 }, { requestId: ctx.asked[IDEA], text: good }] }));
    expect(refusals().slice(0, 2)).toEqual(['noteLink', WHY]);
    expect(errors().some((line) => line.includes(DROP))).toBe(true);
    expect(waiting(run, 'press-1-1')).toBe(true);
    expect(doneFor(run, IDEA)).toEqual([good]);
  });

  it('G1 a whole-path link stays accepted', async () => {
    const text = 'No note says what was planted this year; [[Resources/Ideas/Allotment diary]] only records the plot layout.';
    const run = await press([PLANT], [DIARY, IDEAS], (ctx) => answer(ctx.asked[PLANT], text));
    expect(refusals()).toEqual([]);
    expect(doneFor(run, PLANT)).toEqual([text]);
  });

  it.each([
    { name: 'the plain name', words: PLANT, text: 'No note says what was planted; the Allotment diary only records the plot layout.' },
    { name: 'a folder path', words: PLANT, text: 'Nothing in Resources/Ideas says what was planted.' },
    { name: 'an unshown note\'s path', words: PLANT, text: `${PLAN} is not one Bower read.` },
    { name: 'a path from the request', words: `What does ${DIARY} say about beans?`, text: `${DIARY} does not mention beans.` },
  ])('G2 $name in words is no refusal', async ({ words, text }) => {
    const run = await press([words], [DIARY, IDEAS], (ctx) => answer(ctx.asked[words], text));
    expect(refusals()).toEqual([]);
    expect(doneFor(run, words)).toEqual([text]);
  });
});
