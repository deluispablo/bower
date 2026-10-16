import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { plainText } from '@/data/search-text';
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
});
