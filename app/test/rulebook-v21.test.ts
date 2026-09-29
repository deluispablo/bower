import { describe, expect, it } from 'vitest';

import rulebookRaw from '../../vault-template/CLAUDE.md?raw';
import ingestRaw from '../../agent/prompts/ingest.md?raw';
import { rulesVersionOf } from '../src/rulebook.js';

// Text-presence tests for rulebook v21 (#732, spec §7 R-AG-1 to R-AG-8 and
// R-AG-10, §7c): the agent's behaviour cannot be unit-tested, so each rule's
// key sentence must stay in `vault-template/CLAUDE.md`, and the prompt must
// point to it.

const RULEBOOK = rulebookRaw.replace(/\r\n/g, '\n');
const INGEST = ingestRaw.replace(/\r\n/g, '\n');

describe('rulebook v21', () => {
  it('is version 21', () => {
    expect(rulesVersionOf(RULEBOOK)).toBe(21);
  });

  it.each([
    ['R-AG-1 by: bower', 'Every note you write has `by: bower`'],
    ['R-AG-2 every generated note opens with the box', '**A note from Bower** (every note you generate'],
    ['R-AG-2 facts for kind-less notes', 'also has `facts:`, a block map of at most 6 `label: value` pairs'],
    ['R-AG-2 the text copy', 'write its **text copy** `<base name>.md` next to it'],
    ['R-AG-2 the runner adds the text (T9)', 'Never copy the text: the runner adds `## The document`'],
    ['R-AG-3 the change fields', '`bower_updated: YYYY-MM-DD`, `bower_change:'],
    ['R-AG-3 no later paragraphs', 'Never append a "later" paragraph that contradicts the top'],
    ['R-AG-4 note names', 'A name you choose for a note is at most 40 characters, most specific first'],
    ['R-AG-5 web clip source', 'The note keeps `source: <URL>` when the clip has one'],
    ['R-AG-5 name never the original base name', "Never give a note its original's base name"],
    ['R-AG-6 money with its period', 'and its period when the source states one (`£340 a week`'],
    ['R-AG-6 plain added.txt', 'no internal word (index, hub, orphaned, crashed, run, frontmatter), no final full stop'],
    ['R-AG-7 rename request', '**Rename request** ("Rename <path> to <new name>"), handled like a move request'],
    ['R-AG-8 own Applies to list', 'It covers only the files in its own `## Applies to`'],
    ['R-AG-8 empty text', 'An empty text only groups its files: no extra note.'],
    ['R-AG-8 pile_note', 'gets `pile_note: "[[<context note name>]]"`'],
    ['R-AG-10 finishing a tidy-up', 'is filed only: never write its note again'],
    ['R-RUNNER-1 updated.txt', '`.bower/updated.txt`, one `<path><TAB><what changed>` line each'],
  ])('keeps %s', (_rule, sentence) => {
    expect(RULEBOOK).toContain(sentence);
  });

  it('lets the agent write updated.txt', () => {
    expect(RULEBOOK).toContain('`.bower/added.txt` and `.bower/updated.txt`: in unattended runs');
  });

  it('is pointed to by the ingest prompt', () => {
    expect(INGEST).toContain('`by: bower`');
    expect(INGEST).toContain('text copy');
    expect(INGEST).toContain('.bower/updated.txt');
    expect(INGEST).toContain('rename request');
    expect(INGEST).toContain('pile_note');
  });
});
