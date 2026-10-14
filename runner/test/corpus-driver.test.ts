import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase, score, type Expected } from '../src/corpus';
import { runWithClaude } from './corpus-run';

it("the scorer counts questions exactly and checks a pair's subject", () => {
  const pairSubject = { kind: 'pair' as const, notes: ['Projects/A.md', 'Projects/B.md'] as [string, string] };
  const check = (questions: unknown[]) => score({
    expected: { report: { questionsExactly: 1, pairSubject } }, before: {}, after: {},
    pathsById: { a: 'Projects/A.md', b: 'Projects/B.md', c: 'Projects/C.md' },
    lastRun: { run: { report: { questions } } },
  });
  expect(check([{ id: 'q-pair-a.b' }, { id: 'q-pair-a.c' }]).pass).toBe(false);
  expect(check([{ id: 'q-pair-a.c' }]).pass).toBe(false);
  expect(check([{ id: 'q-pair-b.a' }])).toEqual({ pass: true, unmet: [] });
  expect(check([]).pass).toBe(false);
});

it("a case's between step runs between two runs", async () => {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c05-merge-question-first'));
  const path = 'Projects/Flat hunt/Larkspur Lane flat.md';
  const calls: string[] = [];
  const person = `${c.folder[path]}\nAlex wants an amber kitchen.\n`;
  const run = await runWithClaude({ ...c, between: [{ kind: 'edit', path, text: person }] }, async (call) => {
    calls.push(call.input);
    const context = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as {
      selection?: unknown; sources: Array<{ itemId: string; candidates: Array<{ id: string; path: string }> }>;
      foldersById: Record<string, string>;
    };
    const destination = Object.entries(context.foldersById).find(([, path]) => path === 'Projects/Flat hunt')?.[0];
    if (context.selection === undefined && calls.length > 1) {
      expect(context.sources.some((source) => source.candidates.some((candidate) => candidate.path === path)),
        'the between-step note is a listed candidate').toBe(true);
    }
    const intent = context.selection === undefined ? { items: calls.length === 1 ? [] : context.sources.map((source) => {
      const note = source.candidates.find((candidate) => candidate.path === path);
      expect(destination).toBeDefined();
      return { itemId: source.itemId, kind: 'unknown', destination, wants: note ? [note.id] : [] };
    }), asks: [] } : { kind: 'tidy-intent', v: 1, things: [] };
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(intent) }) };
  });
  expect(calls).toHaveLength(4);
  expect(calls[0]).not.toContain('Alex wants an amber kitchen.');
  expect(calls[1]).not.toContain('Alex wants an amber kitchen.');
  expect(calls[2]).not.toContain('Alex wants an amber kitchen.'); // Selection carries metadata only.
  expect(calls[3]).toContain('Alex wants an amber kitchen.'); // Execution reads the edited note.
  expect(run.after[path]).toBe(person);
  expect(run.runs?.[0]?.code).toBe(0);
  expect(run.code).toBe(0);
});


describe('multi-press corpus', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 7, 9));
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// These cases use the production runner over one Drive, with no live model or clock waits.
const KEPT = 'Projects/Garden plot.md';
const OTHER = 'Projects/Garden plot, second.md';
const PERSONAL = 'Projects/Alex.md';
const PERSON_TEXT = '---\r\ntitle: Alex\r\n---\r\n\r\n## My thoughts\r\nAlex likes café light.\r\n\r\n## Timeline\r\n';

async function smallCase() {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c05-merge-question-first'));
  return {
    ...c, id: 'driver-garden', scope: 'all' as const, inbox: [{ line: 'Alex’s garden plot notes describe herbs.', files: [] }], questions: [],
    journal: [{ kind: 'rule' as const, text: 'Alex prefers garden notes together.' }],
    folder: {
      [KEPT]: '---\nsummary: Alex’s garden plot.\nby: bower\n---\n\n## Current state\n- Alex grows herbs.\n\n## Timeline\n- 2026-10-01 · Alex started the plot.\n',
      [OTHER]: '---\nsummary: Alex’s second garden note.\nby: bower\n---\n\n## Current state\n- Alex grows mint.\n\n## Timeline\n- 2026-10-02 · Alex saved the second note.\n',
      [PERSONAL]: PERSON_TEXT,
    },
    folderBinary: {}, inboxFiles: {}, inboxBinary: {}, bowerOwned: [KEPT, OTHER], expected: {},
  };
}

const pairAsk = { kind: 'tidy-intent', v: 1, things: [], asks: [{
  notes: [KEPT, OTHER], text: 'These notes describe Alex’s garden plot. Keep one note?', yes: 'Write it', no: 'Keep mine',
}] };
const emptyIntent = { kind: 'tidy-intent', v: 1, things: [] };

