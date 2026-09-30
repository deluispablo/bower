import { describe, expect, it } from 'vitest';

import {
  askBowerHref,
  isRootFolder,
  moreMenuGroups,
  moreMenuHeader,
  showInFoldersHref,
} from '../src/more-menu.js';
import { revealHref } from '../src/reveal.js';

function prefill(href: string): string | null {
  return new URL(href, 'https://example.com').searchParams.get('text');
}

describe('moreMenuHeader (#352, #608)', () => {
  it('gives the type word and the folder with its PARA kind, as the board draws it', () => {
    expect(
      moreMenuHeader('PDF', '1-Projects/Flat hunt/Lease 2026.pdf'),
    ).toEqual({
      typeLabel: 'PDF',
      place: { label: 'Projects › Flat hunt', kind: 'projects' },
    });
    expect(
      moreMenuHeader('Note', '2-Areas/Home/Boiler.md').place?.label,
    ).not.toMatch(/[0-4]-/);
  });

  it('has a neutral kind for a folder that is not a landmark', () => {
    expect(moreMenuHeader('Note', 'Answers/Reply.md').place).toEqual({
      label: 'Answers',
      kind: null,
    });
  });

  it('has no place at the top of the Bower folder', () => {
    expect(moreMenuHeader('Folder', '1-Projects')).toEqual({
      typeLabel: 'Folder',
      place: null,
    });
  });
});

describe('askBowerHref (#352)', () => {
  it('names a note or a file as a wikilink, and nothing else', () => {
    expect(prefill(askBowerHref('note', 'Shopping list'))).toBe(
      '[[Shopping list]] ',
    );
    expect(prefill(askBowerHref('file', 'Lease 2026.pdf'))).toBe(
      '[[Lease 2026.pdf]] ',
    );
  });

  it('names a folder as "About <folder>: ", and nothing else (#354)', () => {
    expect(prefill(askBowerHref('folder', 'Flat hunt'))).toBe(
      'About Flat hunt: ',
    );
    expect(askBowerHref('folder', 'Flat hunt')).toBe(
      `/bower?text=${encodeURIComponent('About Flat hunt: ')}`,
    );
  });

  it('opens the Bower tab, the name encoded', () => {
    expect(askBowerHref('note', 'A & B').startsWith('/bower?text=')).toBe(true);
    expect(prefill(askBowerHref('note', 'A & B'))).toBe('[[A & B]] ');
  });
});

describe('showInFoldersHref (#608)', () => {
  it('reveals a note or a file by id, and a folder by path', () => {
    expect(showInFoldersHref('note', { id: 'n1', path: 'a/b.md' })).toBe(
      revealHref({ kind: 'note', id: 'n1', path: 'a/b.md' }),
    );
    expect(showInFoldersHref('file', { id: 'f1', path: 'a/b.pdf' })).toBe(
      '/notes?reveal=file%2Ff1',
    );
    expect(
      showInFoldersHref('folder', { id: 'd1', path: '1-Projects/Flat hunt' }),
    ).toBe(revealHref({ kind: 'folder', path: '1-Projects/Flat hunt' }));
  });
});

/** The labels of each group, as the boards draw them (#907, spec §3.6). */
function labels(...args: Parameters<typeof moreMenuGroups>): string[][] {
  return moreMenuGroups(...args).map((group) =>
    group.map((entry) => entry.label),
  );
}

