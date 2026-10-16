/**
 * C06 c06-sweep-a (specs/c06-connections/spec.md AC1): the scripted replies and authored test bodies below were written
 * before TL-P4-34 ruling 1; each link line they author now carries its reason, so the reason rule (c06-body-links, R2)
 * refuses none of them. Stored notes a test seeds are not authored replies and are not swept.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { AT, runScripted } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CORPUS = resolve(ROOT, 'testing/corpus');
/** R2: a line is bare when, its links, list mark, label words and punctuation removed, no letter or digit is left. */
const bare = (line: string): boolean => line.includes('[[') && !/[\p{L}\p{N}]/u.test(line.replace(/\[\[[^\]]*\]\]/g, ' ')
  .replace(/^\s*(?:[-*+]|\d+\.)\s+/, ' ').replace(/\b(?:see also|related|sources?|links?|and)\b/gi, ' '));
/** Every note body and summary a reply authors. */
const authored = (value: unknown): string[] => (Array.isArray(value) ? value.flatMap(authored)
  : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, v]) => ((key === 'body' || key === 'summary') && typeof v === 'string' ? [v] : authored(v)))
    : []);
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r' };
/** The decoded text of each `body:` or `summary:` literal in a source file, whatever its quotes (a `+` join is not followed). */
const authoredIn = (source: string): string[] => [...source.matchAll(/\b(?:body|summary)\s*:\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/g)]
  .map((m) => (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\(u[\da-f]{4}|x[\da-f]{2}|[\s\S])/gi, (_, e: string) =>
    e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), 16)) : (ESCAPES[e] ?? e)));
const bareLines = (texts: string[]): string[] => texts.flatMap((text) => text.split('\n')).filter(bare);

const CASES = ['b1-index-job-offer', 'b23-hot-question-answer', 'b23-summary-person-lint', 'c17-b4-origin-not-authority'];
const TESTS = ['b4-incorporation.test.ts', 'b4b-fr1.test.ts', 'b4b-fr2.test.ts'];

describe('the oracle (R2)', () => {
  it.each([
    ['See also [[Job hunt]]: this offer belongs to the search.'],
    ['Related: [[Job hunt]]: this offer belongs to the search.'],
    ['- [[Job hunt]] and [[Applications]]: both track the search.'],
  ])('accepts a line that says why: %s', (line) => expect(bare(line)).toBe(false));
  it.each([['Related: [[Job hunt]].'], ['See also [[Job hunt]] and [[Applications]].'], ['- [[Job hunt]]'], ['1. Sources: [[Job hunt]]']])(
    'rejects a bare line: %s', (line) => expect(bare(line)).toBe(true));
  it.each([
    ['single quotes', `x = { body: 'Alex.\\n\\nSee also [[Job hunt]].' }`],
    ['double quotes', `x = { body: "Alex.\\n\\nRelated: [[Job hunt]]." }`],
    ['a template', 'x = { summary: `Alex.\n\nRelated: [[Job hunt]].` }'],
    ['an escaped quote', `x = { body: 'Alex\\'s.\\nRelated: [[Job hunt]].' }`],
  ])('finds a bare link in a body written with %s', (_, source) => expect(bareLines(authoredIn(source))).toHaveLength(1));
  it('passes a reason-bearing body however it is quoted', () => {
    expect(bareLines(authoredIn(`x = { body: "Alex.\\n\\nRelated: [[Job hunt]]: this offer belongs to the search." }`))).toEqual([]);
  });
});

it.each(CASES)('AC1 c06-sweep-a: %s authors no bare link line', (id) => {
  const texts = ['replies.json', 'proposed-refusal.json'].map((f) => join(CORPUS, id, f)).filter(existsSync)
    .flatMap((file) => authored(JSON.parse(readFileSync(file, 'utf8')) as unknown));
  expect(texts.length).toBeGreaterThan(0);
  expect(bareLines(texts)).toEqual([]);
});

it.each(TESTS)('AC1 c06-sweep-a: %s authors no bare link line in a reply body', (file) => {
  const texts = authoredIn(readFileSync(resolve(ROOT, 'runner/test', file), 'utf8'));
  expect(texts.length).toBeGreaterThan(0);
  expect(bareLines(texts)).toEqual([]);
});

// These cases are `covers: model`, so the corpus loop never scores them: score every press here. The index lines in
// their expected.json are the model's work (the scripted driver writes none, before and after this sweep), so only
// those may stay unmet; a body, link, move or question expectation that the new words break fails here.
describe('the swept replies still score', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT);
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each(CASES)('AC1 c06-sweep-a: %s still scores clean on its scripted replies', async (id) => {
    const c = await loadCase(join(CORPUS, id));
    if (id === 'b23-hot-question-answer') { // The same setup as b23-hot-context's answer test: the case alone is not runnable scripted.
      const visits = 'Resources/Housing/Home visits.md';
      c.folder[visits] = (c.folder[visits] ?? '').replace('appointments', 'an appointment');
      c.questions.push({ id: 'q-folder', text: 'Keep the garden notes together?', yes: 'Yes', no: 'No', askedAt: AT - 1 });
    }
    const run = await runScripted(c);
    expect({ code: run.code, presses: (run.runs ?? []).map((r) => r.code) }).toEqual({ code: 0, presses: (run.runs ?? []).map(() => 0) });
    expect({ id, unmet: (run.score?.unmet ?? []).filter((line) => !line.startsWith('index.md: lacks "- [[')) }).toEqual({ id, unmet: [] });
  }, 60_000);
});