// Until the additive driver scorer exists, exercise the old scorer to expose the missing checks on assertions.
async function checkCase(c: Awaited<ReturnType<typeof smallCase>>, run: Awaited<ReturnType<typeof runWithClaude>>) {
  const driver = await import('./corpus-run');
  const enhanced: unknown = Reflect.get(driver, 'scoreCase');
  if (typeof enhanced === 'function') return enhanced(c, run) as ReturnType<typeof score>;
  return score({ expected: c.expected, before: c.folder, after: run.after, lastRun: run.lastRun, pathsById: run.pathsById });
}

it('answers a pair question through the answer path between presses', async () => {
  const { replySequence } = await import('./corpus-run');
  const c = { ...await smallCase(), presses: [
    { between: [
      { kind: 'answer' as const, question: { kind: 'pair' as const, notes: [KEPT, OTHER] as [string, string] }, yes: true },
      { kind: 'answer' as const, question: { kind: 'pair' as const, notes: [KEPT, OTHER] as [string, string] }, yes: true },
    ] },
    {},
  ] };
  const run = await runWithClaude(c, replySequence([pairAsk,
    { ...emptyIntent, keep: [{ kept: KEPT, other: OTHER }] }, emptyIntent,
  ]));
  expect(run.runs).toHaveLength(2);
  expect(run.code).toBe(0);
  expect(run.after[OTHER]).toBeUndefined();
  expect((run.after[KEPT] ?? '').match(/Alex grows mint\./g)).toHaveLength(1);
  const second = run.runs?.[1];
  expect(second?.code).toBe(0);
  expect(JSON.parse(second?.after['.bower/questions.json'] ?? '{}')).toEqual({ v: 1, questions: [] });
  expect(score({ expected: { report: { updated: [KEPT, 'Bower health.md'], questionsExactly: 0 } }, before: c.folder,
    after: second?.after ?? {}, lastRun: second?.lastRun })).toEqual({ pass: true, unmet: [] });
  expect(score({ expected: { report: { updated: [], questionsExactly: 0 } }, before: c.folder,
    after: run.after, lastRun: run.lastRun })).toEqual({ pass: true, unmet: [] });
  const records = Object.entries(run.after).filter(([path]) => path.startsWith('.bower/changes/'))
    .map(([, text]) => JSON.parse(text) as { kind: string; questionId?: string; text: string; what: string });
  const answers = records.filter((r) => r.kind === 'answer');
  expect(answers).toEqual([expect.objectContaining({ text: 'yes', what: 'Answered "Write it" to a question' })]);
  const firstQuestions = JSON.parse(run.runs?.[0]?.after['.bower/questions.json'] ?? '{}') as { questions: Array<{ id: string }> };
  expect(answers[0]?.questionId).toBe(firstQuestions.questions[0]?.id);
  expect(Object.entries(run.after).filter(([path, text]) => path.startsWith('.bower/changes/')
    && !path.includes('/archive/') && (JSON.parse(text) as { kind: string }).kind === 'answer')).toEqual([]);
});

it('keeps both notes and closes the question after Keep mine', async () => {
  const { replySequence } = await import('./corpus-run');
  const c = { ...await smallCase(), presses: [
    { between: [{ kind: 'answer' as const, question: { kind: 'pair' as const, notes: [KEPT, OTHER] as [string, string] }, yes: false }] }, {},
  ] };
  const run = await runWithClaude(c, replySequence([pairAsk, emptyIntent, emptyIntent]));
  expect(run.runs).toHaveLength(2);
  expect(run.after[KEPT]).toBe(c.folder[KEPT]);
  expect(run.after[OTHER]).toBe(c.folder[OTHER]);
  expect(score({ expected: { report: { updated: [], questionsExactly: 0 } }, before: c.folder,
    after: run.after, lastRun: run.lastRun })).toEqual({ pass: true, unmet: [] });
  const answers = Object.entries(run.after).filter(([p]) => p.startsWith('.bower/changes/'))
    .map(([, text]) => JSON.parse(text) as { kind: string; text: string; what: string }).filter((r) => r.kind === 'answer');
  expect(answers).toEqual([expect.objectContaining({ text: 'no', what: 'Answered "Keep mine" to a question' })]);
});

