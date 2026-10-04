import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown, outlineOf } from './markdown';

describe('the note reader', () => {
  it('turns wikilinks into links and never runs HTML', () => {
    render(<Markdown text={'See [[Flat 7]] and <img src=x onerror=alert(1)>'} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
    expect(screen.getByRole('link', { name: 'Flat 7' })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
  it('reads lists, tables and headings', () => {
    const { container } = render(<Markdown text={'## A\n\n- one\n- two\n\n| x | y |\n| --- | --- |\n| 1 | 2 |'} link={(t) => t} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('td')?.textContent).toBe('1');
    expect(outlineOf('## A\n### B')).toEqual([{ level: 2, text: 'A' }, { level: 3, text: 'B' }]);
  });
});
