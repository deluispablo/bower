import { describe, expect, it } from 'vitest';

import rulebookRaw from '../../vault-template/CLAUDE.md?raw';
import indexRaw from '../../vault-template/index.md?raw';
import { RETIRED_RULEBOOK_LINES } from '../src/rulebook-retired.js';
import { rulesVersionOf } from '../src/rulebook.js';

// Text-presence tests for rulebook v24 (#962, spec R-SS-4 to R-SS-17): the
// rulebook is cut into sections with load markers, the index rows carry
// tags and a description, and the tags live in `index.md`'s `## Tags`.

const RULEBOOK = rulebookRaw.replace(/\r\n/g, '\n');
const INDEX = indexRaw.replace(/\r\n/g, '\n');

const MARKER =
  /^<!-- load: (ingest|instructions|lint)(, (ingest|instructions|lint))* -->$/;

/** Each `##` heading outside a code fence, with the line after it. */
function sections(text: string): { heading: string; next: string }[] {
  const lines = text.split('\n');
  const found: { heading: string; next: string }[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (line.startsWith('```')) fenced = !fenced;
    else if (!fenced && line.startsWith('## ')) {
      found.push({ heading: line.slice(3), next: lines[i + 1] ?? '' });
    }
  });
  return found;
}

function markerOf(next: string): string | null {
  return MARKER.test(next)
    ? next.slice('<!-- load: '.length, -' -->'.length)
    : null;
}

describe('rulebook v24', () => {
  it('is version 24', () => {
    expect(rulesVersionOf(RULEBOOK)).toBe(24);
  });

  it('marks every section as core or with a valid marker', () => {
    const map = Object.fromEntries(
      sections(RULEBOOK).map(({ heading, next }) => [
        heading.replace(/ \(.*$/, ''),
        markerOf(next),
      ]),
    );
    expect(map).toEqual({
      Purpose: null,
      'About the owner': null,
      Language: null,
      'Directory structure': null,
      Tags: null,
      'index.md and log.md': null,
      'Page conventions': null,
      'An answer': 'instructions',
      'How Bower thinks': 'ingest, instructions',
      Ingest: 'ingest, instructions',
      Kinds: 'ingest',
      Formats: 'ingest',
      Instructions: 'instructions',
      Query: 'instructions',
      Lint: 'lint',
      Archive: 'instructions, lint',
      'Self-learning': null,
      Proposals: 'ingest, instructions',
      Rules: null,
    });
  });

  it('has a load marker only right after a section heading', () => {
    const lines = RULEBOOK.split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('<!-- load:')) return;
      expect(line).toMatch(MARKER);
      expect(lines[i - 1]).toMatch(/^## /);
    });
  });

  it.each([
    'This rulebook, `Rules.md` and `About-Me.md` are already in your instructions; do not open them.',
    'Find related items by searching `index.md` with Grep for their likely tags and keywords',
    'never read `index.md` whole',
    '`- [[<path from the top of the folder>]] · <Type> · <#tag #tag> · <description> · <origin>`',
    'A description of at most 100 characters that says what the item is about, in plain words, with no `·` and no wikilink.',
    'keeps the link to that original at the end, after the origin',
    'Tags are English, lower case, with words joined by hyphens',
    'add `- #<tag> · <meaning, at most 80 characters> · 1` there',
    'The runner recounts the tags and writes the `Tag added:` log line after the run.',
    "Notes' frontmatter `tags:` use the same vocabulary",
    'first line `Transcribed by Bower from a scan`',
    'at most about 3,000 characters',
    'When you answer about a filed PDF of no listed kind that has no text copy, write its text copy as Ingest step 6 says.',
    '`Rule added/changed:`, `Correction:`, `Proposal:`, `Context:` and `Applied rule:`',
    'The runner writes the `Filed:` and `Tag added:` lines',
    'Never read `log.md`',
    'complete up to 50 rows of `index.md` that lack tags or a description',
    'read the note or the text copy, never a binary; describe a binary that has no text copy from its name and folder',
  ])('says: %s', (sentence) => {
    expect(RULEBOOK).toContain(sentence);
  });

  it.each([
    '**Domain tags**',
    'kind: rule | workflow | tag',
    'Read `CLAUDE.md`, then `Rules.md`, then `About-Me.md`',
    'Start any task by reading `index.md`',
  ])('no longer says: %s', (sentence) => {
    expect(RULEBOOK).not.toContain(sentence);
  });

  it('retires the v23 lines it rewrote, so an update never copies them to Rules.md', () => {
    expect(RETIRED_RULEBOOK_LINES).toContain('## Workflows');
    expect(RETIRED_RULEBOOK_LINES).toContain(
      '### Kinds (the documents that get a companion note)',
    );
    expect(RETIRED_RULEBOOK_LINES).toContain('- kind: rule | workflow | tag');
  });

  it('starts index.md with an empty Tags section at the end', () => {
    expect(INDEX.trimEnd().endsWith('\n## Tags')).toBe(true);
  });
});
