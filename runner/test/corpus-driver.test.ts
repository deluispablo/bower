import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { loadCase, score } from '../src/corpus';
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
  const c = await loadCase(resolve(import.meta.dirname, '../../harness/corpus/c05-merge-question-first'));
  const path = 'Projects/Flat hunt/Larkspur Lane flat.md';
  const calls: string[] = [];
  const person = `${c.folder[path]}\nAlex wants an amber kitchen.\n`;
  const run = await runWithClaude({ ...c, between: [{ kind: 'edit', path, text: person }] }, async (call) => {
    calls.push(call.input);
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify({ kind: 'tidy-intent', v: 1, things: [] }) }) };
  });
  expect(calls).toHaveLength(2);
  expect(calls[0]).not.toContain('Alex wants an amber kitchen.');
  expect(calls[1]).toContain('Alex wants an amber kitchen.');
  expect(run.after[path]).toBe(person);
  expect(run.runs?.[0]?.code).toBe(0);
  expect(run.code).toBe(0);
});
