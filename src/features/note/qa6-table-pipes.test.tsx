import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { plainSnippet, plainText, tableCells } from '@/data/search-text';
import { Markdown } from './markdown';

const TABLE = '| Skill | Evidence | Decision |\n| --- | --- | --- |\n| C \\| C++ | Both skills appear | Keep |';

describe('qa6-table-pipes: an escaped pipe stays inside its cell (GFM tables extension)', () => {
  it('AC1 qa6-table-pipes-note-reader: the row keeps three cells, the first reads "C | C++"', () => {
    const { container } = render(<Markdown text={TABLE} link={(t) => t} />);
    const cells = [...container.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(cells).toEqual(['C | C++', 'Both skills appear', 'Keep']);
  });

  it('AC2 qa6-table-pipes-alias-link: a wikilink with an escaped alias pipe in a cell is one link', () => {
    const text = '| Flat | Rent |\n| --- | --- |\n| [[Flat 7\\|the flat]] | 1200 |';
    const { container } = render(<Markdown text={text} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
    expect(container.querySelectorAll('tbody td')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'the flat' })).toHaveAttribute('href', '#Flat 7');
  });

  it('AC3 qa6-table-pipes-search-text: a search hit on that row reads the same three cells', () => {
    expect(plainText('| C \\| C++ | Both skills appear | Keep |')).toBe('C | C++, Both skills appear, Keep');
  });

  // Spec-review round 1 red gaps.
  const tds = (text: string) => {
    const { container } = render(<Markdown text={text} link={(t) => t} />);
    return { container, cells: [...container.querySelectorAll('tbody td')].map((td) => td.textContent) };
  };

  it('G1 qa6-table-pipes-snippet: the snippet a search shows (plain text, then snippet) keeps "C | C++"', () => {
    expect(plainSnippet(plainText('| C \\| C++ | Both skills appear | Keep |'))).toBe('C | C++, Both skills appear, Keep');
  });

  it('G2 qa6-table-pipes-empty-cell: an empty middle cell keeps its place, in the shared reader and under its heading', () => {
    const row = '| C \\| C++ |  | Keep |';
    expect(tableCells(row)).toEqual(['C | C++', '', 'Keep']);
    expect(tds(`| Skill | Evidence | Decision |\n| --- | --- | --- |\n${row}`).cells).toEqual(['C | C++', '', 'Keep']);
  });

  it('G3 qa6-table-pipes-escaped-end: an escaped last pipe without a closing pipe stays in the last cell', () => {
    expect(tableCells('| a | b \\|')).toEqual(['a', 'b |']);
    expect(tds('| A | B |\n| --- | --- |\n| a | b \\|').cells).toEqual(['a', 'b |']);
  });

  it('G4 qa6-table-pipes-header: an escaped pipe in a heading is one heading and reads | in the region name', () => {
    const { container } = tds('| Skill \\| tool | Decision |\n| --- | --- |\n| C | Keep |');
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Skill | tool', 'Decision']);
    expect(screen.getByRole('region', { name: 'Table: Skill | tool, Decision' })).toBeInTheDocument();
  });

  it('G5 qa6-table-pipes-inline-spans: escaped pipes inside code and emphasis read | in one cell', () => {
    const { container, cells } = tds('| A | B |\n| --- | --- |\n| `a \\| b` | *c \\| d* |');
    expect(cells).toEqual(['a | b', 'c | d']);
    expect(container.querySelector('tbody code')).toHaveTextContent('a | b');
    expect(container.querySelector('tbody em')).toHaveTextContent('c | d');
    expect(plainText('| `a \\| b` | *c \\| d* |')).toBe('a | b, c | d');
  });
});
