/** C08a through production main: a request answered by a new document note, written once in a shown folder (c08-documents AC1-AC8). */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bowerNoteRole } from '../../src/data/contracts/note-format';
import { scriptedDecisions } from '../../src/data/demo/script';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { B_FAILURE, listedPiles, planScripted, resultNoteKey, runKeys, type Decisions, type RequestPlan } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, score, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { caseReplies, frameOf, promptOf, runOnDrive, runScripted, runWithClaude, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const HUNT = 'Projects/Flat hunt';
const LARK = `${HUNT}/Larkspur Lane flat.md`;
const COBBLE = `${HUNT}/Cobble Row flat.md`;
const DOC = `${HUNT}/Shortlist comparison.md`;
const note = (summary: string, body: string) => `---\nsummary: ${summary}\nby: bower\n---\n\n${body}\n\n## Timeline\n- 2026-10-03 · Viewed the flat.\n`;
const FILES: Record<string, string> = {
  [`${HUNT}/Flat hunt.md`]: note('Alex is comparing flats in Saltmere.', '## Current state\n- Alex has not chosen a flat.'),
  [LARK]: note('The Larkspur Lane flat in Saltmere.', 'Rent: 1,450 a month.\nCommute: 24 min.\nDeposit: 1,450.\nStatus: viewing done.'),
  [COBBLE]: note('The Cobble Row flat in Saltmere.', 'Rent: 1,580 a month.\nCommute: 18 min.\nStatus: viewing booked.'),
};
const ASK = 'Compare the Larkspur Lane and Cobble Row flats in a table';
const TITLE = 'Shortlist comparison';
const SUMMARY = 'Cobble Row has the shorter commute; Larkspur Lane has the lower rent.';
const BODY = [
  '| Flat | Rent | Commute | Status |', '| --- | --- | --- | --- |',
  '| [[Larkspur Lane flat]] | 1,450 a month | 24 min | viewing done |',
  '| [[Cobble Row flat]] | 1,580 a month | 18 min | viewing booked |', '',
  'Cobble Row offers a shorter commute, while Larkspur Lane has the lower rent.', '',
  '## Sources', '', '- [[Larkspur Lane flat]]', '- [[Cobble Row flat]]',
].join('\n');
const frame = (owner: string, text: string): string => `<!-- bower:ownership/2 begin ${owner} -->\n${text}<!-- bower:ownership/2 end ${owner} -->\n`;
/** The document's bytes, as c08-document-format gives them. */
const documentText = (body: string, date = '2026-10-07'): string => ['---', `summary: ${SUMMARY}`, 'status: active', 'tags: []', 'by: bower',
  `created: "${date}"`, `updated: "${date}"`, 'type: document', 'bower_format: ownership/2', 'bower_template: document', '---', '',
  frame('document', `${body}\n`), frame('current', ''), frame('personal', '## My notes\n\n'),
  frame('timeline', `## Timeline\n- ${date} · Written for a request you made.\n`), frame('bower-note', '')].join('\n');
const DONE = `Done. See [[${TITLE}]].`;
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

/** One instructions press through main for one request: the selection wants both flats, then the given execution reply. */
async function ask(intent: (requestId: string, attempt: number, more: string[]) => unknown, o: { files?: Record<string, string>; props?: Record<string, Record<string, string>>; words?: string; more?: string[] } = {}) {
  const words = o.words ?? ASK;
  const c: LoadedCase = { id: 'c08-documents', capability: 'C08', title: 'Alex asks for a comparison', covers: 'model', source: 'new', scope: 'instructions',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...FILES, ...o.files } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c, o.props);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  const record = await drive.createText(await id(SYSTEM.changes), 'press-1.json', JSON.stringify({ v: 1, id: 'press-1', device: 'device-1', at: DAY + 1,
    kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const more: string[] = [];
  for (const [i, text] of (o.more ?? []).entries()) {
    more.push((await drive.createText(await id(SYSTEM.changes), `press-${i + 2}.json`, JSON.stringify({ v: 1, id: `press-${i + 2}`, device: 'device-1', at: DAY + 1,
      kind: 'request', what: `Asked Bower: "${text}"`, text }))).id);
  }
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => DAY + 2, newId: () => 'c08-documents-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await id(HUNT);
  const calls: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf<Frame>(call);
    calls.push(promptOf(call));
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: hunt,
      wants: s.candidates.filter((x) => x.path === LARK || x.path === COBBLE).map((x) => x.id) })), asks: [] });
    return reply(intent(record.id, attempt++, more));
  }, () => ({ drive, root, admission: admission.manifest }), true);
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: 'c08-documents-run' }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-c08' } }, 1);
  return { run, calls, words, drive, root, id };
}
const doc = (requestId: string, extra: Record<string, unknown> = {}) => ({ ...empty, documents: [{ requestId, to: HUNT, title: TITLE, summary: SUMMARY, body: BODY, ...extra }] });
const doneFor = (run: CaseRun, words: string) => ((JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ text: string; done?: string }> }).done)
  .filter((r) => r.text === words).map((r) => r.done);
