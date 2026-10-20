/**
 * qa-prod-8-F1: a question that names one of the run's requests holds only that request after the retry, and the rest is
 * filed; a question about an id the run does not know still refuses the whole reply. When a run does fail after the retry,
 * its last log line says why, in fixed words: the kind refuses the whole reply, names no pile or request, or nothing is
 * left once its piles and requests are set aside (specs/qa-prod-8/plan.md, F1). Prior art: partial-success batch APIs
 * (SQS SendMessageBatch, Elasticsearch _bulk) and the dead-letter pattern. The harness is plan-partial's `tidy`.
 * Every run goes through production main over a made-up folder; only the model is replaced.
 */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission, SET_ASIDE } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { askId } from '../../src/data/contracts/questions';
import { SYSTEM } from '../../src/data/vault/layout';
import { REFUSALS, type ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, runOnDrive, seedCase } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 17, 9);
const DIARY = 'Areas/Allotment/Allotment diary.md';
const BOILER = 'Areas/Home/Boiler.md';
const bower = (summary: string, line: string) => `---\nsummary: ${summary}\nby: bower\n---\n\n${summary}\n\n## Timeline\n- ${line}\n`;
const FILES: Record<string, string> = {
  [BOILER]: bower('The boiler in the hallway cupboard.', '2026-09-30 · Filed by Bower.'),
  [DIARY]: '---\nsummary: Alex\'s allotment diary.\n---\n\nAlex writes what happens on the plot.\n\n## Timeline\n- 2026-10-01 · Alex dug the first bed.\n',
};
const ADD_DIARY = 'Add to Allotment diary: Alex sowed broad beans in bed 3 on 17 Oct.';
const DIARY_LINE = 'Alex sowed broad beans in bed 3 on 17 Oct.';
const ASK = { text: 'Shall I add this to the allotment diary?', yes: 'Add it', no: 'Leave it' };
const PHOTO = 'Photo from the hallway.png';
const RECEIPT = 'Receipt from the shop.png';
const PHOTO_NAME = 'Boiler service reminder.png';
const NOTES_MD = 'Alex notes.md';
const NOTES_TEXT = '# Alex notes\n\nAlex keeps the boiler manual in the hallway drawer.\n';
const SERVICED = 'The boiler in the hallway cupboard was serviced on 3 October, not in September.';
const SERVICED_LINE = 'The boiler was serviced on 3 October.';
const WAITS = "Bower couldn't tidy this up yet. Try again.";
const RUN = 'qa-prod-8-F1-run';
const SUFFIX = {
  whole: (kind: string) => `(${kind}; refuses the whole reply)`,
  unlocated: (kind: string) => `(${kind}; names no pile or request)`,
  left: (kind: string) => `(${kind}; nothing is left once its piles and requests are set aside, or its pile cannot wait)`,
};

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

const errors = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String));
const drops = () => errors().flatMap((line) => { const m = /drops a (pile|request) \((\w+)\): (.*); it waits for the next tidy-up/.exec(line); return m ? [{ what: m[1] ?? '', kind: m[2] ?? '', why: m[3] ?? '' }] : []; });
/** The run's last log line: the plan refused after the retry and any drops. */
const finalLine = () => errors().filter((line) => line.includes(' is refused: ')).at(-1) ?? 'no final line';

type Frame = { requests?: Array<{ requestId: string; text: string }>; piles?: Array<{ pileId: string; things: Array<{ fileId: string; name: string }> }>;
  sources?: Array<{ itemId: string; candidates: Array<{ id: string; path: string }> }> };
type Ctx = { request: (words: string) => string; thing: (name: string) => string; pile: (name: string) => string; words: () => string };
type Drive = ReturnType<typeof fixedDrive>;

/**
 * One tidy-up through main over a made-up folder (plan-partial's `tidy`): the requests as the app writes them, the piles in
 * the Inbox, a selection that wants the named notes for each request (`wants`) and pile (`pileWants`), filed beside the first
 * (a source that wants none goes to Areas/Home), then the given execution reply, the same for both attempts.
 */
