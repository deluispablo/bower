import { describe, expect, it } from 'vitest';

import rulebookRaw from '../../vault-template/CLAUDE.md?raw';
import { folderStatuses } from '../src/folder-statuses.js';
import { rulesVersionOf } from '../src/rulebook.js';

// Text-presence tests for rulebook v23 (#921, decision E-7): Bower chooses
// the status list for each folder and writes it in the folder's hub note;
// the kind's list is the fallback. The examples the rulebook gives must be
// lists the app reads (`folderStatuses`, #916).

const RULEBOOK = rulebookRaw.replace(/\r\n/g, '\n');

describe('rulebook v23', () => {
  it('is version 23', () => {
    expect(rulesVersionOf(RULEBOOK)).toBe(23);
  });

  it.each([
    "**A folder's statuses.**",
    "write `statuses:` in the frontmatter of that folder's hub note (`<Folder>/<Folder>.md`, `by: bower`)",
    'a YAML list of 3 to 10 lower-case values, at most 24 characters each, no value twice, in lifecycle order, starting with `new`',
    'Never reorder or drop a value a note in the folder already uses',
    "A new note's `status` is the first value of its folder's list; the kind's list is used when the folder has no list.",
    'The status lines under `## History` are written by the runner',
  ])('says: %s', (sentence) => {
    expect(RULEBOOK).toContain(sentence);
  });

  it('gives examples the app reads as the folder list', () => {
    const examples = [...RULEBOOK.matchAll(/`(statuses: \[[^\]]+\])`/g)].map(
      (match) => match[1] ?? '',
    );
    expect(examples).toHaveLength(2);
    for (const example of examples) {
      const list = folderStatuses(`---\n${example}\n---\n`, {
        statuses: ['fallback'],
      });
      expect(list[0]).toBe('new');
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list.length).toBeLessThanOrEqual(10);
      for (const status of list) expect(status.length).toBeLessThanOrEqual(24);
    }
  });
});
