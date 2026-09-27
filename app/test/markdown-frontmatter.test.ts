// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  normalizeTags,
  outlineOf,
  parseFrontmatter,
  propertiesFor,
} from '../src/markdown/frontmatter.js';

function note(...lines: string[]): string {
  return lines.join('\n');
}

describe('parseFrontmatter', () => {
  it('reads scalars and returns the body without the block', () => {
    const { data, body } = parseFrontmatter(
      note(
        '---',
        'title: Seed List',
        'count: 42',
        'ratio: -1.5',
        'zip: 007',
        'done: true',
        'draft: False',
        'empty:',
        'nothing: ~',
        'created: 2026-09-26',
        'status: active | waiting   # projects only',
        'url: https://example.com/a#b',
        '---',
        '# Heading',
        '',
        'Text.',
      ),
    );
    expect(data).toEqual({
      title: 'Seed List',
      count: 42,
      ratio: -1.5,
      zip: '007',
      done: true,
      draft: false,
      empty: null,
      nothing: null,
      created: '2026-09-26',
      status: 'active | waiting',
      url: 'https://example.com/a#b',
    });
    expect(body).toBe('# Heading\n\nText.');
  });

  it('reads quoted strings with #, :, escapes and trailing comments', () => {
    const { data } = parseFrontmatter(
      note(
        '---',
        'source: "[[Scan 01]] or https://example.com"   # where it came from',
        'hash: "#not-a-comment"',
        "time: '10:30'",
        "quote: 'it''s fine'",
        'escaped: "line\\nnext \\"quoted\\" \\u00e9"',
        '"spaced key": value',
        '---',
      ),
    );
    expect(data).toEqual({
      source: '[[Scan 01]] or https://example.com',
      hash: '#not-a-comment',
      time: '10:30',
      quote: "it's fine",
      escaped: 'line\nnext "quoted" é',
      'spaced key': 'value',
    });
  });

  it('reads inline and block lists', () => {
    const { data } = parseFrontmatter(
      note(
        '---',
        'related: ["[[Note A]]", "[[Note B|B, really]]"]',
        'bare: [[[Note C]], 3, yes]',
        'nested: [a, [b, c]]',
        'none: []',
        'aliases:',
        '  - First',
        '  - "Second: quoted"',
        'flat:',
        '- one',
        '- 2',
        '---',
      ),
    );
    expect(data).toEqual({
      related: ['[[Note A]]', '[[Note B|B, really]]'],
      bare: ['[[Note C]]', 3, 'yes'],
      nested: ['a', ['b', 'c']],
      none: [],
      aliases: ['First', 'Second: quoted'],
      flat: ['one', 2],
    });
  });

  it('reads one level of nested mapping and block text', () => {
    const { data } = parseFrontmatter(
      note(
        '---',
        'owner:',
        '  name: Alex',
        '  roles: [editor, reader]',
        'summary: |',
        '  First line',
        '  second line',
        'folded: >',
        '  one',
        '  two',
        '---',
      ),
    );
    expect(data).toEqual({
      owner: { name: 'Alex', roles: ['editor', 'reader'] },
      summary: 'First line\nsecond line',
      folded: 'one two',
    });
  });

  it('normalises tags from a list or a string, without #', () => {
    expect(
      parseFrontmatter('---\ntags: [meta, "#personal"]\n---\n').data.tags,
    ).toEqual(['meta', 'personal']);
    expect(parseFrontmatter('---\ntags: "#a, b  c"\n---\n').data.tags).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(
      parseFrontmatter('---\ntags:\n  - x\n  - "#y"\n  - x\n---\n').data.tags,
    ).toEqual(['x', 'y']);
    expect(parseFrontmatter('---\ntags:\n---\n').data.tags).toEqual([]);
    expect(normalizeTags([2026, '#2027', null])).toEqual(['2026', '2027']);
  });

  it('returns empty data when there is no frontmatter', () => {
    expect(parseFrontmatter('# Title\n\nText')).toEqual({
      data: {},
      body: '# Title\n\nText',
    });
    expect(parseFrontmatter('')).toEqual({ data: {}, body: '' });
    // An opening line without a closing one is not frontmatter.
    const open = '---\ntitle: x\nno end';
    expect(parseFrontmatter(open)).toEqual({ data: {}, body: open });
  });

  it('accepts a byte order mark and Windows line endings', () => {
    const { data, body } = parseFrontmatter('﻿---\r\ntitle: x\r\n---\r\nBody');
    expect(data).toEqual({ title: 'x' });
    expect(body).toBe('Body');
  });

  it('keeps going past malformed lines and keeps unknown constructs raw', () => {
    const { data } = parseFrontmatter(
      note(
        '---',
        'first: 1',
        'this line has no colon',
        '- orphan item',
        'broken: "unterminated',
        'list: [a, b',
        'map: {a: 1}',
        'pairs:',
        '  - key: value',
        '__proto__: safe',
        'last: 2',
        '---',
      ),
    );
    expect(data).toEqual({
      first: 1,
      broken: '"unterminated',
      list: '[a, b',
      map: '{a: 1}',
      pairs: ['key: value'],
      ['__proto__']: 'safe',
      last: 2,
    });
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
    expect(Object.keys(data)).toContain('__proto__');
  });
});

describe('propertiesFor', () => {
  it('reads tags from a list, created and source when present', () => {
    expect(
      propertiesFor({
        tags: ['recipe', 'bread'],
        created: '2026-09-12',
        source: 'Clipping, filed by Bower',
      }),
    ).toEqual({
      tags: ['recipe', 'bread'],
      created: '2026-09-12',
      source: 'Clipping, filed by Bower',
    });
  });

  it('reads tags from a space/comma separated string, without #', () => {
    expect(propertiesFor({ tags: '#recipe, bread' }).tags).toEqual([
      'recipe',
      'bread',
    ]);
  });

  it('leaves created and source out when missing, blank or not a scalar', () => {
    expect(propertiesFor({})).toEqual({
      tags: [],
      created: undefined,
      source: undefined,
    });
    expect(
      propertiesFor({ created: '   ', source: ['not', 'a', 'string'] }),
    ).toEqual({ tags: [], created: undefined, source: undefined });
  });

  it('formats a numeric or boolean created/source as text', () => {
    expect(propertiesFor({ created: 2026, source: true })).toEqual({
      tags: [],
      created: '2026',
      source: 'true',
    });
  });
});

describe('outlineOf', () => {
  it('lists h2/h3 headings in document order, ignoring h1 and h4', () => {
    const html =
      '<h1 id="title">Title</h1>' +
      '<p>Intro</p>' +
      '<h2 id="a">Feeding schedule</h2>' +
      '<p>...</p>' +
      '<h3 id="b">Days 1 to 3</h3>' +
      '<h2 id="c">Troubleshooting</h2>' +
      '<h4 id="d">Ignored</h4>';
    expect(outlineOf(html)).toEqual([
      { id: 'a', text: 'Feeding schedule', depth: 2 },
      { id: 'b', text: 'Days 1 to 3', depth: 3 },
      { id: 'c', text: 'Troubleshooting', depth: 2 },
    ]);
  });

  it('returns an empty list for a note with no headings', () => {
    expect(outlineOf('<p>Just a paragraph.</p>')).toEqual([]);
  });
});
