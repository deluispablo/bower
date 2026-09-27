import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { commandsFor, folderPath, mergeResults } from '../src/switcher.js';
import type { Command, SwitcherNote } from '../src/switcher.js';

function note(id: string, path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType: 'text/markdown', parents: ['PARENT'], path };
}

const COMMANDS: Command[] = [
  { id: 'tidy-up', label: 'Tidy up the inbox' },
  { id: 'add', label: 'Add a file or photo', href: '/add' },
  { id: 'tell', label: 'Tell Bower something', href: '/tell' },
  { id: 'theme', label: 'Switch to dark theme' },
];

describe('mergeResults', () => {
  it('orders notes first, then commands, unchanged', () => {
    const notes: SwitcherNote[] = [
      {
        file: note('a', '2-Areas/Cooking/Sourdough starter.md'),
        snippet: null,
      },
      {
        file: note('b', 'Weeknight curry.md'),
        snippet: '…serve with sourdough…',
      },
    ];

    const merged = mergeResults(notes, COMMANDS, 'sour');

    expect(merged.map((entry) => entry.kind)).toEqual([
      'note',
      'note',
      'command',
      'command',
      'command',
      'command',
    ]);
    expect(
      merged
        .slice(0, 2)
        .map((entry) => (entry.kind === 'note' ? entry.file.id : null)),
    ).toEqual(['a', 'b']);
    expect(
      merged
        .slice(2)
        .map((entry) => (entry.kind === 'command' ? entry.command.id : null)),
    ).toEqual(['tidy-up', 'add', 'tell', 'theme']);
  });

  it('gives each note a highlight span at the case-insensitive match in its name', () => {
    const notes: SwitcherNote[] = [
      { file: note('a', 'Sourdough starter.md'), snippet: null },
    ];

    const merged = mergeResults(notes, [], 'SOUR');

    expect(merged[0]).toMatchObject({
      kind: 'note',
      highlight: { start: 0, end: 4 },
    });
  });

  it('leaves the highlight null when the query does not match the name', () => {
    const notes: SwitcherNote[] = [
      { file: note('a', 'Weeknight curry.md'), snippet: '…sourdough…' },
    ];

    const merged = mergeResults(notes, [], 'sour');

    expect(merged[0]).toMatchObject({ kind: 'note', highlight: null });
  });

  it('carries the snippet through untouched', () => {
    const notes: SwitcherNote[] = [
      {
        file: note('a', 'Weeknight curry.md'),
        snippet: '…serve with sourdough…',
      },
    ];

    const merged = mergeResults(notes, [], 'sour');

    expect(merged[0]).toMatchObject({ snippet: '…serve with sourdough…' });
  });

  it('still returns the commands, highlight-free, for an empty query', () => {
    const merged = mergeResults([], COMMANDS, '');

    expect(merged).toHaveLength(4);
    expect(merged.every((entry) => entry.kind === 'command')).toBe(true);
  });

  it('returns an empty list when there is nothing to show', () => {
    expect(mergeResults([], [], '')).toEqual([]);
  });
});

describe('commandsFor', () => {
  it('labels Tidy up plainly with nothing pending', () => {
    const commands = commandsFor({ pending: 0, theme: 'dark' });

    expect(commands[0]).toEqual({ id: 'tidy-up', label: 'Tidy up the inbox' });
  });

  it('labels Tidy up with the pending count', () => {
    const commands = commandsFor({ pending: 3, theme: 'dark' });

    expect(commands[0]).toEqual({
      id: 'tidy-up',
      label: 'Tidy up the inbox (3)',
    });
  });

  it('offers to switch to light theme while dark', () => {
    const commands = commandsFor({ pending: 0, theme: 'dark' });

    expect(commands[3]).toEqual({
      id: 'theme',
      label: 'Switch to light theme',
    });
  });

  it('offers to switch to dark theme while light', () => {
    const commands = commandsFor({ pending: 0, theme: 'light' });

    expect(commands[3]).toEqual({
      id: 'theme',
      label: 'Switch to dark theme',
    });
  });

  it('lists Add and Tell Bower in between, each with its own route', () => {
    const commands = commandsFor({ pending: 0, theme: 'light' });

    expect(commands[1]).toEqual({
      id: 'add',
      label: 'Add a file or photo',
      href: '/add',
    });
    expect(commands[2]).toEqual({
      id: 'tell',
      label: 'Tell Bower something',
      href: '/tell',
    });
  });
});

describe('folderPath', () => {
  it('is the path with the file name removed', () => {
    expect(folderPath(note('a', '2-Areas/Cooking/Sourdough starter.md'))).toBe(
      '2-Areas/Cooking',
    );
  });

  it('is empty for a top-level file', () => {
    expect(folderPath(note('a', 'Plan.md'))).toBe('');
  });
});
