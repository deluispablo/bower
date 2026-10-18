/**
 * qa-live-claude F3 (plan side): a waiting request the person took out is never acted on. The app takes a sent request
 * back with an inverse request line naming it in `undoes` (the one Undo home, journal.ts `retract`; it carries no
 * `text`). A run that takes both shows neither to the model, settles neither in `requests.json`, and archives both; the
 * other requests go on as before. Through production main on the pretend Drive, as c09-answers does. Made-up words only.
 */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const HUNT = 'Projects/Flat hunt';
const LARK = `${HUNT}/Larkspur Lane flat.md`;
const COBBLE = `${HUNT}/Cobble Row flat.md`;
const note = (summary: string, body: string, line: string) => `---\nsummary: ${summary}\nby: bower\n---\n\n${body}\n\n## Timeline\n- ${line}\n`;
const FILES: Record<string, string> = {
  [`${HUNT}/Flat hunt.md`]: note('Alex is comparing flats in Saltmere.', '## Current state\n- Alex has not chosen a flat.', '2026-10-02 · Started the shortlist.'),
  [LARK]: note('The Larkspur Lane flat in Saltmere.', 'Rent: 1,450 a month.\nCommute: 24 min.', '2026-10-03 · Viewed the flat.'),
  [COBBLE]: note('The Cobble Row flat in Saltmere.', 'Rent: 1,580 a month.\nCommute: 18 min.', '2026-10-04 · Booked the viewing.'),
};
const KEPT = 'Which flat has the shorter commute?';
const TAKEN_OUT = 'Which flat is cheaper?';
const TOOK_BACK_WORDS = 'taken back';
const GOOD = '[[Cobble Row flat]] has the shorter commute, 18 min; [[Larkspur Lane flat]] takes 24 min.';

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

type Line = { id: string; at: number; what: string; text?: string; undoes?: string };
const asked = (id: string, at: number, text: string): Line => ({ id, at, what: `Asked Bower: "${text}"`, text });
const takenBack = (id: string, at: number, of: Line | string): Line => ({ id, at, what: `Took back the request "${typeof of === 'string' ? 'an earlier one' : of.text ?? ''}"`, undoes: typeof of === 'string' ? of : of.id });

/** One instructions press through main over these journal lines; the execution answers KEPT when it was shown. */
async function press(lines: Line[]) {
  const c: LoadedCase = { id: 'qa-live-claude-F3', capability: 'C09', title: 'Alex takes a request back', covers: 'model', source: 'new', scope: 'instructions',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...FILES } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  const fileOf: Record<string, string> = {};
  for (const l of lines) {
    const file = await drive.createText(await id(SYSTEM.changes), `${l.id}.json`, JSON.stringify({ v: 1, device: 'device-1', kind: 'request', ...l }));
    fileOf[l.id] = file.id;
  }
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => DAY + 99, newId: () => 'f3-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await id(HUNT);
  const frames: Array<{ phase: string; requests: unknown; json: string }> = [];
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as Record<string, unknown> & { sources?: Array<{ itemId: string; candidates: Array<{ id: string; path: string }> }>; requests?: Array<{ requestId: string; text: string }> };
    frames.push({ phase, requests: frame.requests, json: JSON.stringify(frame) });
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: hunt,
      wants: s.candidates.filter((x) => [LARK, COBBLE].includes(x.path)).map((x) => x.id) })), asks: [] });
    // Every request shown is answered, so one shown and done is told from one never shown.
    const answers = (frame.requests ?? []).map((r) => ({ requestId: r.requestId, text: r.text === KEPT ? GOOD : `Alex asked: ${r.text}` }));
    return reply({ kind: 'tidy-intent', v: 1, things: [], ...(answers.length ? { answers } : {}) });
  }, () => ({ drive, root, admission: admission.manifest }), true);
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: 'f3-run' }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-f3' } }, 1);
  return { run, frames, fileOf };
}
const done = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string; text: string; done?: string }> }).done;
const archived = (run: CaseRun, recordId: string) => Object.entries(run.after).some(([p, text]) =>
  p.startsWith(`${SYSTEM.archive}/`) && p.endsWith(`${recordId}.json`) && (JSON.parse(text) as { id?: string }).id === recordId)
  && !Object.keys(run.after).some((p) => p.startsWith(`${SYSTEM.changes}/`) && !p.startsWith(`${SYSTEM.archive}/`) && p.endsWith(`${recordId}.json`));
