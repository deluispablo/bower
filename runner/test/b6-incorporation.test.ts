/** B6b reds through production main. Offline precedents: https://zod.dev/api and
 * https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents */
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseNote, serializeNote } from '../../src/data/contracts/note-format';
import { NOTE_TEMPLATES } from '../../src/data/contracts/note-templates';
import type { Question } from '../../src/data/contracts/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM, type RetrievalFile } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';
import { loadCase } from '../src/corpus';
import { AT, redispatchCase, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';

const WATER = 'Resources/Rainwater/Rainwater.md';
const ARTICLE = 'Alex records rainwater collection as reference material.';
const GOAL = 'Alex will sell the bicycle by the end of October.';
const empty = { kind: 'tidy-intent', v: 1, things: [] };
const pageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = pageSize; });

function note(summary: string, type = 'concept'): string {
  const text = serializeNote({ summary, byBower: true,
    properties: [{ key: 'type', label: 'Type', value: type }], tags: [], currentState: [],
    body: '## My notes\nAlex keeps this sentence.', timeline: [] });
  // B1's legacy MOC fixture keeps its Timeline and declares the three existing maintenance regions.
  if (type !== 'moc') return text;
  return text + Object.entries({ 'moc-overview': '## Overview\n\nRainwater reference material.\n',
    'moc-figures': '## Figures\n\n', 'moc-members': '## Notes\n\n' })
    .map(([region, body]) => `\n<!-- bower:ownership/2 begin ${region} -->\n${body}<!-- bower:ownership/2 end ${region} -->\n`).join('');
}

async function setup(folder: Record<string, string> = { [WATER]: note(ARTICLE) },
  inbox = [{ line: ARTICLE, files: ['Article.txt'] }], inboxFiles: Record<string, string> = { 'Article.txt': ARTICLE }) {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/b1-index-job-offer'));
  Object.assign(c, { folder, folderBinary: {}, inbox, inboxFiles, inboxBinary: {}, journal: [], questions: [],
    expected: {}, scope: 'all', presses: undefined, between: undefined,
    bowerOwned: Object.keys(folder) });
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const ix = VaultIndex.build(root, await drive.listAll(root));
  const id = (path: string): string => {
    const found = ix.idOf(path);
    expect(found, `fixture identity: ${path}`).toBeDefined();
    return found ?? '';
  };
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'b6-admission' });
  expect(admitted.kind, 'a real Worker admission reaches main').toBe('manifest');
  if (admitted.kind !== 'manifest') throw new Error('Expected B6 admission.');
  const source = (name = 'Article.txt'): string => {
    const found = admitted.manifest.piles.flatMap((p) => p.items).find((f) => f.name === name);
    expect(found, `admitted source: ${name}`).toBeDefined();
    return found?.fileId ?? '';
  };
  return { c, drive, root, ix, id, source, admission: admitted.manifest };
}
type Base = Awaited<ReturnType<typeof setup>>;
type Frame = { input: string; selection?: unknown; sources?: Array<{ itemId: string; candidates: Array<{ id: string }> }>; index?: string };

function select(b: Base, to: string, wants: string[] = [], name = 'Article.txt') {
  const destination = b.ix.file(to)?.folder ? b.id(to)
    : { parentId: b.id(to.slice(0, to.lastIndexOf('/'))), name: to.split('/').at(-1) ?? '' };
  return { items: [{ itemId: b.source(name), kind: 'unknown', destination, wants }], asks: [] };
}

/** Script only semantic replies. main owns selection validation, planning, effects and the report barrier.
 * B1d's sources/selection frames distinguish phases; the pre-integration provider requests execution directly. */
async function run(b: Base, selection: unknown, execution: unknown, retry = execution, press = 1) {
  const frames: Frame[] = [];
  const errorsAt = vi.mocked(console.error).mock.calls.length;
  const claude: ClaudeSpawn = async (call: ClaudeCall) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Frame;
    frames.push({ ...frame, input: call.input });
    const isSelection = frame.sources !== undefined && frame.selection === undefined;
    const value = isSelection ? selection : /^Your reply was refused:/m.test(call.input) ? retry : execution;
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success',
      is_error: false, result: JSON.stringify(value), usage: { input_tokens: 10, output_tokens: 10 } }) };
  };
  const result = await runOnDrive(b.c, b.drive, b.root, { claude, pacing: { baseMs: 0, sleep: async () => {} },
    ...(press === 1 ? { admission: b.admission } : { answerStart: { scope: 'all' as const, requestId: 'b6-answer' } }),
  }, press);
  return { ...result, frames, claude,
    errors: vi.mocked(console.error).mock.calls.slice(errorsAt).flat().map(String).join('\n') };
}

