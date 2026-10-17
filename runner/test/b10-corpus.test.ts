/** B10's four corpus cases land and score through production main, with the driver answering synopsis calls (TL-P4-52 B10). */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import type { ClaudeCall, ClaudeExit } from '../src/claude';
import { frameOf, AT, caseReplies, replySequence, runWithClaude } from './corpus-run';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
/** Each case and the synopsis calls its run makes: a complete long text gets one; a partial one none. */
const CASES: Array<[string, number]> = [['c17-b10-complete-tail', 1], ['c17-b10-personal-original', 1], ['c17-b10-partial-pdf', 0], ['c17-b10-shared-budget', 0]];
type Entry = { kind?: string; name?: string; statements?: Array<{ text: string; parts: unknown[] }> };

describe('B10 corpus cases through main', () => {
  it.each(CASES)('AC9 b10-corpus-fixtures-landed: %s has scripted replies, its health note expected and no review-only specimen', async (id, synopses) => {
    const c = await loadCase(join(ROOT, id));
    expect(existsSync(join(ROOT, id, 'replies.json')), 'scripted replies').toBe(true);
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Entry[];
    const entries = replies.filter((r) => r.kind === 'synopsis');
    expect(entries, 'one synopsis entry per long text read whole').toHaveLength(synopses);
    for (const e of entries) {
      expect(c.inbox.flatMap((p) => p.files), 'the entry names an inbox file').toContain(e.name);
      expect(e.statements?.length, 'at least one statement').toBeGreaterThan(0);
      for (const s of e.statements ?? []) for (const part of s.parts) {
        expect(String(part), 'parts are bound by a phrase of the original').toMatch(/^\$part:.+/);
        expect(c.inboxFiles[e.name ?? ''] ?? '', 'the phrase is in the original, so it binds a part').toContain(String(part).slice('$part:'.length));
      }
    }
    expect(replies.filter((r) => r.kind === 'tidy-intent').length, 'at least one execution reply').toBeGreaterThan(0);
    expect(c.expected.report?.created ?? [], 'the first run\'s health note is expected').toContain('Bower health.md');
    expect(existsSync(join(ROOT, id, 'oracle.json')), 'the review-only oracle lives in the reds').toBe(false);
    expect(`${c.source}\n${c.rubric}`, 'no pending-proof wording').not.toMatch(/pending|future driver/i);
  });

  it.each(CASES)('AC10 b10-corpus-case: %s through main scores clean with its synopsis calls, each accepted and shown to both planning phases', async (id, synopses) => {
    const c = await loadCase(join(ROOT, id));
    const model = caseReplies(id);
    const entries = (JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Entry[]).filter((r) => r.kind === 'synopsis');
    let made = 0;
    const shown: Record<'selection' | 'execution', string[]> = { selection: [], execution: [] };
    const run = await runWithClaude(c, async (call) => {
      const frame = frameOf(call) as { synopsis?: unknown; selection?: unknown; piles?: Array<{ things: Array<{ text?: string | null }> }> };
      if (frame.synopsis) made++;
      else shown[frame.selection === undefined ? 'selection' : 'execution'].push((frame.piles ?? []).flatMap((p) => p.things).map((t) => t.text ?? '').join('\n'));
      return model(call);
    });
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(made, 'synopsis calls').toBe(synopses);
    const logged = [...vi.mocked(console.error).mock.calls, ...vi.mocked(console.log).mock.calls].flat().map(String).join('\n');
    expect(logged, 'no synopsis was refused or left unmade').not.toMatch(/synopsis of a long text/);
    for (const phase of ['selection', 'execution'] as const) {
      expect(shown[phase].length, `${phase} was called`).toBeGreaterThan(0);
      for (const text of shown[phase]) {
        expect(text.includes("Bower's synopsis of the whole text"), `${phase} shows a synopsis only where one was made`).toBe(synopses > 0);
        for (const e of entries) for (const s of e.statements ?? []) expect(text, `${phase} shows the statement`).toContain(`- ${s.text}`);
      }
    }
  });
});

// The driver's synopsis answer (R15), alone and through main.
const synopsisCall = (name: string, parts: string[]): ClaudeCall => ({ command: 'claude', args: [], env: {}, cwd: '/run', timeoutMs: 1, maxBytes: 1,
  input: `PROMPT\n${JSON.stringify({ synopsis: { name, words: 3100, parts: parts.map((text, i) => ({ n: i + 1, text })) } })}` });
const resultOf = (exit: ClaudeExit): unknown => JSON.parse(String((JSON.parse(exit.stdout) as { result: unknown }).result));
const entry = (name: string, ...phrases: string[]) => ({ kind: 'synopsis', name, statements: [{ text: `About ${name}.`, parts: phrases.map((p) => `$part:${p}`) }] });

