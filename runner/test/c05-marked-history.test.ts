import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { loadCase } from '../src/corpus';
import { runScripted } from './corpus-run';

it('the marked state was actually written and its previous lines remain in undo evidence', async () => {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c05-marked-state-keeps-history'));
  const run = await runScripted(c);
  expect(run.runs?.[0]?.code).toBe(0);
  expect(run.runs?.[0]?.after['Areas/Home/Garden plot.md']).toContain('bower_state: ad0d49f0788bfc33');
  expect(run.code).toBe(0);
  const edits: Array<Record<string, unknown>> = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>;
      if (row.kind === 'state-rewrite') edits.push(row);
      Object.values(row).forEach(visit);
    }
  };
  for (const [path, text] of Object.entries(run.after)) if (path.startsWith('.bower/') && path.endsWith('.json')) visit(JSON.parse(text) as unknown);
  expect(edits).toContainEqual(expect.objectContaining({ previous: ['The committee will replace the shared water butt.'], lines: ['The replacement water butt has arrived.', 'The committee asks Alex to return the shared water butt.'] }));
});
