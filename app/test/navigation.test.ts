import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  appFileGroup,
  breadcrumb,
  buildTree,
  filterTree,
  folderCounts,
  nextFocusIndex,
  pendingCount,
  recentNotes,
  relativeTime,
  siblings,
} from '../src/navigation.js';
import type { TreeRow } from '../src/navigation.js';
import { buildVaultIndex } from '../src/vault-index.js';

let nextId = 0;

function entry(
  path: string,
  mimeType = 'text/markdown',
  modifiedTime?: string,
): DriveFile {
  nextId++;
  const name = path.split('/').pop() ?? path;
  return {
    id: `id${nextId}`,
    name,
    mimeType,
    parents: ['PARENT'],
    path,
    modifiedTime,
  };
}

function dir(path: string): DriveFile {
  return entry(path, FOLDER_MIME);
}

describe('relativeTime', () => {
  const now = new Date('2026-01-10T12:00:00.000Z');

  it('says "today" and "yesterday"', () => {
    expect(relativeTime('2026-01-10T01:00:00.000Z', now)).toBe('today');
    expect(relativeTime('2026-01-09T01:00:00.000Z', now)).toBe('yesterday');
  });

  it('counts days under a week', () => {
    expect(relativeTime('2026-01-07T12:00:00.000Z', now)).toBe('3 days ago');
  });

  it('counts weeks under 5', () => {
    expect(relativeTime('2025-12-27T12:00:00.000Z', now)).toBe('2 weeks ago');
  });

  it('counts months under a year, singular at 1', () => {
    expect(relativeTime('2025-12-10T12:00:00.000Z', now)).toBe('1 month ago');
    expect(relativeTime('2025-09-10T12:00:00.000Z', now)).toBe('4 months ago');
  });

  it('counts years past a year', () => {
    expect(relativeTime('2024-01-10T12:00:00.000Z', now)).toBe('2 years ago');
  });
});

describe('recentNotes', () => {
  it('sorts by modifiedTime descending and caps at n', () => {
    const index = buildVaultIndex([
      entry('a.md', 'text/markdown', '2026-01-01T00:00:00.000Z'),
      entry('b.md', 'text/markdown', '2026-01-03T00:00:00.000Z'),
      entry('c.md', 'text/markdown', '2026-01-02T00:00:00.000Z'),
    ]);
    expect(recentNotes(index).map((f) => f.name)).toEqual([
      'b.md',
      'c.md',
      'a.md',
    ]);
    expect(recentNotes(index, 2).map((f) => f.name)).toEqual(['b.md', 'c.md']);
  });

  it('sorts a missing modifiedTime last', () => {
    const index = buildVaultIndex([
      entry('no-time.md'),
      entry('has-time.md', 'text/markdown', '2026-01-01T00:00:00.000Z'),
    ]);
    expect(recentNotes(index).map((f) => f.name)).toEqual([
      'has-time.md',
      'no-time.md',
    ]);
  });

  it('skips app files unless asked', () => {
    const index = buildVaultIndex([
      entry('CLAUDE.md', 'text/markdown', '2026-01-05T00:00:00.000Z'),
      entry('Notes.md', 'text/markdown', '2026-01-01T00:00:00.000Z'),
    ]);
    expect(recentNotes(index).map((f) => f.name)).toEqual(['Notes.md']);
    expect(recentNotes(index, 20, true).map((f) => f.name)).toEqual([
      'CLAUDE.md',
      'Notes.md',
    ]);
  });
});

describe('pendingCount', () => {
  it('counts files under 0-Inbox/ and Clippings/, excluding Processed/, folders and folder notes', () => {
    const files = [
      dir('0-Inbox'),
      entry('0-Inbox/scan.pdf', 'application/pdf'),
      entry('0-Inbox/note.md'),
      dir('0-Inbox/Processed'),
      entry('0-Inbox/Processed/old.pdf', 'application/pdf'),
      entry('0-Inbox/_Folder.md'),
      dir('Clippings'),
      entry('Clippings/article.html', 'text/html'),
      entry('1-Projects/plan.md'),
    ];
    expect(pendingCount(files)).toBe(3);
  });

  it('is zero for an empty inbox', () => {
    expect(pendingCount([dir('0-Inbox')])).toBe(0);
  });

  it('still counts an instruction note in 0-Inbox/, even though the tree hides it', () => {
    const files = [
      dir('0-Inbox'),
      entry('0-Inbox/note.md'),
      entry('0-Inbox/Bower - 2026-09-26 1405 Receipts.md'),
    ];
    expect(pendingCount(files)).toBe(2);
  });
});