const report = (run: CaseRun) => (run.lastRun as { run: { report: { requests?: string[]; leftAsWritten?: unknown[]; yourChanges?: number } } }).run.report;

describe('qa-live-claude F3: a request taken out is never acted on', () => {
  it('F3 plan-withdrawn-not-shown: neither the request taken out nor its inverse line reaches the model, and both are archived with no row', async () => {
    const kept = asked('press-1', DAY, KEPT);
    const out = asked('press-2', DAY + 1, TAKEN_OUT);
    const back = takenBack('press-3', DAY + 2, out);
    const { run, frames, fileOf } = await press([kept, out, back]);
    expect(frames.length).toBeGreaterThan(0);
    // Both calls show only the request still wanted, by its journal file id.
    for (const f of frames) expect(f.requests).toEqual([{ requestId: fileOf[kept.id], text: KEPT }]);
    // Nothing of either line is in any call: not its words, not its file id.
    for (const f of frames) for (const gone of [TAKEN_OUT, TOOK_BACK_WORDS, fileOf[out.id] ?? '', fileOf[back.id] ?? '']) expect(f.json).not.toContain(gone);
    // Positive control: the request kept is answered as before.
    expect(done(run).find((r) => r.id === kept.id)?.done).toContain('[[Cobble Row flat]]');
    expect(done(run).map((r) => r.id)).toEqual([kept.id]);
    expect(archived(run, out.id)).toBe(true);
    expect(archived(run, back.id)).toBe(true);
  });

  it('F3 plan-withdrawn-past-the-cap: a request taken back is taken back even when its inverse line comes after 20 other requests', async () => {
    const out = asked('press-00', DAY, TAKEN_OUT);
    const others = Array.from({ length: 20 }, (_, i) => asked(`press-${String(i + 1).padStart(2, '0')}`, DAY + 1 + i, `Tidy shelf ${i + 1}`));
    const back = takenBack('press-99', DAY + 50, out);
    const { run, frames, fileOf } = await press([out, ...others, back]);
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) for (const gone of [TAKEN_OUT, TOOK_BACK_WORDS, fileOf[out.id] ?? '', fileOf[back.id] ?? '']) expect(f.json).not.toContain(gone);
    expect(done(run).some((r) => r.id === out.id)).toBe(false);
    expect(archived(run, out.id)).toBe(true);
    expect(archived(run, back.id)).toBe(true);
    // The cap applies to the others: the execution frame lists exactly those 20, and all 20 are settled.
    const execution = frames.filter((f) => f.phase !== 'selection');
    expect(execution.length).toBeGreaterThan(0);
    for (const f of execution) expect(((f.requests ?? []) as Array<{ text: string }>).map((r) => r.text).sort()).toEqual(others.map((o) => o.text ?? '').sort());
    expect(done(run).map((r) => r.id).sort(), 'all 20 are settled').toEqual(others.map((o) => o.id).sort());
    for (const o of others) expect(archived(run, o.id), `${o.id} is archived`).toBe(true);
  });

  it('F3P-8 a withdrawal undone past the cap: the cap never changes what was taken back, the restored request stands and is answered', async () => {
    const kept = asked('press-00', DAY, KEPT);
    const others = Array.from({ length: 18 }, (_, i) => asked(`press-${String(i + 1).padStart(2, '0')}`, DAY + 1 + i, `Tidy shelf ${i + 1}`));
    const back = takenBack('press-98', DAY + 50, kept);
    const undo = takenBack('press-99', DAY + 51, back.id);
    const { run, frames } = await press([kept, ...others, back, undo]);
    const execution = frames.filter((f) => f.phase !== 'selection');
    expect(execution.length).toBeGreaterThan(0);
    for (const f of execution) expect(((f.requests ?? []) as Array<{ text: string }>).map((r) => r.text)).toContain(KEPT);
    // Only requests have rows: a withdrawal, standing or undone, has none.
    expect(done(run).map((r) => r.id).sort()).toEqual([kept.id, ...others.map((o) => o.id)].sort());
    expect(done(run).find((r) => r.id === kept.id)?.done).toContain('[[Cobble Row flat]]');
    expect(archived(run, back.id)).toBe(true);
    expect(archived(run, undo.id)).toBe(true);
  });

  it.each([
    ['an unpaired withdrawal', (): Line[] => [takenBack('press-3', DAY + 2, 'earlier-run-request')]],
    ['a request and its withdrawal', (): Line[] => { const out = asked('press-2', DAY + 1, TAKEN_OUT); return [out, takenBack('press-3', DAY + 2, out)]; }],
  ])('F3 plan-withdrawn-only: %s alone makes no model call, is archived and leaves no row or count', async (_name, make) => {
    const lines = make();
    const { run, frames } = await press(lines);
    expect(frames, 'no model call').toEqual([]);
    for (const l of lines) expect(archived(run, l.id)).toBe(true);
    expect(done(run)).toEqual([]);
    expect(report(run).requests ?? []).toEqual([]);
    expect(report(run).leftAsWritten ?? []).toEqual([]);
    expect(report(run).yourChanges ?? 0).toBe(0);
  });
});

