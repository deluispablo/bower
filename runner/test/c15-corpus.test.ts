/** C15's five cases land and score through production main: the runner prepares every admitted input itself (C15 R-lines). */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { AT, caseReplies, runWithClaude } from './corpus-run';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const CASES = ['c15-ready-package-reused', 'c15-stale-package-rebuilt', 'c15-context-budget-exhausted', 'c15-more-context-bounded', 'c15-scanned-letter'];

describe('C15 corpus cases through main', () => {
  it.each(CASES)('AC11 c15-corpus-fixtures-landed: %s has scripted replies and no claim of an app package or a pending driver', async (id) => {
    const c = await loadCase(join(ROOT, id));
    expect(existsSync(join(ROOT, id, 'replies.json')), 'scripted replies').toBe(true);
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ kind?: string }>;
    expect(replies.length).toBeGreaterThan(0);
    const created = c.expected.report?.created;
    if (created) expect(created, 'the first run\'s health note is expected').toContain('Bower health.md');
    expect(`${c.title}\n${c.source}\n${c.rubric}`, 'the runner prepares its own input: no app package, no pending proof').not.toMatch(/package|pending|prepared extraction|future driver/i);
  });

  it.each(CASES)('AC12 c15-corpus-case: %s through main scores clean with selection and execution only', async (id) => {
    const c = await loadCase(join(ROOT, id));
    const model = caseReplies(id);
    const inputs: string[] = [];
    const run = await runWithClaude(c, async (call) => { inputs.push(call.input); return model(call); });
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(inputs.filter((i) => /"synopsis":/.test(i.split('\n').at(-1) ?? '')), 'no long text read whole in these cases').toHaveLength(0);
  });
});
