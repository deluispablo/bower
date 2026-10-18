// Reconstruction: production logs keep only the code (noteLink); target class inferred from linkWhy and the prompt.
/**
 * prod1-mixed-request through production main: a tidy-up with piles and a checklist request lost the request to
 * noteLink twice (qa-prod-1 run1 log lines 5-6, run2 line 5). The document cited a thing the same reply files, which no
 * prompt line told the model it could not (rulings R-cause, R-fix). Harness: the qa-live-claude-f1 and c08-documents stubs.
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, promptOf, runOnDrive, seedCase, systemOf } from './corpus-run';
import { fixedDrive } from './drive-v3';

const CASE = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/prod1-mixed-request/case.json'), 'utf8')) as {
  request: string; folder: string; target: string; drop: string;
  piles: { receipt: { line: string; file: string; bytes: string; filedAs: string }; meeting: { line: string; writtenAs: string } };
  shown: Record<string, string>; unshown: Record<string, string>; document: { title: string; summary: string };
  refusal: { kind: string; before: string; after: string };
};
const DAY = Date.UTC(2026, 9, 17, 9);
const [SHOWN = ''] = Object.keys(CASE.shown);
const [UNSHOWN = ''] = Object.keys(CASE.unshown);
const { folder: HOME, target: TARGET, request: REQUEST } = CASE;
const MEETING = `${HOME}/${CASE.piles.meeting.writtenAs}`;
const NOT_SHOWN = CASE.refusal.before;
const ALSO_WRITES = CASE.refusal.after;
const PROMPT_LINE = 'never a note or thing this reply files or writes';

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
const refusals = () => errors().flatMap((line) => { const m = /was refused \((\w+)\): (.*); asking once more/.exec(line); return m ? [{ kind: m[1] ?? '', why: m[2] ?? '' }] : []; });

type Frame = { requests?: Array<{ requestId: string; text: string }>; piles?: Array<{ pileId: string; things: Array<{ fileId: string; name: string }> }>;
  sources?: Array<{ itemId: string; candidates: Array<{ id: string; path: string }> }> };
type Ctx = { frame: Frame; requestId: string; receipt: string; meeting: string; attempt: number };

/** One tidy-up over the made-up folder: the selection wants the shown note for the request, files each pile to its folder, then the given execution reply. */
async function tidy(o: { piles: boolean; intent: (ctx: Ctx) => unknown }) {
  const { receipt, meeting } = CASE.piles;
  const scope = o.piles ? 'all' : 'instructions';
  const c: LoadedCase = { id: 'prod1-mixed-request', capability: 'C08', title: 'Alex asks for a checklist', covers: 'model', source: 'new', scope,
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], bowerOwned: [],
    journal: [{ kind: 'request', text: REQUEST }], inbox: o.piles ? [{ line: receipt.line, files: [receipt.file] }, { line: meeting.line, files: [] }] : [],
    inboxFiles: o.piles ? { [receipt.file]: receipt.bytes } : {},
    folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...CASE.shown, ...CASE.unshown } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const ids = Object.fromEntries((await drive.listAll(root)).map((f) => [drive.pathOf(f.id, root), f.id]));
  const admission = await planAdmission(fakeRead(drive), root, { scope, clock: () => DAY + 10, newId: () => 'prod1-mixed-request-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const calls: Array<{ phase: string; prompt: string; system: string | null; frame: Frame }> = [];
  const attempts = { selection: 0, execution: 0 };
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as Frame;
    calls.push({ phase, prompt: promptOf(call), system: systemOf(call), frame });
    const requestId = frame.requests?.find((r) => r.text === REQUEST)?.requestId ?? 'missing request';
    if (phase === 'selection') {
      attempts.selection++;      return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: ids[HOME],
        wants: s.itemId === requestId ? s.candidates.filter((x) => x.path === SHOWN).map((x) => x.id) : [] })), asks: [] });
    }
    const piles = frame.piles ?? [];
    return reply(o.intent({ frame, requestId, attempt: attempts.execution++,
      receipt: piles.flatMap((p) => p.things).find((t) => t.name === receipt.file)?.fileId ?? 'missing receipt',
      meeting: piles.find((p) => !p.things.length)?.pileId ?? 'missing meeting pile' }));
  }, () => ({ drive, root, admission: admission.manifest }), true);
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope, requestId: 'prod1-mixed-request-run' }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-prod1' } }, 1);
  return { ...run, calls };
}

