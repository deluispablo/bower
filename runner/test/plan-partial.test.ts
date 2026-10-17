/**
 * plan-partial: after its one retry, a model reply's item-level refusal holds only the source it names (a pile or a
 * request), visibly, and the rest of the run goes on; reply-level refusals still refuse the whole reply
 * (specs/qa-live-claude/plan-partial.md). Prior art: partial-success batch APIs (SQS SendMessageBatch, Elasticsearch
 * _bulk) and the dead-letter pattern; the one retry is Instructor's validate-and-retry (REFUSALS).
 * Every run goes through production main over a made-up folder; only the model is replaced.
 */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { parseRunManifestV2, WAITING_WHY } from '../../src/data/contracts/run-manifest';
import { SET_ASIDE } from '../../src/data/spine/plan';
import { askId } from '../../src/data/contracts/questions';
import { MAX_NAME } from '../../src/data/contracts/tree';
import { RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import { REFUSALS, type ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, redispatchCase, runOnDrive, seedCase } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 17, 9);
const POTTERY = 'Resources/Pottery class/Pottery class at Fennick Studio.md';
const DIARY = 'Areas/Allotment/Allotment diary.md';
const bower = (summary: string, line: string) => `---\nsummary: ${summary}\nby: bower\n---\n\n${summary}\n\n## Timeline\n- ${line}\n`;
/** A note of the same folder as Pottery's that its request does not name: a listed candidate, so a line on it can be shown and refused (lineCites). */
const SUPPLIES = 'Resources/Pottery class/Pottery class supplies.md';
const FILES: Record<string, string> = {
  [POTTERY]: bower('Alex takes a pottery class at Fennick Studio on Tuesdays.', '2026-10-16 · Filed by Bower.'),
  [SUPPLIES]: bower('Alex keeps a list of the supplies for the pottery class.', '2026-10-16 · Filed by Bower.'),
  // A person's own note (no "by: bower"): it takes only the line its request binds (C05).
  'Areas/Home/Boiler.md': bower('The boiler in the hallway cupboard.', '2026-09-30 · Filed by Bower.'),
  [DIARY]: '---\nsummary: Alex\'s allotment diary.\n---\n\nAlex writes what happens on the plot.\n\n## Timeline\n- 2026-10-01 · Alex dug the first bed.\n',
};
const ADD_POTTERY = 'Add to Pottery class at Fennick Studio: the first class is free for new students.';
const ADD_DIARY = 'Add to Allotment diary: Alex sowed broad beans in bed 3 on 17 Oct.';
const PHONE = "What is Mira Holt's phone number?";
const POTTERY_LINE = 'The first class is free for new students.';
const DIARY_LINE = 'Alex sowed broad beans in bed 3 on 17 Oct.';
const NO_PHONE = 'Your notes do not give Mira Holt\'s phone number.';
const SHED = 'The shed key is under the blue pot.';
const PHOTO = 'Photo from the hallway.png';
const RECEIPT = 'Receipt from the shop.png';
const INVOICE = 'Water invoice scan.png';
const HOLIDAY = ['Holiday one.png', 'Holiday two.png', 'Holiday three.png'];
const WAITS = "Bower couldn't tidy this up yet. Try again.";
const LONG_WORDS = 'x'.repeat(400);
const PHOTO_NAME = 'Boiler service reminder.png';
const LINE_ADDED = 'One line added to its Timeline, as you asked.';
const RUN = 'plan-partial-run';

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
/** Each drop the runner logged: what was dropped, its refusal kind and the reason it gave. */
const drops = () => errors().flatMap((line) => { const m = /drops a (pile|request) \((\w+)\): (.*); it waits for the next tidy-up/.exec(line); return m ? [{ what: m[1] ?? '', kind: m[2] ?? '', why: m[3] ?? '' }] : []; });
/** Sec-hardening L4: a drop line gives the kind's own sentence and none of the reply's or a note's words. */
const expectFixedDrops = (count: number) => {
  const found = drops();
  expect(found, 'one log line per dropped source').toHaveLength(count);
  for (const d of found) expect(d.why).toBe(REFUSALS[d.kind as keyof typeof REFUSALS]);
  const lines = errors().filter((l) => /drops a (pile|request)/.test(l)).join('\n');
  for (const word of [POTTERY_LINE, DIARY_LINE, SHED, LONG_WORDS.slice(0, 40), 'Brand new place', 'Elsewhere', NO_PHONE, 'IMG_0042']) expect(lines).not.toContain(word);
};

