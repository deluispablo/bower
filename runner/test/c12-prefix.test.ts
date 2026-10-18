/**
 * C12 prefix (c12-prefix, rethink 4.2 and section 6): every planning call of a run shares one cached prefix.
 * `claude` gets `--system-prompt-file` (Claude Code CLI reference, "System prompt flags": a custom prompt replaces the
 * coding prompt; a line holding only `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` splits it, so the part above stays cached while
 * the part below changes; v2.1.275 or later). The file holds Bower's fixed instructions, the boundary, then the run's
 * shared context; stdin holds only the call's own text; a retry note goes last; the type table is shown once.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeCall, ClaudeExit } from '../src/claude';
import { claudeProvider } from '../src/claude';
import { loadCorpus } from '../src/corpus';
import { normalizeModelInput } from '../src/model-input';
import { fakeScripted } from '../../src/data/fake/fake-runner';
import { AT, runWithClaude } from './corpus-run';
import { RUN_ID, paging } from './drive-v3';
import { fileIntent, run, seedState, select, setup } from './b1-planning-support';

const BOUNDARY = '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__';
const FIRST_LINE = 'You plan one Bower tidy-up. You have no tools: never try to read, write or run anything.';
const TABLE_HEADER = '| Type | Matches | Template | Properties | Table | Group by |';
const ROOT = resolve(import.meta.dirname, '../../testing/corpus');

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

/**
 * The system prompt file a call names, read while the call runs (the run's folder is removed after it); `null` when the
 * call names none or names it by a relative path (asserted by `named`, outside the spawn, so the run itself goes on).
 */
function systemOf(call: ClaudeCall): string | null {
  const at = call.args.indexOf('--system-prompt-file');
  const path = at < 0 ? '' : call.args[at + 1] ?? '';
  return isAbsolute(path) ? readFileSync(path, 'utf8') : null;
}
function named(systems: Array<string | null>): string[] {
  expect(systems.length, 'a planning call ran').toBeGreaterThan(0);
  expect(systems.every((s) => s !== null), 'every planning call starts claude with --system-prompt-file <absolute path>').toBe(true);
  return systems.map((s) => s ?? '');
}

/** The part above the boundary line and the part below it. */
function halves(system: string): { fixed: string; context: string } {
  const lines = system.split('\n');
  expect(lines.filter((l) => l === BOUNDARY), 'one boundary line, alone on its line').toHaveLength(1);
  const at = lines.indexOf(BOUNDARY);
  return { fixed: lines.slice(0, at).join('\n'), context: lines.slice(at + 1).join('\n') };
}

/** A JSON line of a text, parsed (the run context's or the call's). */
const jsonLines = (text: string): Array<Record<string, unknown>> => text.split('\n')
  .filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Record<string, unknown>);

/** One warm run of the B1 fixture (index.md and hot.md seeded): each call's stdin and its prompt file, captured in the call. */
async function warmRun() {
  const b = await setup(); await seedState(b);
  const seen: Array<string | null> = [];
  const r = await run(b, [select(b), fileIntent(b)], { beforeReply: async (_turn, frame) => { seen.push(systemOf(frame.call)); } });
  return { b, r, seen, inputs: r.frames.map((f) => f.call.input) };
}

const envelope = (value: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 10,
  duration_api_ms: 7, num_turns: 1, result: typeof value === 'string' ? value : JSON.stringify(value), usage: { input_tokens: 10, output_tokens: 10 } });