// A request held by its open large question (B12d), with the withdrawal the person's other device wrote for it.
const TABLE = { v: 1, rows: [{ id: 'offer', match: ['job offer'], template: 'concept', properties: { review_state: { type: 'enum', values: ['new', 'reviewed'] } }, table: ['review_state'] }] };
const JOBS = 'Projects/Job hunt';
const OLD = `${JOBS}/Oldwick offer.md`;
const ACTIVE = { op: 'eq', property: 'status', value: 'active' };
const REVIEWED = { kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' };
const WORDS = 'Mark every active offer in Job hunt as reviewed; ask me first if there are many.';
const offer = (name: string, created = '2026-10-01') => `---\nby: bower\ntype: offer\nsummary: ${name} offers Alex remote work.\nstatus: active\n`
  + `created: ${created}\nreview_state: new\n---\n\n## Notes\n${name} offers Alex remote work.\n`;
const empty = { kind: 'tidy-intent', v: 1, things: [] };

async function heldFolder() {
  const c: LoadedCase = { id: 'qa-live-claude-F3-plan-held', capability: 'C05', title: 'Alex takes back a held request', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2), [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n',
      'Resources/Gardening/Gardening.md': '---\nby: bower\ntype: moc\nsummary: Gardening notes.\n---\n\n## Notes\nGardening.\n', [OLD]: offer('Oldwick', '2026-09-01') } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  const f = { c, drive, root, id, press: 0 };
  const calls: string[] = [];
  const inputs: string[] = [];
  const press = async (answer?: { id: string; question: Record<string, unknown>; yes: boolean }, warming = false) => {
    f.press++;
    const changes = await id(SYSTEM.changes);
    if (warming) await drive.createText(changes, `warm-${f.press}.json`, JSON.stringify({ v: 1, id: `warm-${f.press}`, device: 'device-1', at: DAY + f.press,
      kind: 'request', what: 'Asked Bower: "Update these notes."', text: 'Update these notes.' }));
    if (answer) await drive.createText(changes, `${answer.id}.json`, JSON.stringify({ v: 1, id: answer.id, device: 'device-1', at: DAY + 10 + f.press,
      kind: 'answer', what: 'Answered a question', questionId: answer.question.id, askedAt: answer.question.askedAt, answer: answer.yes, text: answer.yes ? 'yes' : 'no' }));
    const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => DAY + f.press, newId: () => `f3-held-admission-${f.press}` });
    if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
    const hunt = await id(JOBS);
    calls.length = 0;
    inputs.length = 0;
    const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
      calls.push(phase);
      inputs.push(call.input);
      const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { sources?: Array<{ itemId: string }> };
      if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: hunt, wants: [] })), asks: [] });
      return reply(empty);
    }, () => ({ drive, root, admission: admission.manifest }), true);
    const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
      answerStart: { scope: 'instructions', requestId: `f3-held-run-${f.press}` }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-f3-held' } }, f.press);
    return { run, calls: [...calls], inputs: [...inputs] };
  };
  // Offers read in, so the folder is warm (b12-large-part-settle `grow`).
  const hunt = await id(JOBS);
  for (let i = 1; i <= 200; i++) await drive.createText(hunt, `Offer ${String(i).padStart(3, '0')}.md`, offer(`Offer ${i}`));
  let warm = false;
  for (let runs = 0; runs < 3 && !warm; runs++) warm = (await press(undefined, true)).calls.length > 0;
  if (!warm) throw new Error('The folder was not read within 3 runs.');
  const held = await drive.createText(await id(SYSTEM.changes), 'held-1.json', JSON.stringify({ v: 1, id: 'held-1', device: 'device-1', at: DAY,
    kind: 'request', what: `Asked Bower: "${WORDS}"`, text: WORDS }));
  const back = await drive.createText(await id(SYSTEM.changes), 'back-1.json', JSON.stringify({ v: 1, id: 'back-1', device: 'device-1', at: DAY + 5,
    kind: 'request', what: 'Took back the request', undoes: 'held-1' }));
  const members = await Promise.all(Array.from({ length: 200 }, (_, i) => id(`${JOBS}/Offer ${String(i + 1).padStart(3, '0')}.md`)));
  const q = { id: 'q-request-held-1', text: 'There are 201 active offers. Start with the 200 most recent?', yes: 'Start with these', no: 'Leave them', askedAt: DAY,
    request: { id: 'held-1', title: 'Review offers', set: { type: 'offer', folderId: hunt, recursive: false, where: ACTIVE }, ops: [REVIEWED], members, total: 201 } };
  const body = `${JSON.stringify({ v: 1, questions: [q] }, null, 2)}\n`;
  const there = (await drive.listAll(root)).find((x) => drive.pathOf(x.id, root) === SYSTEM.questions);
  if (there) await drive.writeText(there.id, body, there.modifiedTime);
  else await drive.createText(await id(SYSTEM.dir), 'questions.json', body);
  return { press, q, held, back };
}
const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Array<{ id: string }> }).questions;
const reviewed = (run: CaseRun) => Object.entries(run.after).filter(([path, text]) => path.startsWith(`${JOBS}/`) && text.includes('review_state: reviewed\n')).map(([path]) => path);
const pending = (run: CaseRun, recordId: string) => Object.keys(run.after).some((p) => p.startsWith(`${SYSTEM.changes}/`) && !p.startsWith(`${SYSTEM.archive}/`) && p.endsWith(`${recordId}.json`));

