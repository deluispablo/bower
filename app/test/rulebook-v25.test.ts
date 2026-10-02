import { describe, expect, it } from 'vitest';

import rulebookRaw from '../../vault-template/CLAUDE.md?raw';
import { RETIRED_RULEBOOK_LINES } from '../src/rulebook-retired.js';
import { rulesVersionOf } from '../src/rulebook.js';

// Text-presence tests for rulebook v25 (#977): Bower writes its filing
// decisions to `.bower/filing.tsv` and the runner carries them out (#978
// parses exactly the contract pinned here).

const RULEBOOK = rulebookRaw.replace(/\r\n/g, '\n');

const MARKER =
  /^<!-- load: (ingest|instructions|lint)(, (ingest|instructions|lint))* -->$/;

/** Each `##` heading outside a code fence, with its body up to the next one. */
function sections(text: string): { heading: string; body: string }[] {
  const lines = text.split('\n');
  const found: { heading: string; body: string[] }[] = [];
  let fenced = false;
  for (const line of lines) {
    if (line.startsWith('```')) fenced = !fenced;
    if (!fenced && line.startsWith('## ')) {
      found.push({ heading: line.slice(3), body: [] });
    } else {
      found.at(-1)?.body.push(line);
    }
  }
  return found.map(({ heading, body }) => ({ heading, body: body.join('\n') }));
}

function markerOf(body: string): string | null {
  const first = body.split('\n')[0] ?? '';
  return MARKER.test(first)
    ? first.slice('<!-- load: '.length, -' -->'.length)
    : null;
}

function section(start: string): string {
  const found = sections(RULEBOOK).find(({ heading }) =>
    heading.startsWith(start),
  );
  if (!found) throw new Error(`no section ${start}`);
  return found.body;
}

/** The example sheet: the code block after "Example lines". */
function exampleSheet(): string[] {
  const core = section('index.md and log.md');
  const match = /Example lines[^\n]*\n```\n([\s\S]*?)\n```/.exec(core);
  if (!match?.[1]) throw new Error('no example sheet');
  return match[1].split('\n').map((line) => line.replaceAll('<TAB>', '\t'));
}