const waiting = (run: CaseRun) => Object.keys(run.after).some((p) => p.startsWith(`${SYSTEM.changes}/`) && !p.startsWith(`${SYSTEM.archive}/`) && p.endsWith('press-1.json'));
const created = (run: CaseRun) => ((run.lastRun as { run?: { report?: { created?: Array<{ path: string }> } } } | null)?.run?.report?.created ?? []).map((c) => c.path);
const refusals = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => [.../was refused \((\w+)\): (.*); asking once more/.exec(line) ?? []].slice(1, 3));
const documents = (run: CaseRun) => Object.keys(run.after).filter((p) => p.startsWith(`${HUNT}/Shortlist comparison`)).sort();

const KEYS = 'a document with keys outside the intent: give {requestId, to, title, summary, body}';
const BINDING = "a document whose request is not one of the person's requests below, or a request given more than one result";
const PLACE = 'a document whose "to" is not one of the folders shown under Projects, Areas, Resources or Archive';
const TEXT = 'a document whose title, summary or body breaks the note rules: a title of at most 48 characters with no slash, a summary of one line of at most 200 characters, a body of at most 16,000 characters with no My notes, Timeline or Current state heading';
// Round 1 ruling 9: a document's links take the one link rule's own kind (noteLink), as an answer's do (claude.ts, C09 R3).
const NOT_SHOWN = 'a link to a note you were not shown: leave it out';
// The reason quotes the reply's figure, so the log gives the kind's own sentence (sec-hardening L4), as c09-answers does.
const numbers = (_n: string) => 'a number that is in none of its sources';

