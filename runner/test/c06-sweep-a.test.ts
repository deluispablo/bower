/**
 * C06 c06-sweep-a (specs/c06-connections/spec.md AC1): the scripted replies and authored test bodies below were written
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

const CASES = ['b1-index-job-offer', 'b23-hot-question-answer', 'b23-summary-person-lint', 'c17-b4-origin-not-authority'];
const TESTS = ['b4-incorporation.test.ts', 'b4b-fr1.test.ts', 'b4b-fr2.test.ts'];

it.each(CASES)('AC1 c06-sweep-a: %s authors no bare link line', (id) => {
  const replies: unknown = JSON.parse(readFileSync(resolve(ROOT, 'testing/corpus', id, 'replies.json'), 'utf8'));
  expect(authored(replies).flatMap((text) => text.split('\n')).filter(bare)).toEqual([]);
});

it.each(TESTS)('AC1 c06-sweep-a: %s authors no bare Related line in a reply body', (file) => {
  expect(readFileSync(resolve(ROOT, 'runner/test', file), 'utf8')).not.toMatch(/body: '[^'\n]*Related: \[\[/);
});