describe('moreMenuGroups (#907, R-MORE-1)', () => {
  it('folder: PF-More, LI-More, GR-More', () => {
    expect(labels('folder', { name: 'Flat hunt' })).toEqual([
      ['Ask Bower about this', 'Pin to Home', 'Open in Drive'],
      ['Show in folders', 'Move to…', 'Copy link'],
      ['Help and about this'],
    ]);
    const show = moreMenuGroups('folder', { name: 'Flat hunt' })[1]?.[0];
    expect(show?.hint).toBe('Opens your folders at Flat hunt');
  });

  it('root: AR-More, no Rename… and no Move to…', () => {
    const all = labels('root', { name: 'Areas' }).flat();
    expect(all).toEqual([
      'Ask Bower about this',
      'Pin to Home',
      'Open in Drive',
      'Show in folders',
      'Copy link',
      'Help and about this',
    ]);
    expect(all).not.toContain('Rename…');
    expect(all).not.toContain('Move to…');
  });

  it('note: NO-More, eleven items in four groups, with the listed subtitles', () => {
    const groups = moreMenuGroups('note', { name: 'CV insights' });
    expect(groups.map((g) => g.map((e) => [e.label, e.hint ?? '']))).toEqual([
      [
        ['Ask Bower about this', ''],
        ['Pin to Home', ''],
        ['Open in Drive', ''],
      ],
      [
        ['Show in folders', 'Opens your folders at CV insights'],
        ['Rename…', 'Bower renames it at the next tidy-up'],
        ['Move to…', 'Bower moves it at the next tidy-up'],
        ['Copy link', ''],
      ],
      [
        ['Add a paragraph…', 'A new paragraph at the end of this note'],
        ['Edit the text', 'Plain text, for small fixes'],
      ],
      [['Help and about this', '']],
    ]);
  });

  it('file: FI-More, Download after Copy link, no subtitle on Ask', () => {
    const groups = moreMenuGroups('file', { name: 'Passport copy' });
    expect(groups.map((g) => g.map((e) => e.label))).toEqual([
      ['Ask Bower about this', 'Pin to Home', 'Open in Drive'],
      ['Show in folders', 'Rename…', 'Move to…', 'Copy link', 'Download'],
      ['Help and about this'],
    ]);
    expect(groups[0]?.[0]?.hint).toBeUndefined();
  });

  it('home, add, settings: HM-More, AD-More, ST-More', () => {
    expect(labels('home')).toEqual([['Edit pinned'], ['Help and about this']]);
    expect(labels('add')).toEqual([
      ['Show the inbox in folders', 'Open the inbox in Drive'],
      ['Help and about this'],
    ]);
    expect(labels('settings')).toEqual([
      ['Open your Bower folder in Drive'],
      ['Help and about this'],
    ]);
  });

  it('bower, justFiled: BW-More, JF-More, with their subtitles', () => {
    expect(
      moreMenuGroups('bower').map((g) => g.map((e) => [e.label, e.hint])),
    ).toEqual([
      [
        ['Things you can ask', 'Ideas for rules, jobs and questions'],
        ['Open your rules in Drive', 'Your rules file, as Bower keeps it'],
      ],
      [['Help and about this', undefined]],
    ]);
    expect(
      moreMenuGroups('justFiled').map((g) => g.map((e) => [e.label, e.hint])),
    ).toEqual([
      [
        ['Mark all seen', 'Clears the Just filed badge'],
        ['Every tidy-up in the Bower tab', 'Activity, with what was set aside'],
      ],
      [['Help and about this', undefined]],
    ]);
  });

  it('notes: NT-More, the toggle follows the shared preference', () => {
    expect(labels('notes')).toEqual([
      ['Open your Bower folder in Drive', "Show Bower's own files"],
      ['Help and about this'],
    ]);
    expect(labels('notes', { ownFilesShown: true })[0]?.[1]).toBe(
      "Hide Bower's own files",
    );
  });

  it('says Unpin when pinned, and Waiting when a rename or move waits', () => {
    const groups = moreMenuGroups('note', {
      pinned: true,
      pendingRename: true,
      pendingMove: true,
    });
    expect(groups[0]?.[1]?.label).toBe('Unpin from Home');
    expect(groups[1]?.[1]?.hint).toBe('Waiting for the next tidy-up');
    expect(groups[1]?.[2]?.hint).toBe('Waiting for the next tidy-up');
  });

  it('leaves out omitted items, and a group left empty (R-API-5)', () => {
    expect(
      labels('settings', { omit: new Set(['bowerDrive'] as const) }),
    ).toEqual([['Help and about this']]);
  });
});

describe('isRootFolder (#907)', () => {
  it('is true for a top-level landmark only', () => {
    expect(isRootFolder('2-Areas')).toBe(true);
    expect(isRootFolder('Projects')).toBe(true);
    expect(isRootFolder('1-Projects/Flat hunt')).toBe(false);
    expect(isRootFolder('Misc')).toBe(false);
    expect(isRootFolder('')).toBe(false);
  });
});
