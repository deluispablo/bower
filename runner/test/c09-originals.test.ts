/** C09b through production main: a request reaches the originals in the folder, sees the ones it wants, and cites them (c09-originals AC1-AC6). */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { B_FAILURE, listedPiles, planScripted, runKeys, type Decisions } from '../../src/data/spine/scripted';
import { scriptedDecisions } from '../../src/data/demo/script';
import { SYSTEM } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import { CONTEXT_BOUNDS, type ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply, seedState, type Base } from './b1-planning-support';
import { frameOf, promptOf, runOnDrive, seedCase, systemOf, type CaseRun } from './corpus-run';
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
type Frame = Record<string, unknown> & { sources?: Array<{ itemId: string; candidates: Candidate[] }>; files?: unknown; notes?: Array<{ path: string; text: string }>;
  piles?: Array<{ things: Array<{ fileId: string; name: string }> }> };
type Shown = { path: string; text: string; cut: number };
type Options = { binary?: Record<string, Uint8Array>; scope?: 'all' | 'instructions'; inbox?: LoadedCase['inbox']; inboxFiles?: Record<string, string>;
  /** A path whose content Drive refuses for good (403 forbidden). */
  refuse?: string;
  /** The folder's retrieval state and index already kept, so discovery fetches a matched note's prefix itself. */
  warm?: boolean };
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

async function seeded(extra: Record<string, string>, o: Options = {}) {
  const scope = o.scope ?? 'instructions';
  const c: LoadedCase = { id: 'c09-originals', capability: 'C09', title: 'Alex asks about the originals', covers: 'model', source: 'new', scope,
    allowWeb: false, dir: tmpdir(), folderBinary: o.binary ?? {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [],
    inbox: o.inbox ?? [], inboxFiles: o.inboxFiles ?? {}, folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...FILES, ...extra } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  if (o.warm) {
    const ix = VaultIndex.build(root, await drive.listAll(root));
    await seedState({ c, drive, root, ix, id: (path: string) => ix.idOf(path) ?? '', warm: false } as Base);
  }
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  const asked = new Map<string, string>();
  const request = async (text: string) => {
    const n = asked.size + 1;
    const record = await drive.createText(await id(SYSTEM.changes), `press-${n}.json`, JSON.stringify({ v: 1, id: `press-${n}`, device: 'device-1', at: DAY + n,
      kind: 'request', what: `Asked Bower: "${text}"`, text }));
    asked.set(record.id, text);
    return record.id;
  };
  return { c, drive, root, id, scope, asked, request };
}

/**
 * One press through main for its requests, each written as the app writes it: the selection wants the named paths (when
 * they are candidates; per request words when given by words), then the given execution reply. `reads` counts every
 * content read of a path, whole or a range.
 */
async function ask(words: string | string[], wants: string[] | Record<string, string[]>, intent: (requestId: string, attempt: number, frame: Frame, ids: string[]) => unknown = () => empty,
  extra: Record<string, string> = {}, o: Options = {}) {
  const { c, drive, root, id, scope, asked, request } = await seeded(extra, o);
  for (const text of typeof words === 'string' ? [words] : words) await request(text);
  const ids = [...asked.keys()];
  const admission = await planAdmission(fakeRead(drive), root, { scope, clock: () => DAY + 20, newId: () => 'c09-originals-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await id(HUNT);
  const refused = o.refuse ? await id(o.refuse) : undefined;
  const selection: Frame[] = []; const execution: Frame[] = []; const prompts: string[] = []; const selectionPrompts: string[] = [];
  const media: string[] = []; const systems: Array<string | null> = []; const inputs: string[] = [];
  let attempt = 0;
  const wanted = (itemId: string): string[] => Array.isArray(wants) ? wants : wants[asked.get(itemId) ?? ''] ?? [];
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    // c12-prefix: the model reads the prompt file (the fixed text, the run context), then the call's stdin.
    const frame = frameOf(call) as Frame;
    const prompt = promptOf(call);
    systems.push(systemOf(call)); inputs.push(call.input);
    if (phase === 'selection') {
      selection.push(frame); selectionPrompts.push(prompt);
      return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: hunt,
        wants: s.candidates.filter((x) => x.path !== undefined && wanted(s.itemId).includes(x.path)).map((x) => x.id) })), asks: [] });
    }
    execution.push(frame); prompts.push(prompt);
    return reply(intent(ids[0] ?? '', attempt++, frame, ids));
  }, () => ({ drive, root, admission: admission.manifest }), true);
  const around = (next: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init) => {
    const u = url(input);
    const fileId = decodeURIComponent(u.pathname.split('/').at(-1) ?? '');
    if (u.searchParams.get('alt') === 'media') {
      media.push(fileId);
      if (fileId === refused) return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refused read', errors: [{ reason: 'forbidden' }] } }), { status: 403 });
    }
    return next(input, init);
  };
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} }, around,
    answerStart: { scope, requestId: 'c09-originals-run' }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-c09' } }, 1);
  const candidatesOf = (requestId: string | undefined) => (selection[0]?.sources ?? []).find((s) => s.itemId === requestId)?.candidates.flatMap((x) => x.path ? [x.path] : []) ?? [];
  const reads = async (path: string) => { const fileId = await id(path); return media.filter((m) => m === fileId).length; };
  return { run, candidates: candidatesOf(ids[0]), candidatesOf, selection, execution, prompts, selectionPrompts, systems, inputs, requestId: ids[0] ?? '', ids, reads };
}
const doneFor = (run: CaseRun, words: string) => ((JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ text: string; done?: string }> }).done)
  .filter((r) => r.text === words).map((r) => r.done);
