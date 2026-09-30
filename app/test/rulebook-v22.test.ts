import { describe, expect, it } from 'vitest';

import rulebookRaw from '../../vault-template/CLAUDE.md?raw';
import ingestRaw from '../../agent/prompts/ingest.md?raw';
import { rulesVersionOf } from '../src/rulebook.js';

// Text-presence tests for rulebook v22 (#790, spec §6.18 and §7 R-AG-11,
// R-HIST-2, R-FRONT-2, §7c): "How Bower thinks" cannot be unit-tested, so
// each principle's key sentence must stay in `vault-template/CLAUDE.md`, and
// the ingest prompt must point to it.

const RULEBOOK = rulebookRaw.replace(/\r\n/g, '\n');
const INGEST = ingestRaw.replace(/\r\n/g, '\n');

/** The `## How Bower thinks` section, up to the next `## ` heading. */
function thinksSection(text: string): string {
  const start = text.indexOf('\n## How Bower thinks\n');
  if (start === -1) throw new Error('the rulebook has no How Bower thinks');
  const end = text.indexOf('\n## ', start + 1);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

describe('rulebook v22', () => {
  it('is version 22', () => {
    expect(rulesVersionOf(RULEBOOK)).toBe(22);
  });

  it('has the nine principles, in order, in about 25 lines', () => {
    const section = thinksSection(RULEBOOK);
    const heads = [...section.matchAll(/^(\d)\. \*\*([^*]+)\*\*/gm)].map(
      (match) => `${match[1] ?? ''} ${match[2] ?? ''}`,
    );
    expect(heads).toEqual([
      '1 Decision first.',
      '2 Reuse before looking up.',
      '3 Cross-check.',
      '4 Say what is next.',
      '5 Keep history.',
      '6 Update, do not duplicate.',
      '7 Say what is missing.',
      '8 Never invent.',
      '9 Learn patterns.',
    ]);
    expect(section.trim().split('\n').length).toBeLessThanOrEqual(25);
  });

  it.each([
    ['R-AG-11 the verdict words', '`Apply first`, `Worth a look`, `Skip`'],
    [
      'R-AG-11 Reference rows',
      'Append a row only for a value you actually looked up, dated; never reorder or rewrite a row.',
    ],
    [
      'R-AG-11 cross-check',
      'ending `— Check`, and never pick a winner silently',
    ],
    [
      'R-MEAN-1 checks.txt format',
      '`.bower/checks.txt`: `<path A><TAB><path B><TAB><reason>`',
    ],
    [
      'R-AG-11 Next steps',
      "`- [ ] <step>` item in the project note's `## Next steps`",
    ],
    [
      'R-MEAN-1 next.txt format',
      '`.bower/next.txt`: `<path, or -><TAB><action>`',
    ],
    ['R-MEAN-1 at most three', 'At most three per run.'],
    [
      'R-HIST-2 append-only',
      'is append-only: never rewrite, reorder or remove its lines',
    ],
    ['R-HIST shape', '`- 30 Sep · Scored 78, Apply first, by Bower`'],
    [
      'R-HIST-2 a rule says so',
      '`- 30 Sep · CV and cover letter written (your rule), by Bower`',
    ],
    ['R-AG-11 made_for', '`made_for: "[[<item>]]"`'],
    ['R-VERDICT-2 apply_link', '`apply_link` Apply link (link)'],
    [
      'R-FRONT-2 ticks do not count',
      'An edit that only ticks checkboxes does not count.',
    ],
    ['#871 the pile note name', '`Bower - YYYY-MM-DD HHmm-ss Context <xx>.md`'],
  ])('keeps %s', (_rule, sentence) => {
    expect(RULEBOOK).toContain(sentence);
  });

  it('is pointed to by the ingest prompt', () => {
    expect(INGEST).toContain('**How Bower thinks**');
    expect(INGEST).toContain('.bower/checks.txt');
    expect(INGEST).toContain('.bower/next.txt');
    expect(INGEST).toContain('## History');
  });
});
