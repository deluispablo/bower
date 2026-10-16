/** C08 at today's boundary: a report and a comparison authored as the filed briefing's own note (c08-attached-reports AC1-AC4). */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase } from '../src/corpus';
import { caseReplies, runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const CASES = [
  { id: 'c08-report-with-sources', note: 'Projects/Garden day/Garden day readiness report.md', briefing: 'Garden day briefing.txt', to: 'Projects/Garden day',
    header: ['Work', 'What is known', 'What remains'] },
  { id: 'c08-compare-missing-fact', note: 'Projects/Flat hunt/Shortlist comparison.md', briefing: 'Shortlist briefing.txt', to: 'Projects/Flat hunt',
    header: ['Flat', 'Rent', 'Commute', 'Deposit', 'Status'] },
] as const;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

/** The authored body the case's reply gives its one note, as written. */
async function replyBody(id: string): Promise<string> {
  const file = join(ROOT, id, 'replies.json');
  if (!existsSync(file)) return `no replies.json in ${id}`;
  const [first] = JSON.parse(await readFile(file, 'utf8')) as Array<{ things?: Array<{ note?: { body?: string } }> }>;
  return first?.things?.[0]?.note?.body ?? 'no authored body';
}

async function run(id: string) {
  const c = await loadCase(join(ROOT, id));
  const calls: string[] = [];
  const replies = caseReplies(id);
  const counted: ClaudeSpawn = async (call) => { calls.push(call.input); return replies(call); };
  return { c, calls, result: await runWithClaude(c, counted) };
}

describe('c08-attached-reports', () => {
  it.each(CASES)('AC1 c08-attached-reports-score: $id scores clean through main with its replies and two model calls', async ({ id }) => {
    const { result, calls } = await run(id);
    expect(result.code).toBe(0);
    expect(result.score).toEqual({ pass: true, unmet: [] });
    expect(calls).toHaveLength(2);
  });

  it.each(CASES)('AC2 c08-attached-reports-body: $id keeps the authored body byte for byte between its front matter and Timeline', async ({ id, note }) => {
    const body = (await replyBody(id)).trim();
    const { result } = await run(id);
    const text = result.after[note] ?? '';
    expect(text.slice(text.indexOf('---\n\n') + 5, text.indexOf('\n\n## Timeline\n'))).toBe(body);
  });

  it.each(CASES)('AC4 c08-attached-reports-fixture: $id is scripted and reads its table as rows, by header', async ({ id, note, header }) => {
    const c = await loadCase(join(ROOT, id));
    expect(c.covers).toBe('scripted');
    expect(((c.expected as { tables?: Array<{ path: string; header: string[] }> }).tables ?? []).map((t) => [t.path, t.header])).toEqual([[note, header]]);
  });

  it.each(CASES)('AC3 c08-attached-reports-briefing: $id files the briefing with its bytes and links it as its source', async ({ id, briefing, to, note }) => {
    const { c, result } = await run(id);
    expect(result.after[`${to}/${briefing}`]).toBe(c.inboxFiles[briefing]);
    expect(result.after[note]).toContain(`- 2026-10-07 · Filed by Bower. · [[${briefing}]]\n`);
  });
});