const refusals = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => [.../was refused \((\w+)\): (.*); asking once more/.exec(line) ?? []].slice(1, 3));
// The one link rule of c06-body-links (claude.ts `linkWhy`): answer links report `noteLink` with its reasons (c09-answers ledger item 1).
const NOT_SHOWN = 'a link to a note you were not shown: leave it out';
const SHARED = 'a bare name two notes share: give its path, as shown';
// The log names only the fixed reason (sec-hardening L4); the model's retry still gets the quoted figure.
const numbers = (_n: string) => 'a number that is in none of its sources';
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

  it('review gap 16 c09-originals-link-hop-warm: with a warm index, the original a matched note links is still a candidate once discovery reads that note', async () => {
    const { candidates } = await ask(SIGNING, [], undefined, {}, { warm: true });
    expect(candidates).toContain(COBBLE);
    expect(candidates).toContain(HOLDING);
  });

  it('review gap 17 c09-originals-hidden: an original under a hidden folder is never a candidate, never read, never shown, by its name or a link', async () => {
    const SALARY = 'Projects/.private/Salary.csv';
    const words = 'What salary does the Cobble Row salary sheet say?';
    const { candidates, execution, reads } = await ask(words, [SALARY], undefined,
      { [SALARY]: 'Salary: 4,000 a month.\n', [COBBLE]: note('The Cobble Row flat in Saltmere.', `Rent: 1,580 a month.\nSee [[${SALARY}]].`) });
    expect(candidates).toContain(COBBLE);
    expect(candidates).not.toContain(SALARY);
    expect(await reads(SALARY)).toBe(0);
    expect(JSON.stringify(execution)).not.toContain('4,000');
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

  // c12-prefix spec review round 1 ruling 1: the files clause is fixed text; the files shown are call text.
  it('c12-prefix ruling 1 c09-originals-prefix: an original shown leaves the prompt file as a run with no files has it; the files are on stdin', async () => {
    const shown = await ask(RENT, [LISTING]);
    const none = await ask(RENT, []);
    expect(shown.execution[0]?.files, 'the original is shown').toBeDefined();
    expect(none.execution[0]?.files, 'no original is shown').toBeUndefined();
    expect(shown.systems.length, 'every planning call names its prompt file').toBeGreaterThan(0);
    expect(shown.systems.every((s) => s !== null)).toBe(true);
    expect(shown.systems[shown.systems.length - 1], 'the same prompt file with or without files').toBe(none.systems[none.systems.length - 1]);
    expect(shown.systems[0]).toMatch(/"files": originals shown for a request, read-only/);
    expect(shown.systems[0], 'the files shown are not in the prompt file').not.toContain('Rent: 1,450 a month.\nDeposit: 1,600.');
    const stdin = JSON.parse(shown.inputs[shown.inputs.length - 1] ?? '{}') as { notes?: unknown; files?: Array<{ path: string }> };
    expect(stdin.files?.map((f) => f.path), 'the files shown are on the execution stdin').toEqual([LISTING]);
    expect(Object.keys(stdin).indexOf('files'), 'right after the notes').toBe(Object.keys(stdin).indexOf('notes') + 1);
  });

  // Review ledger c09-originals rulings 4-15: the reds the implementer writes first.
  it('ruling 15 c09-originals-prompt-evidence: both prompts say selected originals are answer evidence, never "notes shown only"', async () => {
    const { prompts, selectionPrompts } = await ask(RENT, [LISTING]);
    expect(prompts[0]).not.toContain('notes shown only');
    expect(prompts[0]).toContain('Answer from the notes and files shown only');
    expect(prompts[0]).toMatch(/"files": originals shown for a request, read-only/);
    expect(selectionPrompts[0]).toContain('"wants":["listed note or file id"]');
  });

  it('ruling 4 c09-originals-planner: the planner accepts an answer citing an original by its path or its one name, and refuses a name two files share anywhere in the folder (ruling 11)', async () => {
    const f = await seeded({ 'Old papers/Holding terms.txt': 'An old holding fee.\n' });
    await f.request(DEPOSIT);
    const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'instructions', clock: () => DAY + 20, newId: () => 'c09-originals-planner' });
    if (admission.kind !== 'manifest') throw new Error('Not admitted');
    const plan = async (text: string) => {
      const decisions: Decisions = { ...scriptedDecisions([], []), request: () => ({ kind: 'answer', uses: [], answer: text }) };
      try {
        const reads = fakeRead(f.drive);
        await planScripted({ ...reads, provenance: 'fake-stored', piles: (rootId, context) => listedPiles(reads, rootId, undefined, undefined, context) }, f.root, { scope: 'instructions',
          allowWeb: false, runId: 'c09-originals-planner', requestId: admission.manifest.id, requestedAt: admission.manifest.at, taken: admission.manifest,
          mintKey: await runKeys('c09-originals-planner'), decisions });
        return 'planned';
      } catch (error) { return error instanceof Error ? error.message : String(error); }
    };
    expect(await plan(`The deposit is 1,600, as [[${LISTING}]] says.`), 'a whole path').toBe('planned');
    expect(await plan('The agent asks for a guarantor fee, as [[Agent letter.txt]] says.'), 'a name one file has').toBe('planned');
    expect(await plan('The deposit is 1,600, as [[Listing.txt]] says.'), 'a name two originals share').toBe(B_FAILURE);
    expect(await plan('The holding fee is asked, as [[Holding terms.txt]] says.'), 'a name a file outside the main folders also has').toBe(B_FAILURE);
    expect(await plan(`The holding fee is asked, as [[${HOLDING}]] says.`), 'its whole path').toBe('planned');
  });

  it('ruling 11 c09-originals-identity: a bare name another file shares anywhere in the folder reaches no original and is refused at the reply; its whole path lands', async () => {
    const SIGNING_NOTE = `${HUNT}/Signing steps.md`;
    const words = 'What does the Cobble Row signing step need?';
    const good = `The holding fee is asked before signing, as [[${HOLDING}]] says.`;
    const { run, candidates } = await ask(words, [HOLDING], (requestId, attempt) => ({ ...empty, answers: [{ requestId,
      text: attempt ? good : 'The holding fee is asked before signing, as [[Holding terms.txt]] says.' }] }),
    { [SIGNING_NOTE]: note('What signing needs.', 'See also [[Holding terms.txt]]: what is asked before signing.'), 'Old papers/Holding terms.txt': 'An old holding fee.\n' });
    expect(candidates, 'reached by Cobble Row\'s whole path').toContain(HOLDING);
    expect(candidates).not.toContain('Old papers/Holding terms.txt');
    expect(refusals().slice(0, 2)).toEqual(['noteLink', SHARED]);
    expect(doneFor(run, words)).toEqual([good]);
  });

  // Rent notes of an exact length each, shown whole: the notes' share of the room is known.
  const sized = (n: number, length: number) => {
    const head = `---\nsummary: Rent talk ${n}.\nby: bower\n---\n\n`;
    return { [`${HUNT}/Rent note ${n}.md`]: `${head}${'r'.repeat(length - head.length - 1)}\n` };
  };
  const rentNotes = (lengths: number[]) => Object.assign({}, ...lengths.map((length, i) => sized(i + 1, length))) as Record<string, string>;
  const rent = (...ns: number[]) => ns.map((n) => `${HUNT}/Rent note ${n}.md`);
  const LETTER_ROOM = 'What do the rent notes and the agent letter say?';
  const LISTING_ROOM = 'What do the rent notes and the listing say?';
  const MORE_ROOM = 'What else do the rent notes say?';
  const used = (frame: Frame | undefined) => (frame?.notes ?? []).reduce((sum, n) => sum + n.text.length, 0);

  it('ruling 5 c09-originals-room: notes first, then originals, in one 24,000-character room across requests', async () => {
    const { execution, candidatesOf, ids } = await ask([LETTER_ROOM, MORE_ROOM], { [LETTER_ROOM]: [...rent(1, 2, 3), LETTER], [MORE_ROOM]: rent(4, 5, 6) }, () => empty,
      rentNotes([3_900, 3_900, 3_900, 3_900, 3_900, 3_900]));
    expect(candidatesOf(ids[0])).toContain(LETTER);
    const notes = used(execution[0]);
    expect(execution[0]?.notes?.length, 'every wanted note is shown first: the hub and six rent notes').toBe(7);
    const [shown, ...more] = (execution[0]?.files ?? []) as Shown[];
    expect(more).toEqual([]);
    expect(shown?.path).toBe(LETTER);
    expect(shown?.cut).toBeGreaterThan(0);
    expect(shown?.text).toMatch(/\n\[cut here: \d+ more characters not shown\]$/);
    expect(notes + (shown?.text.length ?? Infinity), 'one room for notes and originals').toBeLessThanOrEqual(CONTEXT_BOUNDS.notesPerRun);
    expect(notes + (shown?.text.length ?? 0), 'the original takes what the notes left').toBeGreaterThan(CONTEXT_BOUNDS.notesPerRun - 50);
  });

  it('ruling 5 c09-originals-room: with no room left after the notes, a wanted original is not shown', async () => {
    const hub = FILES[`${HUNT}/Flat hunt.md`]?.length ?? 0;
    const { execution, candidatesOf, ids } = await ask([LISTING_ROOM, MORE_ROOM], { [LISTING_ROOM]: [...rent(1, 2, 3), LISTING], [MORE_ROOM]: rent(4, 5, 6, 7) }, () => empty,
      rentNotes([3_500, 3_500, 3_500, 3_500, 3_500, 3_500, CONTEXT_BOUNDS.notesPerRun - hub - 6 * 3_500]));
    expect(candidatesOf(ids[0]), 'the listing was a candidate and wanted').toContain(LISTING);
    expect(used(execution[0])).toBe(CONTEXT_BOUNDS.notesPerRun);
    expect(execution[0]?.files ?? []).toEqual([]);
  });

  it('ruling 13 c09-originals-room-notice: a remainder too small for the original with its whole notice leaves the original out', async () => {
    const hub = FILES[`${HUNT}/Flat hunt.md`]?.length ?? 0;
    const { execution, candidatesOf, ids } = await ask([LETTER_ROOM, MORE_ROOM], { [LETTER_ROOM]: [...rent(1, 2, 3), LETTER], [MORE_ROOM]: rent(4, 5, 6, 7) }, () => empty,
      rentNotes([3_500, 3_500, 3_500, 3_500, 3_500, 3_500, CONTEXT_BOUNDS.notesPerRun - 20 - hub - 6 * 3_500]));
    expect(candidatesOf(ids[0])).toContain(LETTER);
    expect(used(execution[0]), 'twenty characters are left').toBe(CONTEXT_BOUNDS.notesPerRun - 20);
    expect(execution[0]?.files ?? []).toEqual([]);
  });

  it('rulings 5 and 8 c09-originals-reads: discovery reads no original; an original two requests want is read once, through the retry, and shown once', async () => {
    const good = 'The deposit is 1,600, as [[Projects/Flat hunt/Listing.txt]] says.';
    const { execution, candidatesOf, ids, reads } = await ask([DEPOSIT, RENT], [LISTING], (requestId, attempt) => ({ ...empty,
      answers: [{ requestId, text: attempt ? good : 'The deposit is 1,600, as [[Listing.txt]] says.' }] }));
    expect(candidatesOf(ids[1]), 'the old listing is a candidate, not wanted').toContain(OLD_LISTING);
    expect(execution).toHaveLength(2);
    expect(execution.map((frame) => frame.files)).toEqual([[{ path: LISTING, text: FILES[LISTING], cut: 0 }], [{ path: LISTING, text: FILES[LISTING], cut: 0 }]]);
    expect(await reads(LISTING), 'one read of the wanted original').toBe(1);
    expect(await Promise.all([OLD_LISTING, HOLDING, LETTER, PHOTO].map(reads)), 'no read of an original not wanted').toEqual([0, 0, 0, 0]);
  });

  it.each([
    ['beyond the original\'s cut', 'What guarantor fee does the agent letter ask for?', [LETTER], `The guarantor fee is 2,222, as [[${LETTER}]] says.`, '2,222',
      `[[${LETTER}]] does not say a guarantor fee in the part Bower read.`],
    ['only in another shown original', 'What do the listing and the holding terms ask?', [LISTING, HOLDING], `The deposit is 1,600, as [[${HOLDING}]] says.`, '1,600',
      `The deposit is 1,600, as [[${LISTING}]] says.`],
  ])('ruling 6 c09-originals-grounding: an amount %s is refused numbers; the corrected reply lands', async (_name, words, wants, bad, n, good) => {
    const { run } = await ask(words, wants, (requestId, attempt) => ({ ...empty, answers: [{ requestId, text: attempt ? good : bad }] }));
    expect(refusals().slice(0, 2)).toEqual(['numbers', numbers(n)]);
    expect(doneFor(run, words)).toEqual([good]);
  });

  const VIEWED = 'Viewing note.txt';
  const viewed = (frame: Frame, body: string, lines: unknown[] = []) => {
    const fileId = (frame.piles ?? []).flatMap((p) => p.things).find((t) => t.name === VIEWED)?.fileId;
    return { fileId, things: [{ fileId, to: HUNT, name: VIEWED, note: { name: 'Viewing note.md', summary: 'Alex viewed the Larkspur Lane flat.', body } }], lines };
  };
  it.each([
    ['a link in a filed thing\'s note', (frame: Frame) => viewed(frame, `Alex viewed the Larkspur Lane flat.\n\nSee also [[${LISTING}]]: the listing of the flat.`),
      ['noteLink', 'a link to a file that is not a note']],
    ['a Timeline line on it', (frame: Frame) => { const v = viewed(frame, 'Alex viewed the Larkspur Lane flat.'); return { ...v, lines: [{ note: LISTING, text: 'Alex viewed the flat.', cites: v.fileId }] }; },
      ['lineNote', 'a line on a note it was not shown']],
  ])('ruling 7 c09-originals-request-only: in a run that files and answers, a shown original refuses %s; the corrected reply lands', async (_name, bad, why) => {
    const good = 'The deposit is 1,600, as [[Projects/Flat hunt/Listing.txt]] says.';
    const { run } = await ask(DEPOSIT, [LISTING], (requestId, attempt, frame) => {
      const { things, lines } = attempt ? viewed(frame, 'Alex viewed the Larkspur Lane flat.') : bad(frame);
      return { ...empty, things, ...(lines.length ? { lines } : {}), answers: [{ requestId, text: good }] };
    }, {}, { scope: 'all', inbox: [{ line: 'File this viewing note with the flat hunt.', files: [VIEWED] }], inboxFiles: { [VIEWED]: 'Alex viewed the Larkspur Lane flat.\n' } });
    expect(refusals().slice(0, 2)).toEqual(why);
    expect(doneFor(run, DEPOSIT)).toEqual([good]);
    expect(run.after[LISTING], 'the original is never written').toBe(FILES[LISTING]);
    expect(run.after[`${HUNT}/Viewing note.md`] ?? '').not.toContain('Listing');
  });

  it.each([
    ['Drive refuses it for good', {}, { refuse: LISTING }, LISTING],
    ['its text is not UTF-8', {}, { binary: { [`${HUNT}/Listing notes.txt`]: new Uint8Array([0x4c, 0xff, 0xfe, 0x41]) } }, `${HUNT}/Listing notes.txt`],
  ] as Array<[string, Record<string, string>, Options, string]>)('ruling 9 c09-originals-read-failure: a wanted original %s is left out, details to the log; the run ends done', async (_name, extra, o, broken) => {
    const words = 'What do the listing notes and the holding terms say?';
    const text = `A holding fee is asked before signing, as [[${HOLDING}]] says.`;
    const { run, execution, candidates } = await ask(words, [broken, HOLDING], (requestId) => ({ ...empty, answers: [{ requestId, text }] }), extra, o);
    expect(candidates).toContain(broken);
    expect(execution[0]?.files).toEqual([{ path: HOLDING, text: FILES[HOLDING], cut: 0 }]);
    expect(console.error).toHaveBeenCalled();
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(doneFor(run, words)).toEqual([text]);
  });

  it('rulings 10 and 12 c09-originals-pdf: a long PDF is shown as a pile shows one: its page notice, then its cut notice, cut counting characters', async () => {
    const LEASE = `${HUNT}/Lease.pdf`;
    const page = (p: number) => Array.from({ length: 40 }, (_, l) => `Lease page ${p} line ${l + 1}: made-up words about the flat and its deposit terms.`);
    const { execution } = await ask('What does the lease say about the deposit?', [LEASE], () => empty, {}, { binary: { [LEASE]: pdfPages([1, 2, 3, 4, 5, 6].map(page)) } });
    const [shown] = (execution[0]?.files ?? []) as Shown[];
    expect(shown?.path).toBe(LEASE);
    expect(shown?.text.length).toBeLessThanOrEqual(CONTEXT_BOUNDS.perNote);
    const notice = /\n\[(\d+) pages not read\]\n\[cut here: (\d+) more characters not shown\]$/.exec(shown?.text ?? '');
    expect(Number(notice?.[1])).toBeGreaterThan(0);
    expect(shown?.cut).toBe(Number(notice?.[2]));
    expect(shown?.cut).toBeGreaterThan(0);
  });
});

/** A one-font text PDF, one entry per page, each page's lines drawn one under another (as b10-synopsis.test.ts builds one). */
function pdfPages(pages: string[][]): Uint8Array {
  const body = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = pages.map((lines) => {
    const stream = `BT\n/F1 8 Tf\n9 TL\n30 820 Td\n${lines.map((l) => `(${l}) Tj T*`).join('\n')}\nET\n`;
    body.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    body.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${body.length} 0 R >>`);
    return `${body.length} 0 R`;
  });
  body[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  const at: number[] = [];
  let out = '%PDF-1.4\n';
  for (const [i, o] of body.entries()) { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${body.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${body.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
