/** C09b through production main: a request reaches the originals in the folder, sees the ones it wants, and cites them (c09-originals AC1-AC6). */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { CONTEXT_BOUNDS, type ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const HUNT = 'Projects/Flat hunt';
const LISTING = `${HUNT}/Listing.txt`;
const OLD_LISTING = 'Archive/Old flat/Listing.txt';
const HOLDING = `${HUNT}/Holding terms.txt`;
const LETTER = `${HUNT}/Agent letter.txt`;
const PHOTO = `${HUNT}/Listing photo.jpg`;
const COBBLE = `${HUNT}/Cobble Row flat.md`;
const LARK = `${HUNT}/Larkspur Lane flat.md`;
const note = (summary: string, body: string) => `---\nsummary: ${summary}\nby: bower\n---\n\n${body}\n\n## Timeline\n- 2026-10-03 · Viewed the flat.\n`;
const FILES: Record<string, string> = {
  [`${HUNT}/Flat hunt.md`]: note('Alex is comparing flats in Saltmere.', '## Current state\n- Alex has not chosen a flat.'),
  [LARK]: note('The Larkspur Lane flat in Saltmere.', 'Rent: 1,450 a month.'),
  [COBBLE]: note('The Cobble Row flat in Saltmere.', `Rent: 1,580 a month.\nSee [[${HOLDING}]] and [[Listing.txt]].`),
  [LISTING]: 'Larkspur Lane listing.\nRent: 1,450 a month.\nDeposit: 1,600.\n',
  [OLD_LISTING]: 'Old flat listing.\nRent: 900 a month.\n',
  [HOLDING]: 'A holding fee of 300 is asked before signing.\n',
  [LETTER]: `${'The agent wrote at length about the street and its shops. '.repeat(80)}\nThe agent asks for a guarantor fee of 2,222.\n`,
  [PHOTO]: 'made-up picture bytes',
};
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

type Candidate = { id: string; path?: string };
type Frame = Record<string, unknown> & { sources?: Array<{ itemId: string; candidates: Candidate[] }>; files?: unknown; notes?: Array<{ path: string }> };

/**
 * One instructions press through main for one request, written as the app writes it: the selection wants the named
 * paths (when they are candidates for the request), then the given execution reply.
 */
async function ask(words: string, wants: string[], intent: (requestId: string, attempt: number) => unknown = () => empty, extra: Record<string, string> = {}) {
  const c: LoadedCase = { id: 'c09-originals', capability: 'C09', title: 'Alex asks about the originals', covers: 'model', source: 'new', scope: 'instructions',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...FILES, ...extra } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  const record = await drive.createText(await id(SYSTEM.changes), 'press-1.json', JSON.stringify({ v: 1, id: 'press-1', device: 'device-1', at: DAY + 1,
    kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => DAY + 2, newId: () => 'c09-originals-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await id(HUNT);
  const selection: Frame[] = []; const execution: Frame[] = []; const prompts: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Frame;
    if (phase === 'selection') {
      selection.push(frame);
      return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: hunt,
        wants: s.candidates.filter((x) => x.path !== undefined && wants.includes(x.path)).map((x) => x.id) })), asks: [] });
    }
    execution.push(frame); prompts.push(call.input.split('\n').slice(0, -1).join('\n'));
    return reply(intent(record.id, attempt++));
  }, () => ({ drive, root, admission: admission.manifest }), true);
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: 'c09-originals-run' }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-c09' } }, 1);
  const candidates = (selection[0]?.sources ?? []).find((s) => s.itemId === record.id)?.candidates.flatMap((x) => x.path ? [x.path] : []) ?? [];
  return { run, candidates, selection, execution, prompts, requestId: record.id };
}
const doneFor = (run: CaseRun, words: string) => ((JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ text: string; done?: string }> }).done)
  .filter((r) => r.text === words).map((r) => r.done);
const refusals = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => [.../was refused \((\w+)\): (.*); asking once more/.exec(line) ?? []].slice(1, 3));
// The one link rule of c06-body-links (claude.ts `linkWhy`): answer links report `noteLink` with its reasons (c09-answers ledger item 1).
const NOT_SHOWN = 'a link to a note you were not shown: leave it out';
const SHARED = 'a bare name two notes share: give its path, as shown';
const numbers = (n: string) => `a number that is in none of its sources: "${n}" in the answer; write only figures from the request, the notes shown or the files shown, or leave the figure out`;
const RENT = 'What is the rent on the flat listing?';
const SIGNING = 'What does Cobble Row ask before signing?';
const DEPOSIT = 'What deposit does the Larkspur Lane listing ask?';