describe('qa-live-claude F3: a request held by its large question and taken back', () => {
  it('F3P-5: neither line is shown, archived or settled; both stay and the question stays open', async () => {
    const f = await heldFolder();
    const { run, inputs } = await f.press();
    for (const words of [WORDS, TOOK_BACK_WORDS, 'Took back', f.held.id, f.back.id]) expect(inputs.join('\n'), `the model never reads ${words}`).not.toContain(words);
    expect(archived(run, 'held-1'), 'the request is not archived').toBe(false);
    expect(archived(run, 'back-1'), 'its withdrawal is not archived').toBe(false);
    expect(pending(run, 'held-1') && pending(run, 'back-1'), 'both stay in the changes').toBe(true);
    expect(reviewed(run), 'nothing is written').toEqual([]);
    expect(done(run).map((r) => r.id), 'no requests row').toEqual([]);
    expect(questions(run).map((x) => x.id), 'the question stays open').toEqual([f.q.id]);
  }, 180_000);

  it('F3P-6: a Yes with the withdrawal there applies no map, settles stale, and both lines are archived', async () => {
    const f = await heldFolder();
    const { run, calls } = await f.press({ id: 'answer-yes', question: f.q, yes: true });
    expect(calls, 'a yes needs no model call').toEqual([]);
    expect(reviewed(run), 'no map is applied: the stored part\'s notes are unchanged').toEqual([]);
    expect(archived(run, 'held-1'), 'the request is archived').toBe(true);
    expect(archived(run, 'back-1'), 'its withdrawal is archived').toBe(true);
    expect(archived(run, 'answer-yes'), 'the Yes settles').toBe(true);
    expect(done(run).map((r) => r.id), 'no requests row').toEqual([]);
  }, 180_000);
});
