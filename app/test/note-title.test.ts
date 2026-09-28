import { describe, expect, it } from 'vitest';

import { noteTitle } from '../src/note-title.js';

function lines(...rows: string[]): string {
  return rows.join('\n');
}

describe('noteTitle', () => {
  it('prefers the frontmatter title', () => {
    const text = lines(
      '---',
      'title: Seed List',
      '---',
      '# Something else entirely',
      'Body text.',
    );
    expect(noteTitle({ name: 'Seed List 2026-09-27.md' }, text)).toBe(
      'Seed List',
    );
  });

  it('falls back to the first # heading when there is no frontmatter title', () => {
    const text = lines('Some intro text.', '', '# The Real Title', 'More.');
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('The Real Title');
  });

  it('falls back to the file name without .md when neither is present', () => {
    const text = lines('Just a paragraph.', 'Nothing else.');
    expect(noteTitle({ name: 'Bower - 2026-09-27 0815 Lisbon.md' }, text)).toBe(
      'Bower - 2026-09-27 0815 Lisbon',
    );
  });

  it('falls back to the file name when called with no text at all', () => {
    expect(noteTitle({ name: 'Shopping list.md' })).toBe('Shopping list');
  });

  it('strips the extension case-insensitively', () => {
    expect(noteTitle({ name: 'Shopping list.MD' })).toBe('Shopping list');
  });

  it('ignores a blank frontmatter title and falls through to the heading', () => {
    const text = lines('---', 'title:', '---', '# Heading Title');
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('Heading Title');
  });

  it('ignores a whitespace-only frontmatter title', () => {
    const text = lines('---', 'title: "   "', '---', '# Heading Title');
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('Heading Title');
  });

  it('never matches a level-2 heading as the first heading', () => {
    const text = lines('## Not this one', '# This one');
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('This one');
  });

  it('ignores a heading inside a fenced code block', () => {
    const text = lines(
      '```',
      '# Not a heading',
      '```',
      'Some text.',
      '# The real heading',
    );
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('The real heading');
  });

  it('ignores a heading inside a tilde-fenced code block', () => {
    const text = lines('~~~', '# Not a heading', '~~~', '# The real heading');
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('The real heading');
  });

  it('falls back to the file name when a heading only appears inside a fence', () => {
    const text = lines('```', '# Not a heading', '```', 'No other heading.');
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('Note');
  });

  it('handles \\r\\n line endings in both the frontmatter and the body', () => {
    const text = ['---', 'title: Windows Note', '---', '# Ignored', ''].join(
      '\r\n',
    );
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('Windows Note');
  });

  it('handles \\r\\n line endings when falling back to the heading', () => {
    const text = ['Intro line.', '', '# Heading, CRLF', ''].join('\r\n');
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('Heading, CRLF');
  });

  it('accepts a number or boolean frontmatter title as text', () => {
    expect(
      noteTitle({ name: 'Note.md' }, lines('---', 'title: 2026', '---', '')),
    ).toBe('2026');
  });

  it('reads a filed link (#557) by its host and path, not its generated name', () => {
    const name = 'Link - example.org 2026-09-28 1414.md';
    expect(noteTitle({ name }, 'https://example.org/offers/job-one')).toBe(
      'example.org/offers/job-one',
    );
    // A trailing newline (as a saved file often has) is trimmed first.
    expect(noteTitle({ name }, 'https://www.example.org/offers/\n')).toBe(
      'example.org/offers/',
    );
    // The bare host: no path beyond "/".
    expect(noteTitle({ name }, 'https://example.org/')).toBe('example.org');
  });

  it('does not treat a note that only mentions a URL as a link note', () => {
    const text = 'See https://example.org/offers/job-one for the listing.';
    expect(noteTitle({ name: 'Note.md' }, text)).toBe('Note');
  });

  it('ignores a non-http(s) bare URL body', () => {
    expect(noteTitle({ name: 'Note.md' }, 'mailto:you@example.com')).toBe(
      'Note',
    );
  });
});
