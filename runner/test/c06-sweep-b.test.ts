/**
 * C06 c06-sweep-b (specs/c06-connections/spec.md AC2): the scripted replies and authored test bodies below were written
 * before TL-P4-34 ruling 1; each link line they author now carries its reason, so the reason rule (c06-body-links, R2)
 * refuses none of them. Stored notes a test seeds are not authored replies and are not swept.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { caseReplies, runWithClaude } from './corpus-run';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const ROOT = resolve(import.meta.dirname, '..', '..');
/** R2: a line is bare when, its links, list mark, label words and punctuation removed, no letter or digit is left. */
const bare = (line: string): boolean => line.includes('[[') && !/[\p{L}\p{N}]/u.test(line.replace(/\[\[[^\]]*\]\]/g, ' ')
  .replace(/^\s*(?:[-*+]|\d+\.)\s+/, ' ').replace(/\b(?:see also|related|sources?|links?|and)\b/gi, ' '));
/** Every note body and summary a reply authors. */
const authored = (value: unknown): string[] => (Array.isArray(value) ? value.flatMap(authored)
  : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, v]) => ((key === 'body' || key === 'summary') && typeof v === 'string' ? [v] : authored(v)))
    : []);

/** Run from their own files: no registered setup (corpus-registry). */
const CASES = ['c17-b7-authority-full-cap', 'c17-b7-automatic-growth-replay', 'c17-b7-automatic-capacity-order', 'c17-b7-reuse-known', 'c17-b8-bounded-encoding'];
/**
 * Needs its registered setup (a refused hub edit and a lost log response, `hub-edit-refused-log-lost`): its consumer,
 * b8-health, runs these replies under it and requires the complete score; run without it, it is not this case.
 */
const RECOVERY = 'c17-b8-settled-recovery';
const TESTS = ['b8-health.test.ts'];

it.each([...CASES, RECOVERY])('AC2 c06-sweep-b: %s authors no bare link line', (id) => {
  const replies: unknown = JSON.parse(readFileSync(resolve(ROOT, 'testing/corpus', id, 'replies.json'), 'utf8'));
  expect(authored(replies).flatMap((text) => text.split('\n')).filter(bare)).toEqual([]);
});

// corpus.test.ts skips these `covers: model` cases: each reworded reply must still be accepted, filed as written, and
// meet the whole score, nothing filtered (corpus-scorer-sweeps AC2).
it.each(CASES)('corpus-scorer-sweeps AC2: sweep B requires the complete score to pass (%s)', async (id) => {
  const c = await loadCase(resolve(ROOT, 'testing/corpus', id));
  const run = await runWithClaude(c, caseReplies(id));
  expect({ id, code: run.code }).toEqual({ id, code: 0 });
  const bodies = authored(JSON.parse(readFileSync(resolve(ROOT, 'testing/corpus', id, 'replies.json'), 'utf8'))).filter((text) => text.includes('See also [['));
  expect(bodies.length, 'the replies author links').toBeGreaterThan(0);
  const filed = Object.values(run.after).join('\n');
  for (const body of bodies) expect(filed, body).toContain(body);
  expect({ id, ...run.score }).toEqual({ id, pass: true, unmet: [] });
});

/** Every `body:` or `summary:` string literal (any quote, escapes kept) of a test source, split into its lines. */
const literalLines = (source: string): string[] => [...source.matchAll(/\b(?:body|summary):\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)]
  .flatMap((m) => (m[2] ?? '').split(/\\n|\n/));

it('AC2 c06-sweep-b: the oracle accepts a link line with a reason and refuses a bare one, whatever its quotes or label', () => {
  const body = (text: string): string => `x({ body: ${text} })`;
  const accepted = [`'Alex waters.\\n\\nRelated: [[Gardening]] because it is the same garden.'`, `'See also [[Gardening]]: the same garden.'`, `'Alex can\\'t stop.'`];
  const refused = [`'Related: [[Gardening]].'`, `"Related: [[Gardening]]."`, '`Sources: [[Gardening]] and [[Seed packet]]`',
    `'Alex can\\'t stop.\\n\\nSee also: [[Gardening]].'`, `'- [[Gardening]]'`];
  accepted.forEach((text) => expect(literalLines(body(text)).filter(bare), text).toEqual([]));
  refused.forEach((text) => expect(literalLines(body(text)).filter(bare), text).not.toEqual([]));
});

it.each(TESTS)('AC2 c06-sweep-b: %s authors no bare link line in a reply body or summary', (file) => {
  const lines = literalLines(readFileSync(resolve(ROOT, 'runner/test', file), 'utf8'));
  expect(lines.filter((line) => line.includes('[[')).length, 'the oracle sees the authored links').toBeGreaterThan(0);
  expect(lines.filter(bare)).toEqual([]);
});