describe('buildTree', () => {
  it('nests folders and notes, hides folder notes, sorts folders alphabetically', () => {
    const index = buildVaultIndex([
      dir('1-Projects'),
      dir('1-Projects/Garden'),
      dir('1-Projects/Attic'),
      entry('1-Projects/_Projects.md'),
      entry('1-Projects/Garden/Seed List.md'),
      entry('Notes.md'),
    ]);
    const tree = buildTree(index);
    expect(tree.notes.map((n) => n.name)).toEqual(['Notes.md']);
    expect(tree.folders.map((f) => f.name)).toEqual(['1-Projects']);
    const projects = tree.folders[0];
    expect(projects?.folders.map((f) => f.name)).toEqual(['Attic', 'Garden']);
    const garden = projects?.folders.find((f) => f.name === 'Garden');
    expect(garden?.notes.map((n) => n.name)).toEqual(['Seed List.md']);
  });

  it('puts a hub note (basename === folder name) first, then alphabetical', () => {
    const index = buildVaultIndex([
      dir('1-Projects'),
      dir('1-Projects/Garden'),
      entry('1-Projects/Garden/Amendments.md'),
      entry('1-Projects/Garden/Garden.md'),
      entry('1-Projects/Garden/Seed List.md'),
    ]);
    const tree = buildTree(index);
    const garden = tree.folders[0]?.folders[0];
    expect(garden?.notes.map((n) => n.name)).toEqual([
      'Garden.md',
      'Amendments.md',
      'Seed List.md',
    ]);
  });

  it('sorts by last modified when asked: newest note first, folders by their newest note', () => {
    const index = buildVaultIndex([
      dir('Alpha'),
      dir('Beta'),
      entry('Alpha/Old.md', 'text/markdown', '2026-01-01T00:00:00.000Z'),
      entry('Beta/Fresh.md', 'text/markdown', '2026-03-01T00:00:00.000Z'),
      entry('Beta/Middle.md', 'text/markdown', '2026-02-01T00:00:00.000Z'),
      entry('Beta/Undated.md'),
    ]);
    const tree = buildTree(index, 'modified');
    expect(tree.folders.map((f) => f.name)).toEqual(['Beta', 'Alpha']);
    expect(tree.folders[0]?.notes.map((n) => n.name)).toEqual([
      'Fresh.md',
      'Middle.md',
      'Undated.md',
    ]);
  });

  it('sorts by name by default', () => {
    const index = buildVaultIndex([
      dir('Beta'),
      dir('Alpha'),
      entry('Beta/Fresh.md', 'text/markdown', '2026-03-01T00:00:00.000Z'),
    ]);
    expect(buildTree(index).folders.map((f) => f.name)).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('builds an empty tree for an empty vault', () => {
    const tree = buildTree(buildVaultIndex([]));
    expect(tree.folders).toEqual([]);
    expect(tree.notes).toEqual([]);
  });

  it("never nests Bower's own files inside a real folder", () => {
    const index = buildVaultIndex([
      dir('0-Inbox'),
      entry('CLAUDE.md'),
      entry('0-Inbox/Bower - 2026-09-26 1405 Receipts.md'),
      entry('0-Inbox/note.md'),
    ]);
    const tree = buildTree(index);
    expect(tree.notes).toEqual([]);
    const inbox = tree.folders.find((f) => f.name === '0-Inbox');
    expect(inbox?.notes.map((n) => n.name)).toEqual(['note.md']);
  });
});

describe('filterTree', () => {
  it('returns the tree unchanged for a blank query', () => {
    const index = buildVaultIndex([
      dir('1-Projects'),
      entry('1-Projects/Garden.md'),
    ]);
    const tree = buildTree(index);
    expect(filterTree(tree, '  ')).toBe(tree);
  });

  it('keeps a matching note and drops the rest, case-insensitively', () => {
    const index = buildVaultIndex([
      dir('1-Projects'),
      entry('1-Projects/Garden.md'),
      entry('1-Projects/Car insurance.md'),
    ]);
    const tree = buildTree(index);
    const filtered = filterTree(tree, 'GARDEN');
    const projects = filtered.folders[0];
    expect(projects?.name).toBe('1-Projects');
    expect(projects?.notes.map((n) => n.name)).toEqual(['Garden.md']);
  });

  it('keeps the parent chain of a deep match and drops sibling folders', () => {
    const index = buildVaultIndex([
      dir('1-Projects'),
      dir('1-Projects/Garden'),
      dir('2-Areas'),
      entry('1-Projects/Garden/Seed List.md'),
      entry('2-Areas/Health.md'),
    ]);
    const tree = buildTree(index);
    const filtered = filterTree(tree, 'seed');
    expect(filtered.folders.map((f) => f.name)).toEqual(['1-Projects']);
    const garden = filtered.folders[0]?.folders[0];
    expect(garden?.name).toBe('Garden');
    expect(garden?.notes.map((n) => n.name)).toEqual(['Seed List.md']);
  });

  it('keeps a whole subtree once a folder name itself matches', () => {
    const index = buildVaultIndex([
      dir('1-Projects'),
      dir('1-Projects/Garden'),
      entry('1-Projects/Garden/Amendments.md'),
      entry('1-Projects/Garden/Seed List.md'),
    ]);
    const tree = buildTree(index);
    const filtered = filterTree(tree, 'garden');
    const garden = filtered.folders[0]?.folders[0];
    expect(garden?.notes.map((n) => n.name)).toEqual([
      'Amendments.md',
      'Seed List.md',
    ]);
  });

  it('returns an empty tree when nothing matches', () => {
    const index = buildVaultIndex([
      dir('1-Projects'),
      entry('1-Projects/Garden.md'),
    ]);
    const tree = buildTree(index);
    const filtered = filterTree(tree, 'nope');
    expect(filtered.folders).toEqual([]);
    expect(filtered.notes).toEqual([]);
  });
});

describe('folderCounts', () => {
  it('counts the notes in each folder, subfolders included', () => {
    const index = buildVaultIndex([
      dir('2-Areas'),
      dir('2-Areas/Cooking'),
      dir('2-Areas/Finance'),
      dir('4-Archive'),
      entry('2-Areas/Overview.md'),
      entry('2-Areas/Cooking/Flour types.md'),
      entry('2-Areas/Cooking/Sourdough starter.md'),
      entry('2-Areas/Cooking/_Cooking.md'),
      entry('index.md'),
    ]);
    const counts = folderCounts(index);
    expect(counts.get('2-Areas')).toBe(3);
    expect(counts.get('2-Areas/Cooking')).toBe(2);
    expect(counts.get('2-Areas/Finance')).toBe(0);
    expect(counts.get('4-Archive')).toBe(0);
    expect(counts.has('')).toBe(false);
  });

  it('is empty for an empty vault', () => {
    expect(folderCounts(buildVaultIndex([])).size).toBe(0);
  });

  it("excludes an instruction note from its folder's count", () => {
    const index = buildVaultIndex([
      dir('0-Inbox'),
      entry('0-Inbox/note.md'),
      entry('0-Inbox/Bower - 2026-09-26 1405 Receipts.md'),
    ]);
    expect(folderCounts(index).get('0-Inbox')).toBe(1);
  });
});

describe('appFileGroup', () => {
  it('labels top-level app files and counts instruction notes separately', () => {
    const index = buildVaultIndex([
      dir('0-Inbox'),
      entry('CLAUDE.md'),
      entry('index.md'),
      entry('0-Inbox/Bower - 2026-09-26 1405 Receipts.md'),
      entry('0-Inbox/Bower - 2026-09-27 0900 Notes.md'),
      entry('0-Inbox/note.md'),
    ]);
    const group = appFileGroup(index);
    expect(group.files.map((f) => f.label)).toEqual(['Catalogue', 'Rulebook']);
    expect(group.instructionNotesCount).toBe(2);
  });

  it('is empty when the vault has no app files', () => {
    const index = buildVaultIndex([entry('Notes.md')]);
    expect(appFileGroup(index)).toEqual({
      files: [],
      instructionNotesCount: 0,
      agentSettings: null,
    });
  });

  it('lists the top-level `.claude` folder as "Agent settings"', () => {
    const index = buildVaultIndex([
      dir('.claude'),
      entry('.claude/settings.json', 'application/json'),
      entry('Notes.md'),
    ]);
    const group = appFileGroup(index);
    expect(group.agentSettings?.label).toBe('Agent settings');
    expect(group.agentSettings?.file.path).toBe('.claude');
  });

  it('has no agent settings entry for a nested `.claude`-named folder', () => {
    const index = buildVaultIndex([dir('1-Projects/.claude')]);
    expect(appFileGroup(index).agentSettings).toBeNull();
  });
});

describe('breadcrumb', () => {
  it('returns each folder segment with its own full path', () => {
    expect(breadcrumb('1-Projects/Garden/Seed List.md')).toEqual([
      { name: '1-Projects', path: '1-Projects' },
      { name: 'Garden', path: '1-Projects/Garden' },
    ]);
  });

  it('is empty for a top-level note', () => {
    expect(breadcrumb('index.md')).toEqual([]);
  });
});

describe('siblings', () => {
  const index = buildVaultIndex([
    dir('1-Projects'),
    entry('1-Projects/Amendments.md'),
    entry('1-Projects/Garden.md'),
    entry('1-Projects/Seed List.md'),
    entry('index.md'),
  ]);

  it('finds the previous and next note in the same folder, by name', () => {
    const garden = index.byPath.get('1-Projects/Garden.md');
    expect(garden).toBeDefined();
    const result = siblings(index, garden?.id ?? '');
    expect(result.prev?.name).toBe('Amendments.md');
    expect(result.next?.name).toBe('Seed List.md');
  });

  it('has no prev at the start and no next at the end of the folder', () => {
    const first = index.byPath.get('1-Projects/Amendments.md');
    const last = index.byPath.get('1-Projects/Seed List.md');
    expect(siblings(index, first?.id ?? '').prev).toBeNull();
    expect(siblings(index, last?.id ?? '').next).toBeNull();
  });

  it('is null/null for an unknown id', () => {
    expect(siblings(index, 'nope')).toEqual({ prev: null, next: null });
  });

  it('does not cross folder boundaries', () => {
    const root = index.byPath.get('index.md');
    const result = siblings(index, root?.id ?? '');
    expect(result).toEqual({ prev: null, next: null });
  });
});

describe('nextFocusIndex', () => {
  // A tiny tree, flattened as it would be with "Projects" expanded:
  // 0 Projects (folder, expanded)
  // 1   Garden (folder, collapsed)
  // 2 index.md (note)
  const rows: TreeRow[] = [
    { kind: 'folder', path: '1-Projects', depth: 0, expanded: true },
    { kind: 'folder', path: '1-Projects/Garden', depth: 1, expanded: false },
    { kind: 'note', path: 'index.md', depth: 0 },
  ];

  it('moves down and up, clamped to the ends', () => {
    expect(nextFocusIndex(rows, 0, 'ArrowDown')).toBe(1);
    expect(nextFocusIndex(rows, 2, 'ArrowDown')).toBe(2);
    expect(nextFocusIndex(rows, 0, 'ArrowUp')).toBe(0);
    expect(nextFocusIndex(rows, 2, 'ArrowUp')).toBe(1);
  });

  it('moves into the first child on Right when the folder is expanded', () => {
    expect(nextFocusIndex(rows, 0, 'ArrowRight')).toBe(1);
  });

  it('does not move on Right for a collapsed folder or a note', () => {
    expect(nextFocusIndex(rows, 1, 'ArrowRight')).toBe(1);
    expect(nextFocusIndex(rows, 2, 'ArrowRight')).toBe(2);
  });

  it('does not move on Left for an expanded folder', () => {
    expect(nextFocusIndex(rows, 0, 'ArrowLeft')).toBe(0);
  });

  it('moves up to the enclosing folder on Left for a collapsed folder', () => {
    expect(nextFocusIndex(rows, 1, 'ArrowLeft')).toBe(0);
  });

  it('stays put on Left for a top-level note (no enclosing row)', () => {
    expect(nextFocusIndex(rows, 2, 'ArrowLeft')).toBe(2);
  });

  it('ignores other keys and empty row lists', () => {
    expect(nextFocusIndex(rows, 1, 'Enter')).toBe(1);
    expect(nextFocusIndex([], 0, 'ArrowDown')).toBe(0);
  });
});
