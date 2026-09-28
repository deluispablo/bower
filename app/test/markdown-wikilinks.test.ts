import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  parseWikilink,
  renderTextWithWikilinks,
  renderWikilink,
  resolveMarkdownLink,
  resolveWikilink,
} from '../src/markdown/wikilinks.js';
import { buildVaultIndex } from '../src/vault-index.js';

function file(id: string, path: string, mimeType = 'text/markdown'): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType, parents: ['PARENT'], path };
}

const index = buildVaultIndex([
  file('seed-deep', '1-Projects/Garden/Archive/Seed List.md'),
  file('seed', '1-Projects/Garden/Seed List.md'),
  file('seed-area', '2-Areas/seed list.md'),
  file('seed-photo', 'Seed List.png', 'image/png'),
  file('plan', '1-Projects/Garden/Garden Plan.md'),
  file('version', '3-Resources/v1.2 notes.md'),
  file('index', 'index.md'),
  file('scan', '0-Inbox/scan.pdf', 'application/pdf'),
]);

describe('parseWikilink', () => {
  it.each([
    ['[[Note]]', { target: 'Note' }],
    ['[[Note|alias]]', { target: 'Note', alias: 'alias' }],
    ['[[Note#Heading]]', { target: 'Note', heading: 'Heading' }],
    [
      '[[Note#Heading|alias]]',
      { target: 'Note', heading: 'Heading', alias: 'alias' },
    ],
    ['[[folder/Note]]', { target: 'folder/Note' }],
    ['[[Note.md]]', { target: 'Note.md' }],
    ['![[Note]]', { target: 'Note' }],
    ['Note', { target: 'Note' }],
    ['[[#Only Heading]]', { target: '', heading: 'Only Heading' }],
    ['[[ Note | spaced alias ]]', { target: 'Note', alias: 'spaced alias' }],
  ])('parses %s', (raw, expected) => {
    expect(parseWikilink(raw)).toEqual(expected);
  });

  it('keeps extra | in the alias and # after the first in the heading', () => {
    expect(parseWikilink('[[Note|a | b|c]]')).toEqual({
      target: 'Note',
      alias: 'a | b|c',
    });
    expect(parseWikilink('[[Note#Part one#Sub part|x#y]]')).toEqual({
      target: 'Note',
      heading: 'Part one#Sub part',
      alias: 'x#y',
    });
  });

  it('accepts the escaped separator used inside tables', () => {
    expect(parseWikilink('[[Note\\|alias]]')).toEqual({
      target: 'Note',
      alias: 'alias',
    });
  });

  it('keeps headings with spaces and punctuation', () => {
    expect(parseWikilink('[[Seed List#Frontmatter (YAML) rules]]')).toEqual({
      target: 'Seed List',
      heading: 'Frontmatter (YAML) rules',
    });
  });
});

describe('resolveWikilink', () => {
  it('resolves by exact path, with or without .md', () => {
    expect(resolveWikilink('2-Areas/seed list', index)?.id).toBe('seed-area');
    expect(resolveWikilink('2-Areas/seed list.md', index)?.id).toBe(
      'seed-area',
    );
    expect(resolveWikilink('0-Inbox/scan.pdf', index)?.id).toBe('scan');
  });

  it('resolves by name, case-insensitively, preferring notes then the shortest path', () => {
    // Three notes and one image share the name: the note with the shortest path wins.
    expect(resolveWikilink('seed list', index)?.id).toBe('seed-area');
    expect(resolveWikilink('SEED LIST.md', index)?.id).toBe('seed-area');
    expect(resolveWikilink('garden plan', index)?.id).toBe('plan');
  });

  it('uses the folder part to choose among duplicates', () => {
    expect(resolveWikilink('Garden/Seed List', index)?.id).toBe('seed');
    expect(resolveWikilink('Archive/Seed List', index)?.id).toBe('seed-deep');
  });

  it('keeps dots that are not an extension and finds attachments', () => {
    expect(resolveWikilink('v1.2 notes', index)?.id).toBe('version');
    expect(resolveWikilink('Seed List.png', index)?.id).toBe('seed-photo');
    expect(resolveWikilink('scan.pdf', index)?.id).toBe('scan');
  });

  it('returns undefined when nothing matches', () => {
    expect(resolveWikilink('Nowhere', index)).toBeUndefined();
    expect(resolveWikilink('', index)).toBeUndefined();
  });
});

