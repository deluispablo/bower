/**
 * C07 c07-prompt (specs/c07-disagreement/spec.md AC1): the execution prompt states when two claims disagree, that a
 * disagreement is one Contradiction line with both sources and no question, that a dated or replacing change is
 * ordinary history, and that a condition is Uncertain.
 */
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase, type LoadedCase } from '../src/corpus';
import { replySequence, runWithClaude } from './corpus-run';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const load = (id: string): Promise<LoadedCase> => loadCase(join(ROOT, id));
const isExecution = (call: ClaudeCall): boolean => (JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { selection?: unknown }).selection !== undefined;
/** Every call's phase, in order, and the inputs seen. */
function counted(spawn: ClaudeSpawn) {
  const calls: Array<'selection' | 'execution'> = [];
  const inputs: string[] = [];
  return { calls, inputs, spawn: async (call: ClaudeCall) => {
    calls.push(isExecution(call) ? 'execution' : 'selection');
    inputs.push(call.input);
    return spawn(call);
  } };
}

it('AC1 c07-prompt: the execution prompt states the disagreement rule (R1-R4)', async () => {
  const c = await load('c07-same-period-rent');
  const { calls, inputs, spawn } = counted(replySequence([{ kind: 'tidy-intent', v: 1, things: [] }]));
  await runWithClaude(c, spawn);
  const execution = inputs.find((_input, i) => calls[i] === 'execution') ?? '';
  const instructions = execution.slice(0, execution.lastIndexOf('\n'));
  expect(instructions, 'the execution prompt was sent').toMatch(/You plan one Bower tidy-up/);
  expect(instructions, 'R1: same thing, detail and period that cannot both hold').toMatch(/two claims about the same thing, detail and period that cannot both hold/);
  expect(instructions, 'R1: never a winner by date').toMatch(/never [^.]*pick one by (?:its )?date/i);
  expect(instructions, 'R1: one contradiction line, the other source in alsoCites').toMatch(/marker "contradiction"[^.]*"alsoCites"[^.]*ask nothing/);
  expect(instructions, 'R2: no question').toMatch(/ask nothing/i);
  expect(instructions, 'R3: a dated or replacing change is ordinary history').toMatch(/replaces the earlier claim is ordinary history,\s+no marker/);
  expect(instructions, 'R4: a condition is uncertain').toMatch(/condition[^.]*"uncertain"/);
});
