import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as noteEdit from '../../src/data/contracts/note-edit';
import { createOwnershipContext } from '../../src/data/contracts/ownership-format';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import type { RunReport, Question } from '../../src/data/contracts/types';
import { ASK_GONE, subjectOf } from '../../src/data/contracts/questions';
import { parseRunCheckpoint, verifyCheckpointChain } from '../../src/data/contracts/run-checkpoint';
import { SYSTEM } from '../../src/data/vault/layout';
import { AT, caseReplies, redispatchCase, runOnDrive, runScripted, runWithClaude, scoreCase, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';
import { RunRecords, RUNS_NAME } from '../../src/data/spine/records';
import * as c05Whys from '../../src/data/spine/scripted';

// Namespace access lets the missing signed copy fail an assertion, rather than module loading or tsc.
const { TOO_OLD_WHY } = c05Whys as typeof c05Whys & { TOO_OLD_WHY?: string };

// Addendum 6's export is supplied by the implementer; absence must be an assertion failure.
const { NOTHING_FOUND_WHY } = c05Whys as typeof c05Whys & { NOTHING_FOUND_WHY?: string };

const PATH = 'Areas/Home/Garden plot.md';
const SOURCE = 'Water butt update.txt';
const NEWS = 'The replacement water butt has arrived.';
const NEW_STATE = 'The replacement water butt has arrived. The committee asks Alex to return the shared water butt.';
const OLD_STATE = 'Alex will keep the shared water butt until the replacement arrives.';
const OTHER = 'Alex grows garlic beside the path.';
const APPENDED = 'One line added to its Timeline, as you asked.';
const NO_TIMELINE = "Bower didn't add the line: this note has no Timeline.";
const OVERFLOW = "Bower didn't update any note: this request names more than three. Ask for three at most at a time.";
const UNREADABLE = "Bower didn't add the line: it can't read this note's Timeline.";
const whyDuplicate = (folder: string) => `In ${folder}. Bower didn't update it: more than one note has this name. Ask again with its folder.`;
type Report = RunReport & { leftAsWritten?: Array<{ name: string; why: string; fileId?: string }> };
interface Context { notes: Array<{ path: string; text: string }>; piles: Array<{ pileId: string; things: Array<{ fileId: string; name: string }> }> }
const reportOf = (r: CaseRun): Report => (r.lastRun as { run?: { report?: Report } } | null)?.run?.report
  ?? { filed: [], created: [], updated: [], setAside: [], questions: [] };
const questionsOf = (r: CaseRun): Question[] => (JSON.parse(r.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
const idOf = (r: CaseRun, path: string): string | undefined => Object.entries(r.pathsById).find(([, p]) => p === path)?.[0];

async function fixture(): Promise<LoadedCase> {
  const c = await loadCase(resolve(import.meta.dirname, '../../harness/corpus/c05-note-not-written-by-bower'));
  delete c.presses;
  c.expected = {};
  return c;
}

function reply(make: (ctx: Context, source: string) => unknown, shown: Context[] = []): ClaudeSpawn {
  return async (call) => {
    const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Context;
    shown.push(ctx);
    const source = ctx.piles.flatMap((p) => p.things).find((t) => t.name === SOURCE)?.fileId ?? 'previously-filed-source';
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false,
      result: JSON.stringify(make(ctx, source)), usage: { input_tokens: 10, output_tokens: 10 } }) };
  };
}
const filing = (source: string) => ({ kind: 'tidy-intent', v: 1,
  things: [{ fileId: source, to: 'Areas/Home', name: SOURCE }] });
const appendReply = (path = PATH, text = NEWS) => reply((_ctx, source) => ({ ...filing(source), lines: [{ note: path, text, cites: source }] }));