describe('B10 the driver answers synopsis calls', () => {
  it('AC10 b10-corpus-driver-bind: a $part: phrase binds to the first part holding it, and a repeated phrase never binds a later one', async () => {
    const spawn = replySequence([entry('A.txt', 'Final terms', 'Reply by'), entry('A.txt', 'Reply by')]);
    const parts = ['Opening text.', 'Reply by the date.', 'Final terms. Reply by again.'];
    expect(resultOf(await spawn(synopsisCall('A.txt', parts)))).toEqual({ statements: [{ text: 'About A.txt.', parts: [3, 2] }] });
  });

  it('AC10 b10-corpus-driver-split-phrase: a phrase no single part holds fails, never another citation', async () => {
    const spawn = replySequence([entry('A.txt', 'text.\n\nReply')]);
    const parts = ['Opening text.', 'Reply by the date.'];
    await expect(spawn(synopsisCall('A.txt', parts))).rejects.toThrow(/\$part:text\./);
  });

  it('AC10 b10-corpus-driver-named: two documents each get their own entry, whatever the order; a missing entry is an empty, refused synopsis', async () => {
    const spawn = replySequence([entry('B.txt', 'Beta'), entry('A.txt', 'Alpha'), { kind: 'tidy-intent', v: 1, things: [] }]);
    expect(resultOf(await spawn(synopsisCall('A.txt', ['Alpha'])))).toEqual({ statements: [{ text: 'About A.txt.', parts: [1] }] });
    expect(resultOf(await spawn(synopsisCall('B.txt', ['Beta'])))).toEqual({ statements: [{ text: 'About B.txt.', parts: [1] }] });
    expect(resultOf(await spawn(synopsisCall('C.txt', ['Gamma']))), 'no entry: empty').toEqual({ statements: [] });
  });
});

const words = (n: number, seed: string): string => {
  const tokens = seed.split(' ');
  return Array.from({ length: n }, (_, i) => (tokens[i % tokens.length] ?? '') + ((i + 1) % 12 === 0 ? '\n' : ' ')).join('').trimEnd() + '\n';
};
const INTENT = { kind: 'tidy-intent', v: 1, things: [] };
const longPair = async () => {
  const c = await loadCase(join(ROOT, 'c17-b10-complete-tail'));
  return { ...c, inbox: [{ line: 'File these with Gardening.', files: ['Guide A.txt', 'Guide B.txt'] }], expected: {}, bowerOwned: [],
    inboxFiles: { 'Guide A.txt': words(3100, 'Alex sows seed rows near the shed today.'), 'Guide B.txt': words(3100, 'Alex waters mint beds beside the gate daily.') } };
};
/** What the driver answered each call, in order, by what the call was. */
async function recorded(c: Awaited<ReturnType<typeof longPair>>, replies: unknown[]) {
  const spawn = replySequence(replies);
  const out: Array<{ kind: string; name?: string; reply: string }> = [];
  const run = await runWithClaude(c, async (call) => {
    const frame = frameOf(call) as { synopsis?: { name: string }; selection?: unknown };
    const exit = await spawn(call);
    const reply = String((JSON.parse(exit.stdout) as { result?: unknown }).result);
    out.push(frame.synopsis ? { kind: 'synopsis', name: frame.synopsis.name, reply } : { kind: frame.selection === undefined ? 'selection' : 'execution', reply });
    return exit;
  });
  return { run, out };
}

describe('B10 the driver through main', () => {
  it('AC10 b10-corpus-driver-fallback: a long text with no entry is refused empty, the planner sees the part that fits, and the execution reply is still the first', async () => {
    const { run, out } = await recorded(await longPair(), [entry('Guide A.txt', 'shed today'), INTENT]);
    expect(out.filter((x) => x.kind === 'synopsis').map((x) => x.name), 'both long texts were asked, in shown order').toEqual(['Guide A.txt', 'Guide B.txt']);
    expect(JSON.parse(out.find((x) => x.name === 'Guide B.txt')?.reply ?? '')).toEqual({ statements: [] });
    expect(vi.mocked(console.error).mock.calls.flat().map(String).join('\n')).toMatch(/The synopsis of a long text was refused \(synopsisKeys\)/);
    expect(out.filter((x) => x.kind === 'execution').every((x) => x.reply === JSON.stringify(INTENT)), 'execution never gets a synopsis entry').toBe(true);
    expect(run.code).toBe(0);
  });

  it('AC10 b10-corpus-driver-turns: two named documents, an execution retry and a later press each take their own reply and never a synopsis entry', async () => {
    const bad = { ...INTENT, bogus: 1 };
    const second = { ...INTENT, keep: [] };
    const c = { ...await longPair(), presses: [{}] };
    const { out } = await recorded(c, [entry('Guide B.txt', 'mint beds'), bad, entry('Guide A.txt', 'shed today'), second]);
    const asked = out.filter((x) => x.kind === 'synopsis');
    expect(asked.length % 2, 'two long texts a press').toBe(0);
    for (const x of asked) expect(JSON.parse(x.reply), x.name).toEqual({ statements: [{ text: `About ${x.name}.`, parts: [1] }] });
    const execs = out.filter((x) => x.kind === 'execution').map((x) => x.reply);
    expect(execs.length, 'the refused reply was retried, and a later press ran').toBeGreaterThan(2);
    expect(new Set(execs.slice(0, execs.indexOf(JSON.stringify(second)))), 'the first press and its retry keep one reply').toEqual(new Set([JSON.stringify(bad)]));
    expect(execs.at(-1), 'the later press takes the next reply').toBe(JSON.stringify(second));
  });
});