it('checks the first press independently of the final report', async () => {
  const { replySequence } = await import('./corpus-run');
  const c = { ...await smallCase(), presses: [{}], expected: { runs: [
    { report: { questionsExactly: 1, questionSubjects: [{ kind: 'pair' as const, notes: [KEPT, OTHER] as [string, string] }] } },
    { report: { questionsExactly: 0 } },
  ] } };
  const absent = await runWithClaude(c, replySequence([emptyIntent, emptyIntent]));
  expect((await checkCase(c, absent)).pass).toBe(false);
  const present = await runWithClaude({ ...c, presses: [{ between: [{ kind: 'answer' as const,
    question: { kind: 'pair' as const, notes: [KEPT, OTHER] as [string, string] }, yes: false }] }] },
  replySequence([pairAsk, emptyIntent]));
  expect(await checkCase(c, present)).toEqual({ pass: true, unmet: [] });
  expect(present.score).toEqual({ pass: true, unmet: [] });
});

it('a protected range fails on one changed byte', async () => {
  const { replySequence } = await import('./corpus-run');
  const c = { ...await smallCase(), between: [{ kind: 'edit' as const, path: PERSONAL, text: PERSON_TEXT.replace('light', 'Light') }],
    expected: { protectedRanges: [{ path: PERSONAL, range: { heading: 'My thoughts' } }] } };
  const run = await runWithClaude(c, replySequence([emptyIntent]));
  expect((await checkCase(c, run)).pass).toBe(false);
  expect(await checkCase(c, { ...run, after: { ...run.after, [PERSONAL]: PERSON_TEXT + '- 2026-10-07 · New line.\r\n' } }))
    .toEqual({ pass: true, unmet: [] });
  expect((await checkCase(c, { ...run, after: { ...run.after, [PERSONAL]: PERSON_TEXT.replace(/\r\n/g, '\n') } })).pass)
    .toBe(false);
});

it('compares front matter bytes and fails closed on a missing range or note', async () => {
  const { replySequence } = await import('./corpus-run');
  const c = { ...await smallCase(), expected: { protectedRanges: [{ path: PERSONAL, range: { frontMatter: true as const } }] } };
  const run = await runWithClaude(c, replySequence([emptyIntent]));
  expect(await checkCase(c, run)).toEqual({ pass: true, unmet: [] });
  expect((await checkCase(c, { ...run, after: { ...run.after, [PERSONAL]: PERSON_TEXT.replace('Alex\r', 'ALEX\r') } })).pass)
    .toBe(false);
  expect((await checkCase(c, { ...run, after: { ...run.after, [PERSONAL]: 'No front matter.\n' } })).pass).toBe(false);
  expect((await checkCase(c, { ...run, after: {} })).pass).toBe(false);
});

it('checks Drive properties directly, including absence', async () => {
  const { replySequence } = await import('./corpus-run');
  const c = { ...await smallCase(), expected: { properties: [{ path: PERSONAL, absent: ['by', 'bower_state'], equals: { custom: 'Alex' } }] } };
  const run = await runWithClaude(c, replySequence([emptyIntent]), { [PERSONAL]: { custom: 'Alex' } });
  expect(await checkCase(c, run)).toEqual({ pass: true, unmet: [] });
  const badProps: Array<Record<string, string>> = [{ custom: 'Alex', by: 'bower' }, { custom: 'Alex', bower_state: '' }, { custom: 'alex' }, {}];
  for (const props of badProps) {
    expect((await checkCase(c, { ...run, props: { ...run.props, [PERSONAL]: props } })).pass).toBe(false);
  }
  expect((await checkCase(c, { ...run, after: {} })).pass).toBe(false);
});

it('replays the original request id separately from a new tidy-up', async () => {
  const { runScripted } = await import('./corpus-run');
  const seed = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c09-closest-flat'));
  const text = 'Which flat is closest to Ferrowick?';
  const c = { ...seed, presses: [
    { request: { kind: 'replay' as const, id: 'change-1' } },
    { request: { kind: 'tidy' as const, text } },
  ] };
  const run = await runScripted(c);
  expect(run.runs).toHaveLength(2);
  expect(run.runs?.[0]?.code).toBe(0);
  expect(run.runs?.[1]?.code).toBe(0);
  expect(run.code).toBe(0);
  expect(Reflect.get(run.runs?.[0] ?? {}, 'requests')).toEqual([{ id: 'change-1', text }]);
  expect(Reflect.get(run.runs?.[1] ?? {}, 'requests')).toEqual([{ id: 'change-1', text }]);
  expect(run.runs?.[1]?.dispatch).toEqual(run.runs?.[0]?.dispatch);
  expect(Reflect.get(run, 'requests')).toEqual([{ id: 'press-3', text }]);
});

