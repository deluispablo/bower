import { describe, expect, it } from 'vitest';

import { applyFormat } from '../src/editor-format.js';
import type { Format, Formatted } from '../src/editor-format.js';

/**
 * Applies `format` to `marked`, where `[` and `]` mark the selection (a
 * single `|` marks a cursor), and returns the result marked the same way.
 */
function run(marked: string, format: Format): string {
  let start: number;
  let end: number;
  let text: string;
  if (marked.includes('|')) {
    start = end = marked.indexOf('|');
    text = marked.replace('|', '');
  } else {
    start = marked.indexOf('[');
    end = marked.indexOf(']') - 1;
    text = marked.replace('[', '').replace(']', '');
  }
  const out: Formatted = applyFormat(text, start, end, format);
  if (out.selectionStart === out.selectionEnd) {
    return (
      out.text.slice(0, out.selectionStart) +
      '|' +
      out.text.slice(out.selectionStart)
    );
  }
  return (
    out.text.slice(0, out.selectionStart) +
    '[' +
    out.text.slice(out.selectionStart, out.selectionEnd) +
    ']' +
    out.text.slice(out.selectionEnd)
  );
}

describe('applyFormat: wrapping', () => {
  it('wraps the selection in ** for bold and keeps it selected', () => {
    expect(run('a [word] here', 'bold')).toBe('a **[word]** here');
  });

  it('wraps the selection in * for italic', () => {
    expect(run('a [word] here', 'italic')).toBe('a *[word]* here');
  });

  it('puts the cursor between the markers with nothing selected', () => {
    expect(run('a | here', 'bold')).toBe('a **|** here');
    expect(run('|', 'italic')).toBe('*|*');
  });

  it('turns the selection into link text and selects the url placeholder', () => {
    expect(run('see [the docs] now', 'link')).toBe('see [the docs]([url]) now');
    expect(run('|', 'link')).toBe('[]([url])');
  });

  it('accepts a backwards selection', () => {
    const out = applyFormat('abc', 3, 0, 'bold');
    expect(out).toEqual({
      text: '**abc**',
      selectionStart: 2,
      selectionEnd: 5,
    });
  });
});

describe('applyFormat: line prefixes', () => {
  it('turns the cursor line into a heading', () => {
    expect(run('one\ntw|o\nthree', 'heading')).toBe('one\n# tw|o\nthree');
  });

  it('makes a heading one level deeper, up to six', () => {
    expect(run('## Ti|tle', 'heading')).toBe('### Ti|tle');
    expect(run('###### Ti|tle', 'heading')).toBe('###### Ti|tle');
  });

  it('prefixes every selected line with a list marker, skipping blank lines', () => {
    expect(run('[one\n\ntwo]', 'list')).toBe('- [one\n\n- two]');
  });

  it('leaves lines that already are list items alone', () => {
    expect(run('[- one\ntwo]', 'list')).toBe('[- one\n- two]');
  });

  it('prefixes a checkbox, and turns a list item into a task', () => {
    expect(run('[buy milk\n- call Alex]', 'checkbox')).toBe(
      '- [ ] [buy milk\n- [ ] call Alex]',
    );
  });

  it('leaves a task alone', () => {
    expect(run('- [x] do|ne', 'checkbox')).toBe('- [x] do|ne');
  });

  it('prefixes an empty line under the cursor', () => {
    expect(run('|', 'list')).toBe('- |');
    expect(run('\n|', 'checkbox')).toBe('\n- [ ] |');
    expect(run('|\nnext', 'heading')).toBe('# |\nnext');
  });

  it('does not touch the line a selection ends at the very start of', () => {
    expect(run('[one\n]two', 'list')).toBe('- [one\n]two');
  });
});