const report = (r: CaseRun) => (r.lastRun as { run?: { report?: { filed: unknown[]; created: unknown[]; questions: unknown[] } } } | null)
  ?.run?.report ?? { filed: [], created: [], questions: [] };
const questions = (r: CaseRun): Question[] => (JSON.parse(r.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
const visibleNotes = (r: CaseRun) => Object.keys(r.after).filter((p) => /^(Projects|Areas|Resources|Archive)\/.+\.md$/.test(p)).sort();
function done(r: Awaited<ReturnType<typeof run>>, count: number) {
  expect(r.code, r.errors).toBe(0);
  expect(r.wire?.statuses.at(-1)?.phase, r.errors).toBe('done');
  expect(report(r).filed).toHaveLength(count);
}
function filing(b: Base, to = 'Resources/Rainwater', title = 'Article source', name = 'Article.txt') {
  return { ...empty, things: [{ fileId: b.source(name), to, name,
    note: { name: `${title}.md`, summary: b.c.inboxFiles[name] ?? ARTICLE, body: b.c.inboxFiles[name] ?? ARTICLE } }] };
}
function reuse(b: Base, path = WATER) {
  return { ...empty, things: [{ fileId: b.source(), to: path.slice(0, path.lastIndexOf('/')), name: 'Article.txt' }],
    lines: [{ note: path, text: ARTICLE, cites: b.source() }] };
}

it('b6-existing-fit-before-create control: no fit creates', async () => {
  const b = await setup({ 'Resources/Paper craft/Paper craft.md': note('Alex folds paper.') });
  const r = await run(b, select(b, 'Resources/Rainwater'), filing(b, 'Resources/Rainwater', 'Rainwater'));
  done(r, 1);
  expect(r.after[WATER]).toContain(ARTICLE);
  expect(r.after['Resources/Rainwater/Article.txt']).toBe(ARTICLE);
  expect(r.after['Resources/Paper craft/Paper craft.md']).toBe(b.c.folder['Resources/Paper craft/Paper craft.md']);
});

it('b6-existing-fit-before-create', async () => {
  for (const type of ['concept', 'moc']) {
    const b = await setup({ [WATER]: note(ARTICLE, type) });
    const r = await run(b, select(b, 'Resources/Rainwater', [b.id(WATER)]), filing(b, 'Resources/Rainwater', 'Rainwater'),
      type === 'moc' ? { ...empty, things: [{ fileId: b.source(), to: 'Resources/Rainwater', name: 'Article.txt' }] } : reuse(b));
    done(r, 1);
    expect(r.frames[0]?.input, 'the existing fit was actually visible').toContain('Rainwater');
    expect.soft(visibleNotes(r), 'a visible matching note or MOC wins before duplicate creation').toEqual([WATER]);
    expect(r.after['Resources/Rainwater/Article.txt']).toBe(ARTICLE);
    // A legacy MOC never takes a Timeline line (TL-P4-47 Q5): its text stays byte-identical.
    if (type === 'moc') expect(r.after[WATER]).toBe(b.c.folder[WATER]);
    else expect.soft(parseNote(WATER, r.after[WATER] ?? '').timeline, 'the existing fit receives the cited source')
      .toEqual([expect.objectContaining({ text: ARTICLE, source: 'Article.txt' })]);
  }
});

it('b6-near-name-reuses control: a clearly different name creates', async () => {
  const roof = 'Alex records roof repair as reference material.';
  const b = await setup({ [WATER]: note(ARTICLE) }, [{ line: roof, files: ['Article.txt'] }], { 'Article.txt': roof });
  const r = await run(b, select(b, 'Resources/Rainwater', [b.id(WATER)]), filing(b, 'Resources/Rainwater', 'Roof repair'));
  done(r, 1);
  expect(visibleNotes(r)).toEqual([WATER, 'Resources/Rainwater/Roof repair.md']);
  expect(r.after[WATER]).toBe(b.c.folder[WATER]);
});

it('b6-near-name-reuses', async () => {
  for (const title of ['Rain-water', 'Rainwater (2)']) {
    const b = await setup();
    const r = await run(b, select(b, 'Resources/Rainwater', [b.id(WATER)]), filing(b, 'Resources/Rainwater', title), reuse(b));
    done(r, 1);
    expect.soft(visibleNotes(r), `${title} reuses the selected Rainwater identity`).toEqual([WATER]);
    expect(r.after['Resources/Rainwater/Article.txt']).toBe(ARTICLE);
  }
});

it('b6-clear-topic-creates control: an existing fit still reuses', async () => {
  const b = await setup();
  const r = await run(b, select(b, 'Resources/Rainwater', [b.id(WATER)]), reuse(b));
  done(r, 1);
  expect(visibleNotes(r)).toEqual([WATER]);
  expect(parseNote(WATER, r.after[WATER] ?? '').timeline, r.errors).toEqual([
    expect.objectContaining({ text: ARTICLE, source: 'Article.txt' }),
  ]);
  expect(r.after[WATER]).toContain('Alex keeps this sentence.');
  expect(report(r).created).toEqual([]);
});

it('b6-clear-topic-creates', async () => {
  const b = await setup({ 'Resources/Paper craft/Paper craft.md': note('Alex folds paper.') });
  const intent = filing(b, 'Resources/Rainwater', 'Rainwater');
  const execution = { ...intent, things: intent.things.map((t) => ({ ...t, note: { ...t.note, template: 'concept' } })) };
  const r = await run(b, select(b, 'Resources/Rainwater'), execution);
  expect(r.wire?.statuses.at(-1)?.phase,
    `a clear topic carries its Concept template through main instead of refusing the template: ${r.errors}`).toBe('done');
  done(r, 1);
  const text = r.after[WATER] ?? '';
  expect(parseNote(WATER, text).properties.find((p) => p.key === 'type')?.value).toBe('concept');
  for (const heading of NOTE_TEMPLATES.concept.sections) expect(text).toContain(`## ${heading}`);
  expect(r.after['Resources/Rainwater/Article.txt']).toBe(ARTICLE);
  expect(questions(r)).toEqual([]);
  expect(Object.keys(r.pathsById).filter((id) => /^Areas\/Rainwater|^Projects\/Rainwater/.test(r.pathsById[id] ?? ''))).toEqual([]);
  expect(r.after['Resources/Paper craft/Paper craft.md']).toBe(b.c.folder['Resources/Paper craft/Paper craft.md']);
});

it('b6-clear-project-source-basis control: an ambiguous one does not create', async () => {
  const words = 'Alex has some bicycle material.';
  const b = await setup({}, [{ line: words, files: ['Article.txt'] }], { 'Article.txt': words });
  const r = await run(b, { items: [], asks: [] }, empty);
  done(r, 0);
  expect(r.pathsById[b.source()]).toMatch(/^Inbox\//);
  expect(visibleNotes(r)).toEqual([]);
  expect(Object.values(r.pathsById).filter((p) => p.startsWith('Projects/'))).toEqual([]);
});

it('b6-clear-project-source-basis', async () => {
  const b = await setup({}, [{ line: GOAL, files: ['Article.txt'] }], { 'Article.txt': GOAL });
  const intent = filing(b, 'Projects/Bicycle sale', 'Bicycle sale');
  // The basis names the admitted source identity, never an unrelated note or an invented rule line.
  const basis = { kind: 'source', fileId: b.source(), goal: GOAL };
  const execution = { ...intent, things: intent.things.map((t) => ({ ...t, basis })) };
  const selected = select(b, 'Projects/Bicycle sale');
  const selection = { ...selected, items: selected.items.map((item) => ({ ...item, basis })) };
  const r = await run(b, selection, execution);
  expect(r.frames[0]?.input, 'the goal is present in the admitted source').toContain(GOAL);
  expect(r.wire?.statuses.at(-1)?.phase,
    `a grounded admitted source can authorize a new Project without a pre-existing rule or note: ${r.errors}`).toBe('done');
  done(r, 1);
  expect(r.after['Projects/Bicycle sale/Article.txt']).toBe(GOAL);
  const text = r.after['Projects/Bicycle sale/Bicycle sale.md'] ?? '';
  for (const heading of NOTE_TEMPLATES.project.sections) expect(text).toContain(`## ${heading}`);
  expect(text).toContain(GOAL);
});

async function ambiguous(count: number) {
  const folder = Object.fromEntries(Array.from({ length: count }, (_, i) => [
    `Resources/Letters ${i + 1}/Letters ${i + 1}.md`, note('Alex keeps letters and words.'),
  ]));
  folder['Projects/Bicycle sale/Bicycle sale.md'] = note('Alex records bicycle repair.', 'project');
  const b = await setup(folder, [{ line: 'Alex has letters and bicycle material.', files: ['Letter.txt', 'Bicycle.txt'] }],
    { 'Letter.txt': 'Alex keeps letters and words.', 'Bicycle.txt': 'Alex records bicycle repair.' });
  const paths = Array.from({ length: count }, (_, i) => `Resources/Letters ${i + 1}`);
  const pile = b.admission.piles.find((p) => p.items.some((f) => f.fileId === b.source('Letter.txt')));
  expect(pile).toBeDefined();
  const words = pile?.items.find((f) => f.name === PILE_NOTE)?.fileId ?? '';
  const ask = { fileId: b.source('Letter.txt'),
    text: 'Where should Alex keep these letters?', yes: 'Choose a place', no: 'Leave here' };
  const clear = filing(b, 'Projects/Bicycle sale', 'Bicycle source', 'Bicycle.txt');
  const selection = select(b, 'Projects/Bicycle sale', [b.id('Projects/Bicycle sale/Bicycle sale.md')], 'Bicycle.txt');
  return { b, paths, words, ask, clear, selection };
}

it('b6-ambiguous-q1-file-to control: option id applies the stored folder once', async () => {
  const { b, paths, words, ask, clear, selection } = await ambiguous(2);
  const options = paths.map((path, i) => ({ folderId: b.id(path), label: `Choice ${i + 1}` }));
  const first = await run(b, { ...selection, asks: [{ ...ask, options }] }, { ...clear, asks: [{ ...ask, options }] });
  done(first, 1);
  const stored = JSON.parse(first.after[SYSTEM.questions] ?? '{}') as {
    questions: Array<Omit<Question, 'options'> & { options: Array<{ id: string; label: string; action: { kind: string; folderId: string } }> }> };
  expect(stored.questions).toHaveLength(1);
  const q = stored.questions[0];
  const chosen = q?.options[1];
  expect(chosen?.action).toEqual({ kind: 'file-to', folderId: b.id(paths[1] ?? '') });
  expect(first.pathsById[b.source('Letter.txt')]).toMatch(/^Inbox\//);
  expect(first.after[first.pathsById[words] ?? '']).toBe(`${b.c.inbox[0]?.line}\n`);
  // The real journal format, as DriveVault.answer records it; the model is given no chosen path.
  await b.drive.createText(b.id(SYSTEM.changes), 'b6-option.json', JSON.stringify({ v: 1, id: 'b6-option',
    device: 'device-1', at: AT + 1, kind: 'answer', what: 'Answered a question', questionId: q?.id,
    askedAt: q?.askedAt, answer: { option: chosen?.id } }));
  const second = await run(b, { items: [], asks: [] }, empty, empty, 2);
  done(second, 1);
  expect(second.pathsById[b.source('Letter.txt')]).toBe(`${paths[1]}/Letter.txt`);
  expect(second.after[`${paths[1]}/Letter.txt`]).toBe(b.c.inboxFiles['Letter.txt']);
  const replay = await redispatchCase(b.c, second, 2, { claude: second.claude, pacing: { baseMs: 0, sleep: async () => {} } });
  expect(replay.code).toBe(0);
  expect(replay.after).toEqual(second.after);
  expect(replay.wire?.requests.filter((r) => r.method === 'PATCH')).toEqual([]);
});

it('b6-ambiguous-q1-file-to', async () => {
  for (const count of [2, 3, 4]) {
    const { b, paths, words, ask, clear, selection } = await ambiguous(count);
    const r = await run(b, { ...selection, asks: [ask] }, { ...clear, asks: [ask] });
    done(r, 1);
    expect(r.pathsById[b.source('Bicycle.txt')]).toBe('Projects/Bicycle sale/Bicycle.txt');
    expect(r.pathsById[b.source('Letter.txt')]).toMatch(/^Inbox\//);
    expect(r.after[r.pathsById[words] ?? '']).toBe(`${b.c.inbox[0]?.line}\n`);
    const stored = JSON.parse(r.after[SYSTEM.questions] ?? '{}') as {
      questions: Array<Omit<Question, 'options'> & { options?: Array<{ id: string; action: { kind: string; folderId: string } }> }> };
    expect(stored.questions).toHaveLength(1);
    expect(report(r).questions).toHaveLength(1);
    expect.soft(stored.questions[0]?.options?.map((o) => o.action),
      `${count} visible candidate folders become stored file-to actions without model-authored ids`)
      .toEqual(paths.map((path) => ({ kind: 'file-to', folderId: b.id(path) })));
  }
});

it('b6-cut-index-no-create control: a complete index creates normally', async () => {
  const b = await setup({ 'Resources/Paper craft/Paper craft.md': note('Alex folds paper.') });
  const r = await run(b, select(b, 'Resources/Rainwater'), filing(b, 'Resources/Rainwater', 'Rainwater'));
  done(r, 1);
  expect(r.frames[0]?.index).not.toContain('index cut:');
  expect(r.after[WATER]).toContain(ARTICLE);
});

it('b6-cut-index-no-create', async () => {
  // A new folder and a new note under an existing folder are both cut off.
  for (const destination of ['Resources/Rainwater', 'Resources/Group 000']) {
    const folder = Object.fromEntries(Array.from({ length: 140 }, (_, i) => [
      `Resources/Group ${String(i).padStart(3, '0')}/Note ${String(i).padStart(3, '0')}.md`,
      note(`Evidence ${i} ${'x'.repeat(199 - `Evidence ${i} `.length)}.`),
    ]));
    const b = await setup(folder);
    // Reuse B1's warm id/version snapshot; seed reads are outside production call/byte budgets.
    const files: RetrievalFile['files'] = {};
    for (const f of await b.drive.listAll(b.root)) {
      const path = b.drive.pathOf(f.id, b.root) ?? '';
      if (!path.startsWith('Resources/') || !path.endsWith('.md')) continue;
      files[f.id] = { path, version: f.modifiedTime, summary: parseNote(path, await b.drive.readText(f.id)).summary,
        coverage: { kind: 'prefix', bytes: 4096 } };
    }
    await b.drive.createText(b.id(SYSTEM.dir), 'retrieval.json', JSON.stringify({ v: 1, folderId: b.root,
      account: 'ACCOUNT_ID', cursor: String(Number(await b.drive.getStartPageToken()) + 1), files }));
    b.drive.touch(b.id('Resources/Group 000/Note 000.md'));
    const r = await run(b, select(b, destination), filing(b, destination, 'Rainwater'), empty);
    expect(r.frames[0]?.index, 'the production candidate projection is actually cut').toMatch(/index cut: (\d+ folders omitted|context omitted)/);
    expect(r.code, r.errors).toBe(0);
    expect.soft(visibleNotes(r), 'a cut index never authorizes new note creation').toEqual(Object.keys(folder).sort());
    expect.soft(r.pathsById[b.source()], 'the original stays in the inbox when creation cannot be justified').toMatch(/^Inbox\//);
    expect.soft(report(r).filed, 'the source is not reported as filed').toEqual([]);
    expect.soft(report(r).created, 'nothing is reported as created from incomplete fit evidence').toEqual([]);
    expect(r.after[r.pathsById[b.source()] ?? '']).toBe(ARTICLE);
    const anchor = b.admission.piles[0]?.items.find((i) => i.name === PILE_NOTE)?.fileId ?? '';
    expect.soft(r.pathsById[anchor] ?? '', 'the source words also stay honest').toMatch(/^Inbox\//);
  }
});