const empty = { kind: 'tidy-intent', v: 1, things: [] };
/** The piles as the reply files them: the receipt renamed (with a note of its own, whose body may link), the meeting words written as a note. */
const filing = (ctx: Ctx, receiptNote?: { name: string; summary: string; body: string }) => ({
  things: [{ fileId: ctx.receipt, to: HOME, name: CASE.piles.receipt.filedAs, ...(receiptNote ? { note: receiptNote } : {}) }],
  notes: [{ pileId: ctx.meeting, to: HOME, name: CASE.piles.meeting.writtenAs }],
});
const checklist = (ctx: Ctx, link: string) => ({ requestId: ctx.requestId, to: HOME, title: CASE.document.title, summary: CASE.document.summary,
  body: `- [ ] Pay the council tax second instalment by 15 November, as [[${SHOWN.slice(HOME.length + 1, -3)}]] says.\n- [ ] Settle the bike repair, see [[${link}]] for the receipt.` });
const SHOWN_NAME = SHOWN.slice(HOME.length + 1, -3);
const DOCUMENT = `${HOME}/${CASE.document.title}.md`;
const doneFor = (run: Awaited<ReturnType<typeof tidy>>) => ((JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ text: string; done?: string }> }).done)
  .filter((r) => r.text === REQUEST).map((r) => r.done);
const settled = (run: Awaited<ReturnType<typeof tidy>>) => run.after[`${SYSTEM.archive}/change-1.json`] !== undefined;

describe('prod1-mixed-request', () => {
  it('AC1 mixed_checklist_reproduces_identified_link_failure: a document citing the thing the same reply files is refused with its precise reason', async () => {
    const run = await tidy({ piles: true, intent: (ctx) => ({ ...empty, ...filing(ctx), documents: [checklist(ctx, TARGET)] }) });
    const [selection, execution] = [run.calls.find((c) => c.phase === 'selection'), run.calls.find((c) => c.phase === 'execution')];
    // Selection and shown evidence: the request and both piles were in one run; the existing note was shown, the target never was.
    expect(selection?.frame.requests?.map((r) => r.text)).toEqual([REQUEST]);
    expect(execution?.frame.piles?.length).toBe(2);
    expect(selection?.frame.sources?.find((s) => s.itemId === execution?.frame.requests?.[0]?.requestId)?.candidates.map((x) => x.path)).toEqual([SHOWN]);
    expect(execution?.prompt).toContain('The second instalment is due on 15 November 2026');
    expect(execution?.prompt, 'the note outside the selection is not shown').not.toContain('The membership ended in 2024.');
    expect(execution?.prompt, 'the reply\'s own new name was never shown').not.toContain(TARGET);
    // The exact target and the refusal (red: before the fix, the generic "not shown" reason).
    expect(refusals()[0]).toEqual({ kind: CASE.refusal.kind, why: ALSO_WRITES });
    expect(refusals()[0]?.why).not.toBe(NOT_SHOWN);
  });

  it('AC1 guard: two such replies in a row drop the request with noteLink, as the production log line says; the piles are still filed', async () => {
    const run = await tidy({ piles: true, intent: (ctx) => ({ ...empty, ...filing(ctx), documents: [checklist(ctx, TARGET)] }) });
    expect(errors().filter((l) => / drops a /.test(l)).map((l) => l.slice(l.indexOf('drops a ')))).toEqual([CASE.drop]);
    expect(run.after[DOCUMENT]).toBeUndefined();
    expect(Object.values(run.pathsById)).toContain(`${HOME}/${TARGET}`);
    expect(Object.keys(run.after)).toContain(MEETING);
    expect(settled(run)).toBe(false);
  });

  it('AC2 mixed_checklist_accepts_supported_existing_citations (i): the documents line as sent says a document never links what the reply files or writes', async () => {
    const run = await tidy({ piles: false, intent: (ctx) => ({ ...empty, documents: [checklist(ctx, SHOWN_NAME)] }) });
    const execution = run.calls.find((c) => c.phase === 'execution');
    expect(`${execution?.system ?? ''}\n${execution?.prompt ?? ''}`).toContain(PROMPT_LINE);
  });

  it('AC2 (ii): mixed run, the self-citation is refused with its reason, the retry citing only the shown note writes one document and settles the request', async () => {
    const run = await tidy({ piles: true, intent: (ctx) => ({ ...empty, ...filing(ctx), documents: [checklist(ctx, ctx.attempt ? SHOWN_NAME : TARGET)] }) });
    expect(refusals()).toEqual([{ kind: 'noteLink', why: ALSO_WRITES }]);
    expect(run.after[DOCUMENT]).toContain(`[[${SHOWN_NAME}]]`);
    expect(Object.keys(run.after).filter((p) => p.startsWith(`${HOME}/${CASE.document.title}`))).toEqual([DOCUMENT]);
    expect(doneFor(run)).toEqual([`Done. See [[${CASE.document.title}]].`]);
    expect(settled(run)).toBe(true);
    expect(Object.values(run.pathsById)).toContain(`${HOME}/${TARGET}`);
    expect(Object.keys(run.after)).toContain(MEETING);
  });

  // guard
  it('AC2 (iii): request-only control, the same request with no piles is accepted first time, one document written and settled', async () => {
    const run = await tidy({ piles: false, intent: (ctx) => ({ ...empty, documents: [checklist(ctx, SHOWN_NAME)] }) });
    expect(refusals()).toEqual([]);
    expect(Object.keys(run.after).filter((p) => p.startsWith(`${HOME}/${CASE.document.title}`))).toEqual([DOCUMENT]);
    expect(doneFor(run)).toEqual([`Done. See [[${CASE.document.title}]].`]);
    expect(settled(run)).toBe(true);
  });
});

