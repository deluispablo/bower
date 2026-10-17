/**
 * C06 c06-sweep-c (specs/c06-connections/spec.md AC3): the scripted replies and authored test bodies below were written
 * before TL-P4-34 ruling 1; each link line they author now carries its reason, so the reason rule (c06-body-links, R2)
 * refuses none of them. Stored notes a test seeds are not authored replies and are not swept.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
/** R2: a line is bare when, its links, list mark, label words and punctuation removed, no letter or digit is left. */
const bare = (line: string): boolean => line.includes('[[') && !/[\p{L}\p{N}]/u.test(line.replace(/\[\[[^\]]*\]\]/g, ' ')
  .replace(/^\s*(?:[-*+]|\d+\.)\s+/, ' ').replace(/\b(?:see also|related|sources?|links?|and)\b/gi, ' '));
/** Every note body and summary a reply authors. */
const authored = (value: unknown): string[] => (Array.isArray(value) ? value.flatMap(authored)
  : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, v]) => ((key === 'body' || key === 'summary') && typeof v === 'string' ? [v] : authored(v)))
    : []);

const CASES = ['c17-b10-complete-tail', 'c17-b10-partial-pdf', 'c17-b10-shared-budget', 'c17-b11-proposal-authority', 'c17-b12-large-first-part'];
const TESTS = ['b8-log.test.ts'];
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r' };
/** Decode body and summary literals as in sweep-a before applying R2 to their lines. */
const authoredIn = (source: string): string[] => [...source.matchAll(/\b(?:body|summary)\s*:\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/g)]
  .map((m) => (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\(u[\da-f]{4}|x[\da-f]{2}|[\s\S])/gi, (_, e: string) =>
    e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), 16)) : (ESCAPES[e] ?? e)));
const bareIn = (source: string): string[] => authoredIn(source).flatMap((text) => text.split('\n')).filter(bare);

it('AC3 c06-sweep-c: the oracle accepts reason-bearing bodies and summaries', () => {
  for (const key of ['body', 'summary']) for (const quote of ["'", '"', '`']) {
    expect(bareIn(`x = { ${key}: ${quote}Related: [[Gardening]]: mulch supports the garden.${quote} }`)).toEqual([]);
  }
});

it.each([
  ['single quotes', `x = { body: 'Alex.\\n\\nSee also [[Gardening]].' }`],
  ['double quotes', `x = { body: "Alex.\\n\\nRelated: [[Gardening]]." }`],
  ['a template', 'x = { summary: `Alex.\n\nSources: [[Gardening]] and [[Seed packet]].` }'],
  ['an escaped quote', `x = { body: 'Alex\\'s.\\nRelated: [[Gardening]].' }`],
  ['encoded text', `x = { summary: "Alex.\\n\\u0053ee also [[Gardening]]\\u002e" }`],
])('AC3 c06-sweep-c: the oracle finds a bare link in %s', (_, source) => {
  expect(bareIn(source)).toHaveLength(1);
});

it.each(CASES)('AC3 c06-sweep-c: %s authors no bare link line', (id) => {
  const replies: unknown = JSON.parse(readFileSync(resolve(ROOT, 'testing/corpus', id, 'replies.json'), 'utf8'));
  expect(authored(replies).flatMap((text) => text.split('\n')).filter(bare)).toEqual([]);
});

it.each(TESTS)('AC3 c06-sweep-c: %s authors no bare link line in a reply body or summary', (file) => {
  const source = readFileSync(resolve(ROOT, 'runner/test', file), 'utf8');
  expect(authoredIn(source).some((text) => text.includes('[[')), 'the oracle sees authored links').toBe(true);
  expect(bareIn(source)).toEqual([]);
});
