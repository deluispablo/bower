import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { Note } from '@/data/types';
import { Markdown } from './markdown';
import { LinkedList } from './RightPanel';

/** design-note-page: note tables that never break a token, and links shown once, two-way when both. Made-up notes. */

afterEach(cleanup);

const TABLE = [
  '| Flat | Rent | Commute | Status |',
  '| --- | --- | --- | --- |',
  '| [[Flat 3, 12 Larkspur Lane]] | £1,450 | 24 min | viewing done |',
  '| [[Flat 7, Cobble Row]] | -£20.50 | 18 min | 75% |',
].join('\n');

describe('design-note-page: note tables', () => {
  it('AC1 note-table-region: a table sits in a region you can reach with the keyboard and scroll sideways, named by its columns', () => {
    render(<Markdown text={TABLE} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
    const region = screen.queryByRole('region', { name: 'Table: Flat, Rent, Commute, Status' });
    expect(region, 'a region named "Table: Flat, Rent, Commute, Status"').not.toBeNull();
    if (!region) return;
    expect(region).toHaveClass('md-table');
    expect(region.tabIndex).toBe(0);
    expect(within(region).getByRole('table')).toBeInTheDocument();
  });

  it('AC2 note-table-numbers: cells that are a number, with or without a unit, are marked to stay on one line; words are not', () => {
    const { container } = render(<Markdown text={TABLE} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
    const cells = [...container.querySelectorAll('td')].map((td) => [td.textContent, td.classList.contains('md-num')]);
    expect(cells).toEqual([
      ['Flat 3, 12 Larkspur Lane', false],
      ['£1,450', true],
      ['24 min', true],
      ['viewing done', false],
      ['Flat 7, Cobble Row', false],
      ['-£20.50', true],
      ['18 min', true],
      ['75%', true],
    ]);
  });

  it('R4 note-table-rendered-text: a number is judged as shown, so bold and link marks do not hide it', () => {
    const text = ['| Item | Time |', '| --- | --- |', '| **24 min** | *£3* |', '| [[18 min]] | **soon** |'].join('\n');
    const { container } = render(<Markdown text={text} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
    const cells = [...container.querySelectorAll('td')].map((td) => [td.textContent, td.classList.contains('md-num')]);
    expect(cells).toEqual([['24 min', true], ['£3', true], ['18 min', true], ['soon', false]]);
  });

  it('R4 note-table-code-span: a code span holding link marks renders literally, so it is judged and named as rendered', () => {
    const text = ['| `[[24 min]]` | Time |', '| --- | --- |', '| `[[24 min]]` | x |'].join('\n');
    const { container } = render(<Markdown text={text} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
    expect(container.querySelector('td')?.textContent).toBe('[[24 min]]');
    expect(container.querySelector('td')).not.toHaveClass('md-num');
    expect(screen.getByRole('region', { name: 'Table: [[24 min]], Time' })).toBeInTheDocument();
  });

  it('R3 note-table-headerless: a table with no header row keeps today\'s parsing, its first row becomes the header', () => {
    render(<Markdown text={['| a | b |', '| 1 | 2 |'].join('\n')} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
    expect(screen.getByRole('region', { name: 'Table: a, b' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['a', 'b']);
  });
});

const note =(links: string[], backlinks: string[]): Note => ({
  path: 'Projects/Flat hunt/Flat hunt.md', title: 'Flat hunt', summary: '', properties: [], tags: [], currentState: [], body: '', timeline: [], links, backlinks, byBower: true,
});
const show = (n: Note): void => {
  render(<MemoryRouter><LinkedList note={n} /></MemoryRouter>);
};
/** The links listed under a heading, by their visible title, with whether each is marked two-way. */
const under = (heading: string): Array<[string, boolean]> => {
  const h = screen.getByRole('heading', { name: heading });
  const list = h.nextElementSibling;
  if (!list || list.tagName !== 'UL') return [];
  return within(list as HTMLElement).getAllByRole('link').map((a) => [
    a.firstElementChild?.textContent ?? '',
    /Links both ways/.test(a.textContent ?? ''),
  ]);
};

describe('design-note-page: links to and linked from', () => {
  it('AC3 note-links-once: a note in both lists shows once, under Links to, marked "Links both ways"', () => {
    show(note(['Projects/Flat hunt/Flat 3.md', 'Projects/Flat hunt/Flat 7.md'], ['Projects/Flat hunt/Flat 7.md', 'About me.md']));
    expect(under('Links to')).toEqual([['Flat 3', false], ['Flat 7', true]]);
    expect(under('Linked from')).toEqual([['About me', false]]);
    expect(screen.getAllByRole('link', { name: /Flat 7/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Flat 7/ })).toHaveAttribute('href', '/note/Projects/Flat%20hunt/Flat%207.md');
  });

  it('AC3 note-links-all-both: when every note linking here is also linked to, Linked from says so instead of "nothing"', () => {
    show(note(['Projects/Flat hunt/Flat 7.md'], ['Projects/Flat hunt/Flat 7.md']));
    expect(under('Links to')).toEqual([['Flat 7', true]]);
    expect(screen.queryByText('Nothing links here yet.')).toBeNull();
    expect(screen.getByText('No other notes link here.')).toBeInTheDocument();
  });

  it('R5 note-links-by-path: two notes with the same title in different places both stay', () => {
    show(note(['Projects/Flat hunt/Notes.md', 'Archive/Notes.md'], ['Archive/Notes.md']));
    expect(under('Links to')).toEqual([['Notes', false], ['Notes', true]]);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('R5 note-links-one-way: one-way links and the empty cases read as today', () => {
    show(note(['Projects/Flat hunt/Flat 3.md'], ['About me.md']));
    expect(under('Links to')).toEqual([['Flat 3', false]]);
    expect(under('Linked from')).toEqual([['About me', false]]);
    expect(screen.queryByText(/Links both ways/)).toBeNull();
    cleanup();
    show(note([], []));
    expect(screen.getByText('No links yet.')).toBeInTheDocument();
    expect(screen.getByText('Nothing links here yet.')).toBeInTheDocument();
  });
});
