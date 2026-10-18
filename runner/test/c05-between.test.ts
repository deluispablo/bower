import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import type { Change, ManifestV2 } from '../../src/data/contracts/run-manifest';
import { loadCase } from '../src/corpus';
import { runScripted, scoreCase, type CaseRun } from './corpus-run';

const PLOT = 'Areas/Home/Garden plot.md';
const SHOWN = ['The replacement water butt has arrived.', 'The committee asks Alex to return the shared water butt.'];
type Stored = { questions: Array<{ text: string; shown?: { lines: string[] } }> };

/** The plot's state rewrites in one press's manifests (`.bower/runs/<id>/manifest-*.json`). */
const stateRewrites = (files: Record<string, string>): Change[] =>
  Object.entries(files)
    .filter(([p]) => /^\.bower\/runs\/[^/]+\/manifest-[^/]+\.json$/.test(p))
    .flatMap(([, text]) => (JSON.parse(text) as ManifestV2).operations)
    .flatMap((o) => (o.effect.kind === 'edit-text' && o.effect.path === PLOT ? o.effect.changes : []))
    .filter((ch) => ch.kind === 'state-rewrite');

it('corpus-fix-c05-c07-state AC1: person edits occur between real runs and remain protected', async () => {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c05-person-edited-between-runs'));
  // The red on main: the edit sat in the legacy `between`, with no replay press and no per-press expectations.
  expect(c.between).toBeUndefined();
  expect(c.presses).toHaveLength(2);
  const edit = c.presses?.[0]?.between ?? [];
  expect(edit).toHaveLength(1);
  expect(edit[0]).toEqual(expect.objectContaining({ kind: 'edit', path: PLOT, text: expect.stringContaining('bower_state: ad0d49f0788bfc33') }));
  expect(c.presses?.[1]).toEqual({});
  expect(c.expected.runs).toHaveLength(3);
  expect(c.rubric).not.toMatch(/second-run snapshot|This snapshot does not prove|scripted driver must run once|read-to-write race/);

  const run = await runScripted(c);
  const runs: CaseRun[] = [...(run.runs ?? []), run];
  expect(runs.map((r) => r.code)).toEqual([0, 0, 0]);
  const [one, two, three] = runs as [CaseRun, CaseRun, CaseRun];

  const first = one.after[PLOT] ?? '';
  expect(first).toContain('bower_state: ad0d49f0788bfc33');
  expect(first).toContain('## Current state\n- The committee will replace the shared water butt.');
  expect(first).not.toContain('Alex wants to paint the water butt amber.');

  const editText = (edit[0] as { text: string }).text;
  const alex = editText.slice(editText.indexOf('## Current state'), editText.indexOf('\n\n## Timeline'));
  expect(alex).toContain('## My plans\nAlex wants to paint the water butt amber.');
  expect(two.after[PLOT]).toContain(alex);
  const asked = (JSON.parse(two.after['.bower/questions.json'] ?? '{}') as Stored).questions;
  expect(asked).toHaveLength(1);
  expect(asked[0]?.text).toContain('You changed the current state');
  expect(asked[0]?.shown?.lines).toEqual(SHOWN);
  // Every manifest of the three presses is in the final folder; only press 1's first write is a state rewrite.
  expect(stateRewrites(run.after)).toEqual([expect.objectContaining({ kind: 'state-rewrite', previous: [] })]);
  expect(stateRewrites(one.after)).toHaveLength(1);

  expect(three.after[PLOT]).toBe(two.after[PLOT]);
  expect(three.after['.bower/questions.json']).toBe(two.after['.bower/questions.json']);
  const report = (three.lastRun as { run?: { report?: Record<string, unknown> } } | null)?.run?.report;
  expect(report).toEqual(expect.objectContaining({ filed: [], updated: [], questions: [] }));
  expect((three.after[PLOT] ?? '').split('## Timeline\n')[1]?.trim().split('\n')).toHaveLength(3);

  expect(scoreCase(c, run)).toEqual({ pass: true, unmet: [] });
});
