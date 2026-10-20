/**
 * qa-prod-8-F1b: the fixed prompt names the views grammar (B11 R14, never added), so a request such as "suggest a view, but
 * ask me before saving it" is a "views" proposal and not a question; and "asks" are never about a request, in the prompt and
 * in the refusal (specs/qa-prod-8/plan.md, F1b). Prior art: Anthropic, "Be clear and direct" (the model is told the format
 * it must produce, and instructions do not conflict); the prompt's own Maps clause. The run goes through production main
 * over the made-up c17-b11-proposal-authority folder, the request live Claude asked about; only the model is replaced.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { REFUSALS, type ClaudeSpawn } from '../src/claude';
import { AT, frameOf, promptOf, replySequence, runWithClaude, splitPrompt } from './corpus-run';

const CASE = resolve(import.meta.dirname, '../../testing/corpus/c17-b11-proposal-authority');

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** The case on its own replies (a "views" proposal), and its first execution call's instructions as the model reads them. */
async function instructions(): Promise<string> {
  const c = await loadCase(CASE);
  const answer = replySequence(JSON.parse(await readFile(join(CASE, 'replies.json'), 'utf8')) as unknown[]);
  const executions: string[] = [];
  const spawn: ClaudeSpawn = async (call) => {
    if ((frameOf(call) as { selection?: unknown }).selection !== undefined) executions.push(promptOf(call));
    return answer(call);
  };
  const r = await runWithClaude(c, spawn);
  expect(r.code, 'the case files on its own replies').toBe(0);
  const text = splitPrompt(executions[0] ?? '').instructions;
  expect(text, 'the execution prompt was sent').toMatch(/You plan one Bower tidy-up/);
  return text;
}

describe('qa-prod-8-F1b', () => {
  it('AC1 qa8-prompt-names-views: the instructions hold a Views clause with its keys, homes, modes and measures', async () => {
    const text = await instructions();
    const clause = /^Views: .*$/m.exec(text)?.[0] ?? '';
    expect(clause, 'R1: a Views clause on its own line').not.toBe('');
    expect(text.indexOf(clause), 'R1: beside the Maps clause').toBeGreaterThan(text.indexOf('Maps: '));
    for (const key of ['"views"', '"requestId"', '"home"', '"kind":"moc"', '"kind":"type-row"', '"rowId"', '"mode"', '"install"', '"propose"', '"definition"',
      '"aggregate"', '"set"', '"groupBy"', '"measures"', '"formula"', '"outputs"', '"column"', '"text"', '"yes"', '"no"']) {
      expect(clause, `R1: the clause names ${key}`).toContain(key);
    }
    for (const op of ['count', 'countValues', 'top', 'sum', 'average', 'median', 'min', 'max', 'range', 'earliest', 'latest']) {
      expect(clause, `R1: the measure "${op}"`).toContain(`"${op}"`);
    }
    expect(clause, 'R1: a proposal is asked once and installed on a yes').toMatch(/"propose"[^.]*"text", "yes" and "no"[^.]*asks it once[^.]*on a yes/);
  });

  it('AC2 qa8-asks-never-about-a-request: the instructions and the refusal say a request is never asked about', async () => {
    const text = await instructions();
    expect(text, 'R2: the asks step').toMatch(/"asks"[^.]*never about a request/);
    expect(REFUSALS.askNotAdmitted, 'R3: the refusal').toMatch(/never asked about in "asks"/);
    expect(REFUSALS.askNotAdmitted, 'R3: the old sentence leads').toMatch(/^a question about a thing or pile it was not admitted to take; /);
  });
});
