/**
 * C06 c06-sweep-b (specs/c06-connections/spec.md AC2): the scripted replies and authored test bodies below were written
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

const CASES = ['c17-b7-authority-full-cap', 'c17-b7-proposal-budget', 'c17-b7-proposal-yes', 'c17-b7-reuse-known', 'c17-b8-bounded-encoding', 'c17-b8-settled-recovery'];
const TESTS = ['b8-health.test.ts'];

it.each(CASES)('AC2 c06-sweep-b: %s authors no bare link line', (id) => {
  const replies: unknown = JSON.parse(readFileSync(resolve(ROOT, 'testing/corpus', id, 'replies.json'), 'utf8'));
  expect(authored(replies).flatMap((text) => text.split('\n')).filter(bare)).toEqual([]);
});

it.each(TESTS)('AC2 c06-sweep-b: %s authors no bare Related line in a reply body', (file) => {
  expect(readFileSync(resolve(ROOT, 'runner/test', file), 'utf8')).not.toMatch(/body: '[^'\n]*Related: \[\[/);
});