async function tidy(o: { requests?: string[]; inbox?: LoadedCase['inbox']; inboxFiles?: Record<string, string>; wants?: string[]; pileWants?: string[]; intent: (ctx: Ctx) => unknown;
  seed?: (drive: Drive, ids: Record<string, string>) => Promise<void> }) {
  const requests = o.requests ?? [];
  const c: LoadedCase = { id: 'qa-prod-8-F1', capability: 'C05', title: 'Alex tidies', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], bowerOwned: [],
    journal: requests.map((text) => ({ kind: 'request' as const, text })), inbox: o.inbox ?? [], inboxFiles: o.inboxFiles ?? {},
    folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...FILES } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const ids = Object.fromEntries((await drive.listAll(root)).map((f) => [drive.pathOf(f.id, root), f.id]));
  await o.seed?.(drive, ids);
  const outside = async () => Object.fromEntries(await Promise.all((await drive.listAll(root)).filter((f) => !f.folder && !drive.pathOf(f.id, root).startsWith('.bower/'))
    .map(async (f) => [drive.pathOf(f.id, root), await drive.readText(f.id)] as const)));
  const before = await outside();
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => DAY + 10, newId: () => 'qa-prod-8-F1-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const calls: string[] = [];
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as Frame;
    calls.push(phase);
    if (phase === 'selection') {
      return reply({ items: (frame.sources ?? []).map((s) => {
        const wants = (frame.requests?.some((r) => r.requestId === s.itemId) ? o.wants : o.pileWants) ?? [];
        const named = s.candidates.filter((x) => wants.includes(x.path));
        const first = named[0]?.path;
        return { itemId: s.itemId, kind: 'unknown', destination: ids[first ? first.slice(0, first.lastIndexOf('/')) : 'Areas/Home'], wants: named.map((x) => x.id) };
      }), asks: [] });
    }
    return reply(o.intent({
      request: (words) => frame.requests?.find((r) => r.text === words)?.requestId ?? `missing request ${words}`,
      thing: (name) => frame.piles?.flatMap((p) => p.things).find((t) => t.name === name)?.fileId ?? `missing thing ${name}`,
      pile: (name) => frame.piles?.find((p) => p.things.some((t) => t.name === name))?.pileId ?? `missing pile of ${name}`,
      words: () => frame.piles?.find((p) => !p.things.length)?.pileId ?? 'missing words pile' }));
  }, () => ({ drive, root, admission: admission.manifest }), true);
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'all', requestId: RUN }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-qp8' } }, 1);
  return { ...run, calls, before, outside: await outside() };
}
type Run = Awaited<ReturnType<typeof tidy>>;
const phase = (run: Run) => run.wire?.statuses.at(-1)?.phase;
type Report = { setAside: Array<{ name: string; why: string }> };
const reportOf = (run: Run): Report => (run.lastRun as { run?: { report?: Report } } | null)?.run?.report ?? { setAside: [] };
const manifestText = (run: Run): string | undefined => Object.entries(run.after).find(([p]) => p.includes(`/${RUN}/manifest-`))?.[1];
const manifestOf = (run: Run) => { const text = manifestText(run); return text === undefined ? undefined : JSON.parse(text) as { waiting?: Array<{ name: string; why: string }> }; };
const waits = (run: Run, n: number): boolean => run.after[`${SYSTEM.changes}/change-${n}.json`] !== undefined && run.after[`${SYSTEM.archive}/change-${n}.json`] === undefined;
const filed = (run: Run, name: string): boolean => Object.values(run.pathsById).includes(`Areas/Home/${name}`);
const expectFailedUntouched = (run: Run) => {
  expect(phase(run)).toBe('failed');
  expect(run.code).toBe(1);
  expect(manifestText(run), 'no manifest').toBeUndefined();
  expect(run.outside).toEqual(run.before);
  expect(drops(), 'a failed run logs no drop').toEqual([]);
};
/** Sec-hardening L4: the final line gives fixed words only, none of the reply's or a note's. */
const expectFixedFinal = (suffix: string) => {
  const line = finalLine();
  expect(line.endsWith(suffix), `${line} ends with ${suffix}`).toBe(true);
  for (const word of [ASK.text, ASK.yes, DIARY_LINE, SERVICED_LINE, 'boiler manual', 'Elsewhere', PHOTO_NAME]) expect(line).not.toContain(word);
};

const empty = { kind: 'tidy-intent', v: 1, things: [] };
const BYTES = Object.fromEntries([PHOTO, RECEIPT].map((n) => [n, `made-up picture bytes of ${n}`]));
const photoInbox = (...names: string[]) => names.map((name) => ({ line: name.replace(/\.png$/, ''), files: [name] }));
const goodPhoto = (ctx: Ctx) => ({ fileId: ctx.thing(PHOTO), to: 'Areas/Home', name: PHOTO_NAME });
/** The photo filed, the diary request's line, and a question about the given id in both replies. */
const asking = (about: (ctx: Ctx) => Record<string, string>) => tidy({ requests: [ADD_DIARY], wants: [DIARY], inbox: photoInbox(PHOTO), inboxFiles: BYTES,
  intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx)], lines: [{ note: DIARY, text: DIARY_LINE, cites: ctx.request(ADD_DIARY) }], asks: [{ ...about(ctx), ...ASK }] }) });