describe('one cached prefix for every planning call (c12-prefix)', () => {
  it('AC1 c12-prefix-file: the prompt file holds the fixed instructions, the boundary, then the run context, the same for every call of the run', async () => {
    const { r, seen } = await warmRun();
    const systems = named(seen);
    expect(r.code).toBe(0);
    expect(systems, 'selection and execution each name the file').toHaveLength(2);
    expect(systems[1], 'byte for byte the same prefix for both calls').toBe(systems[0]);
    const { fixed, context } = halves(systems[0] ?? '');
    expect(fixed.split('\n')[0], 'the fixed instructions come first').toBe(FIRST_LINE);
    expect(fixed).toContain('Kinds of document: the first matching row controls.');
    for (const run of ['"runId"', '"hot"', '"indexed"', 'Existing change.', 'Projects/Remote search']) expect(fixed, `no run data above the boundary: ${run}`).not.toContain(run);
    expect(context, 'the run context follows the boundary').toContain(TABLE_HEADER);
    const shared = jsonLines(context);
    expect(shared, 'one JSON line of run context').toHaveLength(1);
    expect(Object.keys(shared[0] ?? {})).toEqual(expect.arrayContaining(['map', 'hot']));
    expect(String(shared[0]?.hot)).toContain('Existing change.');
  });

  it('AC1 c12-prefix-file: the fixed instructions are the same on every run and for every person', async () => {
    const warm = await warmRun();
    const mine = named(warm.seen);
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-garden-newsletter');
    if (!c) throw new Error('the C04 garden newsletter case is missing');
    const seen: Array<string | null> = [];
    await runWithClaude(c, async (call) => (seen.push(systemOf(call)), { code: 0, stderr: '', cut: null, stdout: envelope({ kind: 'tidy-intent', v: 1, things: [] }) }));
    const other = named(seen);
    expect(halves(other[0] ?? '').fixed).toBe(halves(mine[0] ?? '').fixed);
    expect(halves(other[0] ?? '').context, 'another folder has another run context').not.toBe(halves(mine[0] ?? '').context);
  });

  it('AC2 c12-prefix-stdin: stdin carries only the call text, never the instructions or the run context', async () => {
    const { r, inputs, seen } = await warmRun();
    const [selection, execution] = inputs;
    expect(selection?.split('\n')[0], 'selection states its task first').toMatch(/^Select context first\./);
    for (const [i, input] of inputs.entries()) {
      expect(input, `call ${i + 1} repeats no fixed instruction`).not.toContain(FIRST_LINE);
      expect(input).not.toContain('Kinds of document');
      expect(input, `call ${i + 1} repeats no type table`).not.toContain(TABLE_HEADER);
      expect(input, `call ${i + 1} repeats no hot list`).not.toContain('Existing change.');
      const own = jsonLines(input ?? '');
      expect(own, `call ${i + 1} has one JSON line`).toHaveLength(1);
      for (const key of ['index', 'hot', 'folders', 'indexed', 'rules', 'aboutMe', 'learnedFacts', 'foldersById', 'types']) {
        expect(own[0], `call ${i + 1} carries no ${key}`).not.toHaveProperty(key);
      }
      expect(own[0]).toHaveProperty('piles');
      expect(own[0]).toHaveProperty('admission');
    }
    expect(jsonLines(selection ?? '')[0]).not.toHaveProperty('selection');
    expect(jsonLines(execution ?? '')[0], 'execution carries its selection').toHaveProperty('selection');
    expect(r.frames[1]?.value).toHaveProperty('selection');
    expect(named(seen), 'what left stdin is in the prompt file').toHaveLength(2);
  });

  it('AC3 c12-prefix-retry-last: a retry repeats the first attempt whole and puts the note last, on the same prefix', async () => {
    const b = await setup(); await seedState(b);
    const calls: Array<{ input: string; system: string | null }> = [];
    const spawn = async (call: ClaudeCall): Promise<ClaudeExit> => {
      calls.push({ input: call.input, system: systemOf(call) });
      return { code: 0, stderr: '', cut: null, stdout: envelope('not intent') };
    };
    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn }, { rootId: b.root, runId: RUN_ID, allowWeb: false },
      fakeScripted(b.drive))({ taken: b.admission, deferred: [] })).rejects.toThrow();
    expect(calls, 'the selection and its one retry').toHaveLength(2);
    const [first, retry] = calls;
    expect(retry?.input.startsWith(`${first?.input ?? ''}\n`), 'the whole first attempt comes first').toBe(true);
    const note = retry?.input.slice((first?.input.length ?? 0) + 1) ?? '';
    expect(note).toMatch(/^Your reply was refused: .+\. Reply again with the whole JSON object, changed so it passes\.$/);
    expect(note, 'the note is one line, the last').not.toContain('\n');
    named(calls.map((c) => c.system));
    expect(retry?.system, 'the retry reads the same prefix').toBe(first?.system);
  });

  it('AC4 c12-prefix-types-once: the type table is shown once, as the Markdown table in the run context', async () => {
    const { b, seen, inputs } = await warmRun();
    const all = [seen[0] ?? '', ...inputs].join('\n');
    expect(all.split(TABLE_HEADER.slice(0, -2)).length - 1, 'one table header in all the model reads').toBe(1);
    expect(all, 'no JSON copy of the rows').not.toContain('"types":');
    const { context } = halves(named(seen)[0] ?? '');
    const rows = context.split('\n').filter((l) => l.startsWith('| "'));
    expect(rows.length, 'the rows are in the run context').toBeGreaterThan(0);
    // Ruling: the one table keeps every field the JSON copy had, a profile row's marker included.
    expect(context.split('\n').find((l) => l.startsWith('| Type |'))).toBe('| Type | Matches | Template | Properties | Table | Group by | Profile |');
    expect(b.c.id).toBe('b1-index-job-offer');
  });

  it('AC5 c12-prefix-fingerprint: the input fingerprint covers the prompt file and the selection stdin, in that order', async () => {
    const { r, seen, inputs } = await warmRun();
    const systems = named(seen);
    const runLine = r.consoleLines.flatMap((l) => l.split('\n')).find((l) => l.startsWith('timing:')) ?? '';
    const expected = createHash('sha256').update(normalizeModelInput(`${systems[0] ?? ''}\n${inputs[0] ?? ''}`)).digest('hex').slice(0, 12);
    expect(runLine).toContain(`input=${expected}`);
  });

  it('AC5 c12-prefix-fingerprint: the run context and the call text normalize as one input (an id named in one, resolved in the other)', () => {
    const input = (id: string): string => [
      FIRST_LINE, BOUNDARY,
      JSON.stringify({ map: [{ id: `folder-${id}`, path: 'Areas/Home', notes: 1 }] }),
      'Select context first.',
      JSON.stringify({ runId: 'r', admission: 'a', piles: [], cards: [{ id, path: 'Areas/Home/Garden plot.md', summary: 'Alex grows beans.' }], sources: [{ itemId: 'f1', candidates: [id] }] }),
    ].join('\n');
    expect(normalizeModelInput(input('drive-id-1'))).toBe(normalizeModelInput(input('drive-id-2')));
    expect(normalizeModelInput(input('drive-id-1'))).toContain('Areas/Home/Garden plot.md');
  });
});