describe('prod1-mixed-request AC3 invented_and_unshown_citations_still_refuse', () => {
  const cases: Array<[string, string, string, boolean]> = [
    // guard
    ['an invented title', 'Imaginary bill', NOT_SHOWN, false],
    // guard
    ['an existing note that was not shown', UNSHOWN.slice(0, -3), NOT_SHOWN, false],
    // guard
    ['a note this reply authors', CASE.piles.meeting.writtenAs.slice(0, -3), ALSO_WRITES, true],
    ['a thing this reply files', TARGET, ALSO_WRITES, true],
  ];
  it.each(cases)('a document linking %s is refused noteLink with its exact reason', async (_name, link, why, piles) => {
    await tidy({ piles, intent: (ctx) => ({ ...empty, ...(piles ? filing(ctx) : {}), documents: [checklist(ctx, ctx.attempt ? SHOWN_NAME : link)] }) });
    expect(refusals()[0]).toEqual({ kind: 'noteLink', why });
  });

  // guard
  it('in a filing context, a note body linking the thing this reply files is still accepted', async () => {
    const run = await tidy({ piles: true, intent: (ctx) => ({ ...empty,
      ...filing(ctx, { name: 'Bike repair.md', summary: 'Alex had the bike repaired.', body: `The bike was repaired.\n\nSee also [[${TARGET}]]: the receipt for the repair.` }),
      documents: [checklist(ctx, SHOWN_NAME)] }) });
    expect(refusals()).toEqual([]);
    expect(run.after[`${HOME}/Bike repair.md`]).toContain(`[[${TARGET}]]`);
  });

  // guard (round 2, R-fix-b-scope): an answer linking a thing this reply files keeps the "not shown" reason.
  it('an answer linking the thing this reply files is still refused "not shown"', async () => {
    await tidy({ piles: true, intent: (ctx) => ({ ...empty, ...filing(ctx),
      answers: [{ requestId: ctx.requestId, text: ctx.attempt ? `Pay the council tax by 15 November, as [[${SHOWN_NAME}]] says.` : `Settle the bike repair, see [[${TARGET}]] for it.` }] }) });
    expect(refusals()[0]).toEqual({ kind: 'noteLink', why: NOT_SHOWN });
  });
});