it('checks a typed state question by the resolved note id', async () => {
  const { replySequence } = await import('./corpus-run');
  const c = { ...await smallCase(), expected: { report: { questionSubjects: [{ kind: 'state' as const, note: PERSONAL }] } } };
  const run = await runWithClaude(c, replySequence([emptyIntent]));
  expect((await checkCase(c, run)).pass).toBe(false);
  const id = Object.entries(run.pathsById).find(([, path]) => path === PERSONAL)?.[0];
  const withQuestion = (question: unknown) => ({ ...run, lastRun: { run: { report: { questions: [question] } } } });
  expect(await checkCase(c, withQuestion({ id: `q-state-${id}` }))).toEqual({ pass: true, unmet: [] });
  expect((await checkCase(c, withQuestion({ id: 'q-state-other' }))).pass).toBe(false);
  expect((await checkCase(c, withQuestion({ id: `q-ask-${id}`, subject: id }))).pass).toBe(false);
});

describe.each(['final', 'per-run'] as const)('empty expectations in the %s score', (where) => {
  it.each<[string, Expected, string]>([
    ['questionSubjects', { report: { questionSubjects: [] } }, 'report.questionSubjects: expected a non-empty list'],
    ['absent', { properties: [{ path: PERSONAL, absent: [], equals: { custom: 'Alex' } }] },
      `${PERSONAL}: properties.absent: expected a non-empty list`],
    ['equals', { properties: [{ path: PERSONAL, absent: ['by'], equals: {} }] },
      `${PERSONAL}: properties.equals: expected at least one key`],
  ])('refuses empty %s', async (_field, expected, reason) => {
    const { replySequence } = await import('./corpus-run');
    const c = { ...await smallCase(), expected: where === 'final' ? expected : { runs: [expected] } };
    const run = await runWithClaude(c, replySequence([emptyIntent]), { [PERSONAL]: { custom: 'Alex' } });
    expect(run.code).toBe(0);
    expect(run.score).toEqual({ pass: false, unmet: [where === 'final' ? reason : `run 1: ${reason}`] });
  });
});

it('reports an unselected replay without consuming or writing another request', async () => {
  const { replySequence } = await import('./corpus-run');
  const text = 'Update Alex’s garden notes.';
  const seed = await smallCase();
  const c = { ...seed, journal: [...seed.journal, { kind: 'request' as const, text }],
    presses: [{ request: { kind: 'replay' as const, id: 'change-2' } }] };
  const run = await runWithClaude(c, replySequence([emptyIntent, emptyIntent]));
  const first = run.runs?.[0];
  expect(first?.code).toBe(0);
  expect(run.code).toBe(0);
  const path = '.bower/changes/change-2.json';
  const archived = '.bower/changes/archive/change-2.json';
  // Addendum 24 leaves the omitted request unconsumed across its same-run replay.
  expect(first?.after[path]).toBeDefined();
  expect(JSON.parse(first?.after[path] ?? '{}')).toEqual(expect.objectContaining({ id: 'change-2', text }));
  expect(first?.after[archived]).toBeUndefined();
  expect(run.after[path]).toBe(first?.after[path]);
  expect(run.after[archived]).toBeUndefined();
  expect(first?.after[PERSONAL]).toBe(PERSON_TEXT);
  expect(run.after[PERSONAL]).toBe(PERSON_TEXT);
  const requests = Object.entries(run.after).filter(([p, text]) => p.startsWith('.bower/changes/')
    && (JSON.parse(text) as { id: string }).id === 'change-2');
  expect(requests).toHaveLength(1);
  expect(run.requests).toEqual([{ id: 'change-2', text }]);
  expect(run.dispatch).toEqual(first?.dispatch);
  expect(Reflect.get(run, 'requestAction')).toEqual({ kind: 'replay', id: 'change-2', outcome: 'redispatched' });
});

it('reports a same-run replay and a newly written tidy-up separately', async () => {
  const { runScripted } = await import('./corpus-run');
  const seed = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c09-closest-flat'));
  const text = 'Which flat is closest to Ferrowick?';
  const run = await runScripted({ ...seed, presses: [
    { request: { kind: 'replay', id: 'change-1' } }, { request: { kind: 'tidy', text } },
  ] });
  const first = run.runs?.[0];
  const second = run.runs?.[1];
  expect(first?.code).toBe(0);
  expect(second?.code).toBe(0);
  expect(run.code).toBe(0);
  expect(first?.after['.bower/changes/change-1.json']).toBeUndefined();
  expect(first?.after['.bower/changes/archive/change-1.json']).toBeDefined();
  expect(second?.requests).toEqual([{ id: 'change-1', text }]);
  expect(second?.dispatch).toEqual(first?.dispatch);
  expect(second?.after).toEqual(first?.after);
  expect(Reflect.get(second ?? {}, 'requestAction')).toEqual({ kind: 'replay', id: 'change-1', outcome: 'redispatched' });
  expect(run.requests).toEqual([{ id: 'press-3', text }]);
  expect(Reflect.get(run, 'requestAction')).toEqual({ kind: 'tidy', id: 'press-3' });
});

});