describe('c08-documents', () => {
  it('AC1 c08-documents-created: a document reply writes one document note, exactly, and the request\'s done row links it', async () => {
    const { run, calls, words } = await ask((requestId) => doc(requestId));
    expect(run.after[DOC]).toBe(documentText(BODY));
    expect(run.props[DOC], 'created under the request\'s own key, never the run\'s').toMatchObject({ bowerItem: await resultNoteKey('press-1') });
    expect(doneFor(run, words)).toEqual([DONE]);
    expect(waiting(run)).toBe(false);
    expect(created(run)).toContain(DOC);
    expect(Object.fromEntries(Object.keys(FILES).map((p) => [p, run.after[p] === FILES[p]]))).toEqual(Object.fromEntries(Object.keys(FILES).map((p) => [p, true])));
    expect(calls).toHaveLength(2);
  });

  const bad: Array<[string, string, string, (requestId: string) => unknown]> = [
    ['an unknown key', 'documentKeys', KEYS, (r) => doc(r, { template: 'document' })],
    ['no body', 'documentKeys', KEYS, (r) => ({ ...empty, documents: [{ requestId: r, to: HUNT, title: TITLE, summary: SUMMARY }] })],
    ['a request that is not this run\'s', 'documentBinding', BINDING, () => doc('press-0')],
    ['an answer and a document for one request', 'documentBinding', BINDING, (r) => ({ ...doc(r), answers: [{ requestId: r, text: 'See the table.' }] })],
    // Round 1 ruling 4: one result per request, whatever the key order: a map or a view beside a document for one request is the document's refusal.
    ['a map and a document for one request', 'documentBinding', BINDING, (r) => ({ ...empty, maps: [{ requestId: r, title: 'Flats', set: { type: 'flat', folderId: 'FOLDER_ID', recursive: false }, ops: [{ kind: 'tag', mode: 'add', value: 'flat' }] }], ...doc(r) })],
    ['a view and a document for one request', 'documentBinding', BINDING, (r) => ({ ...empty, views: [{ requestId: r, home: { kind: 'type-row', rowId: 'flat' }, mode: 'install', definition: {} }], ...doc(r) })],
    ['a place under Inbox', 'documentPlace', PLACE, (r) => doc(r, { to: 'Inbox' })],
    ['a place in Bower\'s own folder', 'documentPlace', PLACE, (r) => doc(r, { to: SYSTEM.dir })],
    ['a folder that is not there', 'documentPlace', PLACE, (r) => doc(r, { to: 'Projects/Flat hunt/Tables' })],
    ['an empty title', 'documentText', TEXT, (r) => doc(r, { title: '  ' })],
    ['a title with a slash', 'documentText', TEXT, (r) => doc(r, { title: 'Flats/compared' })],
    ['a title over 48 characters', 'documentText', TEXT, (r) => doc(r, { title: 'A'.repeat(49) })],
    ['a summary with a line break', 'documentText', TEXT, (r) => doc(r, { summary: 'Two lines.\nNot one.' })],
    ['a summary over 200 characters', 'documentText', TEXT, (r) => doc(r, { summary: `${'Long summary. '.repeat(15)}` })],
    ['an empty body', 'documentText', TEXT, (r) => doc(r, { body: ' ' })],
    ['a body over 16,000 characters', 'documentText', TEXT, (r) => doc(r, { body: `${BODY}\n\n${'Cobble Row is near the station. '.repeat(500)}` })],
    ['a My notes heading', 'documentText', TEXT, (r) => doc(r, { body: `${BODY}\n\n## My notes\nmine` })],
    ['a Timeline heading', 'documentText', TEXT, (r) => doc(r, { body: `${BODY}\n\n## Timeline\n- 2026-10-07 · Done.` })],
    ['an ownership marker', 'documentText', TEXT, (r) => doc(r, { body: `${BODY}\n<!-- bower:ownership/2 end document -->` })],
    ['a link to nothing in the folder', 'noteLink', NOT_SHOWN, (r) => doc(r, { body: `${BODY}\n- [[Imaginary flat]]` })],
    ['a figure in no source', 'numbers', numbers('1,900'), (r) => doc(r, { body: `${BODY}\n\nThe agent asks 1,900 to hold it.` })],
  ];
  it.each(bad)('AC2 c08-documents-refusals: %s is refused once with its own kind and reason; the corrected reply applies', async (_name, kind, why, wrong) => {
    const { run, words } = await ask((requestId, attempt) => attempt ? doc(requestId) : wrong(requestId));
    expect(refusals().slice(0, 2)).toEqual([kind, why]);
    expect(doneFor(run, words)).toEqual([DONE]);
    expect(documents(run)).toEqual([DOC]);
  });

  it('AC3 c08-documents-shared-title: when another note has the title, the done row links the document by its whole path', async () => {
    const old = 'Archive/Old flat/Shortlist comparison.md';
    const { run, words } = await ask((requestId) => doc(requestId), { files: { [old]: note('The old shortlist.', 'Two old flats.') } });
    expect(run.after[DOC]).toBe(documentText(BODY));
    expect(doneFor(run, words)).toEqual([`Done. See [[${DOC.slice(0, -3)}]].`]);
  });

  it('AC3 c08-documents-shared-title: two documents this run writes with one title link by their whole paths (round 1 ruling 6)', async () => {
    const OLD = 'Archive/Old flat';
    const again = 'Compare the old flats in a table';
    const { run, words } = await ask((requestId, _attempt, [other = '']) => ({ ...doc(requestId),
      documents: [...doc(requestId).documents, { requestId: other, to: OLD, title: TITLE, summary: SUMMARY, body: BODY }] }),
    { files: { [`${OLD}/Old flat.md`]: note('The old flat.', 'Two old flats.') }, more: [again] });
    expect(run.after[DOC]).toBe(documentText(BODY));
    expect(run.after[`${OLD}/${TITLE}.md`]).toBe(documentText(BODY));
    expect(doneFor(run, words)).toEqual([`Done. See [[${DOC.slice(0, -3)}]].`]);
    expect(doneFor(run, again)).toEqual([`Done. See [[${OLD}/${TITLE}]].`]);
  });

  it('AC4 c08-documents-name-taken: a name already taken in the folder gives the next free name; the note there is unchanged', async () => {
    const taken = note('Alex\'s own comparison.', 'Alex wrote this table.');
    const { run, words } = await ask((requestId) => doc(requestId), { files: { [DOC]: taken } });
    expect(run.after[DOC]).toBe(taken);
    expect(run.after[`${HUNT}/Shortlist comparison (2).md`]).toBe(documentText(BODY));
    expect(doneFor(run, words)).toEqual(['Done. See [[Shortlist comparison (2)]].']);
  });

  it('AC5 c08-documents-earlier-attempt: a document an earlier attempt of the request created stands; no second one is made', async () => {
    const earlier = documentText(BODY, '2026-10-06');
    const { run, words } = await ask((requestId) => doc(requestId), { files: { [DOC]: earlier }, props: { [DOC]: { by: 'bower', bowerItem: await resultNoteKey('press-1') } } });
    expect(documents(run)).toEqual([DOC]);
    expect(run.after[DOC]).toBe(earlier);
    expect(doneFor(run, words)).toEqual([DONE]);
  });

  it('AC6 c08-documents-scripted: the scripted comparison is written as a document note by the same writer', async () => {
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c08-compare-flats'));
    const run = await runScripted(c);
    const text = run.after[join(HUNT, 'Flats on the shortlist, compared.md')] ?? '';
    expect(bowerNoteRole(text)).toBe('document');
    expect(text).toContain('<!-- bower:ownership/2 begin document -->\n| Flat | Rent | Commute | Status |\n');
  });

  it('corpus-fix-c08 AC1: comparison checks factual cells missing values and citations', async () => {
    const CORPUS = resolve(import.meta.dirname, '../../testing/corpus');
    const P = `${HUNT}/Flats on the shortlist, compared.md`;
    const c = await loadCase(join(CORPUS, 'c08-compare-flats'));
    const run = await runScripted(c);
    expect(run.code).toBe(0);
    expect(run.score).toEqual({ pass: true, unmet: [] });
    const t = run.after[P] ?? '';
    const THREE = '| [[Flat 3, 12 Larkspur Lane]] |';
    const SEVEN = '| [[Flat 7, Cobble Row]] |';
    const TANNERS = '| [[Flat 2, 40 Tanners Walk]] | £1,390 a month | 35 min | maybe |';
    const LAST = '- [[Flat 2, 40 Tanners Walk]]\n<!--';
    const mutations: Array<[string, string, string]> = [
      ['wrong', t.replace('| £1,580 a month |', '| £1,500 a month |'), `tables ${P}: rows`],
      ['empty', t.replace('| 35 min |', '|  |'), `tables ${P}: rows`],
      ['invented', t.replace(TANNERS, `${TANNERS}\n| [[Flat hunt]] | £1,400 a month | 20 min | maybe |`), `tables ${P}: rows`],
      ['swapped', t.replace(THREE, '\0').replace(SEVEN, THREE).replace('\0', SEVEN), `tables ${P}: rows`],
      ['extra source', t.replace(LAST, '- [[Flat 2, 40 Tanners Walk]]\n- [[Flat hunt]]\n<!--'), `${P}: lacks "## Sources`],
      ['missing source', t.replace(LAST, '<!--'), `${P}: lacks "## Sources`],
    ];
    for (const [name, mutated, line] of mutations) {
      expect(mutated, name).not.toBe(t);
      expect(mutated, name).toContain('| Flat | Rent | Commute | Status |');
      const s = score({ expected: c.expected, before: c.folder, after: { ...run.after, [P]: mutated }, lastRun: run.lastRun });
      expect(s.pass, name).toBe(false);
      expect(s.unmet.some((u) => u.startsWith(line)), `${name}: ${s.unmet.join('; ')}`).toBe(true);
    }
    // Guard: an invented value for a fact that is missing fails c08-compare-missing-fact's own oracle.
    const m = await loadCase(join(CORPUS, 'c08-compare-missing-fact'));
    const mr = await runWithClaude(m, caseReplies('c08-compare-missing-fact'));
    expect(mr.score?.pass).toBe(true);
    const MP = `${HUNT}/Shortlist comparison.md`;
    const mt = mr.after[MP] ?? '';
    for (const value of ['| 1,580 |', '| 0 |']) {
      const mutated = mt.replace('| Not stated |', value);
      expect(mutated, value).not.toBe(mt);
      const s = score({ expected: m.expected, before: m.folder, after: { ...mr.after, [MP]: mutated }, lastRun: mr.lastRun });
      expect(s.pass, value).toBe(false);
      expect(s.unmet.some((u) => u.startsWith(`tables ${MP}: rows`)), `${value}: ${s.unmet.join('; ')}`).toBe(true);
    }
  });

  it('corpus-fix-c08 AC3: revision is described as an unimplemented lifecycle', async () => {
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c08-revise-keeps-personal-text'));
    expect(c.covers).toBe('model');
    expect(existsSync(join(c.dir, 'replies.json'))).toBe(false);
    expect(c.rubric.startsWith('Unsupported today: Bower has no operation that revises a generated document')).toBe(true);
    expect(c.rubric).toContain('Bower creates the comparison through the planner, Alex edits its personal text, Alex asks for the revision, and a replay with nothing new changes nothing');
    expect(c.rubric).not.toMatch(/^Revise the existing|until the lead rules|prep's exact empty reply|future driver/m);
    const log = readFileSync(resolve(import.meta.dirname, '../../testing/fixtures/p4-method-rubric-changes.md'), 'utf8');
    const row = log.split('\n').find((l) => l.startsWith('| c08-revise-keeps-personal-text |')) ?? '';
    expect(row).toMatch(/^\| c08-revise-keeps-personal-text \| changed \| .*unsupported/i);
    expect(row).not.toContain('revise the same sourced comparison');
  });

  it('AC7 c08-documents-prompt: the execution prompt gives the documents grammar when the run took a request', async () => {
    const { calls } = await ask((requestId) => doc(requestId));
    expect((calls[1] ?? '').split('\n').slice(0, -1).join('\n')).toMatch(/"documents":\s*\[\{"requestId":"<the request's fileId>","to":"[^"]+","title":"[^"]+","summary":"[^"]+","body":"[^"]+"\}\]/);
  });

  it('AC8 c08-documents-planner-links: the planner refuses a document plan whose body links nothing in the folder, beside its passing twin', async () => {
    const drive = fixedDrive();
    const c: LoadedCase = { id: 'c08-planner', capability: 'C08', title: 'planner', covers: 'model', source: 'new', scope: 'instructions', allowWeb: false, dir: tmpdir(),
      folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], bowerOwned: [], inbox: [], inboxFiles: {},
      journal: [{ kind: 'request', text: ASK }], folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), ...FILES } };
    const root = await seedCase(drive, c);
    const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => DAY, newId: () => 'c08-planner' });
    if (admission.kind !== 'manifest') throw new Error('Not admitted');
    const plan = async (body: string) => {
      const document = { kind: 'document', note: { to: HUNT, title: TITLE, what: SUMMARY }, body } as unknown as RequestPlan;
      const decisions: Decisions = { ...scriptedDecisions([], []), request: () => document };
      const reads = fakeRead(drive);
      try {
        await planScripted({ ...reads, provenance: 'fake-stored', piles: (rootId, context) => listedPiles(reads, rootId, undefined, undefined, context) }, root, {
          scope: 'instructions', allowWeb: false, runId: 'c08-planner', requestId: admission.manifest.id, requestedAt: admission.manifest.at,
          taken: admission.manifest, mintKey: await runKeys('c08-planner'), decisions });
        return 'planned';
      } catch (error) { return error instanceof Error ? error.message : String(error); }
    };
    expect(await plan(BODY), 'the twin').toBe('planned');
    expect(await plan(`${BODY}\n- [[Imaginary flat]]`)).toBe(B_FAILURE);
  });
});