describe('c09-originals', () => {
  it('AC1 c09-originals-candidates: an original whose name matches the request is a candidate for it; a picture and Bower\'s own files are not', async () => {
    const { candidates } = await ask(RENT, []);
    expect(candidates).toEqual(expect.arrayContaining([LISTING, OLD_LISTING]));
    expect(candidates.filter((p) => p === PHOTO || p.startsWith(`${SYSTEM.dir}/`))).toEqual([]);
  });

  it('AC2 c09-originals-link-hop: an original a matched note links by its whole path is a candidate; a link two files could take reaches neither', async () => {
    const { candidates } = await ask(SIGNING, []);
    expect(candidates).toContain(COBBLE);
    expect(candidates).toContain(HOLDING);
    expect(candidates.filter((p) => p === LISTING || p === OLD_LISTING)).toEqual([]);
  });

  it('AC3 c09-originals-shown: a wanted original is shown whole by its path in "files"; one not wanted is not shown', async () => {
    const { execution } = await ask(RENT, [LISTING]);
    expect(execution[0]?.files).toEqual([{ path: LISTING, text: FILES[LISTING], cut: 0 }]);
    expect(JSON.stringify(execution[0])).not.toContain('Old flat listing.');
  });

  it('AC3 c09-originals-cut: a long wanted original is cut within a note\'s bound and marked, as a note is', async () => {
    const { execution } = await ask('What does the agent letter ask for?', [LETTER]);
    const [shown] = (execution[0]?.files ?? []) as Array<{ path: string; text: string; cut: number }>;
    expect(shown?.path).toBe(LETTER);
    expect(shown?.text.length).toBeLessThanOrEqual(CONTEXT_BOUNDS.perNote);
    expect(shown?.cut).toBeGreaterThan(0);
    expect(shown?.text).toMatch(/\n\[cut here: \d+ more characters not shown\]$/);
    expect(shown?.text).not.toContain('2,222');
  });

  it('AC4 c09-originals-grounded: a figure only a shown original holds grounds an answer that cites it by its whole path', async () => {
    const text = 'The deposit is 1,600, as [[Projects/Flat hunt/Listing.txt]] says.';
    const { run } = await ask(DEPOSIT, [LISTING], (requestId) => ({ ...empty, answers: [{ requestId, text }] }));
    expect(refusals()).toEqual([]);
    expect(doneFor(run, DEPOSIT)).toEqual([text]);
  });

  it.each([
    ['an original not shown', 'The deposit is 1,600, as [[Archive/Old flat/Listing.txt]] says.', NOT_SHOWN],
    ['a name two originals share', 'The deposit is 1,600, as [[Listing.txt]] says.', SHARED],
  ])('AC5 c09-originals-links: an answer citing %s is refused noteLink with its reason; the corrected reply applies', async (_name, bad, why) => {
    const good = 'The deposit is 1,600, as [[Projects/Flat hunt/Listing.txt]] says.';
    const { run } = await ask(DEPOSIT, [LISTING], (requestId, attempt) => ({ ...empty, answers: [{ requestId, text: attempt ? good : bad }] }));
    expect(refusals().slice(0, 2)).toEqual(['noteLink', why]);
    expect(doneFor(run, DEPOSIT)).toEqual([good]);
  });

  // Review ruling 21 refined: a currency sign before or after the number makes it an amount, checked against the one note linked.
  const COST = 'What does the Larkspur Lane flat cost?';
  const FAIR = '[[Larkspur Lane flat]] costs 1,450 a month.';
  it.each(['1580 €', '1580€', '£1580'])('AC-currency c09-originals-currency-after: "[[Larkspur Lane flat]] costs %s." is refused numbers when that note holds only 1,450', async (amount) => {
    const { run } = await ask(COST, [LARK], (requestId, attempt) => ({ ...empty, answers: [{ requestId, text: attempt ? FAIR : `[[Larkspur Lane flat]] costs ${amount}.` }] }));
    expect(refusals().slice(0, 2)).toEqual(['numbers', numbers('1580')]);
    expect(doneFor(run, COST)).toEqual([FAIR]);
  });

  it('AC-currency c09-originals-currency-after: a count as a plain whole number stays accepted', async () => {
    const LIST = `${HUNT}/List.md`;
    const HOW_MANY = 'How many people come to the viewings?';
    const text = 'There are 3 people in [[List]].';
    const { run } = await ask(HOW_MANY, [LIST], (requestId) => ({ ...empty, answers: [{ requestId, text }] }),
      { [LIST]: note('Who comes to the viewings.', '- the letting agent\n- a neighbour\n- a friend from work') });
    expect(refusals()).toEqual([]);
    expect(doneFor(run, HOW_MANY)).toEqual([text]);
  });

  it('AC6 c09-originals-prompt: the execution prompt says what "files" holds when an original is shown', async () => {
    const { prompts } = await ask(RENT, [LISTING]);
    expect(prompts[0]).toMatch(/"files"/);
  });
});