// Same real production entry point with an already-owned note proves the fixture, intent and adapter work.
async function positiveControl(): Promise<void> {
  const c = await fixture();
  c.bowerOwned = [PATH];
  c.folder[PATH] = (c.folder[PATH] ?? '').replace('summary:', 'by: bower\nsummary:');
  const r = await runWithClaude(c, appendReply());
  expect(r.code).toBe(0);
  expect(r.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
  expect(reportOf(r).filed).toHaveLength(1);
}

function assertPersonal(r: CaseRun): void {
  expect(r.props[PATH] ?? {}).not.toHaveProperty('by');
  expect(r.props[PATH] ?? {}).not.toHaveProperty('bower_state');
  expect(r.props[PATH] ?? {}).not.toHaveProperty('bowerMd5');
  expect(r.after[PATH]).not.toMatch(/by: bower|bower_state:|<!-- bower:ownership/);
}

describe('C05 person notes through runner main', () => {
  beforeEach(() => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    ['case and punctuation', 'Update (GARDEN PLOT) from this committee letter.', 'Garden plot'],
    ['the article', 'Update the garden plot from this committee letter.', 'Garden plot'],
    ['my article', 'Update my garden plot from this committee letter.', 'Garden plot'],
    ['Unicode NFC', 'Update my Cafe\u0301 plot from this committee letter.', 'Café plot'],
  ])('C05 person notes: title grammar %s shows the named note before hubs', async (_label, words, title) => {
    await positiveControl();
    const c = await fixture();
    const path = `Areas/Home/${title}.md`;
    c.folder[path] = c.folder[PATH] ?? '';
    if (path !== PATH) Reflect.deleteProperty(c.folder, PATH);
    c.inbox[0] = { line: words, files: [SOURCE] };
    c.journal = [{ kind: 'request', text: words }];
    // Fill the existing 12-note cap with hubs: the explicit note has priority over all of them.
    for (let i = 0; i < 12; i++) c.folder[`Projects/Hub ${i}/Hub ${i}.md`] = '---\nby: bower\nsummary: A made-up project.\n---\n\n## Timeline\n';
    const shown: Context[] = [];
    const r = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source), lines: [{ note: path, text: NEWS, cites: source }] }), shown));
    expect.soft(shown[0]?.notes[0]?.path).toBe(path);
    expect(r.after[path]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
  });

  it('C05 person notes: longest whole title wins and source-only or partial mentions grant nothing', async () => {
    await positiveControl();
    const c = await fixture();
    const short = 'Areas/Home/Garden.md';
    const partial = 'Areas/Home/Plot.md';
    c.folder[short] = c.folder[PATH] ?? '';
    c.folder[partial] = c.folder[PATH] ?? '';
    c.folder['Areas/Home/Shed roof.md'] = c.folder[PATH] ?? '';
    c.inboxFiles[SOURCE] += '\nGarden, Shed roof and Plotter are mentioned by this letter, not requested.';
    const shown: Context[] = [];
    const r = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source), lines: [{ note: PATH, text: NEWS, cites: source }] }), shown));
    expect.soft(shown[0]?.notes.map((n) => n.path)).toContain(PATH);
    expect(shown[0]?.notes.map((n) => n.path)).not.toEqual(expect.arrayContaining([short]));
    expect(shown[0]?.notes.map((n) => n.path)).not.toContain(partial);
    expect(shown[0]?.notes.map((n) => n.path)).not.toContain('Areas/Home/Shed roof.md');
    for (const path of [short, partial, 'Areas/Home/Shed roof.md']) expect(r.after[path]).toBe(c.folder[path]);
    const boundary = structuredClone(c);
    const boundaryWords = 'Update the plotter from this committee letter.';
    boundary.inbox[0] = { line: boundaryWords, files: [SOURCE] };
    boundary.journal = [{ kind: 'request', text: boundaryWords }];
    const boundaryShown: Context[] = [];
    const refused = await runWithClaude(boundary, reply((_ctx, source) => filing(source), boundaryShown));
    expect(boundaryShown[0]?.notes.map((n) => n.path)).not.toContain(partial);
    expect(refused.after[partial]).toBe(boundary.folder[partial]);
    expect(r.after[PATH]).toContain(NEWS);
  });

  it.each([2, 3])('C05 person notes: row 6 files the source and lists %i same-title notes by id and folder without asking', async (matches) => {
    await positiveControl();
    const c = await fixture();
    const second = 'Projects/Garden/Garden plot.md';
    const third = 'Resources/Growing/Garden plot.md';
    c.folder[second] = c.folder[PATH] ?? '';
    if (matches === 3) c.folder[third] = c.folder[PATH] ?? '';
    const r = await runWithClaude(c, appendReply());
    expect.soft(reportOf(r).filed).toHaveLength(1);
    expect.soft(reportOf(r).leftAsWritten).toHaveLength(matches);
    expect.soft(reportOf(r).leftAsWritten).toEqual(expect.arrayContaining([
      expect.objectContaining({ why: whyDuplicate('Areas / Home'), fileId: idOf(r, PATH) }),
      expect.objectContaining({ why: whyDuplicate('Projects / Garden'), fileId: idOf(r, second) }),
      ...(matches === 3 ? [expect.objectContaining({ why: whyDuplicate('Resources / Growing'), fileId: idOf(r, third) })] : []),
    ]));
    expect(reportOf(r).questions).toEqual([]);
    expect(questionsOf(r)).toEqual([]);
    expect(reportOf(r).updated).toEqual([]);
    for (const path of [PATH, second, ...(matches === 3 ? [third] : [])]) expect(r.after[path]).toBe(c.folder[path]);
    expect(r.after[`Areas/Home/${SOURCE}`]).toBe(c.inboxFiles[SOURCE]);
  });

  it('C05 person notes: row 7 files the source but four named notes produce one unlinked row and zero updates', async () => {
    await positiveControl();
    const c = await fixture();
    const paths = [PATH, 'Areas/Home/Shed roof.md', 'Areas/Home/Apple tree.md', 'Areas/Home/Pond liner.md'];
    for (const path of paths) c.folder[path] = c.folder[PATH] ?? '';
    const three = structuredClone(c);
    const threeWords = 'Update my Garden plot, Shed roof and Apple tree from this letter.';
    three.inbox[0] = { line: threeWords, files: [SOURCE] }; three.journal = [{ kind: 'request', text: threeWords }];
    const withinLimit = await runWithClaude(three, reply((_ctx, source) => ({ ...filing(source),
      lines: paths.slice(0, 3).map((note) => ({ note, text: NEWS, cites: source })) })));
    for (const path of paths.slice(0, 3)) expect.soft(withinLimit.after[path]).toContain(NEWS);
    expect(withinLimit.after[paths[3] ?? '']).toBe(three.folder[paths[3] ?? '']);
    const words = 'Update my Garden plot, Shed roof, Apple tree and Pond liner from this letter.';
    c.inbox[0] = { line: words, files: [SOURCE] }; c.journal = [{ kind: 'request', text: words }];
    const r = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source), lines: paths.map((note) => ({ note, text: NEWS, cites: source })) })));
    expect.soft(reportOf(r).filed).toHaveLength(1);
    expect.soft(reportOf(r).leftAsWritten).toEqual([expect.objectContaining({ why: OVERFLOW })]);
    expect(reportOf(r).leftAsWritten?.[0] ?? {}).not.toHaveProperty('fileId');
    expect(reportOf(r).updated).toEqual([]);
    for (const path of paths) expect(r.after[path]).toBe(c.folder[path]);
  });

  it.each(['unrelated request id', 'unrelated target id', 'citation not filed in this run'] as const)(
    'C05 person notes: consent refuses %s through main beside a legitimate append', async (attack) => {
      await positiveControl();
      const c = await fixture();
      c.folder['Areas/Home/Unrelated note.md'] = c.folder[PATH] ?? '';
      c.folder['Areas/Home/Older letter.txt'] = c.inboxFiles[SOURCE] ?? '';
      c.journal.push({ kind: 'request', text: 'Keep this letter whole.' });
      const legitimate = await runWithClaude(c, appendReply());
      expect.soft(legitimate.after[PATH]).toContain(NEWS);
      expect(idOf(legitimate, 'Areas/Home/Unrelated note.md')).toBeTruthy();
      expect(idOf(legitimate, 'Areas/Home/Older letter.txt')).toBeTruthy();
      // Fault the runner-created tuple at its real author boundary, rather than granting consent in model JSON.
      // The unchanged real author and manifest guard still validate the proposed write before Drive sees it.
      let corrupted = 0;
      const author = noteEdit.applyChanges;
      const spy = vi.spyOn(noteEdit, 'applyChanges').mockImplementation((bytes, changes, fetched) => {
        const altered = changes.map((change) => {
          if (change.kind !== 'timeline-append' || fetched?.fileId !== idOf(legitimate, PATH)) return change;
          const bound = change as typeof change & { consent?: { requestId: string; targetFileId: string; sourceFileId: string } };
          if (!bound.consent) return change;
          corrupted++;
          const consent = { ...bound.consent };
          if (attack === 'unrelated request id') consent.requestId = 'change-2';
          if (attack === 'unrelated target id') consent.targetFileId = idOf(legitimate, 'Areas/Home/Unrelated note.md') ?? '';
          if (attack === 'citation not filed in this run') consent.sourceFileId = idOf(legitimate, 'Areas/Home/Older letter.txt') ?? '';
          return { ...bound, consent };
        });
        return author(bytes, altered, fetched);
      });
      let attacker: CaseRun;
      try { attacker = await runWithClaude(c, appendReply()); }
      finally { spy.mockRestore(); }
      expect.soft(corrupted).toBeGreaterThan(0);
      expect(attacker.after[PATH]).toBe(c.folder[PATH]);
      expect(reportOf(attacker).updated).toEqual([]);
      assertPersonal(attacker);
    });

  it.each([
    ['row 5 missing Timeline', (text: string) => text.replace(/## Timeline[\s\S]*$/, ''), NO_TIMELINE],
    ['row 8 unparseable Timeline', (text: string) => text.replace('- 2026-09-12 · Planted garlic.', 'September: planted garlic.'), UNREADABLE],
  ])('C05 person notes: %s is byte-identical, linked in leftAsWritten and never counted updated', async (_label, transform, why) => {
    await positiveControl();
    const c = await fixture(); c.folder[PATH] = transform(c.folder[PATH] ?? '');
    const r = await runWithClaude(c, appendReply());
    expect.soft(reportOf(r).filed).toHaveLength(1);
    expect.soft(reportOf(r).leftAsWritten).toEqual([expect.objectContaining({ why, fileId: idOf(r, PATH) })]);
    expect(r.after[PATH]).toBe(c.folder[PATH]);
    expect(reportOf(r).updated).toEqual([]);
    assertPersonal(r);
  });

  it('C05 person notes: corpus first append, protected ranges, state question and later non-adoption score per run', async () => {
    await positiveControl();
    const c = await loadCase(resolve(import.meta.dirname, '../../harness/corpus/c05-note-not-written-by-bower'));
    const r = await runScripted(c);
    expect(r.runs?.[0]?.requests).toEqual([{ id: 'change-1', text: 'Update the garden plot from this committee letter.' }]);
    expect(scoreCase(c, r)).toEqual({ pass: true, unmet: [] });
  });

  it.each([true, false])('C05 person notes: state answer %s changes only the shown bullet or writes nothing and is never re-asked', async (yes) => {
    await positiveControl();
    const c = await fixture();
    c.folder[PATH] = (c.folder[PATH] ?? '').replace(`- ${OLD_STATE}`, `- ${OLD_STATE}\n- ${OTHER}  `);
    const first = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source), lines: [{ note: PATH, text: NEWS, cites: source }],
      states: [{ note: PATH, lines: [NEW_STATE, OTHER], cites: source }] })));
    const question = questionsOf(first).find((q) => subjectOf(q).kind === 'state');
    expect.soft(first.after[PATH]).toContain(NEWS);
    expect.soft(question).toEqual(expect.objectContaining({ text: 'Water butt update also changes the current state of Garden plot. Should Bower write its update there?',
      yes: 'Write it', no: 'Keep mine', shown: expect.objectContaining({ lines: [NEW_STATE, OTHER] }) }));
    // A missing question is an assertion failure above, never a fabricated answer or a driver load error.
    if (!question) return;
    const lifecycle = { ...c, presses: [{ between: [{ kind: 'answer' as const, question: { kind: 'state' as const, note: PATH }, yes }] }, {}, {}] };
    let turn = 0; let cwd = '';
    const spawn: ClaudeSpawn = async (call) => {
      if (cwd !== call.cwd) { cwd = call.cwd; turn++; }
      return reply((_ctx, source) => turn === 1 ? { ...filing(source), lines: [{ note: PATH, text: NEWS, cites: source }],
        states: [{ note: PATH, lines: [NEW_STATE, OTHER], cites: source }] }
        : { kind: 'tidy-intent', v: 1, things: [], states: [{ note: PATH, lines: [NEW_STATE, OTHER] }] })(call);
    };
    const final = await runWithClaude(lifecycle, spawn);
    const runs = [...final.runs ?? [], final];
    const beforeAnswer = runs[0]?.after[PATH] ?? '';
    expect(runs[1]?.after[PATH]).toBe(yes ? beforeAnswer.replace(OLD_STATE, NEW_STATE) : beforeAnswer);
    expect(runs[2]?.after[PATH]).toBe(runs[1]?.after[PATH]);
    expect(final.after[PATH]).toBe(runs[1]?.after[PATH]);
    for (const r of runs.slice(1)) { expect(questionsOf(r)).toHaveLength(0); assertPersonal(r); }
    if (yes) expect(reportOf(runs[1] ?? final).updated).toEqual(expect.arrayContaining([expect.objectContaining({ path: PATH, what: 'Current state updated, as you chose.' })]));
    else expect(reportOf(runs[1] ?? final).updated).toEqual([]);
  });

  it('C05 person notes: state changed before Write it re-asks and preserves the new personal bullet', async () => {
    await positiveControl();
    const c = await fixture();
    const first = await runWithClaude(c, caseReplies('c05-note-not-written-by-bower'));
    const question = questionsOf(first).find((q) => subjectOf(q).kind === 'state');
    expect.soft(question?.yes).toBe('Write it');
    if (!question) return;
    const edited = (first.after[PATH] ?? '').replace(OLD_STATE, 'Alex has already returned the shared water butt.');
    c.presses = [{ between: [{ kind: 'edit', path: PATH, text: edited }, { kind: 'answer', question: { kind: 'state', note: PATH }, yes: true }] }];
    const final = await runWithClaude(c, caseReplies('c05-note-not-written-by-bower'));
    expect(final.after[PATH]).toBe(edited);
    const reask = questionsOf(final);
    expect(reask).toHaveLength(1);
    expect(reask[0]?.id).toBe(question.id);
    expect(reask[0]?.text).toBe('The current state of Garden plot changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?');
    expect(reask[0]).toEqual(expect.objectContaining({ yes: 'Write it', no: 'Keep mine' }));
    expect(subjectOf(reask[0] ?? question)).toEqual(expect.objectContaining({ kind: 'state', id: idOf(final, PATH) }));
    assertPersonal(final);
  });

  it('C05 person notes: append clash retries on the next main call with the fresh personal text and original citation', async () => {
    await positiveControl();
    const c = await fixture();
    let noteId = ''; let changed = false;
    let driveRef: CaseRun['drive'] | undefined;
    const r = await runScripted(c, (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const response = await fetch(input, init);
      const body = init?.body ? await new Response(init.body).text() : '';
      if (!changed && init?.method === 'POST' && url.pathname === '/upload/drive/v3/files' && body.includes('run-manifest')) {
        changed = true;
        // The persisted plan already holds the old bytes; the final fence must see this edit.
        const file = await driveRef?.get(noteId);
        if (file && driveRef) await driveRef.writeText(noteId, (c.folder[PATH] ?? '').replace('## My words\n', '## My words\nAlex added a personal reminder.\n'), file.modifiedTime);
      }
      return response;
    }, false, async (drive, root) => {
      driveRef = drive;
      noteId = (await drive.listAll(root)).find((f) => f.name === 'Garden plot.md')?.id ?? '';
    });
    expect.soft(changed).toBe(true);
    expect.soft(reportOf(r).updated).toEqual([]);
    expect(questionsOf(r)).toEqual([]);
    const next = await runOnDrive(c, r.drive, r.root, { claude: reply(() => ({ kind: 'tidy-intent', v: 1, things: [],
      lines: [{ note: PATH, text: NEWS, cites: idOf(r, `Areas/Home/${SOURCE}`) }] })) }, 2);
    expect(next.after[PATH]).toContain('Alex added a personal reminder.');
    expect(next.after[PATH]?.split(` · ${NEWS}`).length).toBe(2);
    expect(next.after[PATH]).toContain(` · [[${SOURCE}]]`);
    const fresh = (c.folder[PATH] ?? '').replace('## My words\n', '## My words\nAlex added a personal reminder.\n');
    expect(next.after[PATH]).toBe(fresh.replace('- 2026-10-07 · The committee will replace the shared water butt.',
      `- 2026-10-07 · The committee will replace the shared water butt.\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]`));
    expect(reportOf(next).updated).toEqual(expect.arrayContaining([expect.objectContaining({ path: PATH, what: APPENDED })]));
    assertPersonal(next);
  });

  it('C05 person notes: landed append with lost answer and failed read-back resumes exactly once', async () => {
    await positiveControl();
    const c = await fixture();
    const drive = fixedDrive();
    const root = await seedCase(drive, c);
    const noteId = (await drive.listAll(root)).find((f) => f.name === 'Garden plot.md')?.id ?? '';
    let landed = 0; let readsFailed = 0; let modelCalls = 0;
    const planner = appendReply();
    const claude: ClaudeSpawn = async (call) => { modelCalls++; return planner(call); };
    const first = await runOnDrive(c, drive, root, { claude, around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method ?? 'GET';
      if (landed && method === 'GET' && url.pathname.endsWith(`/${noteId}`)) {
        readsFailed++;
        return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up read-back refusal.' } }), { status: 403 });
      }
      const response = await fetch(input, init);
      if (!landed && method === 'PATCH' && url.pathname === `/upload/drive/v3/files/${noteId}` && response.ok) {
        landed++;
        throw new TypeError('Made-up lost answer after the append landed.');
      }
      return response;
    } }, 1);
    expect.soft(landed).toBe(1);
    expect.soft(readsFailed).toBeGreaterThan(0);
    expect.soft(first.after[PATH]).toContain(NEWS);
    const callsAtLoss = modelCalls;
    // Same run id: this is a resume of its persisted checkpoint, not a fresh tidy-up.
    const resumed = await runOnDrive(c, drive, root, { claude }, 1);
    expect.soft(modelCalls).toBe(callsAtLoss);
    expect.soft(resumed.after[PATH]).toBe(first.after[PATH]);
    // Repeat same-run recovery with new model wording: the persisted append is never planned again.
    const replay = await runOnDrive(c, drive, root, {
      claude: reply(() => ({ kind: 'tidy-intent', v: 1, things: [], lines: [{ note: PATH,
        text: 'The new water butt is here now.', cites: idOf(resumed, `Areas/Home/${SOURCE}`) }] })) }, 1);
    expect.soft(replay.after[PATH]?.split(` · ${NEWS}`).length).toBe(2);
    expect(replay.after[PATH]).not.toContain('The new water butt is here now.');
    expect(replay.after[PATH]).toBe(resumed.after[PATH]);
    assertPersonal(replay);
  });

  it('C05 person notes: fix 1 finding 1: overflow blocks owned and personal note writes', async () => {
    await positiveControl();
    const c = await fixture();
    const paths = [PATH, 'Areas/Home/Shed roof.md', 'Areas/Home/Apple tree.md', 'Areas/Home/Pond liner.md'];
    for (const path of paths) c.folder[path] = c.folder[PATH] ?? '';
    const owned = paths[1] ?? '';
    c.bowerOwned = [owned]; c.folder[owned] = (c.folder[owned] ?? '').replace('summary:', 'by: bower\nsummary:');
    const within = structuredClone(c);
    const words = 'Update Garden plot, Shed roof and Apple tree from this letter.';
    within.journal = [{ kind: 'request', text: words }];
    const control = await runWithClaude(within, reply((_ctx, source) => ({ ...filing(source),
      lines: paths.slice(0, 3).map((note) => ({ note, text: NEWS, cites: source })) })));
    for (const path of paths.slice(0, 3)) expect(control.after[path]).toContain(NEWS);
    c.journal = [{ kind: 'request', text: 'Update Garden plot, Shed roof, Apple tree and Pond liner from this letter.' }];
    const r = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source),
      lines: paths.map((note) => ({ note, text: NEWS, cites: source })) })));
    expect(reportOf(r).filed).toHaveLength(1);
    expect(reportOf(r).leftAsWritten).toEqual([expect.objectContaining({ why: OVERFLOW })]);
    expect.soft(reportOf(r).updated).toEqual([]);
    for (const path of paths) expect.soft(r.after[path]).toBe(c.folder[path]);
  });

  it('C05 person notes: fix 1 finding 2: a conflicted append retries its filed source within twenty retained runs', async () => {
    await positiveControl();
    const c = await fixture();
    const drive = fixedDrive(); const root = await seedCase(drive, c);
    const noteId = (await drive.listAll(root)).find((f) => f.name === 'Garden plot.md')?.id ?? '';
    let clashes = 0;
    const around: NonNullable<Parameters<typeof runOnDrive>[3]['around']> = (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const response = await fetch(input, init);
      const body = init?.body ? await new Response(init.body).text() : '';
      if (init?.method === 'POST' && url.pathname === '/upload/drive/v3/files' && body.includes('run-manifest')) {
        const file = await drive.get(noteId);
        const text = await drive.readText(noteId);
        await drive.writeText(noteId, text.replace('## My words\n', `## My words\nAlex reminder ${++clashes}.\n`), file.modifiedTime);
      }
      return response;
    };
    let r = await runOnDrive(c, drive, root, { claude: appendReply(), around }, 1);
    drive.setTimes(idOf(r, `${SYSTEM.dir}/${RUNS_NAME}/abc123-run1`) ?? '', AT, AT);
    const source = idOf(r, `Areas/Home/${SOURCE}`);
    expect(source).toBeTruthy(); expect(clashes).toBe(1);
    const retry = reply(() => ({ kind: 'tidy-intent', v: 1, things: [], lines: [{ note: PATH, text: NEWS, cites: source }] }));
    r = await runOnDrive(c, drive, root, { claude: retry, around }, 2);
    drive.setTimes(idOf(r, `${SYSTEM.dir}/${RUNS_NAME}/abc123-run1-2`) ?? '', AT + 1, AT + 1);
    // Positive retry control: the next manifest really carries the same binding and captured place.
    const retryManifest = Object.entries(r.after).find(([path]) => path.includes('/abc123-run1-2/manifest-'));
    expect(retryManifest?.[1]).toContain('"sourceFileId":"' + source + '"');
    expect(clashes).toBe(2);
    for (let press = 3; press <= 19; press++) {
      r = await runOnDrive(c, drive, root, { claude: retry, around }, press);
      drive.setTimes(idOf(r, `${SYSTEM.dir}/${RUNS_NAME}/abc123-run1-${press}`) ?? '', AT + press - 1, AT + press - 1);
    }
    expect(clashes).toBe(19);
    expect(Object.keys(r.after).some((path) => path.includes('/abc123-run1/manifest-'))).toBe(true);
    const fresh = r.after[PATH] ?? '';
    const final = await runOnDrive(c, drive, root, { claude: retry }, 20);
    expect(final.after[PATH]).toBe(fresh.replace('- 2026-10-07 · The committee will replace the shared water butt.',
      `- 2026-10-07 · The committee will replace the shared water butt.\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]`));
    expect(reportOf(final).updated).toEqual(expect.arrayContaining([expect.objectContaining({ path: PATH, what: APPENDED })]));
    assertPersonal(final);
    const replay = await runOnDrive(c, drive, root, { request: { kind: 'tidy', text: 'Update Garden plot.' }, claude: retry }, 21);
    expect(replay.after[PATH]).toBe(final.after[PATH]);
    const found = await new RunRecords(drive, root).found('abc123-run1-21');
    expect(found.kind).toBe('run');
    if (found.kind !== 'run') return;
    expect(found.manifest).not.toHaveProperty('appendEvidence');
    expect(found.manifest.completedAppends ?? []).toEqual([]);
  }, 30_000);

  it('C05 person notes: fix 1 finding 3: article-equivalent titles stay ambiguous in context and writes', async () => {
    await positiveControl();
    const c = await fixture(); const second = 'Projects/Garden/The Garden plot.md';
    c.folder[second] = c.folder[PATH] ?? '';
    const shown: Context[] = [];
    const r = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source),
      lines: [PATH, second].map((note) => ({ note, text: NEWS, cites: source })) }), shown));
    expect(reportOf(r).filed).toHaveLength(1);
    expect.soft(shown[0]?.notes.map((n) => n.path)).not.toContain(PATH);
    expect.soft(shown[0]?.notes.map((n) => n.path)).not.toContain(second);
    expect.soft(reportOf(r).leftAsWritten).toEqual(expect.arrayContaining([
      expect.objectContaining({ fileId: idOf(r, PATH), why: whyDuplicate('Areas / Home') }),
      expect.objectContaining({ fileId: idOf(r, second), why: whyDuplicate('Projects / Garden') }),
    ]));
    for (const path of [PATH, second]) expect.soft(r.after[path]).toBe(c.folder[path]);
    expect(reportOf(r).updated).toEqual([]); expect(questionsOf(r)).toEqual([]);
  });

  async function addNextSource(r: CaseRun, withRequest: boolean): Promise<string> {
    const inboxId = idOf(r, 'Inbox') ?? '';
    const source = await r.drive.createText(inboxId, 'Next water butt update.txt', 'Alex received the next committee letter.', { pile: 'next-pile' });
    if (withRequest) await r.drive.createText(idOf(r, SYSTEM.changes) ?? '', 'change-2.json', JSON.stringify({
      v: 1, id: 'change-2', device: 'device-1', at: Date.UTC(2026, 9, 7, 10), kind: 'request',
      what: 'Asked Bower to update Garden plot', text: 'Update Garden plot from the next committee letter.' }));
    return source.id;
  }
  const nextReply = (source: string, text: string) => reply(() => ({ kind: 'tidy-intent', v: 1,
    things: [{ fileId: source, to: 'Areas/Home', name: 'Next water butt update.txt' }], lines: [{ note: PATH, text, cites: source }] }));

  // Keep the original request pending after completion; never copy an archive back to the inbox.
  async function completedAwaitingArchive(c: LoadedCase, drive: CaseRun['drive'], root: string): Promise<CaseRun> {
    let interrupted = 0;
    const first = await runOnDrive(c, drive, root, { claude: appendReply(), around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const parent = url.searchParams.get('addParents');
      if (init?.method === 'PATCH' && parent && (await drive.get(parent)).name === 'archive') {
        interrupted++;
        throw new TypeError('Made-up interruption before the request archive landed.');
      }
      return fetch(input, init);
    } }, 1);
    expect(interrupted).toBe(1);
    expect(first.after[`${SYSTEM.changes}/pending/abc123-run1/change-1.json`]).toBeDefined();
    expect(first.after[`${SYSTEM.archive}/change-1.json`]).toBeUndefined();
    return first;
  }

  it('C05 person notes: fix 1 finding 4: a completed replay cannot consume the new request for the same note', async () => {
    await positiveControl();
    const c = await fixture(); const drive = fixedDrive(); const root = await seedCase(drive, c);
    const first = await completedAwaitingArchive(c, drive, root);
    expect(first.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
    const source = await addNextSource(first, true);
    const text = 'Alex has received the new instructions.';
    const r = await runOnDrive(c, drive, root, { request: { kind: 'tidy', text: 'Update these notes.' }, claude: nextReply(source, text) }, 2);
    expect(r.requests?.map((q) => q.id)).toContain('change-2');
    expect(r.requestAction).toEqual({ kind: 'tidy', id: 'press-2' });
    expect(reportOf(r).filed).toHaveLength(1);
    expect(r.after[PATH]).toContain(` · ${text} · [[Next water butt update.txt]]`);
    expect(r.after[PATH]?.split(` · ${NEWS}`).length).toBe(2);
    const found = await new RunRecords(drive, root).found('abc123-run1-2');
    expect(found.kind).toBe('run');
    if (found.kind !== 'run') return;
    expect(found.chain.at(-1)?.appendBindings?.map((b) => b.requestId)).toEqual(['change-2']);
    expect(found.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-2', targetFileId: idOf(r, PATH) }]);
    expect(found.manifest).not.toHaveProperty('appendEvidence');
    assertPersonal(r);
  });

  it('C05 person notes: fix 1 finding 5: an already-present bound append completes the request before replay', async () => {
    await positiveControl();
    const c = await fixture();
    c.folder[PATH] = (c.folder[PATH] ?? '').trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]\n`;
    const drive = fixedDrive(); const root = await seedCase(drive, c);
    const first = await runOnDrive(c, drive, root, { claude: appendReply() }, 1);
    expect(first.after[PATH]).toBe(c.folder[PATH]);
    expect(reportOf(first).filed).toHaveLength(1); expect(reportOf(first).updated).toEqual([]);
    const completed = await new RunRecords(drive, root).found('abc123-run1');
    expect(completed.kind).toBe('run');
    if (completed.kind !== 'run') return;
    expect(completed.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: idOf(first, PATH) }]);
    const source = await addNextSource(first, false);
    const r = await redispatchCase(c, first, 2, {
      claude: nextReply(source, 'The same requested update has different wording now.') });
    expect(r.code).toBe(0);
    expect(r.dispatch?.runId).toBe(first.dispatch?.runId);
    expect(await new RunRecords(drive, root).found('abc123-run1')).toEqual(completed);
    expect(reportOf(r).filed).toHaveLength(1);
    expect(r.after[PATH]).toBe(first.after[PATH]);
    expect(reportOf(r).updated).toEqual([]); assertPersonal(r);
  });

  it('C05 person notes: fix 1 finding 8: an unrelated filing failure preserves the filed source refusal row', async () => {
    await positiveControl();
    const c = await fixture(); c.folder[PATH] = (c.folder[PATH] ?? '').replace(/## Timeline[\s\S]*$/, '');
    const control = await runWithClaude(c, appendReply());
    expect(reportOf(control).leftAsWritten).toEqual([expect.objectContaining({ why: NO_TIMELINE, fileId: idOf(control, PATH) })]);
    const unrelated = 'Unrelated letter.txt';
    c.inbox.push({ line: '', files: [unrelated] }); c.inboxFiles[unrelated] = 'Alex received an unrelated letter.';
    const drive = fixedDrive(); const root = await seedCase(drive, c);
    const unrelatedId = (await drive.listAll(root)).find((f) => f.name === unrelated)?.id ?? '';
    let refused = 0;
    const r = await runOnDrive(c, drive, root, { claude: reply((_ctx, source) => ({ kind: 'tidy-intent', v: 1,
      things: [{ fileId: source, to: 'Areas/Home', name: SOURCE }, { fileId: unrelatedId, to: 'Areas/Home', name: unrelated,
        note: { name: 'Unrelated letter.md', summary: 'Alex received an unrelated letter.', body: 'Alex received an unrelated letter.' } }],
      lines: [{ note: PATH, text: NEWS, cites: source }] })), around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const response = await fetch(input, init);
      const body = init?.body ? await new Response(init.body).text() : '';
      if (!refused && init?.method === 'POST' && url.pathname === '/upload/drive/v3/files' && body.includes('run-manifest')) {
        refused++;
        // B's move must fail its real name/place fence; A's independently succeeds.
        await drive.update(unrelatedId, { name: 'Unrelated letter, mine.txt' });
      }
      return response;
    } }, 1);
    expect(refused).toBeGreaterThan(0); expect(reportOf(r).filed).toHaveLength(1);
    expect(r.after[`Areas/Home/${SOURCE}`]).toBe(c.inboxFiles[SOURCE]);
    expect(r.after[PATH]).toBe(c.folder[PATH]); expect(reportOf(r).updated).toEqual([]);
    expect(reportOf(r).leftAsWritten).toEqual([expect.objectContaining({ why: NO_TIMELINE, fileId: idOf(r, PATH) })]);
  });

  it('C05 person notes: round 3 2: only the oldest unfinished request settles for one note', async () => {
    await positiveControl();
    const c = await fixture();
    c.journal.push({ kind: 'request', text: 'Update Garden plot from the next committee letter.' });
    const drive = fixedDrive(); const root = await seedCase(drive, c);
    const files = await drive.listAll(root);
    const younger = files.find((f) => f.name === 'change-2.json');
    expect(younger).toBeDefined();
    if (!younger) return;
    const before = await drive.readText(younger.id);
    const seen = await drive.get(younger.id);
    const r = await runOnDrive(c, drive, root, { claude: appendReply() }, 1);
    expect(r.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
    const found = await new RunRecords(drive, root).found('abc123-run1');
    expect(found.kind).toBe('run');
    if (found.kind !== 'run') return;
    expect(found.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: idOf(r, PATH) }]);
    expect.soft(r.after[`${SYSTEM.changes}/change-2.json`]).toBe(before);
    expect.soft(await drive.get(younger.id)).toEqual(seen);
    expect(found.manifest.capture.journal.map((j) => j.recordId)).not.toContain('change-2');
    expect(found.manifest.operations.some((o) => o.effect.kind === 'move' && o.effect.before.fileId === younger.id)).toBe(false);
    const source = await addNextSource(r, false);
    const next = await runOnDrive(c, drive, root, { claude: nextReply(source, 'Alex received the second update.') }, 2);
    expect(next.after[PATH]).toContain(' · Alex received the second update. · [[Next water butt update.txt]]');
    expect(next.after[PATH]?.split(` · ${NEWS}`).length).toBe(2);
    assertPersonal(next);
  });

  it.each(['ambiguity', 'overflow', 'missing Timeline', 'unreadable Timeline'] as const)(
    'C05 person notes: round 3 1: %s settles and reports without a model line', async (reason) => {
      await positiveControl();
      const c = await fixture();
      const paths = [PATH];
      let rows = [expect.objectContaining({ fileId: expect.any(String), why: NO_TIMELINE })];
      if (reason === 'ambiguity') {
        paths.push('Projects/Garden/Garden plot.md');
        c.folder[paths[1] ?? ''] = c.folder[PATH] ?? '';
        rows = paths.map((path) => expect.objectContaining({ fileId: expect.any(String),
          why: whyDuplicate(path.startsWith('Projects/') ? 'Projects / Garden' : 'Areas / Home') }));
      } else if (reason === 'overflow') {
        paths.push('Areas/Home/Shed roof.md', 'Areas/Home/Apple tree.md', 'Areas/Home/Pond liner.md');
        for (const path of paths.slice(1)) c.folder[path] = c.folder[PATH] ?? '';
        c.journal = [{ kind: 'request', text: 'Update Garden plot, Shed roof, Apple tree and Pond liner from this letter.' }];
        rows = [expect.objectContaining({ why: OVERFLOW })];
      } else if (reason === 'missing Timeline') c.folder[PATH] = (c.folder[PATH] ?? '').replace(/## Timeline[\s\S]*$/, '');
      else {
        c.folder[PATH] = (c.folder[PATH] ?? '').replace('- 2026-09-12 · Planted garlic.', 'September: planted garlic.');
        rows = [expect.objectContaining({ fileId: expect.any(String), why: UNREADABLE })];
      }
      const r = await runWithClaude(c, reply((_ctx, source) => ({ kind: 'tidy-intent', v: 1,
        things: [{ fileId: source, to: 'Areas/Home', name: SOURCE, note: { name: 'Committee letter.md',
          summary: 'Alex received a committee letter.', body: NEWS } }] })));
      expect(r.code).toBe(0);
      expect(reportOf(r).filed).toHaveLength(1);
      expect.soft(reportOf(r).leftAsWritten).toEqual(rows);
      expect(reportOf(r).updated).toEqual([]); expect(questionsOf(r)).toEqual([]);
      for (const path of paths) expect(r.after[path]).toBe(c.folder[path]);
      expect(r.after[`Areas/Home/${SOURCE}`]).toBe(c.inboxFiles[SOURCE]);
      const found = await new RunRecords(r.drive, r.root).found('abc123-run1');
      expect(found.kind).toBe('run');
      if (found.kind !== 'run') return;
      const sourceId = idOf(r, `Areas/Home/${SOURCE}`);
      const sourceMove = found.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === sourceId);
      expect(sourceMove).toBeDefined();
      const requestFiles = found.manifest.capture.journal.find((j) => j.recordId === 'change-1')?.fileIds ?? [];
      const archive = found.manifest.operations.find((o) => o.effect.kind === 'move' && requestFiles.includes(o.effect.before.fileId));
      expect.soft(archive).toBeDefined();
      expect.soft(archive?.dependsOn ?? []).toContain(sourceMove?.operationId);
      expect(found.chain.at(-1)?.completedAppends ?? []).toEqual([]);
      for (const row of reportOf(r).leftAsWritten ?? []) {
        if (reason === 'overflow') expect(row).not.toHaveProperty('fileId');
        else expect(paths.map((path) => idOf(r, path))).toContain(row.fileId);
      }
    });

  it.each(['overflow', 'ambiguity'] as const)(
    'C05 person notes: round 3 3: %s refuses its source on an unnamed owned hub', async (reason) => {
      await positiveControl();
      const c = await fixture(); const hub = 'Areas/Home/Home.md';
      c.folder[hub] = (c.folder[PATH] ?? '').replace('summary:', 'by: bower\nsummary:'); c.bowerOwned = [hub];
      const control = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source),
        lines: [PATH, hub].map((note) => ({ note, text: NEWS, cites: source })) })));
      expect(control.after[hub]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
      const paths = reason === 'overflow' ? [PATH, 'Areas/Home/Shed roof.md', 'Areas/Home/Apple tree.md', 'Areas/Home/Pond liner.md']
        : [PATH, 'Projects/Garden/Garden plot.md', 'Areas/Home/Shed roof.md'];
      for (const path of paths.slice(1)) c.folder[path] = c.folder[PATH] ?? '';
      c.journal = [{ kind: 'request', text: reason === 'overflow'
        ? 'Update Garden plot, Shed roof, Apple tree and Pond liner from this letter.'
        : 'Update Garden plot and Shed roof from this letter.' }];
      const r = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source),
        lines: [...paths, hub].map((note) => ({ note, text: NEWS, cites: source })),
        states: [{ note: hub, lines: [NEW_STATE], cites: source }] })));
      expect(r.code).toBe(0); expect(reportOf(r).filed).toHaveLength(1);
      expect.soft(r.after[hub]).toBe(c.folder[hub]);
      for (const path of paths) expect(r.after[path]).toBe(c.folder[path]);
      expect.soft(reportOf(r).updated).toEqual([]); expect.soft(questionsOf(r)).toEqual([]);
      const found = await new RunRecords(r.drive, r.root).found('abc123-run1');
      expect(found.kind).toBe('run');
      if (found.kind !== 'run') return;
      expect(found.manifest.operations.filter((o) => o.effect.kind === 'edit-text')).toEqual([]);
    });

  it.each(['invalid bullet count', 'plain note'] as const)(
    'C05 person notes: round 3 5: %s state proposal leaves the valid append independent', async (shape) => {
      await positiveControl();
      const c = await fixture();
      const control = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source),
        lines: [{ note: PATH, text: NEWS, cites: source }], states: [{ note: PATH, lines: [NEW_STATE], cites: source }] })));
      expect(control.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
      expect(questionsOf(control)).toHaveLength(1);
      if (shape === 'plain note') c.folder[PATH] = (c.folder[PATH] ?? '').slice((c.folder[PATH] ?? '').indexOf('## Current state'));
      const before = c.folder[PATH] ?? '';
      const r = await runWithClaude(c, reply((_ctx, source) => ({ ...filing(source),
        lines: [{ note: PATH, text: NEWS, cites: source }],
        states: [{ note: PATH, lines: shape === 'plain note' ? [NEW_STATE] : [NEW_STATE, OTHER], cites: source }] })));
      expect(r.code).toBe(0); expect(reportOf(r).filed).toHaveLength(1);
      expect.soft(r.after[PATH]).toBe(before.replace('- 2026-10-07 · The committee will replace the shared water butt.',
        `- 2026-10-07 · The committee will replace the shared water butt.\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]`));
      expect(questionsOf(r)).toEqual([]);
      expect(reportOf(r).updated).toEqual([expect.objectContaining({ path: PATH, what: APPENDED })]);
      const found = await new RunRecords(r.drive, r.root).found('abc123-run1');
      expect(found.kind).toBe('run');
      if (found.kind === 'run') expect(found.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: idOf(r, PATH) }]);
      assertPersonal(r);
    });

  it('C05 person notes: round 3 6: retry cites the bound source id after its rename', async () => {
    await positiveControl();
    const c = await fixture(); const drive = fixedDrive(); const root = await seedCase(drive, c);
    const noteId = (await drive.listAll(root)).find((f) => f.name === 'Garden plot.md')?.id ?? '';
    let clashes = 0;
    const first = await runOnDrive(c, drive, root, { claude: appendReply(), around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const response = await fetch(input, init);
      const body = init?.body ? await new Response(init.body).text() : '';
      if (!clashes && init?.method === 'POST' && url.pathname === '/upload/drive/v3/files' && body.includes('run-manifest')) {
        clashes++;
        const file = await drive.get(noteId);
        await drive.writeText(noteId, (c.folder[PATH] ?? '').replace('## My words\n', '## My words\nAlex added a reminder.\n'), file.modifiedTime);
      }
      return response;
    } }, 1);
    expect(clashes).toBe(1); expect(reportOf(first).updated).toEqual([]);
    const sourceId = idOf(first, `Areas/Home/${SOURCE}`) ?? '';
    expect(sourceId).toBeTruthy();
    await drive.update(sourceId, { name: 'Renamed letter.txt' });
    // No model line: the persisted retry binding must resolve the citation from this exact id.
    const next = await runOnDrive(c, drive, root, { claude: reply(() => ({ kind: 'tidy-intent', v: 1, things: [] })) }, 2);
    expect(next.code).toBe(0);
    expect(next.after[PATH]).toContain('Alex added a reminder.');
    expect(next.after[PATH]?.split(` · ${NEWS}`).length).toBe(2);
    expect.soft(next.after[PATH]).toContain(` · ${NEWS} · [[Renamed letter.txt]]`);
    expect(next.after[PATH]).not.toContain(` · ${NEWS} · [[${SOURCE}]]`);
    expect(idOf(next, 'Areas/Home/Renamed letter.txt')).toBe(sourceId);
    assertPersonal(next);
  });

  it('C05 person notes: round 3 6: satisfaction follows final citation naming on a filing collision', async () => {
    await positiveControl();
    const c = await fixture();
    c.folder[PATH] = (c.folder[PATH] ?? '').trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]\n`;
    const control = await runWithClaude(c, appendReply());
    expect(control.code).toBe(0); expect(control.after[PATH]).toBe(c.folder[PATH]);
    expect(reportOf(control).updated).toEqual([]); expect(reportOf(control).filed).toHaveLength(1);
    c.folder[`Areas/Home/${SOURCE}`] = 'Alex received an older, different letter.';
    const r = await runWithClaude(c, appendReply());
    expect.soft(r.code).toBe(0);
    expect.soft(reportOf(r).filed).toHaveLength(1);
    expect(r.after[`Areas/Home/${SOURCE}`]).toBe(c.folder[`Areas/Home/${SOURCE}`]);
    const newSource = Object.entries(r.after).find(([path, text]) => path.startsWith('Areas/Home/') && text === c.inboxFiles[SOURCE]);
    expect.soft(newSource).toBeDefined();
    if (!newSource) return;
    const name = newSource[0].split('/').at(-1);
    expect(name).not.toBe(SOURCE);
    expect(r.after[PATH]).toBe((c.folder[PATH] ?? '').trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[${name}]]\n`);
    const found = await new RunRecords(r.drive, r.root).found('abc123-run1');
    expect(found.kind).toBe('run');
    if (found.kind === 'run') expect(found.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: idOf(r, PATH) }]);
    const replay = await redispatchCase(c, r, 2, {
      claude: reply(() => ({ kind: 'tidy-intent', v: 1, things: [], lines: [{ note: PATH, text: 'Different replay wording.', cites: idOf(r, newSource[0]) }] })) });
    expect(replay.after[PATH]).toBe(r.after[PATH]); assertPersonal(replay);
  });

  // Inspect the stored production chain, including the originating-manifest checks in RunRecords.walk.
  async function round4Records(r: CaseRun, runId: string) {
    const found = await new RunRecords(r.drive, r.root).found(runId);
    expect(found.kind).toBe('run');
    if (found.kind !== 'run') throw new Error('The control must have a verified production run.');
    for (const checkpoint of found.chain) {
      const parsed = await parseRunCheckpoint(new TextEncoder().encode(JSON.stringify(checkpoint)), {
        rootId: r.root, runId, captureId: found.manifest.captureId, manifestHash: found.manifestHash,
        operationIds: found.manifest.operations.map((o) => o.operationId),
      });
      expect(parsed.ok).toBe(true);
    }
    expect((await verifyCheckpointChain(found.chain)).ok).toBe(true);
    return found;
  }

  const round4File = (fileId: string, name: string, body = 'Alex received the next committee letter.') => ({
    fileId, to: 'Areas/Home', name, note: { name: name.replace(/\.txt$/, '.md'), summary: body, body },
  });

  function requestArchive(r: CaseRun, stored: Awaited<ReturnType<typeof round4Records>>, requestId: string) {
    const operations = stored.manifest.operations;
    const destination = (target: { fileId: string } | { createdBy: string }): string | undefined => {
      if ('fileId' in target) return r.pathsById[target.fileId];
      const made = operations.find((o) => o.operationId === target.createdBy);
      if (made?.effect.kind !== 'create-folder') return undefined;
      const parent = destination(made.effect.parent);
      return parent ? `${parent}/${made.effect.name}` : undefined;
    };
    const pending = operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === requestId
      && destination(o.effect.parent) === `${SYSTEM.changes}/pending/abc123-run1`);
    const archive = operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === requestId
      && destination(o.effect.parent) === SYSTEM.archive);
    expect(pending, 'the request first moves to its originating pending folder').toBeDefined();
    expect(archive, 'the archive is selected by its destination').toBeDefined();
    if (!archive || !pending) throw new Error('pending and archive moves are both required');
    expect(operations.indexOf(archive)).toBeGreaterThan(operations.indexOf(pending));
    return archive;
  }

  it('C05 person notes: round 4 1: settlement survives recovery and retention', async () => {
    await positiveControl();
    const c = await fixture(); const drive = fixedDrive(); const root = await seedCase(drive, c);
    const first = await runOnDrive(c, drive, root, { claude: appendReply() }, 1);
    expect(first.code).toBe(0);
    expect(first.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
    expect(first.after[`${SYSTEM.archive}/change-1.json`]).toBeDefined();
    expect(first.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    const completed = await round4Records(first, 'abc123-run1');
    expect(completed.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: idOf(first, PATH) }]);

    // A transport failure between append and archive leaves the archive unapplied and completion on disk.
    // The next *new* run must recover it through its originating checkpoint, without a model line or second append.
    const interruptedDrive = fixedDrive(); const interruptedRoot = await seedCase(interruptedDrive, c);
    const requestId = (await interruptedDrive.listAll(interruptedRoot)).find((f) => f.name === 'change-1.json')?.id ?? '';
    let interrupted = 0;
    const lost = await runOnDrive(c, interruptedDrive, interruptedRoot, { claude: appendReply(), around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (init?.method === 'PATCH' && url.pathname === `/drive/v3/files/${requestId}` && url.searchParams.has('addParents')) {
        interrupted++;
        throw new TypeError('Made-up interruption before the request archive landed.');
      }
      return fetch(input, init);
    } }, 1);
    expect(interrupted).toBe(1);
    expect(lost.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
    expect(lost.after[`${SYSTEM.changes}/change-1.json`]).toBeDefined();
    expect(lost.after[`${SYSTEM.archive}/change-1.json`]).toBeUndefined();
    const checkpoint = await round4Records(lost, 'abc123-run1');
    expect(checkpoint.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: idOf(lost, PATH) }]);
    const archive = requestArchive(lost, checkpoint, requestId);
    expect(archive).toBeDefined();
    expect(checkpoint.chain.at(-1)?.outcomes.find((o) => o.operationId === archive?.operationId)?.state).not.toBe('applied');
    const recoverySource = await addNextSource(lost, false);
    const recovered = await runOnDrive(c, interruptedDrive, interruptedRoot, {
      claude: reply(() => ({ kind: 'tidy-intent', v: 1,
        things: [round4File(recoverySource, 'Next water butt update.txt')] })),
    }, 2);
    expect.soft(recovered.code).toBe(0);
    expect.soft(recovered.after[PATH]).toBe(lost.after[PATH]);
    expect.soft(recovered.after[`${SYSTEM.archive}/change-1.json`]).toBe(lost.after[`${SYSTEM.changes}/change-1.json`]);
    expect.soft(recovered.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    const recovery = await round4Records(recovered, 'abc123-run1-2');
    expect.soft(recovery.manifest.operations.some((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === idOf(lost, PATH))).toBe(false);

    let later = first;
    for (let press = 2; press <= 21; press++) {
      const name = `Next letter ${press}.txt`;
      const source = await drive.createText(idOf(later, 'Inbox') ?? '', name, `Alex received made-up letter ${press}.`, { pile: `newer-${press}` });
      later = await runOnDrive(c, drive, root, { claude: reply(() => ({ kind: 'tidy-intent', v: 1,
        things: [round4File(source.id, name, `Alex received made-up letter ${press}.`)] })) }, press);
      expect(later.code).toBe(0);
      expect(reportOf(later).filed).toHaveLength(1);
      await round4Records(later, `abc123-run1-${press}`);
      expect(later.requests?.map((q) => q.id)).not.toContain('change-1');
      expect(later.after[PATH]).toBe(first.after[PATH]);
    }
    expect(Object.keys(later.after).some((path) => path.includes('/abc123-run1/manifest-'))).toBe(false);
    // After twenty newer successful runs, a supported pile cannot revive the settled request.
    const freshSource = await addNextSource(later, false);
    const replay = await runOnDrive(c, drive, root, {
      claude: reply((ctx) => ({ kind: 'tidy-intent', v: 1, things: [round4File(freshSource, 'Next water butt update.txt')],
        lines: ctx.notes.some((n) => n.path === PATH) ? [{ note: PATH, text: 'The new water butt is here now.', cites: freshSource }] : [] })) }, 22);
    expect(replay.requestAction).toEqual({ kind: 'tidy', id: 'press-22' });
    expect(replay.after[`${SYSTEM.archive}/change-1.json`]).toBe(first.after[`${SYSTEM.archive}/change-1.json`]);
    expect(replay.code).toBe(0);
    expect(reportOf(replay).filed).toHaveLength(1);
    expect.soft(replay.after[PATH]).toBe(first.after[PATH]);
    const replayRecords = await round4Records(replay, 'abc123-run1-22');
    expect.soft(replayRecords.chain.at(-1)?.completedAppends ?? []).toEqual([]);
    assertPersonal(replay);
  }, 30_000);

  async function round4Pending() {
    const c = await fixture(); const drive = fixedDrive(); const root = await seedCase(drive, c);
    const requestId = (await drive.listAll(root)).find((f) => f.name === 'change-1.json')?.id ?? '';
    const requestBytes = await drive.readText(requestId);
    const noteId = (await drive.listAll(root)).find((f) => f.name === 'Garden plot.md')?.id ?? '';
    let clashes = 0;
    const first = await runOnDrive(c, drive, root, { claude: appendReply(), around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const response = await fetch(input, init);
      const body = init?.body ? await new Response(init.body).text() : '';
      if (!clashes && init?.method === 'POST' && url.pathname === '/upload/drive/v3/files' && body.includes('run-manifest')) {
        clashes++;
        const seen = await drive.get(noteId);
        await drive.writeText(noteId, (c.folder[PATH] ?? '').replace('## My words\n', '## My words\nAlex added a reminder.\n'), seen.modifiedTime);
      }
      return response;
    } }, 1);
    drive.setTimes(idOf(first, `${SYSTEM.dir}/${RUNS_NAME}/abc123-run1`) ?? '', AT, AT);
    expect(first.code).toBe(0); expect(clashes).toBe(1);
    expect(first.after[PATH]).not.toContain(` · ${NEWS} · [[${SOURCE}]]`);
    expect.soft(first.after[`${SYSTEM.changes}/pending/abc123-run1/change-1.json`]).toBe(requestBytes);
    expect.soft(first.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    const sourceId = idOf(first, `Areas/Home/${SOURCE}`) ?? '';
    expect(sourceId).toBeTruthy();
    const stored = await round4Records(first, 'abc123-run1');
    const append = stored.manifest.operations.find((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === noteId);
    expect(append?.effect.kind === 'edit-text' ? append.effect.changes : []).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'timeline-append', consent: { requestId: 'change-1', targetFileId: noteId, sourceFileId: sourceId } }),
    ]));
    expect(stored.chain.at(-1)?.outcomes.find((o) => o.operationId === append?.operationId)).toEqual(expect.objectContaining({
      state: 'rejected', failure: expect.objectContaining({ code: 'conflict' }),
    }));
    return { c, first, drive, root, noteId, sourceId };
  }

  it('C05 person notes: round 4 2: pending retries keep target and source ids', async () => {
    await positiveControl();
    const control = await round4Pending();
    const retry = await runOnDrive(control.c, control.drive, control.root, {
      claude: reply(() => ({ kind: 'tidy-intent', v: 1, things: [] })),
    }, 2);
    expect(retry.code).toBe(0);
    expect(retry.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
    expect(retry.after[PATH]).toContain('Alex added a reminder.');
    expect(idOf(retry, PATH)).toBe(control.noteId);
    expect(retry.after[`${SYSTEM.archive}/change-1.json`]).toBeDefined();

    for (const replacement of [false, true]) {
      const { c, first, drive, root, noteId, sourceId } = await round4Pending();
      await drive.update(noteId, { name: 'Beds.md' });
      await drive.update(sourceId, { name: 'Renamed letter.txt' });
      const replacementText = (c.folder[PATH] ?? '').replace('Alex keeps a handwritten planting diary.', 'Alex keeps a different made-up diary.');
      const another = replacement ? await drive.createText(idOf(first, 'Areas/Home') ?? '', 'Garden plot.md', replacementText) : null;
      const newSource = await addNextSource(first, false);
      const next = await runOnDrive(c, drive, root, { claude: reply((ctx) => ({ kind: 'tidy-intent', v: 1,
        things: [round4File(newSource, 'Next water butt update.txt')],
        lines: replacement && ctx.notes.some((n) => n.path === PATH)
          ? [{ note: PATH, text: 'Alex received the next committee letter.', cites: newSource }] : [],
      })) }, 2);
      const renamed = 'Areas/Home/Beds.md';
      expect(next.code).toBe(0);
      expect(idOf(next, renamed)).toBe(noteId);
      expect(idOf(next, 'Areas/Home/Renamed letter.txt')).toBe(sourceId);
      expect.soft(next.after[renamed], `renamed target, replacement=${replacement}`).toBe((first.after[PATH] ?? '').trimEnd()
        + `\n- 2026-10-07 · ${NEWS} · [[Renamed letter.txt]]\n`);
      if (another) {
        expect(idOf(next, PATH)).toBe(another.id);
        expect.soft(next.after[PATH], 'the old title does not transfer consent').toBe(replacementText);
      }
      const persisted = await round4Records(next, 'abc123-run1-2');
      const consents = persisted.manifest.operations.flatMap((o) => o.effect.kind === 'edit-text'
        ? o.effect.changes.flatMap((change) => change.kind === 'timeline-append' && change.consent ? [change.consent] : []) : []);
      expect.soft(consents).toEqual([{ requestId: 'change-1', targetFileId: noteId, sourceFileId: sourceId }]);
      expect.soft(persisted.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: noteId }]);
      expect.soft(next.after[`${SYSTEM.archive}/change-1.json`]).toBeDefined();
      expect.soft(next.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    }

    const gone = await round4Pending();
    await gone.drive.trash(gone.noteId);
    const goneSource = await addNextSource(gone.first, false);
    const next = await runOnDrive(gone.c, gone.drive, gone.root, { claude: reply(() => ({ kind: 'tidy-intent', v: 1,
      things: [round4File(goneSource, 'Next water butt update.txt')] })) }, 2);
    expect(next.code).toBe(0);
    expect(next.after[PATH]).toBeUndefined();
    expect((await gone.drive.evidence(gone.noteId))?.trashed).toBe(true);
    expect.soft(JSON.stringify(reportOf(next))).toContain(ASK_GONE);
    expect.soft(next.after[`${SYSTEM.archive}/change-1.json`]).toBeDefined();
    expect.soft(next.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    const settled = await round4Records(next, 'abc123-run1-2');
    expect(settled.manifest.operations.some((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === gone.noteId)).toBe(false);
    expect(settled.chain.at(-1)?.completedAppends ?? []).toEqual([]);
  });

  it('C05 person notes: round 4 3: only settlement archives scripted requests', async () => {
    await positiveControl();
    const c = await fixture();
    c.journal.push({ kind: 'request', text: 'Update Garden plot from the next committee letter.' });
    const drive = fixedDrive(); const root = await seedCase(drive, c);
    const files = await drive.listAll(root);
    const oldest = files.find((f) => f.name === 'change-1.json');
    const younger = files.find((f) => f.name === 'change-2.json');
    expect(oldest).toBeDefined(); expect(younger).toBeDefined();
    if (!oldest || !younger) return;
    const before = await drive.readText(younger.id);
    const metadata = await drive.get(younger.id);
    const oldestText = await drive.readText(oldest.id);
    // No Claude override: main selects the actual scripted provider with its generic request handler.
    const r = await runOnDrive(c, drive, root, {}, 1);
    expect(r.code).toBe(0);
    expect(reportOf(r).filed.length).toBeGreaterThan(0);
    expect(r.requests?.map((q) => q.id)).toEqual(['change-1', 'change-2']);
    expect(r.after[PATH]).toBe(c.folder[PATH]);
    // Addendum 6: the admitted oldest target has no line, so its row settles and archives it.
    expect(r.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    expect(r.after[`${SYSTEM.archive}/change-1.json`]).toBe(oldestText);
    expect(reportOf(r).leftAsWritten).toEqual([
      expect.objectContaining({ fileId: idOf(r, PATH), why: NOTHING_FOUND_WHY }),
    ]);
    const found = await round4Records(r, 'abc123-run1');
    expect(found.chain.at(-1)?.completedAppends ?? []).toEqual([]);
    const archive = found.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === oldest.id);
    expect(archive).toBeDefined();
    expect(found.chain.at(-1)?.outcomes.find((o) => o.operationId === archive?.operationId)?.state).toBe('applied');
    expect.soft(r.after[`${SYSTEM.changes}/change-2.json`]).toBe(before);
    expect.soft(r.after[`${SYSTEM.archive}/change-2.json`]).toBeUndefined();
    expect.soft(await drive.readText(younger.id)).toBe(before);
    expect.soft(await drive.get(younger.id)).toEqual(metadata);
    expect.soft(found.manifest.capture.journal.map((j) => j.recordId)).not.toContain('change-2');
    expect.soft(found.manifest.operations.some((o) => o.effect.kind === 'move' && o.effect.before.fileId === younger.id)).toBe(false);
  });

  async function round5NewerRuns(c: LoadedCase, first: CaseRun) {
    let later = first;
    for (let press = 2; press <= 21; press++) {
      const name = `Next letter ${press}.txt`;
      const source = await first.drive.createText(idOf(later, 'Inbox') ?? '', name,
        `Alex received made-up letter ${press}.`, { pile: `newer-${press}` });
      later = await runOnDrive(c, first.drive, first.root, { claude: reply(() => ({ kind: 'tidy-intent', v: 1,
        things: [round4File(source.id, name, `Alex received made-up letter ${press}.`)] })) }, press);
      first.drive.setTimes(idOf(later, `${SYSTEM.dir}/${RUNS_NAME}/abc123-run1-${press}`) ?? '', AT + press - 1, AT + press - 1);
      expect(later.code).toBe(0);
      expect(reportOf(later).filed).toHaveLength(1);
      const stored = await round4Records(later, `abc123-run1-${press}`);
      expect(stored.chain.at(-1)?.completedAppends ?? []).toEqual([]);
      expect(stored.manifest.operations.some((o) => o.effect.kind === 'edit-text'
        && o.effect.changes.some((change) => change.kind === 'timeline-append'
          && change.consent?.requestId === 'change-1'))).toBe(false);
      expect(later.after[PATH]).toBe(first.after[PATH]);
    }
    expect(Object.keys(later.after).some((path) => path.includes('/abc123-run1/manifest-'))).toBe(false);
    return later;
  }

  it('C05 person notes: round 5 1: archived completion uses the record id inside differently named bytes', async () => {
    await positiveControl();
    const c = await fixture(); const drive = fixedDrive(); const root = await seedCase(drive, c);
    const requestFileId = (await drive.listAll(root)).find((f) => f.name === 'change-1.json')?.id ?? '';
    await drive.update(requestFileId, { name: 'different-name.json' });
    const first = await runOnDrive(c, drive, root, { claude: appendReply() }, 1);
    expect(first.code).toBe(0);
    expect(first.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
    const archivedBytes = first.after[`${SYSTEM.archive}/different-name.json`] ?? '';
    const archivedFileId = idOf(first, `${SYSTEM.archive}/different-name.json`) ?? '';
    expect(archivedFileId).toBeTruthy();
    expect(archivedBytes).toBeTruthy();
    expect(JSON.parse(archivedBytes)).toEqual(expect.objectContaining({ id: 'change-1' }));
    const completed = await round4Records(first, 'abc123-run1');
    expect(completed.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: idOf(first, PATH) }]);
    const later = await round5NewerRuns(c, first);

    // Supported control after retention: the archived request is never restored.
    const controlSource = await addNextSource(later, false);
    const control = await runOnDrive(c, drive, root, {
      claude: reply((ctx) => ({ kind: 'tidy-intent', v: 1,
        things: [round4File(controlSource, 'Next water butt update.txt')],
        lines: ctx.notes.some((n) => n.path === PATH)
          ? [{ note: PATH, text: 'The new water butt is here now.', cites: controlSource }] : [] })) }, 22);
    expect(control.code).toBe(0); expect(reportOf(control).filed).toHaveLength(1);
    expect(control.after[PATH]).toBe(first.after[PATH]);
    expect((await round4Records(control, 'abc123-run1-22')).chain.at(-1)?.completedAppends ?? []).toEqual([]);
    expect(await drive.readText(archivedFileId)).toBe(archivedBytes);

    // A settled request stays archived. A later pile cannot grant a second append from those bytes.
    const source = await drive.createText(idOf(control, 'Inbox') ?? '', 'Replay letter.txt', 'Alex received another made-up letter.', { pile: 'replay-copy' });
    const replay = await runOnDrive(c, drive, root, {
      claude: reply((ctx) => ({ kind: 'tidy-intent', v: 1, things: [round4File(source.id, 'Replay letter.txt')],
        lines: ctx.notes.some((n) => n.path === PATH)
          ? [{ note: PATH, text: 'The new water butt is here now.', cites: source.id }] : [] })) }, 23);
    expect(replay.code).toBe(0); expect(reportOf(replay).filed).toHaveLength(1);
    expect.soft(replay.after[PATH], 'different filename cannot grant a second append').toBe(first.after[PATH]);
    const stored = await round4Records(replay, 'abc123-run1-23');
    expect.soft(stored.chain.at(-1)?.completedAppends ?? [], 'different filename cannot record a second completion').toEqual([]);
    expect.soft(stored.manifest.operations.some((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === idOf(first, PATH))).toBe(false);
    assertPersonal(replay);
  }, 30_000);

  async function round5CompletedButActive() {
    const c = await fixture(); const drive = fixedDrive(); const root = await seedCase(drive, c);
    const requestFileId = (await drive.listAll(root)).find((f) => f.name === 'change-1.json')?.id ?? '';
    expect(requestFileId).toBeTruthy();
    let interrupted = 0;
    const first = await runOnDrive(c, drive, root, { claude: appendReply(), around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (init?.method === 'PATCH' && url.pathname === `/drive/v3/files/${requestFileId}` && url.searchParams.has('addParents')) {
        interrupted++;
        throw new TypeError('Made-up interruption before the request archive landed.');
      }
      return fetch(input, init);
    } }, 1);
    expect(interrupted).toBe(1);
    expect(first.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
    expect(first.after[`${SYSTEM.changes}/change-1.json`]).toBeDefined();
    expect(first.after[`${SYSTEM.archive}/change-1.json`]).toBeUndefined();
    const stored = await round4Records(first, 'abc123-run1');
    const noteId = idOf(first, PATH) ?? '';
    expect(stored.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: noteId }]);
    const archive = requestArchive(first, stored, requestFileId);
    expect(archive).toBeDefined();
    expect(stored.chain.at(-1)?.outcomes.find((o) => o.operationId === archive?.operationId)?.state).not.toBe('applied');
    return { c, drive, root, first, noteId };
  }

  it('C05 person notes: round 5 2: a retained completion never resolves a renamed target by title again', async () => {
    await positiveControl();
    const control = await round5CompletedButActive();
    const controlSource = await addNextSource(control.first, false);
    const recovered = await runOnDrive(control.c, control.drive, control.root, { claude: reply(() => ({ kind: 'tidy-intent', v: 1,
      things: [round4File(controlSource, 'Next water butt update.txt')] })) }, 2);
    expect(recovered.code).toBe(0); expect(reportOf(recovered).filed).toHaveLength(1);
    expect(recovered.after[PATH]).toBe(control.first.after[PATH]);
    expect(recovered.after[`${SYSTEM.archive}/change-1.json`]).toBe(control.first.after[`${SYSTEM.changes}/change-1.json`]);
    expect((await round4Records(recovered, 'abc123-run1-2')).chain.at(-1)?.completedAppends ?? []).toEqual([]);

    const { c, drive, root, first, noteId } = await round5CompletedButActive();
    await drive.update(noteId, { name: 'Beds.md' });
    const replacementText = (c.folder[PATH] ?? '').replace('Alex keeps a handwritten planting diary.', 'Alex keeps a different made-up diary.');
    const replacement = await drive.createText(idOf(first, 'Areas/Home') ?? '', 'Garden plot.md', replacementText);
    const source = await addNextSource(first, false);
    const next = await runOnDrive(c, drive, root, { claude: reply((ctx) => ({ kind: 'tidy-intent', v: 1,
      things: [round4File(source, 'Next water butt update.txt')],
      lines: ctx.notes.some((n) => n.path === PATH)
        ? [{ note: PATH, text: 'Alex received the next committee letter.', cites: source }] : [] })) }, 2);
    expect(next.code).toBe(0); expect(reportOf(next).filed).toHaveLength(1);
    expect(idOf(next, 'Areas/Home/Beds.md')).toBe(noteId); expect(idOf(next, PATH)).toBe(replacement.id);
    expect.soft(next.after['Areas/Home/Beds.md'], 'the completed target gets no second append').toBe(first.after[PATH]);
    expect.soft(next.after[PATH], 'the replacement title gets no consent').toBe(replacementText);
    const stored = await round4Records(next, 'abc123-run1-2');
    expect.soft(stored.chain.at(-1)?.completedAppends ?? [], 'a retained completion is request-wide').toEqual([]);
    expect.soft(stored.manifest.operations.some((o) => o.effect.kind === 'edit-text'
      && [noteId, replacement.id].includes(o.effect.before.fileId))).toBe(false);
    expect(next.after[`${SYSTEM.archive}/change-1.json`]).toBe(first.after[`${SYSTEM.changes}/change-1.json`]);
    expect(next.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    assertPersonal(next);
  });

  it('C05 person notes: round 5 3: a request past retention is left as written and archived without an append', async () => {
    await positiveControl();
    // A retained pending binding is still actionable after a rename, beside a new note with its old title.
    const control = await round4Pending();
    await control.drive.update(control.noteId, { name: 'Beds.md' });
    const replacementText = control.c.folder[PATH] ?? '';
    const replacement = await control.drive.createText(idOf(control.first, 'Areas/Home') ?? '', 'Garden plot.md', replacementText);
    const controlSource = await addNextSource(control.first, false);
    const retry = await runOnDrive(control.c, control.drive, control.root, { claude: reply((ctx) => ({ kind: 'tidy-intent', v: 1,
      things: [round4File(controlSource, 'Next water butt update.txt')],
      lines: ctx.notes.some((n) => n.path === PATH)
        ? [{ note: PATH, text: 'Alex received the next committee letter.', cites: controlSource }] : [] })) }, 2);
    expect(retry.code).toBe(0); expect(reportOf(retry).filed).toHaveLength(1);
    expect(retry.after['Areas/Home/Beds.md']).toBe((control.first.after[PATH] ?? '').trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]\n`);
    expect(idOf(retry, PATH)).toBe(replacement.id); expect(retry.after[PATH]).toBe(replacementText);
    expect((await round4Records(retry, 'abc123-run1-2')).chain.at(-1)?.completedAppends).toEqual([
      { requestId: 'change-1', targetFileId: control.noteId },
    ]);

    const { c, first, drive, root, noteId, sourceId } = await round4Pending();
    const activeBytes = first.after[`${SYSTEM.changes}/pending/abc123-run1/change-1.json`] ?? '';
    await drive.trash(sourceId);
    expect((await drive.evidence(sourceId))?.trashed).toBe(true);
    const later = await round5NewerRuns(c, first);
    expect(later.after[`${SYSTEM.changes}/pending/abc123-run1/change-1.json`]).toBe(activeBytes);
    const oldest = await round4Records(later, 'abc123-run1-2');
    expect((JSON.parse(activeBytes) as { at: number }).at).toBeLessThan(oldest.manifest.requestedAt);
    await drive.update(noteId, { name: 'Beds.md' });
    const another = await drive.createText(idOf(later, 'Areas/Home') ?? '', 'Garden plot.md', replacementText);
    const source = await addNextSource(later, false);
    const next = await runOnDrive(c, drive, root, { claude: reply((ctx) => ({ kind: 'tidy-intent', v: 1,
      things: [round4File(source, 'Next water butt update.txt')],
      lines: ctx.notes.some((n) => n.path === PATH)
        ? [{ note: PATH, text: 'Alex received the next committee letter.', cites: source }] : [] })) }, 22);
    expect(next.code).toBe(0); expect(reportOf(next).filed).toHaveLength(1);
    expect(idOf(next, 'Areas/Home/Beds.md')).toBe(noteId); expect(idOf(next, PATH)).toBe(another.id);
    expect.soft(next.after['Areas/Home/Beds.md'], 'the old target stays unchanged').toBe(first.after[PATH]);
    expect.soft(next.after[PATH], 'expired consent cannot transfer to the new title match').toBe(replacementText);
    const stored = await round4Records(next, 'abc123-run1-22');
    expect.soft(stored.chain.at(-1)?.completedAppends ?? []).toEqual([]);
    expect.soft(stored.manifest.operations.some((o) => o.effect.kind === 'edit-text'
      && [noteId, another.id].includes(o.effect.before.fileId))).toBe(false);
    expect.soft(next.after[`${SYSTEM.changes}/pending/abc123-run1/change-1.json`]).toBeUndefined();
    expect.soft(next.after[`${SYSTEM.archive}/change-1.json`]).toBe(activeBytes);
    const archive = stored.manifest.operations.find((o) => o.effect.kind === 'move'
      && o.effect.before.fileId === idOf(first, `${SYSTEM.changes}/pending/abc123-run1/change-1.json`));
    expect.soft(archive, 'the stale request has its archive move').toBeDefined();
    expect.soft(stored.chain.at(-1)?.outcomes.find((o) => o.operationId === archive?.operationId)?.state).toBe('applied');
    expect.soft(reportOf(next).updated).toEqual([]);
    expect.soft(typeof TOO_OLD_WHY, 'the designer-signed C05 why must be exported').toBe('string');
    expect.soft(TOO_OLD_WHY, 'the signed why is nonempty').toBeTruthy();
    expect.soft(reportOf(next).leftAsWritten, 'the stale request reports one Left as you wrote them row').toHaveLength(1);
    expect.soft(reportOf(next).leftAsWritten).toEqual([expect.objectContaining({ why: TOO_OLD_WHY })]);
  }, 30_000);

  const round5Other = 'Areas/Home/Shed roof.md';
  const round5OtherNews = 'Alex received the shed roof update.';
  const round5NothingFound = "Bower didn't add the line: it found nothing about this note in what you added.";

  async function round5TwoTargets() {
    const c = await fixture();
    c.folder[round5Other] = (c.folder[PATH] ?? '').replace('Alex keeps a handwritten planting diary.', 'Alex keeps a made-up shed diary.');
    c.inboxFiles[SOURCE] += `\n${round5OtherNews}`;
    c.journal = [{ kind: 'request', text: 'Update Garden plot and Shed roof from this committee letter.' }];
    const drive = fixedDrive(); const root = await seedCase(drive, c);
    const files = await drive.listAll(root);
    const noteId = files.find((f) => f.name === 'Garden plot.md')?.id ?? '';
    const otherId = files.find((f) => f.name === 'Shed roof.md')?.id ?? '';
    const requestId = files.find((f) => f.name === 'change-1.json')?.id ?? '';
    expect(noteId).toBeTruthy(); expect(otherId).toBeTruthy(); expect(requestId).toBeTruthy();
    return { c, drive, root, noteId, otherId, requestId, requestBytes: await drive.readText(requestId) };
  }

  const round5TwoLines = () => reply((_ctx, source) => ({ ...filing(source), lines: [
    { note: PATH, text: NEWS, cites: source },
    { note: round5Other, text: round5OtherNews, cites: source },
  ] }));

  // Both named personal notes can append, complete and archive in one production run.
  async function round5TwoTargetControl(): Promise<void> {
    const { c, drive, root, noteId, otherId, requestBytes } = await round5TwoTargets();
    const r = await runOnDrive(c, drive, root, { claude: round5TwoLines() }, 1);
    expect(r.code).toBe(0);
    expect(r.after[PATH]).toBe((c.folder[PATH] ?? '').trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]\n`);
    expect(r.after[round5Other]).toBe((c.folder[round5Other] ?? '').trimEnd() + `\n- 2026-10-07 · ${round5OtherNews} · [[${SOURCE}]]\n`);
    expect(reportOf(r).updated).toHaveLength(2);
    expect(reportOf(r).leftAsWritten ?? []).toEqual([]);
    const stored = await round4Records(r, 'abc123-run1');
    expect(stored.chain.at(-1)?.completedAppends).toEqual(expect.arrayContaining([
      { requestId: 'change-1', targetFileId: noteId }, { requestId: 'change-1', targetFileId: otherId },
    ]));
    expect(stored.chain.at(-1)?.completedAppends).toHaveLength(2);
    expect(r.after[`${SYSTEM.archive}/change-1.json`]).toBe(requestBytes);
    expect(r.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
  }

  it('C05 person notes: round 5 4: one line and one nothing-found row settle two named targets', async () => {
    await positiveControl();
    await round5TwoTargetControl();
    expect.soft(typeof NOTHING_FOUND_WHY, 'the C05 nothing-found why must be exported without a load error').toBe('string');
    expect.soft(NOTHING_FOUND_WHY, 'the nothing-found copy is the owner-signed sentence').toBe(round5NothingFound);
    const { c, drive, root, noteId, otherId, requestId, requestBytes } = await round5TwoTargets();
    const shown: Context[] = [];
    const first = await runOnDrive(c, drive, root, { claude: reply((_ctx, source) => ({ ...filing(source),
      lines: [{ note: PATH, text: NEWS, cites: source }] }), shown) }, 1);
    expect(first.code).toBe(0);
    expect(shown[0]?.notes.map((n) => n.path)).toEqual(expect.arrayContaining([PATH, round5Other]));
    expect.soft(first.after[PATH], 'one offered line must append despite the other target getting no line').toBe(
      (c.folder[PATH] ?? '').trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]\n`);
    expect(first.after[round5Other]).toBe(c.folder[round5Other]);
    expect.soft(reportOf(first).filed).toHaveLength(1);
    expect.soft(reportOf(first).updated).toEqual([expect.objectContaining({ path: PATH, what: APPENDED })]);
    expect(questionsOf(first)).toEqual([]);
    expect.soft(reportOf(first).leftAsWritten, 'the target without a model line settles with its linked why').toEqual([
      expect.objectContaining({ fileId: otherId, why: NOTHING_FOUND_WHY }),
    ]);
    expect.soft(first.after[`${SYSTEM.archive}/change-1.json`], 'all named targets settle in the admitting run').toBe(requestBytes);
    expect.soft(first.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    const stored = await round4Records(first, 'abc123-run1');
    expect(stored.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: noteId }]);
    expect(stored.manifest.operations.filter((o) => o.effect.kind === 'edit-text')).toHaveLength(1);
    const archive = stored.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === requestId);
    expect.soft(archive, 'the admitting manifest contains the request archive').toBeDefined();
    expect.soft(stored.chain.at(-1)?.outcomes.find((o) => o.operationId === archive?.operationId)?.state).toBe('applied');

    // Use the driver's no-new-request path: neither later run may finish an omitted target.
    const unchanged = await runOnDrive(c, drive, root, {
      answerStart: { scope: 'all', requestId: 'abc123-run1-2' },
      claude: reply(() => ({ kind: 'tidy-intent', v: 1, things: [] })),
    }, 2);
    // An empty, unchanged feed is not admitted; it writes no report, operation or completion.
    expect(unchanged.code).toBe(-1);
    expect(unchanged.requestAction).toBeUndefined();
    expect(unchanged.requests).toBeUndefined();
    expect(unchanged.lastRun).toBeNull();
    expect((await new RunRecords(drive, root).found('abc123-run1-2')).kind).toBe('new');
    expect(unchanged.after).toEqual(first.after);
    expect(unchanged.after[PATH]).toBe(first.after[PATH]);
    expect(unchanged.after[round5Other]).toBe(first.after[round5Other]);
    expect(reportOf(unchanged).updated).toEqual([]);
    expect(reportOf(unchanged).leftAsWritten ?? []).toEqual([]);
    expect.soft(unchanged.after[`${SYSTEM.archive}/change-1.json`]).toBe(requestBytes);

    const unrelated = await drive.createText(idOf(unchanged, 'Inbox') ?? '', 'Unrelated letter.txt',
      'Alex received an unrelated made-up letter.', { pile: 'unrelated-letter' });
    const later = await runOnDrive(c, drive, root, {
      answerStart: { scope: 'all', requestId: 'abc123-run1-3' },
      claude: reply((ctx) => ({ kind: 'tidy-intent', v: 1,
      things: [round4File(unrelated.id, 'Unrelated letter.txt', 'Alex received an unrelated made-up letter.')],
      lines: ctx.notes.some((n) => n.path === round5Other)
        ? [{ note: round5Other, text: 'Alex received an unrelated made-up letter.', cites: unrelated.id }] : [],
    })) }, 3);
    expect(later.code).toBe(0); expect(reportOf(later).filed).toHaveLength(1);
    expect(later.requestAction).toBeUndefined();
    expect(later.requests).toEqual([]);
    expect(later.after['Areas/Home/Unrelated letter.txt']).toBe('Alex received an unrelated made-up letter.');
    const laterStored = await round4Records(later, 'abc123-run1-3');
    expect(later.after[PATH]).toBe(first.after[PATH]);
    expect(later.after[round5Other]).toBe(first.after[round5Other]);
    expect(laterStored.chain.at(-1)?.completedAppends ?? []).toEqual([]);
    expect(laterStored.manifest.operations.filter((o) => o.effect.kind === 'edit-text')).toEqual([]);
    expect(reportOf(later).updated).toEqual([]);
    expect(reportOf(later).leftAsWritten ?? []).toEqual([]);
    expect(later.after[`${SYSTEM.archive}/change-1.json`]).toBe(requestBytes);
    assertPersonal(first); assertPersonal(unchanged); assertPersonal(later);
  });

  it('C05 person notes: round 5 5: only a clashed target retries on bound ids before archive', async () => {
    await positiveControl();
    await round5TwoTargetControl();
    const { c, drive, root, noteId, otherId, requestId, requestBytes } = await round5TwoTargets();
    const fresh = (c.folder[PATH] ?? '').replace('## My words\n', '## My words\nAlex added a personal reminder.\n');
    let clashes = 0;
    const first = await runOnDrive(c, drive, root, { claude: round5TwoLines(), around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const response = await fetch(input, init);
      const body = init?.body ? await new Response(init.body).text() : '';
      if (!clashes && init?.method === 'POST' && url.pathname === '/upload/drive/v3/files' && body.includes('run-manifest')) {
        clashes++;
        const seen = await drive.get(noteId);
        await drive.writeText(noteId, fresh, seen.modifiedTime);
      }
      return response;
    } }, 1);
    expect(first.code).toBe(0); expect(clashes).toBe(1);
    expect(first.after[PATH]).toBe(fresh);
    expect(first.after[round5Other]).toBe((c.folder[round5Other] ?? '').trimEnd() + `\n- 2026-10-07 · ${round5OtherNews} · [[${SOURCE}]]\n`);
    expect(reportOf(first).updated).toEqual([expect.objectContaining({ path: round5Other, what: APPENDED })]);
    expect(reportOf(first).leftAsWritten ?? []).toEqual([]);
    expect(questionsOf(first)).toEqual([]);
    const sourceId = idOf(first, `Areas/Home/${SOURCE}`) ?? '';
    expect(sourceId).toBeTruthy();
    const stored = await round4Records(first, 'abc123-run1');
    expect(stored.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: otherId }]);
    const clashed = stored.manifest.operations.find((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === noteId);
    expect(clashed?.effect.kind === 'edit-text' ? clashed.effect.changes : []).toEqual([expect.objectContaining({
      kind: 'timeline-append', consent: { requestId: 'change-1', targetFileId: noteId, sourceFileId: sourceId },
    })]);
    expect(stored.chain.at(-1)?.outcomes.find((o) => o.operationId === clashed?.operationId)).toEqual(expect.objectContaining({
      state: 'rejected', failure: expect.objectContaining({ code: 'conflict' }),
    }));
    expect.soft(first.after[`${SYSTEM.changes}/pending/abc123-run1/change-1.json`], 'one clashed target keeps the request active').toBe(requestBytes);
    expect.soft(first.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    expect.soft(first.after[`${SYSTEM.archive}/change-1.json`], 'the other completion cannot archive the request early').toBeUndefined();
    const archive = requestArchive(first, stored, requestId);
    expect(archive).toBeDefined();
    expect.soft(stored.chain.at(-1)?.outcomes.find((o) => o.operationId === archive?.operationId)?.state).not.toBe('applied');

    // The model supplies no new line: only the persisted target/source pair can finish this request.
    const next = await runOnDrive(c, drive, root, { claude: reply(() => ({ kind: 'tidy-intent', v: 1, things: [] })) }, 2);
    expect(next.code).toBe(0);
    expect.soft(next.after[PATH]).toBe(fresh.trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]\n`);
    expect(next.after[round5Other]).toBe(first.after[round5Other]);
    const retry = await round4Records(next, 'abc123-run1-2');
    const consents = retry.manifest.operations.flatMap((o) => o.effect.kind === 'edit-text'
      ? o.effect.changes.flatMap((change) => change.kind === 'timeline-append' && change.consent ? [change.consent] : []) : []);
    expect.soft(consents).toEqual([{ requestId: 'change-1', targetFileId: noteId, sourceFileId: sourceId }]);
    expect.soft(retry.chain.at(-1)?.completedAppends).toEqual([{ requestId: 'change-1', targetFileId: noteId }]);
    expect.soft(reportOf(next).updated).toEqual([expect.objectContaining({ path: PATH, what: APPENDED })]);
    expect(reportOf(next).leftAsWritten ?? []).toEqual([]);
    expect.soft(next.after[`${SYSTEM.archive}/change-1.json`]).toBe(requestBytes);
    expect.soft(next.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
    const retryArchive = retry.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === requestId);
    expect.soft(retryArchive, 'the retry archives the request after its last target settles').toBeDefined();
    expect.soft(retry.chain.at(-1)?.outcomes.find((o) => o.operationId === retryArchive?.operationId)?.state).toBe('applied');
    expect(idOf(next, PATH)).toBe(noteId); expect(idOf(next, round5Other)).toBe(otherId);
    expect(idOf(next, `Areas/Home/${SOURCE}`)).toBe(sourceId);
    assertPersonal(first); assertPersonal(next);
  });

  // CommonMark list items: https://spec.commonmark.org/0.31.2/#list-items
  // These expected strings are independent byte oracles, not output from timeline-line.ts.
  describe('C05 timeline list', () => {
    const path = 'Areas/Home/Allotment diary.md';
    const front = '---\nsummary: Alex keeps a planting diary.\n---\n\n';
    const prefix = `${front}My words stay here.\n\n## Timeline\n`;
    const added = `- 2026-10-07 · ${NEWS} · [[${SOURCE}]]`;
    const starAdded = `* 2026-10-07 · ${NEWS} · [[${SOURCE}]]`;
    const enc = (text: string) => new TextEncoder().encode(text);

    async function timelineFixture(text: string): Promise<LoadedCase> {
      const c = await fixture();
      Reflect.deleteProperty(c.folder, PATH);
      c.folder[path] = text;
      c.journal = [{ kind: 'request', text: 'Update Allotment diary from this committee letter.' }];
      c.inbox[0] = { line: '', files: [SOURCE] };
      return c;
    }

    async function completions(r: CaseRun, runId = 'abc123-run1') {
      const found = await round4Records(r, runId);
      return found.chain.at(-1)?.completedAppends ?? [];
    }

    function staysPersonal(r: CaseRun): void {
      expect(r.props[path] ?? {}).not.toHaveProperty('by');
      expect(r.props[path] ?? {}).not.toHaveProperty('bower_state');
      expect(r.props[path] ?? {}).not.toHaveProperty('bowerMd5');
      expect(r.after[path]).not.toMatch(/by: bower|bower_state:|<!-- bower:ownership/);
    }

    async function controls(): Promise<void> {
      await positiveControl();
      const before = `${prefix}- 2026-10-01 · Alex dug the first bed.\n`;
      const c = await timelineFixture(before);
      const r = await runWithClaude(c, appendReply(path));
      expect(r.code).toBe(0);
      expect(r.after[path]).toBe(`${prefix}- 2026-10-01 · Alex dug the first bed.\n${added}\n`);
      expect(reportOf(r).updated).toEqual([expect.objectContaining({ path, what: APPENDED })]);
      expect(r.after[`${SYSTEM.archive}/change-1.json`]).toBeDefined();
      expect(await completions(r)).toEqual([{ requestId: 'change-1', targetFileId: idOf(r, path) }]);
      staysPersonal(r);
    }

    async function replay(c: LoadedCase, first: CaseRun): Promise<CaseRun> {
      const source = await addNextSource(first, false);
      const r = await redispatchCase(c, first, 2, {
        claude: reply(() => ({ kind: 'tidy-intent', v: 1,
          things: [round4File(source, 'Next water butt update.txt')],
          lines: [{ note: path, text: 'Alex received another update about the bed.', cites: source }] })),
      });
      expect(r.code).toBe(0);
      expect(r.dispatch).toEqual(first.dispatch);
      expect(reportOf(r).filed).toHaveLength(1);
      expect(r.after[path]).toBe(first.after[path]);
      expect(reportOf(r).updated).toEqual(reportOf(first).updated);
      expect(await completions(r)).toEqual(await completions(first));
      const storedRun = (run: CaseRun) => Object.entries(run.after).filter(([p]) => p.startsWith(`${SYSTEM.dir}/${RUNS_NAME}/abc123-run1/`));
      expect(storedRun(r)).toEqual(storedRun(first));
      staysPersonal(r);
      return r;
    }

    it('C05 timeline list: 1: dated-colon list with no offered line settles as nothing found', async () => {
      await controls();
      const control = await timelineFixture(`${prefix}- 2026-10-01 · Alex dug the first bed.\n`);
      // runScripted auto-loads this corpus's recorded replies; {} selects main's actual scripted provider.
      const controlDrive = fixedDrive();
      const good = await runOnDrive(control, controlDrive, await seedCase(controlDrive, control), {}, 1);
      expect(good.code).toBe(0);
      expect(NOTHING_FOUND_WHY).toBe("Bower didn't add the line: it found nothing about this note in what you added.");
      expect(reportOf(good).leftAsWritten).toEqual([expect.objectContaining({ why: NOTHING_FOUND_WHY })]);
      expect(good.after[path]).toBe(control.folder[path]);
      expect(await completions(good)).toEqual([]);

      const c = await timelineFixture(`${prefix}- 1 Oct: Alex dug the first bed.\n`);
      const drive = fixedDrive();
      const r = await runOnDrive(c, drive, await seedCase(drive, c), {}, 1);
      expect(r.code).toBe(0);
      expect.soft(reportOf(r).leftAsWritten).toEqual([
        expect.objectContaining({ why: NOTHING_FOUND_WHY, fileId: idOf(r, path) }),
      ]);
      expect(r.after[path]).toBe(c.folder[path]);
      expect(reportOf(r).updated).toEqual([]);
      expect(await completions(r)).toEqual([]);
      staysPersonal(r);
    });

    it.each([['with front matter', prefix], ['without front matter', 'My words stay here.\n\n## Timeline\n']])(
      'C05 timeline list: 2: plain list %s appends once, updates, archives and completes', async (_label, start) => {
        await controls();
        const before = `${start}- Alex dug the first bed.\n`;
        const c = await timelineFixture(before);
        const r = await runWithClaude(c, appendReply(path));
        expect(r.code).toBe(0);
        expect.soft(r.after[path]).toBe(`${start}- Alex dug the first bed.\n${added}\n`);
        expect.soft(reportOf(r).updated).toEqual([expect.objectContaining({ path, what: APPENDED })]);
        expect(r.after[`${SYSTEM.archive}/change-1.json`]).toBeDefined();
        expect(r.after[`${SYSTEM.changes}/change-1.json`]).toBeUndefined();
        expect.soft(await completions(r)).toEqual([{ requestId: 'change-1', targetFileId: idOf(r, path) }]);
        staysPersonal(r);
        await replay(c, r);
      });

    it('C05 timeline list: 3: prose stays unreadable even with a sourced line offered', async () => {
      await controls();
      const c = await timelineFixture(`${prefix}Alex dug the first bed.\n`);
      const r = await runWithClaude(c, appendReply(path));
      expect(r.code).toBe(0);
      expect(reportOf(r).filed).toHaveLength(1);
      expect(reportOf(r).leftAsWritten).toEqual([expect.objectContaining({ why: UNREADABLE, fileId: idOf(r, path) })]);
      expect(r.after[path]).toBe(c.folder[path]);
      expect(reportOf(r).updated).toEqual([]);
      expect(await completions(r)).toEqual([]);
      staysPersonal(r);
    });

    it('C05 timeline list: 4: appendable person and Bower-owned notes remain positive controls', controls);

    const byteCases = [
      { label: 'CRLF and Unicode byte offsets',
        before: '---\r\nsummary: Alex grows café beans.\r\n---\r\n\r\nMy words: café.\r\n\r\n## Timeline\r\n- 1 Oct: Alex dug the first bed.\r\n',
        after: `---\r\nsummary: Alex grows café beans.\r\n---\r\n\r\nMy words: café.\r\n\r\n## Timeline\r\n- 1 Oct: Alex dug the first bed.\r\n${added}\r\n` },
      { label: 'star marker', before: `${prefix}* September: planted garlic.\n`,
        after: `${prefix}* September: planted garlic.\n${starAdded}\n` },
      { label: 'whole nested subtree at top level',
        before: `${prefix}- Alex dug the first bed.\n  * Alex planted garlic.\n    - Alex watered it.\n      Still damp.\n`,
        after: `${prefix}- Alex dug the first bed.\n  * Alex planted garlic.\n    - Alex watered it.\n      Still damp.\n${added}\n` },
      { label: 'last top-level star in mixed markers',
        before: `${prefix}- Alex dug the first bed.\n\n* Alex planted garlic.\n  - Alex watered it.\n`,
        after: `${prefix}- Alex dug the first bed.\n\n* Alex planted garlic.\n  - Alex watered it.\n${starAdded}\n` },
      { label: 'last top-level dash in mixed markers',
        before: `${prefix}* Alex dug the first bed.\n\n- Alex planted garlic.\n  * Alex watered it.\n`,
        after: `${prefix}* Alex dug the first bed.\n\n- Alex planted garlic.\n  * Alex watered it.\n${added}\n` },
      { label: 'trailing blanks with final newline', before: `${prefix}- Alex dug the first bed.\n\n  \n\n`,
        after: `${prefix}- Alex dug the first bed.\n${added}\n\n  \n\n` },
      { label: 'no final newline', before: `${prefix}- Alex dug the first bed.`,
        after: `${prefix}- Alex dug the first bed.\n${added}` },
      { label: 'trailing blanks without final newline', before: `${prefix}- Alex dug the first bed.\n\n  `,
        after: `${prefix}- Alex dug the first bed.\n${added}\n\n  ` },
      { label: 'following heading stays outside the list',
        before: `${prefix}- Alex dug the first bed.\n\n## Links\nSee [[Planting guide]].\n`,
        after: `${prefix}- Alex dug the first bed.\n${added}\n\n## Links\nSee [[Planting guide]].\n` },
      { label: 'plain CRLF star subtree before a following heading',
        before: 'My words: café.\r\n\r\n## Timeline\r\n* Alex dug the first bed.\r\n  - Alex planted garlic.\r\n\r\n## Links\r\nSee [[Planting guide]].',
        after: `My words: café.\r\n\r\n## Timeline\r\n* Alex dug the first bed.\r\n  - Alex planted garlic.\r\n${starAdded}\r\n\r\n## Links\r\nSee [[Planting guide]].` },
    ];

    function authored(before: string) {
      const consent = { requestId: 'change-1', targetFileId: 'diary-id', sourceFileId: 'letter-id' };
      const bytes = enc(before);
      const copy = bytes.slice();
      const fetched = { fileId: consent.targetFileId, context: createOwnershipContext(), consents: [consent] };
      const admitted = noteEdit.personalTimelineRefusal(bytes, fetched);
      const result = noteEdit.applyChanges(bytes, [{ kind: 'timeline-append', recordIds: [consent.requestId],
        entries: [{ date: '2026-10-07', text: NEWS, source: SOURCE }], consent }], fetched);
      expect(bytes).toEqual(copy);
      return { admitted, result };
    }

    it.each(byteCases.map(({ label, before, after }) => [label, before, after] as const))(
      'C05 timeline list: 5: exact bytes preserve %s through main and note-edit', async (_label, before, after) => {
        await controls();
        const baseline = `${prefix}- 2026-10-01 · Alex dug the first bed.\n`;
        expect(authored(baseline)).toEqual({ admitted: null,
          result: { ok: true, text: `${baseline.trimEnd()}\n${added}\n`, bytes: enc(`${baseline.trimEnd()}\n${added}\n`) } });
        const c = await timelineFixture(before);
        const r = await runWithClaude(c, appendReply(path));
        expect(r.code).toBe(0);
        expect.soft(enc(r.after[path] ?? '')).toEqual(enc(after));
        expect.soft(reportOf(r).updated).toEqual([expect.objectContaining({ path, what: APPENDED })]);
        expect.soft(await completions(r)).toEqual([{ requestId: 'change-1', targetFileId: idOf(r, path) }]);
        staysPersonal(r);
        const api = authored(before);
        expect.soft(api.admitted).toBeNull();
        expect.soft(api.result).toEqual({ ok: true, text: after, bytes: enc(after) });
      });

    it('C05 timeline list: 5: preseeded Bower star line completes once and replay keeps exact bytes', async () => {
      await controls();
      // Control and red differ only in their marker; the old date pins text-plus-source identity.
      for (const marker of ['-', '*']) {
        const before = `${prefix}${marker} 2026-09-12 · ${NEWS} · [[${SOURCE}]]\n`;
        const c = await timelineFixture(before);
        const first = await runWithClaude(c, appendReply(path));
        expect(first.code).toBe(0);
        expect(first.after[path]).toBe(before);
        expect(reportOf(first).filed).toHaveLength(1);
        expect(reportOf(first).updated).toEqual([]);
        expect.soft(await completions(first)).toEqual([{ requestId: 'change-1', targetFileId: idOf(first, path) }]);
        expect(first.after[`${SYSTEM.archive}/change-1.json`]).toBeDefined();
        expect.soft(authored(before).result).toEqual({ ok: false, reason: 'unchanged' });
        await replay(c, first);
      }
    });
  });

});
