/** B10's four corpus cases land and score through production main, with the driver answering synopsis calls (TL-P4-52 B10). */
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

  it.each(CASES)('AC10 b10-corpus-case: %s through main scores clean with its synopsis calls', async (id, synopses) => {
    const c = await loadCase(join(ROOT, id));
    const model = caseReplies(id);
    let made = 0;
    const run = await runWithClaude(c, async (call) => {
      if ((JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { synopsis?: unknown }).synopsis) made++;
      return model(call);
    });
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(made, 'synopsis calls').toBe(synopses);
  });
});
