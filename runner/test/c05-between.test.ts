import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { loadCase } from '../src/corpus';
import { runScripted } from './corpus-run';

it('a real first state write precedes the personal edit and shown update', async () => {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c05-person-edited-between-runs'));
  const run = await runScripted(c);
  const path = 'Areas/Home/Garden plot.md';
  expect(run.runs?.[0]?.code).toBe(0);
  const first = run.runs?.[0]?.after[path] ?? '';
  expect(first).toContain('bower_state: ad0d49f0788bfc33');
  expect(first).toContain('## Current state\n- The committee will replace the shared water butt.');
  expect(first).not.toContain('Alex wants to paint the water butt amber.');
  expect(c.between?.[0]?.kind).toBe('edit');
  // The personal edit retained the actual first write's mark; it changed the section, never its permission.
  expect(c.between?.[0]).toEqual(expect.objectContaining({ text: expect.stringContaining('bower_state: ad0d49f0788bfc33') }));
  expect(run.code).toBe(0);
  const questions = (JSON.parse(run.after['.bower/questions.json'] ?? '{}') as { questions: Array<{ shown?: { lines: string[] }; text: string }> }).questions;
  expect(questions).toHaveLength(1);
  expect(questions[0]?.text).toContain('You changed the current state');
  expect(questions[0]?.shown?.lines).toEqual(['The replacement water butt has arrived.', 'The committee asks Alex to return the shared water butt.']);
});