const expectRequestWaits = (run: Run) => {
  expect(phase(run)).toBe('done');
  expect(filed(run, PHOTO_NAME)).toBe(true);
  expect(waits(run, 1), 'the diary request is not archived').toBe(true);
  expect(run.after[DIARY], 'the diary is byte-identical').toBe(FILES[DIARY]);
  expect(drops()).toEqual([{ what: 'request', kind: 'askNotAdmitted', why: REFUSALS.askNotAdmitted }]);
  expect(reportOf(run).setAside).toEqual([{ name: ADD_DIARY, why: SET_ASIDE.notTidied }]);
  expect(manifestOf(run)?.waiting).toEqual([{ name: ADD_DIARY, why: SET_ASIDE.notTidied }]);
  expect(SET_ASIDE.notTidied).toBe(WAITS);
  expect(run.calls.filter((c) => c === 'execution')).toHaveLength(2);
};

describe('qa-prod-8-F1: a question that names a request holds only that request', () => {
  it('AC1 qa8-ask-names-request-pileId: a question whose pileId is the request waits that request and files the photo', async () => {
    expectRequestWaits(await asking((ctx) => ({ pileId: ctx.request(ADD_DIARY) })));
  });
  it('AC2 qa8-ask-names-request-fileId: a question whose fileId is the request waits that request and files the photo', async () => {
    expectRequestWaits(await asking((ctx) => ({ fileId: ctx.request(ADD_DIARY) })));
  });
  it('AC3 qa8-ask-unknown-id-fails: a question about an id the run does not know refuses the whole reply, with nothing changed', async () => {
    expectFailedUntouched(await asking(() => ({ fileId: 'f-none' })));
  });
});

describe('qa-prod-8-F1: the final line says why nothing could be held', () => {
  it('AC4 qa8-final-line-says-why (a): an unlocated question names no pile or request', async () => {
    await asking(() => ({ fileId: 'f-none' }));
    expectFixedFinal(SUFFIX.unlocated('askNotAdmitted'));
  });
  it('AC4 qa8-final-line-says-why (b): run 6, a person\'s .md given a note and a contradiction with no alsoCites, leaves nothing once both piles are set aside', async () => {
    const run = await tidy({ pileWants: [BOILER], inbox: [{ line: 'Alex notes', files: [NOTES_MD] }, { line: SERVICED, files: [] }], inboxFiles: { [NOTES_MD]: NOTES_TEXT },
      intent: (ctx) => ({ ...empty,
        things: [{ fileId: ctx.thing(NOTES_MD), to: 'Areas/Home', name: NOTES_MD, note: { name: NOTES_MD, summary: 'Where Alex keeps the boiler manual.', body: 'Alex keeps the boiler manual in the hallway drawer.' } }],
        lines: [{ note: BOILER, text: SERVICED_LINE, cites: ctx.words(), marker: 'contradiction' }] }) });
    // Drop lines are logged only for a run that goes on; this one fails, so its log is the first refusal and the final line.
    expect(errors().filter((line) => line.includes(' was refused (')).map((line) => /\((\w+)\)/.exec(line)?.[1])).toEqual(['noteForNote']);
    expectFailedUntouched(run);
    expectFixedFinal(SUFFIX.left('lineAlsoCites'));
  });
  it('AC4 qa8-final-line-says-why (c): a thing filed to Elsewhere/x refuses the whole reply', async () => {
    const run = await tidy({ inbox: photoInbox(PHOTO, RECEIPT), inboxFiles: BYTES,
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx), { fileId: ctx.thing(RECEIPT), name: 'Shop receipt.png', to: 'Elsewhere/x' }] }) });
    expectFailedUntouched(run);
    expectFixedFinal(SUFFIX.whole('placeOutside'));
  });
  it('AC4 qa8-final-line-says-why (d): a pile with a stored reask (plan-partial ruling 19) cannot wait', async () => {
    const run = await tidy({ inbox: photoInbox(PHOTO, RECEIPT), inboxFiles: BYTES,
      seed: async (drive, ids) => {
        const reask = { id: askId('p-2'), subject: 'p-2', text: 'Where does it go?', yes: 'Yes', no: 'No', askedAt: DAY - 5000 };
        await drive.writeText(ids[SYSTEM.questions] ?? '', JSON.stringify({ v: 1, questions: [],
          rounds: [{ subject: 'p-2', pileId: 'p-2', words: RECEIPT.replace(/\.png$/, ''), count: 1, wordsOnly: true, reask }] }), (await drive.get(ids[SYSTEM.questions] ?? '')).modifiedTime);
      },
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx), { fileId: ctx.thing(RECEIPT), name: 'Shop receipt.png', to: 'Projects/Brand new place' }] }) });
    expectFailedUntouched(run);
    expectFixedFinal(SUFFIX.left('newFolder'));
  });
});