describe('rulebook v25', () => {
  it('is version 25 or later', () => {
    expect(rulesVersionOf(RULEBOOK)).toBeGreaterThanOrEqual(25);
  });

  it('marks every section as core or with a valid marker', () => {
    const map = Object.fromEntries(
      sections(RULEBOOK).map(({ heading, body }) => [
        heading.replace(/ \(.*$/, ''),
        markerOf(body),
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

  it.each([
    'Write one line per decision to `.bower/filing.tsv`: UTF-8, one record per line, fields separated by a single TAB',
    'No header. No TAB or newline inside a field. Three kinds of line:',
    '1. `file<TAB><pending path><TAB><destination folder><TAB><file name><TAB><#tag #tag><TAB><description>` files one pending original.',
    "`<pending path>`: the path as the run's pending list gives it.",
    'an existing folder under `1-Projects/`, `2-Areas/`, `3-Resources/` or `4-Archives/`;',
    'a new direct subfolder of one of those four (the runner creates it and its hub note);',
    '`0-Inbox/Processed` (raw clips once their note is written, unconvertible documents, duplicates).',
    '`<file name>`: the base name to give it, keeping the original extension (the same name when it already says what it is), as **File names (originals)** says.',
    'Tags and description: as the row format above says, 1 to 5 tags and at most 100 characters. Use `-` for both when the destination is `0-Inbox/Processed`.',
    "2. `note<TAB><note path><TAB><original path or -><TAB><#tag #tag><TAB><description>` books a note you wrote in this run (a companion note, a text copy, an answer, a clip's note) at its final path.",
    "The original path is the original's path after filing, or `-` when the note has no original.",
    '3. `tag<TAB><#tag><TAB><meaning>` declares a new tag, at most 80 characters of meaning.',
    'The runner derives the row type from the extension, writes the hub line (`- [[<file name>]] <description>`) and the `index.md` row, adds new tags to `## Tags`, and writes the `Filed:` and `Tag added:` log lines.',
    'File a pending original only through a `file` line: never move it yourself, never write its hub line or its `index.md` row, and never edit `## Tags`.',
  ])('has the sheet contract in the core: %s', (sentence) => {
    expect(section('index.md and log.md')).toContain(sentence);
  });

  it('gives one example of each line kind, with the contract field counts', () => {
    const lines = exampleSheet();
    const fields: Record<string, number> = { file: 6, note: 5, tag: 3 };
    for (const line of lines) {
      const parts = line.split('\t');
      const kind = parts[0] ?? '';
      expect(Object.keys(fields)).toContain(kind);
      expect(parts).toHaveLength(fields[kind] ?? -1);
      expect(parts.every((part) => part.length > 0)).toBe(true);
    }
    expect(new Set(lines.map((line) => line.split('\t')[0]))).toEqual(
      new Set(['file', 'note', 'tag']),
    );
    expect(lines).toContain(
      'file\t0-Inbox/scan0001 (1).pdf\t0-Inbox/Processed\tscan0001 (1).pdf\t-\t-',
    );
  });

  it.each([
    ['Ingest', "Write the original's `file` line"],
    ['Ingest', 'Never move the file yourself.'],
    ['Ingest', 'Add no hub line, no `index.md` row and no line in `## Tags`'],
    [
      'Ingest',
      "book it with a `note` line whose original is the original's path after filing",
    ],
    ['Ingest', 'give the raw clip a `file` line to `0-Inbox/Processed`'],
    [
      'Ingest',
      'gets a `file` line to `0-Inbox/Processed` (`-` for tags and description)',
    ],
    ['Kinds', 'and book it with a `note` line (see **index.md and log.md**)'],
    [
      'An answer',
      'Write the answer directly at its path in `Answers/` and book it with a `note` line',
    ],
    [
      'An answer',
      'write its text copy as Ingest step 6 says and book it with a `note` line',
    ],
    ['Formats', 'file it with a `file` line by its name and date alone'],
    ['Tags', 'declare a new one with a `tag` line on the filing sheet'],
    ['Rules', 'Also write `.bower/filing.tsv`, the filing sheet'],
  ])('%s uses the sheet: %s', (heading, sentence) => {
    expect(section(heading)).toContain(sentence);
  });

  it.each([
    '3. Move the original into that folder as it is',
    "4. Add one line to the folder's hub note",
    'link the note from the hub note and `index.md`',
    'move the raw clip to `0-Inbox/Processed/`',
    'moves to `0-Inbox/Processed/` (the runner logs the move)',
    'in the same folder, linked from the hub note and `index.md`',
    'add `- #<tag> · <meaning, at most 80 characters> · 1` there',
    'Every row you add is:',
    'create a project/area folder and hub note if needed',
  ])('no longer says: %s', (sentence) => {
    expect(RULEBOOK).not.toContain(sentence);
  });

  it.each([
    'move the note there (the runner updates its `index.md` row and links and logs the move)',
    "rename the file in place to the owner's name, keeping its extension; the runner keeps its id, updates its `index.md` row and links and logs it.",
    'move or rename each note or original the rule covers that is not yet where, or as, the rule says. For each one, update the hub notes',
    'complete up to 50 rows of `index.md` that lack tags or a description, oldest first',
  ])(
    'keeps instruction moves, renames and the lint backfill: %s',
    (sentence) => {
      expect(RULEBOOK).toContain(sentence);
    },
  );

  it('retires the v24 lines it rewrote, so an update never copies them to Rules.md', () => {
    expect(RETIRED_RULEBOOK_LINES).toContain(
      '2. Decide the PARA destination; create a project/area folder and hub note if needed.',
    );
    expect(RETIRED_RULEBOOK_LINES).toContain(
      '- Never delete notes or originals. Archive or move to `Processed/`.',
    );
    const current = new Set(RULEBOOK.split('\n'));
    expect(RETIRED_RULEBOOK_LINES.filter((line) => current.has(line))).toEqual(
      [],
    );
  });
});
