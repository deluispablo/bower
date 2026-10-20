/**
 * qa-prod-8-F2: a thing that is already a note (a person's `.md`, kind "note") takes no "note". The prompt says so before it
 * says a reply leaving a note out is refused, and the refusal says what to do instead, since on the retry it is the model's
 * only guidance (specs/qa-prod-8/plan.md, F2). Prior art: Anthropic, "Be clear and direct" (instructions must not conflict);
 * Instructor's reask (the retry carries the validation error). Every run goes through production main over the made-up
 * c17-b7-authority-full-cap folder; only the model is replaced.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { REFUSALS, type ClaudeCall, type ClaudeSpawn } from '../src/claude';
import { AT, frameOf, promptOf, replySequence, runWithClaude, splitPrompt } from './corpus-run';

const CASE = resolve(import.meta.dirname, '../../testing/corpus/c17-b7-authority-full-cap');
const PERSON = 'Resources/Gardening/Alex notes.md';
const SAYS = 'A thing of kind "note" is already a note, and so is a saved link filed as a ".md" note: file it as it is, with no "note".';
const FIX = 'a "note" for a thing that is already a note (kind "note", or a saved link filed as ".md"): file it as it is, with no "note"';
const LEAVES_OUT = 'Bower refuses a reply that leaves one out';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

type Thing = { fileId: string; to: string; name: string; note?: unknown };
type Intent = { kind: string; v: number; things: Thing[] };
const isExecution = (call: ClaudeCall): boolean => (frameOf(call) as { selection?: unknown }).selection !== undefined;
const isRetry = (call: ClaudeCall): boolean => /^Your reply was refused:/m.test(call.input);

/** The case, its own reply, and every execution call's prompt as the model reads it, in order. */
async function press(first: (own: Intent) => Intent) {
  const c = await loadCase(CASE);
  const own = (JSON.parse(await readFile(join(CASE, 'replies.json'), 'utf8')) as Intent[])[0] as Intent;
  const opening = replySequence([first(own)]);
  const again = replySequence([own]);
  const executions: string[] = [];
  const spawn: ClaudeSpawn = async (call) => {
    if (isExecution(call)) executions.push(promptOf(call));
    return isRetry(call) ? again(call) : opening(call);
  };
  const r = await runWithClaude(c, spawn);
  return { c, r, executions };
}

describe('qa-prod-8-F2', () => {
  it('AC1 qa8-prompt-note-kind-takes-no-note: the prompt says a thing of kind "note" takes no "note", before a missing note is refused', async () => {
    const { r, executions } = await press((own) => own);
    expect(r.code).toBe(0);
    const instructions = splitPrompt(executions[0] ?? '').instructions;
    expect(instructions, 'the execution prompt was sent').toMatch(/You plan one Bower tidy-up/);
    expect(instructions, 'R2: the exception, word for word').toContain(SAYS);
    expect(instructions.indexOf(SAYS), 'R2: the exception comes before the refusal it limits').toBeLessThan(instructions.indexOf(LEAVES_OUT));
    expect(instructions.indexOf(LEAVES_OUT)).toBeGreaterThan(-1);
    expect(instructions, 'R2: the narrower sentence is gone').not.toContain('A saved link filed as a note takes none.');
  });

  it('AC2 qa8-noteForNote-says-what-to-do: the refusal says what to do instead', () => {
    expect(REFUSALS.noteForNote).toBe(FIX);
  });

  it('AC3 qa8-retry-carries-the-fix: a note for a person\'s .md is refused with the fix, and the retry files it as it is', async () => {
    const { c, r, executions } = await press((own) => ({ ...own, things: own.things.map((t) => t.name === 'Alex notes.md'
      ? { ...t, note: { name: 'Alex notes summary.md', summary: 'Alex keeps notes on the garden.', body: 'Alex keeps notes on the garden.' } } : t) }));
    expect(r.code).toBe(0);
    expect(executions, 'one refused execution call and its retry').toHaveLength(2);
    expect(executions[1], 'R3: the retry carries the fix').toContain(`Your reply was refused: ${FIX}.`);
    expect(r.after[PERSON], 'the person\'s note keeps every byte').toBe(c.inboxFiles['Alex notes.md']);
    expect(Object.hasOwn(r.props[PERSON] ?? {}, 'by'), 'and gets no Bower mark').toBe(false);
    expect(r.after['Resources/Gardening/Alex notes summary.md']).toBeUndefined();
  });
});