type Frame = { requests?: Array<{ requestId: string; text: string }>; piles?: Array<{ pileId: string; things: Array<{ fileId: string; name: string }> }>;
  sources?: Array<{ itemId: string; candidates: Array<{ id: string; path: string }> }> };
type Ctx = { frame: Frame; ids: Record<string, string>; request: (words: string) => string; thing: (name: string) => string; pile: (name: string) => string; words: () => string; attempt: number };
type Drive = ReturnType<typeof fixedDrive>;

/** A reply as claude sends one that is not JSON: its text is the result. */
const raw = (text: string) => { const exit = reply(null); const out = JSON.parse(exit.stdout) as Record<string, unknown>; return { ...exit, stdout: JSON.stringify({ ...out, result: text }) }; };

/**
 * One tidy-up through main over a made-up folder (as qa-live-claude-f1's `tidy`): the requests as the app writes them, the
 * piles in the Inbox, a selection that wants the named notes for each request and files each pile to Areas/Home, then the
 * given execution reply; a string is sent as it is.
 */
async function tidy(o: { requests?: string[]; inbox?: LoadedCase['inbox']; inboxFiles?: Record<string, string>; scope: 'all' | 'instructions';
  wants?: string[]; intent: (ctx: Ctx) => unknown; seed?: (drive: Drive, ids: Record<string, string>) => Promise<void>;
  on?: { drive: Drive; root: string; press: number }; claude?: ClaudeSpawn }) {
  const press = o.on?.press ?? 1;
  const requests = o.requests ?? [];
  const c: LoadedCase = { id: 'plan-partial', capability: 'C05', title: 'Alex tidies', covers: 'model', source: 'new', scope: o.scope,
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], bowerOwned: [],
    journal: requests.map((text) => ({ kind: 'request' as const, text })), inbox: o.inbox ?? [], inboxFiles: o.inboxFiles ?? {},
    folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...FILES } };
  const drive = o.on?.drive ?? fixedDrive();
  const root = o.on?.root ?? await seedCase(drive, c);
  const listing = await drive.listAll(root);
  const ids = Object.fromEntries(listing.map((f) => [drive.pathOf(f.id, root), f.id]));
  await o.seed?.(drive, ids);
  const outside = async () => Object.fromEntries(await Promise.all((await drive.listAll(root)).filter((f) => !f.folder && !drive.pathOf(f.id, root).startsWith('.bower/'))
    .map(async (f) => [drive.pathOf(f.id, root), await drive.readText(f.id)] as const)));
  const before = await outside();
  const admission = await planAdmission(fakeRead(drive), root, { scope: o.scope, clock: () => DAY + 9 + press, newId: () => `plan-partial-admission-${press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const calls: Array<{ phase: string }> = [];
  const attempts = { selection: 0, execution: 0 };
  const wants = o.wants ?? [];
  const spawn: ClaudeSpawn = o.claude ?? phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as Frame;
    calls.push({ phase });
    const ctx: Ctx = { frame, ids, attempt: attempts[phase]++,
      request: (words) => frame.requests?.find((r) => r.text === words)?.requestId ?? `missing request ${words}`,
      thing: (name) => frame.piles?.flatMap((p) => p.things).find((t) => t.name === name)?.fileId ?? `missing thing ${name}`,
      pile: (name) => frame.piles?.find((p) => p.things.some((t) => t.name === name))?.pileId ?? `missing pile of ${name}`,
      words: () => frame.piles?.find((p) => !p.things.length)?.pileId ?? 'missing words pile' };
    if (phase === 'selection') {
      return reply({ items: (frame.sources ?? []).map((s) => {
        // A request wants the listed notes the test names; a pile goes to Areas/Home and wants none.
        const named = frame.requests?.some((r) => r.requestId === s.itemId) ? s.candidates.filter((x) => wants.includes(x.path)) : [];
        const first = named[0]?.path;
        return { itemId: s.itemId, kind: 'unknown', destination: ids[first ? first.slice(0, first.lastIndexOf('/')) : 'Areas/Home'], wants: named.map((x) => x.id) };
      }), asks: [] });
    }
    const intent = o.intent(ctx);
    return typeof intent === 'string' ? raw(intent) : reply(intent);
  }, () => ({ drive, root, admission: admission.manifest }), true);
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: o.scope, requestId: press === 1 ? RUN : `${RUN}-${press}` }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-pp' } }, press);
  return { ...run, calls, drive, root, ids, c, before, outside: await outside() };
}
type Run = Awaited<ReturnType<typeof tidy>>;
const phase = (run: Run) => run.wire?.statuses.at(-1)?.phase;
type Report = { updated: Array<{ path: string; what: string }>; setAside: Array<{ name: string; why: string }>; requests?: string[]; leftAsWritten?: unknown[] };
const reportOf = (run: { lastRun: unknown }): Report => (run.lastRun as { run?: { report?: Report } } | null)?.run?.report ?? { updated: [], setAside: [] };
const manifestText = (run: Run, id = RUN): string | undefined => Object.entries(run.after).find(([p]) => p.includes(`/${id}/manifest-`))?.[1];
type Waiting = Array<{ name: string; why: string }>;
const manifestOf = (run: Run, id = RUN) => { const text = manifestText(run, id); return text === undefined ? undefined : JSON.parse(text) as { waiting?: Waiting; capture: { piles: unknown[]; journal: unknown[] } }; };
/** A request settles when its journal file is archived (`change-N.json`, by its place among the requests); until then it is in `.bower/changes`. */
const waits = (run: Run, n: number): boolean => run.after[`${SYSTEM.changes}/change-${n}.json`] !== undefined && run.after[`${SYSTEM.archive}/change-${n}.json`] === undefined;
const settled = (run: Run, n: number): boolean => run.after[`${SYSTEM.archive}/change-${n}.json`] !== undefined;
const filed = (run: Run, name: string): boolean => Object.values(run.pathsById).includes(`Areas/Home/${name}`);
const inInbox = (run: Run, name: string): boolean => Object.values(run.pathsById).some((p) => p.startsWith('Inbox/') && p.endsWith(`/${name}`) || p === `Inbox/${name}`);
/** A run that changes nothing: failed, code 1, no manifest, the folder outside `.bower/` byte-identical. */
const expectFailedUntouched = (run: Run) => {
  expect(phase(run)).toBe('failed');
  expect(run.code).toBe(1);
  expect(manifestText(run), 'no manifest').toBeUndefined();
  expect(run.outside).toEqual(run.before);
  expect(drops(), 'a reply-level refusal drops nothing').toEqual([]);
};

const empty = { kind: 'tidy-intent', v: 1, things: [] };
const goodPhoto = (ctx: Ctx) => ({ fileId: ctx.thing(PHOTO), to: 'Areas/Home', name: PHOTO_NAME });
/** The photo filed well, and the given thing as a receipt with the row the reply gets wrong. */
const shop = (ctx: Ctx, bad: { name: string; row: Record<string, unknown> }) => [
  goodPhoto(ctx), { fileId: ctx.thing(bad.name), name: 'Shop receipt.png', to: 'Areas/Home', ...bad.row },
];
const photoInbox = (...names: string[]) => names.map((name) => ({ line: `${name.replace(/\.png$/, '')}`, files: [name] }));
const BYTES = Object.fromEntries([PHOTO, RECEIPT, INVOICE, ...HOLIDAY].map((n) => [n, `made-up picture bytes of ${n}`]));
/** The pottery request's line on the diary note: the diary request does not name it, so its "cites" is refused (lineCites). */
const wrongNote = (ctx: Ctx) => ({ note: SUPPLIES, text: POTTERY_LINE, cites: ctx.request(ADD_POTTERY) });
const rightDiary = (ctx: Ctx) => ({ note: DIARY, text: DIARY_LINE, cites: ctx.request(ADD_DIARY) });
const MAIN_REQUESTS = [ADD_POTTERY, ADD_DIARY];

describe('plan-partial: PP-R1 a refused request line waits, the rest is filed', () => {
  let run: Run;
  beforeEach(async () => {
    run = await tidy({ requests: [ADD_POTTERY], scope: 'all', wants: [POTTERY, SUPPLIES], inbox: photoInbox(PHOTO), inboxFiles: BYTES,
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx)], lines: [wrongNote(ctx)] }) });
  });

  it('PP-R1 both replies file the photo and put the Pottery line on the diary note: done, photo filed, 2 execution calls, Pottery untouched, its request waits, with a waiting row', async () => {
    expect(phase(run)).toBe('done');
    expect(filed(run, PHOTO_NAME)).toBe(true);
    expect(run.calls.filter((c) => c.phase === 'execution')).toHaveLength(2);
    expect(run.after[POTTERY]).toBe(FILES[POTTERY]);
    expect(waits(run, 1), 'the Pottery request is still in the journal').toBe(true);
    expect(settled(run, 1)).toBe(false);
    expect(run.after[SUPPLIES]).toBe(FILES[SUPPLIES]);
    const report = reportOf(run);
    expect(report.setAside).toEqual([{ name: ADD_POTTERY, why: WAITS }]);
    expect(JSON.stringify(report), 'no "found nothing" row for the Pottery request').not.toMatch(/found nothing|could not find/i);
    expect(manifestOf(run)?.waiting).toEqual([{ name: ADD_POTTERY, why: WAITS }]);
    expectFixedDrops(1);
    expect(drops()[0]).toMatchObject({ what: 'request', kind: 'lineCites' });
  });

  it('PP-R4 a second press with a good reply adds the Pottery line once, settles the request, files nothing again and has no waiting row', async () => {
    const next = await tidy({ requests: [], scope: 'instructions', wants: [POTTERY], on: { drive: run.drive, root: run.root, press: 2 },
      intent: (ctx) => ({ ...empty, lines: [{ note: POTTERY, text: POTTERY_LINE, cites: ctx.request(ADD_POTTERY) }] }) });
    expect(phase(next)).toBe('done');
    expect(next.after[POTTERY]?.split(POTTERY_LINE)).toHaveLength(2);
    expect(settled(next, 1)).toBe(true);
    expect(reportOf(next).updated).toEqual(expect.arrayContaining([expect.objectContaining({ path: POTTERY, what: LINE_ADDED })]));
    expect(Object.values(next.pathsById).filter((p) => p.endsWith(PHOTO_NAME))).toHaveLength(1);
    expect(reportOf(next).setAside).toEqual([]);
    const second = manifestOf(next, `${RUN}-2`);
    expect(second, 'the second press made a manifest').toBeDefined();
    expect(second).not.toHaveProperty('waiting');
  });

  it('PP-R5 the manifest guard accepts the waiting row and refuses another why, an extra key, a bad name, an empty list or too many rows', async () => {
    const text = manifestText(run) ?? '';
    const parse = (waiting: unknown) => parseRunManifestV2(new TextEncoder().encode(JSON.stringify({ ...(JSON.parse(text) as object), waiting })), run.root, RUNNER_WRITES);
    const row = { name: ADD_POTTERY, why: WAITS };
    expect(await parse([row]), 'positive control').toMatchObject({ ok: true });
    const capture = manifestOf(run)?.capture;
    const most = (capture?.piles.length ?? 0) + (capture?.journal.length ?? 0);
    // A waiting source is not captured, so the bound is the capture's piles plus journal records plus the run's 200 things (round 1 ruling 14's
    // "at most the capture's piles plus journal" would fail any run that drops more than it files: reported in the result).
    expect(await parse(Array.from({ length: most + 200 }, (_, i) => ({ ...row, name: `Request ${i}` }))), 'the most rows').toMatchObject({ ok: true });
    expect(WAITING_WHY, 'the approved copy of the report').toBe(SET_ASIDE.notTidied);
    expect(await parse([{ ...row, name: 'x'.repeat(MAX_NAME) }])).toMatchObject({ ok: true });
    for (const [what, waiting] of [
      ['another why', [{ ...row, why: 'Bower found nothing.' }]],
      ['an extra key', [{ ...row, fileId: 'FILE_ID' }]],
      ['an empty name', [{ ...row, name: '' }]],
      ['a name over MAX_NAME', [{ ...row, name: 'x'.repeat(MAX_NAME + 1) }]],
      ['an empty list', []],
      ['too many rows', Array.from({ length: most + 201 }, (_, i) => ({ ...row, name: `Request ${i}` }))],
      ['not a list', row],
    ] as const) expect(await parse(waiting), what).toMatchObject({ ok: false });
  });

  it('17(g) a redispatch resuming from the persisted manifest shows the same waiting row once and asks the model nothing', async () => {
    const never: ClaudeSpawn = async () => { throw new Error('the model is not asked on a resume'); };
    const again = await redispatchCase(run.c, run, 2, { claude: never, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(again.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(reportOf(again).setAside).toEqual([{ name: ADD_POTTERY, why: WAITS }]);
    expect(waits({ ...run, after: again.after }, 1)).toBe(true);
  });
});

describe('plan-partial: PP-R2 and PP-R6 reply-level refusals still stop the run', () => {
  const two = { inbox: photoInbox(PHOTO, RECEIPT), inboxFiles: BYTES, scope: 'all' as const };
  it('PP-R2 a thing row with an unknown key in both replies beside a good pile fails the run with nothing changed', async () => {
    expectFailedUntouched(await tidy({ ...two, intent: (ctx) => ({ ...empty, things: shop(ctx, { name: RECEIPT, row: { bogus: true } }) }) }));
  });
  it('PP-R2 a thing filed to Elsewhere/x fails the run with nothing changed', async () => {
    expectFailedUntouched(await tidy({ ...two, intent: (ctx) => ({ ...empty, things: shop(ctx, { name: RECEIPT, row: { to: 'Elsewhere/x' } }) }) }));
  });
  it('PP-R2 a reply that is not JSON fails the run with nothing changed', async () => {
    expectFailedUntouched(await tidy({ ...two, intent: () => 'I filed everything where it belongs.' }));
  });
  it('PP-R6 a one-pile run whose only thing is refused newFolder twice fails with nothing changed', async () => {
    const run = await tidy({ inbox: photoInbox(PHOTO), inboxFiles: BYTES, scope: 'all',
      intent: (ctx) => ({ ...empty, things: [{ ...goodPhoto(ctx), to: 'Projects/Brand new place' }] }) });
    expectFailedUntouched(run);
    expect(errors().join('\n')).toContain('newFolder');
  });
  it('17(d) an item-level kind that names no source (a line with no cites) stays reply-level: the run fails', async () => {
    const run = await tidy({ requests: [ADD_DIARY], scope: 'all', wants: [DIARY], inbox: photoInbox(PHOTO), inboxFiles: BYTES,
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx)], lines: [rightDiary(ctx), { note: DIARY, text: LONG_WORDS }] }) });
    expectFailedUntouched(run);
    expect(errors().join('\n')).toContain('lineText');
  });
});

describe('plan-partial: PP-R3 a refused source is not archived and its question is not asked', () => {
  it('PP-R3 a words-only pile whose line is refused lineText twice stays in the Inbox with its words while another pile is filed', async () => {
    const run = await tidy({ requests: [ADD_POTTERY], scope: 'all', wants: [POTTERY, SUPPLIES], inbox: [...photoInbox(PHOTO), { line: SHED, files: [] }], inboxFiles: BYTES,
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx)], lines: [{ note: POTTERY, text: POTTERY_LINE, cites: ctx.request(ADD_POTTERY) }, { note: SUPPLIES, text: LONG_WORDS, cites: ctx.words() }] }) });
    expect(phase(run)).toBe('done');
    expect(filed(run, PHOTO_NAME)).toBe(true);
    // The request's own line applies: the dropped pile's line sat on a note no request names.
    expect(run.after[POTTERY]).toContain(` · ${POTTERY_LINE}`);
    expect(settled(run, 1)).toBe(true);
    expect(drops()).toEqual([expect.objectContaining({ what: 'pile', kind: 'lineText' })]);
    expect(Object.entries(run.after).some(([p, t]) => p.startsWith('Inbox/') && t.includes(SHED)), 'the words stay in the Inbox').toBe(true);
    expect(Object.keys(run.after).filter((p) => /^(Areas|Resources|Projects)\//.test(p) && run.after[p]?.includes(SHED))).toEqual([]);
    expect(run.after[SUPPLIES]).toBe(FILES[SUPPLIES]);
    expect(reportOf(run).setAside).toHaveLength(1);
    expect(manifestOf(run)?.waiting).toHaveLength(1);
    expectFixedDrops(1);
  });

  it('PP-R3 a pile whose question is refused askText twice gets no question and stays in the Inbox; the run is done', async () => {
    const run = await tidy({ inbox: photoInbox(PHOTO, RECEIPT), inboxFiles: BYTES, scope: 'all',
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx)], asks: [{ pileId: ctx.pile(RECEIPT), text: LONG_WORDS, yes: 'Yes', no: 'No' }] }) });
    expect(phase(run)).toBe('done');
    expect(filed(run, PHOTO_NAME)).toBe(true);
    expect(inInbox(run, RECEIPT)).toBe(true);
    const questions = JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: unknown[] };
    expect(questions.questions).toEqual([]);
    expect(drops()).toEqual([expect.objectContaining({ what: 'pile', kind: 'askText' })]);
    expectFixedDrops(1);
  });
});

describe('plan-partial: rulings 14, 15 and 17', () => {
  it('14 a dropped pile of three things is one waiting row named by its anchor, and its files stay in the Inbox', async () => {
    const run = await tidy({ inbox: [...photoInbox(PHOTO), { line: 'Holiday pictures', files: HOLIDAY }], inboxFiles: BYTES, scope: 'all',
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx), ...HOLIDAY.map((name, i) => ({ fileId: ctx.thing(name), name: `Holiday ${i + 1}.png`, to: i === 1 ? 'Projects/Brand new place' : 'Areas/Home' }))] }) });
    expect(phase(run)).toBe('done');
    const pile = run.dispatch?.admission.piles.find((p) => p.items.some((i) => i.name === HOLIDAY[0]));
    expect(manifestOf(run)?.waiting).toEqual([{ name: pile?.anchor?.name ?? HOLIDAY[0], why: WAITS }]);
    for (const name of HOLIDAY) expect(inInbox(run, name), name).toBe(true);
    expect(filed(run, PHOTO_NAME)).toBe(true);
    expectFixedDrops(1);
  });

  it('15 a request whose words are 500 characters is named cut to MAX_NAME with an ellipsis; one with empty words by its file name', async () => {
    const long = `Add to Pottery class at Fennick Studio: ${'the first class is free. '.repeat(20)}`;
    expect(long.length).toBeGreaterThan(500);
    const run = await tidy({ requests: [long, '', ADD_POTTERY], scope: 'instructions', wants: [POTTERY, SUPPLIES],
      intent: (ctx) => ({ ...empty, lines: [{ note: SUPPLIES, text: POTTERY_LINE, cites: ctx.request(long) }, { note: SUPPLIES, text: POTTERY_LINE, cites: ctx.request('') },
        { note: POTTERY, text: POTTERY_LINE, cites: ctx.request(ADD_POTTERY) }] }) });
    expect(phase(run)).toBe('done');
    const names = (manifestOf(run)?.waiting ?? []).map((r) => r.name).sort();
    const cut = `${long.slice(0, MAX_NAME - 1)}…`;
    expect(names).toEqual(['change-2.json', cut].sort());
    expect(reportOf(run).setAside.map((r) => r.name).sort()).toEqual(names);
    expect(waits(run, 1) && waits(run, 2)).toBe(true);
    expect(settled(run, 3)).toBe(true);
    expectFixedDrops(2);
  });

  it('17(a) a row the execution check refuses (a thing filed outside its selected destination) is located and drops only its pile', async () => {
    const run = await tidy({ inbox: photoInbox(PHOTO, RECEIPT), inboxFiles: BYTES, scope: 'all',
      intent: (ctx) => ({ ...empty, things: shop(ctx, { name: RECEIPT, row: { to: 'Resources' } }) }) });
    expect(phase(run)).toBe('done');
    expect(filed(run, PHOTO_NAME)).toBe(true);
    expect(inInbox(run, RECEIPT)).toBe(true);
    expect(drops()).toEqual([expect.objectContaining({ what: 'pile', kind: 'thingPlace' })]);
    expect(manifestOf(run)?.waiting).toHaveLength(1);
    expectFixedDrops(1);
  });

  it('17(b) a state refused for citing a request, on a note another request names, drops both requests: neither is settled as "found nothing"', async () => {
    const run = await tidy({ requests: MAIN_REQUESTS, scope: 'all', wants: [POTTERY, DIARY], inbox: photoInbox(PHOTO), inboxFiles: BYTES,
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx)], states: [{ note: POTTERY, lines: ['Alex takes a pottery class on Tuesdays.'], cites: ctx.request(ADD_DIARY) }] }) });
    expect(phase(run)).toBe('done');
    expect(filed(run, PHOTO_NAME)).toBe(true);
    expect(waits(run, 1) && waits(run, 2), 'both requests wait in the journal').toBe(true);
    expect(manifestOf(run)?.waiting?.map((r) => r.name).sort()).toEqual([ADD_DIARY, ADD_POTTERY].sort());
    expect(JSON.stringify(reportOf(run))).not.toMatch(/found nothing|could not find/i);
    expect(run.after[POTTERY]).toBe(FILES[POTTERY]);
    expectFixedDrops(2);
  });

  it('17(c) an answer refused answerText drops its request only; the other request\'s line applies', async () => {
    const run = await tidy({ requests: [ADD_POTTERY, PHONE], scope: 'instructions', wants: [POTTERY],
      intent: (ctx) => ({ ...empty, lines: [{ note: POTTERY, text: POTTERY_LINE, cites: ctx.request(ADD_POTTERY) }], answers: [{ requestId: ctx.request(PHONE), text: `${NO_PHONE} ${LONG_WORDS}${LONG_WORDS}${LONG_WORDS}` }] }) });
    expect(phase(run)).toBe('done');
    expect(run.after[POTTERY]).toContain(` · ${POTTERY_LINE}`);
    expect(settled(run, 1)).toBe(true);
    expect(waits(run, 2), 'the question waits').toBe(true);
    expect(reportOf(run).updated).toEqual(expect.arrayContaining([expect.objectContaining({ path: POTTERY, what: LINE_ADDED })]));
    expect(manifestOf(run)?.waiting).toEqual([{ name: PHONE, why: WAITS }]);
    expect(drops()).toEqual([expect.objectContaining({ what: 'request', kind: 'answerText' })]);
    expectFixedDrops(1);
  });

  it('17(e) two sources refused in the same reply are dropped in successive passes, with no third model call', async () => {
    const run = await tidy({ inbox: photoInbox(PHOTO, RECEIPT, INVOICE), inboxFiles: BYTES, scope: 'all',
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx),
        { fileId: ctx.thing(RECEIPT), to: 'Projects/Brand new place', name: 'Shop receipt.png' },
        { fileId: ctx.thing(INVOICE), to: 'Areas/Home', name: 'IMG_0042.png' }] }) });
    expect(phase(run)).toBe('done');
    expect(run.calls.filter((c) => c.phase === 'execution')).toHaveLength(2);
    expect(filed(run, PHOTO_NAME)).toBe(true);
    expect(inInbox(run, RECEIPT) && inInbox(run, INVOICE)).toBe(true);
    expect(drops().map((d) => d.kind).sort()).toEqual(['newFolder', 'rawName']);
    expect(manifestOf(run)?.waiting).toHaveLength(2);
    expectFixedDrops(2);
  });

  it('17(f) a pile the reply left a thing out of (the intent\'s own hold) and a dropped pile are both held; only the dropped one is a waiting row', async () => {
    const run = await tidy({ inbox: [...photoInbox(PHOTO, RECEIPT), { line: 'Holiday pictures', files: HOLIDAY.slice(0, 2) }], inboxFiles: BYTES, scope: 'all',
      intent: (ctx) => ({ ...empty, things: [goodPhoto(ctx), { fileId: ctx.thing(RECEIPT), to: 'Projects/Brand new place', name: 'Shop receipt.png' },
        { fileId: ctx.thing(HOLIDAY[0] ?? ''), to: 'Areas/Home', name: 'Holiday 1.png' }] }) });
    expect(phase(run)).toBe('done');
    expect(filed(run, PHOTO_NAME)).toBe(true);
    for (const name of [RECEIPT, ...HOLIDAY.slice(0, 2)]) expect(inInbox(run, name), name).toBe(true);
    expect(filed(run, 'Holiday 1.png')).toBe(false);
    const pile = run.dispatch?.admission.piles.find((p) => p.items.some((i) => i.name === RECEIPT));
    expect(manifestOf(run)?.waiting).toEqual([{ name: pile?.anchor?.name ?? RECEIPT, why: WAITS }]);
    expectFixedDrops(1);
  });
});

describe('plan-partial: ruling 19 a pile with a place choice is not droppable', () => {
  it('19 a pile with an answered place choice whose thing is refused twice ends the run failed with nothing changed', async () => {
    const run = await tidy({ inbox: photoInbox(PHOTO, RECEIPT), inboxFiles: BYTES, scope: 'all',
      seed: async (drive, ids) => {
        // The case seeder names each Inbox pile p-1, p-2 ... by its place: the receipt is the second.
        const pileId = 'p-2';
        const question = { id: askId(pileId), subject: pileId, text: 'Where does it go?', yes: 'Yes', no: 'No', askedAt: DAY - 5000,
          options: [{ id: 'home', label: 'Home', action: { kind: 'file-to', folderId: ids['Areas/Home'] } }] };
        await drive.writeText(ids[SYSTEM.questions] ?? '', JSON.stringify({ v: 1, questions: [question] }), (await drive.get(ids[SYSTEM.questions] ?? '')).modifiedTime);
        await drive.createText(ids[SYSTEM.changes] ?? '', 'answer-1.json', `${JSON.stringify({ v: 1, id: 'answer-1', device: 'device-1', at: DAY - 1000, kind: 'answer',
          what: 'Answered a question', questionId: question.id, askedAt: question.askedAt, answer: { option: 'home' } })}\n`);
      },
      intent: (ctx) => ({ ...empty, things: shop(ctx, { name: RECEIPT, row: { to: 'Projects/Brand new place' } }) }) });
    expect(errors().join('\n'), 'the refusal was newFolder, on the pile that holds the choice').toContain('newFolder');
    expect(phase(run)).toBe('failed');
    expect(run.code).toBe(1);
    expect(manifestText(run)).toBeUndefined();
    expect(run.outside).toEqual(run.before);
    expect(drops()).toEqual([]);
  });

  it('19 a pile with a stored reask whose thing is refused twice ends the run failed with nothing changed', async () => {
    const run = await tidy({ inbox: photoInbox(PHOTO, RECEIPT), inboxFiles: BYTES, scope: 'all',
      seed: async (drive, ids) => {
        const reask = { id: askId('p-2'), subject: 'p-2', text: 'Where does it go?', yes: 'Yes', no: 'No', askedAt: DAY - 5000 };
        await drive.writeText(ids[SYSTEM.questions] ?? '', JSON.stringify({ v: 1, questions: [],
          rounds: [{ subject: 'p-2', pileId: 'p-2', words: RECEIPT.replace(/\.png$/, ''), count: 1, wordsOnly: true, reask }] }), (await drive.get(ids[SYSTEM.questions] ?? '')).modifiedTime);
      },
      intent: (ctx) => ({ ...empty, things: shop(ctx, { name: RECEIPT, row: { to: 'Projects/Brand new place' } }) }) });
    expect(errors().join('\n')).toContain('newFolder');
    expect(phase(run)).toBe('failed');
    expect(run.code).toBe(1);
    expect(manifestText(run)).toBeUndefined();
    expect(run.outside).toEqual(run.before);
    expect(drops()).toEqual([]);
  });
});
