import { describe, expect, it } from 'vitest';

import rulebookRaw from '../../vault-template/CLAUDE.md?raw';
import { RETIRED_RULEBOOK_LINES } from '../src/rulebook-retired.js';
import { rulesVersionOf } from '../src/rulebook.js';

// Text-presence tests for rulebook v26 (#996): an answer about a filed item
// is booked with that item as its original, a kept name may be any length,
// and a saved link Bower cannot open gets a clip note.

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

/** The filing sheet lines of the first code block after `intro`. */
function sheetAfter(body: string, intro: string): string[][] {
  const start = body.indexOf(intro);
  if (start < 0) throw new Error(`no example after ${intro}`);
  const match = /```\n([\s\S]*?)\n\s*```/.exec(body.slice(start));
  if (!match?.[1]) throw new Error(`no sheet after ${intro}`);
  return match[1]
    .split('\n')
    .map((line) => line.trim().replaceAll('<TAB>', '\t').split('\t'));
}

describe('rulebook v26', () => {
  it('is version 26', () => {
    expect(rulesVersionOf(RULEBOOK)).toBe(26);
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

  describe('an answer about a filed item', () => {
    it.each([
      'Its original is `-`, except for an answer about a filed item.',
      'The app writes a question about one file or note as an instruction note whose text starts `About <file name>: ` and then the question.',
      'Find the item by that name in `index.md` (Grep for the name) and take its path from its row.',
      "Book the answer's `note` line with that path as the original, so the answer's `index.md` row ends `· [[<item path>]]` and the item shows the question with a link to its answer.",
      'When no row has that name, or more than one does, book the answer with original `-` and say so in its box',
    ])('An answer says: %s', (sentence) => {
      expect(section('An answer')).toContain(sentence);
    });

    it('the Instructions steps point to it', () => {
      expect(section('Instructions')).toContain(
        "booked with that item's path as its original, as **An answer about a filed item** says; never with original `-` when the item is found.",
      );
    });

    it('gives a fake-data example booked with the item as its original', () => {
      expect(section('An answer')).toContain(
        '`About Arlington Road, listing.pdf: when can I move in?`',
      );
      const [line] = sheetAfter(section('An answer'), 'The answer\'s line:');
      expect(line).toEqual([
        'note',
        'Answers/2026-10-02 When can I move in.md',
        '1-Projects/Flat hunt/Arlington Road, listing.pdf',
        '#rental-listing #flat-hunt',
        'When the Arlington Road flat is free to move into',
      ]);
    });

    it('no longer books every answer with original `-`', () => {
      expect(RULEBOOK).not.toContain(
        'book it with a `note` line on the filing sheet (see **index.md and log.md**), original `-`.',
      );
    });
  });

  describe('names', () => {
    it.each([
      [
        'index.md and log.md',
        'A kept name may be any length; a name you make up is at most 60 characters with the extension, and the runner shortens a longer new one.',
      ],
      [
        'Page conventions',
        'in whatever language it is, at any length: a kept name is never shortened',
      ],
      [
        'Page conventions',
        'at most 60 characters with the extension, which stays as it was. The runner shortens a longer name you make up.',
      ],
    ])('%s says: %s', (heading, sentence) => {
      expect(section(heading)).toContain(sentence);
    });

    it('gives a kept name over 60 characters as the example', () => {
      const example =
        'Tenancy agreement for 14 Arlington Road, London NW1, November 2026 to October 2027.pdf';
      expect(example.length).toBeGreaterThan(60);
      expect(section('Page conventions')).toContain(`\`${example}\` stays as it is`);
    });

    it('limits only a made-up name to 60 characters', () => {
      const limits = RULEBOOK.split('\n').filter((line) =>
        line.includes('60 characters'),
      );
      expect(limits.length).toBeGreaterThan(0);
      for (const line of limits) {
        expect(line).toMatch(/says nothing|make up/);
      }
    });
  });

  describe('a link Bower cannot open', () => {
    it.each([
      '**A link Bower cannot open:** a saved link',
      'when you have no web tools this run. Never try to reach the link.',
      "Write a short clip note at its final place: the folder a context note or the link's own words point to, else `3-Resources`.",
      "It has `source: <the link's address>`",
      'the person\'s words from the link note (if any), and this box line: `> Could not open the link this run. (from the file) — Check`.',
      "Give the raw link note a `file` line to `0-Inbox/Processed` (`-` for tags and description), and book the clip note with a `note` line whose original is the link note's path after filing.",
    ])('Ingest says: %s', (sentence) => {
      expect(section('Ingest')).toContain(sentence);
    });

    it('gives a fake-data example: the link note set aside, the clip note booked from it', () => {
      const lines = sheetAfter(
        section('Ingest'),
        'Example, a link with the words',
      );
      expect(lines).toEqual([
        [
          'file',
          '0-Inbox/Link - example.com 2026-10-02 0915.md',
          '0-Inbox/Processed',
          'Link - example.com 2026-10-02 0915.md',
          '-',
          '-',
        ],
        [
          'note',
          '3-Resources/Balcony herbs link.md',
          '0-Inbox/Processed/Link - example.com 2026-10-02 0915.md',
          '#gardening',
          'A saved link about herbs for the balcony, not opened yet',
        ],
        ['tag', '#gardening', 'Plants and herbs grown at home'],
      ]);
    });

    it('Joining the dots points to it', () => {
      expect(section('Page conventions')).toContain(
        'A saved link you cannot open still gets a clip note (Ingest step 6, **A link Bower cannot open**).',
      );
    });
  });

  it('retires the v25 lines it rewrote, so an update never copies them to Rules.md', () => {
    expect(RETIRED_RULEBOOK_LINES).toContain(
      'Write the answer directly at its path in `Answers/` and book it with a `note` line on the filing sheet (see **index.md and log.md**), original `-`.',
    );
    expect(RETIRED_RULEBOOK_LINES).toContain(
      '- Keep a name that already says what the file is (`Lease agreement 2026.pdf`), in whatever language it is.',
    );
    expect(RETIRED_RULEBOOK_LINES).toContain('updated: 2026-10-01');
    const current = new Set(RULEBOOK.split('\n'));
    expect(RETIRED_RULEBOOK_LINES.filter((line) => current.has(line))).toEqual(
      [],
    );
  });
});
