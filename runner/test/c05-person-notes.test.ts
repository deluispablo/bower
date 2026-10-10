import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as noteEdit from '../../src/data/contracts/note-edit';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import type { RunReport, Question } from '../../src/data/contracts/types';
import { subjectOf } from '../../src/data/contracts/questions';
import { SYSTEM } from '../../src/data/vault/layout';
import { caseReplies, runOnDrive, runScripted, runWithClaude, scoreCase, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

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
    ['row 8 unparseable Timeline', (text: string) => text.replace('- 2026-09-12 · Planted garlic.', '* September: planted garlic.'), UNREADABLE],
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

  it('C05 person notes: corpus first append, protected ranges, state question, replay and later non-adoption score per run', async () => {
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

  it('C05 person notes: landed append with lost answer and failed read-back resumes then replays exactly once', async () => {
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
    // Later run restores the exact request id; a model offering new wording must not append it.
    const replay = await runOnDrive(c, drive, root, { request: { kind: 'replay', id: 'change-1' },
      claude: reply(() => ({ kind: 'tidy-intent', v: 1, things: [], lines: [{ note: PATH,
        text: 'The new water butt is here now.', cites: idOf(resumed, `Areas/Home/${SOURCE}`) }] })) }, 2);
    expect(replay.requestAction).toEqual(expect.objectContaining({ kind: 'replay', id: 'change-1' }));
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

  it('C05 person notes: fix 1 finding 2: a conflicted append survives twenty newer runs and retries its filed source', async () => {
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
    const source = idOf(r, `Areas/Home/${SOURCE}`);
    expect(source).toBeTruthy(); expect(clashes).toBe(1);
    const retry = reply(() => ({ kind: 'tidy-intent', v: 1, things: [], lines: [{ note: PATH, text: NEWS, cites: source }] }));
    r = await runOnDrive(c, drive, root, { claude: retry, around }, 2);
    // Positive retry control: the next manifest really carries the same binding and captured place.
    const retryManifest = Object.entries(r.after).find(([path]) => path.includes('/abc123-run1-2/manifest-'));
    expect(retryManifest?.[1]).toContain('"sourceFileId":"' + source + '"');
    expect(clashes).toBe(2);
    for (let press = 3; press <= 22; press++) r = await runOnDrive(c, drive, root, { claude: retry, around }, press);
    expect(clashes).toBe(22);
    expect(Object.keys(r.after).some((path) => path.includes('/abc123-run1/manifest-'))).toBe(false);
    const fresh = r.after[PATH] ?? '';
    const final = await runOnDrive(c, drive, root, { claude: retry }, 23);
    expect(final.after[PATH]).toBe(fresh.replace('- 2026-10-07 · The committee will replace the shared water butt.',
      `- 2026-10-07 · The committee will replace the shared water butt.\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]`));
    expect(reportOf(final).updated).toEqual(expect.arrayContaining([expect.objectContaining({ path: PATH, what: APPENDED })]));
    assertPersonal(final);
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

  it('C05 person notes: fix 1 finding 4: a completed replay cannot consume the new request for the same note', async () => {
    await positiveControl();
    const c = await fixture(); const drive = fixedDrive(); const root = await seedCase(drive, c);
    const first = await runOnDrive(c, drive, root, { claude: appendReply() }, 1);
    expect(first.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
    const source = await addNextSource(first, true);
    const text = 'Alex has received the new instructions.';
    const r = await runOnDrive(c, drive, root, { request: { kind: 'replay', id: 'change-1' }, claude: nextReply(source, text) }, 2);
    expect(r.requests?.map((q) => q.id)).toEqual(expect.arrayContaining(['change-1', 'change-2']));
    expect(reportOf(r).filed).toHaveLength(1);
    expect(r.after[PATH]).toContain(` · ${text} · [[Next water butt update.txt]]`);
    expect(r.after[PATH]?.split(` · ${NEWS}`).length).toBe(2);
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
    const source = await addNextSource(first, false);
    const r = await runOnDrive(c, drive, root, { request: { kind: 'replay', id: 'change-1' },
      claude: nextReply(source, 'The same requested update has different wording now.') }, 2);
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
});