describe('renderWikilink', () => {
  it('links a resolved note to its route', () => {
    expect(renderWikilink('[[Garden Plan]]', index)).toBe(
      '<a class="wikilink" href="/note/plan">Garden Plan</a>',
    );
    expect(renderWikilink('[[index.md|Home]]', index)).toBe(
      '<a class="wikilink" href="/note/index">Home</a>',
    );
  });

  it('points at the heading anchor', () => {
    expect(renderWikilink('[[Garden Plan#Beds & Paths]]', index)).toBe(
      '<a class="wikilink" href="/note/plan#user-content-beds-paths">Garden Plan &gt; Beds &amp; Paths</a>',
    );
    expect(renderWikilink('[[#Next Steps]]', index)).toBe(
      '<a class="wikilink" href="#user-content-next-steps">Next Steps</a>',
    );
  });

  it('renders unresolved links as a missing span, escaped', () => {
    expect(renderWikilink('[[<b>Nowhere</b>]]', index)).toBe(
      '<span class="wikilink-missing">&lt;b&gt;Nowhere&lt;/b&gt;</span>',
    );
  });

  it('marks embeds, resolved or not', () => {
    expect(renderWikilink('![[Seed List.png]]', index, true)).toBe(
      '<a class="wikilink wikilink-file wikilink-embed" ' +
        'href="/file/seed-photo">Seed List.png</a>',
    );
    expect(renderWikilink('![[gone.png]]', index, true)).toBe(
      '<span class="wikilink-missing wikilink-embed">gone.png</span>',
    );
  });

  it('opens other files on their screen in the app, not in Drive', () => {
    expect(renderWikilink('[[scan.pdf]]', index)).toBe(
      '<a class="wikilink wikilink-file" href="/file/scan">scan.pdf</a>',
    );
  });

  it('emits placeholders for embeds when asked', () => {
    const options = { placeholders: true, notePath: 'index.md' };
    expect(renderWikilink('![[Seed List.png|300]]', index, true, options)).toBe(
      '<img class="embed-image" data-bower-file="seed-photo" alt="Seed List.png">',
    );
    expect(renderWikilink('![[Garden Plan#Beds]]', index, true, options)).toBe(
      '<div class="transclusion-pending" data-bower-embed="plan">' +
        '<a class="wikilink wikilink-embed" href="/note/plan#user-content-beds">' +
        'Garden Plan &gt; Beds</a></div>',
    );
    // No transclusion inside a transcluded note, nor of a note into itself.
    expect(
      renderWikilink('![[Garden Plan]]', index, true, {
        ...options,
        transclude: false,
      }),
    ).toBe(
      '<a class="wikilink wikilink-embed" href="/note/plan">Garden Plan</a>',
    );
    expect(renderWikilink('![[index]]', index, true, options)).toBe(
      '<a class="wikilink wikilink-embed" href="/note/index">index</a>',
    );
  });

  it('turns wikilinks inside plain text into links and escapes the rest', () => {
    expect(
      renderTextWithWikilinks('See [[Garden Plan]] & [[Nowhere]]', index),
    ).toBe(
      'See <a class="wikilink" href="/note/plan">Garden Plan</a> &amp; ' +
        '<span class="wikilink-missing">Nowhere</span>',
    );
  });
});

describe('resolveMarkdownLink', () => {
  it('resolves relative to the note, then like a wikilink', () => {
    const from = '1-Projects/Garden/Garden Plan.md';
    expect(resolveMarkdownLink('Seed%20List.md', from, index)?.file.id).toBe(
      'seed',
    );
    expect(resolveMarkdownLink('Archive/Seed List', from, index)?.file.id).toBe(
      'seed-deep',
    );
    expect(
      resolveMarkdownLink('../../0-Inbox/scan.pdf', from, index)?.file.id,
    ).toBe('scan');
    expect(resolveMarkdownLink('scan.pdf', from, index)?.file.id).toBe('scan');
    const heading = resolveMarkdownLink('Seed List.md#Tomatoes', from, index);
    expect(heading?.file.id).toBe('seed');
    expect(heading?.fragment).toBe('Tomatoes');
  });

  it('leaves URLs and unknown paths alone', () => {
    expect(
      resolveMarkdownLink('https://example.com/scan.pdf', 'index.md', index),
    ).toBeUndefined();
    expect(
      resolveMarkdownLink('nowhere.png', 'index.md', index),
    ).toBeUndefined();
  });
});
