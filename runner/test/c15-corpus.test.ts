/** C15's five cases land and score through production main: the runner prepares every admitted input itself (C15 R-lines). */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { AT, replySequence, runWithClaude, scoreCase } from './corpus-run';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const CASES = ['c15-ready-package-reused', 'c15-stale-package-rebuilt', 'c15-context-budget-exhausted', 'c15-more-context-bounded', 'c15-scanned-letter'];

const obsoleteClaims = /(?<!no )\bapp(?:-side)? package\b|\b(?:app[- ]prepared|prepared (?:letter|text|extraction|artifact)|(?:proof|driver) pending|pending (?:scripted|driver)|future driver)\b/i;
async function modelFor(id: string) {
  return replySequence(JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as unknown[]);
}

describe('C15 corpus cases through main', () => {
  it('AC11 wording control: a valid negative statement is allowed', () => {
    expect('There is no app package. The runner reads current source bytes.').not.toMatch(obsoleteClaims);
  });

  it.each(['The app prepared no text.', 'A valid prepared letter is reused.', 'Scripted input proof pending.', 'The app package is reused.'])('AC11 obsolete claim control: %s', (text) => {
    expect(text).toMatch(obsoleteClaims);
  });

  it('AC12 missing replies fail during setup before main', async () => {
    await expect(modelFor('c15-missing-replies')).rejects.toThrow(/ENOENT.*replies\.json/);
  });

  it.each(CASES)('AC11 c15-corpus-fixtures-landed: %s has scripted replies and no claim of an app package or a pending driver', async (id) => {
    const c = await loadCase(join(ROOT, id));
    expect(existsSync(join(ROOT, id, 'replies.json')), 'scripted replies').toBe(true);
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ kind?: string }>;
    expect(replies.length).toBeGreaterThan(0);
    const created = c.expected.report?.created;
    if (created) expect(created, 'the first run\'s health note is expected').toContain('Bower health.md');
    expect(`${c.title}\n${c.source}\n${c.rubric}`, 'the runner prepares its own input: no app package, no pending proof').not.toMatch(obsoleteClaims);
  });

  it('AC12 the PDF outcome requires both source notes', async () => {
    const c = await loadCase(join(ROOT, 'c15-more-context-bounded'));
    expect(c.expected.notes?.map((note) => note.path)).toEqual(['Resources/Move/Contract.md', 'Resources/Move/Letter.md']);
  });

  it.each(CASES)('AC12 c15-corpus-case: %s through main scores clean with selection and execution only', async (id) => {
    const c = await loadCase(join(ROOT, id));
    const model = await modelFor(id);
    const inputs: string[] = [];
    const run = await runWithClaude(c, async (call) => { inputs.push(call.input); return model(call); });
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    if (id === 'c15-more-context-bounded') {
      for (const path of ['Resources/Move/Contract.md', 'Resources/Move/Letter.md']) {
        const after = Object.fromEntries(Object.entries(run.after).filter(([file]) => file !== path));
        expect(scoreCase(c, { ...run, after }).unmet).toContain(`missing file: ${path}`);
      }
    }
    expect(inputs.filter((i) => /"synopsis":/.test(i.split('\n').at(-1) ?? '')), 'no long text read whole in these cases').toHaveLength(0);
  });
});
