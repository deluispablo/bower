/**
 * design8-links-both-ways (designer, post-qa-7, P3-5), as grouped by ux-controls-polish AC4: the notes that link both
 * ways are listed once, in their own "Links both ways" group, with no mark on a row. When every note linking here is one
 * of them, Linked from says "Only the notes that link both ways." instead of "No other notes link here.", which reads as
 * if nothing links here. Made-up notes only.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { Note } from '@/data/types';
import { LinkedList } from './RightPanel';

afterEach(cleanup);

// ux-controls-polish AC4: two-way notes have their own group, so the sentence names them without a row mark.
const BOTH = 'Only the notes that link both ways.';
const note = (links: string[], backlinks: string[]): Note => ({
  path: 'Projects/Flat hunt/Flat hunt.md', title: 'Flat hunt', summary: '', properties: [], tags: [], currentState: [], body: '', timeline: [], links, backlinks, byBower: true,
});
const show = (n: Note): void => {
  render(<MemoryRouter><LinkedList note={n} /></MemoryRouter>);
};

describe('AC1 Linked from names the two-way notes', () => {
  it('AC1 design8-linked-from-both: when every note linking here links both ways, Linked from says only those link here', () => {
    show(note(['Projects/Flat hunt/Flat 3.md', 'Projects/Flat hunt/Flat 7.md'], ['Projects/Flat hunt/Flat 3.md', 'Projects/Flat hunt/Flat 7.md']));
    // Both rows are in the one two-way group, named once.
    expect(screen.getAllByText('Links both ways')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Links both ways' }).nextElementSibling?.querySelectorAll('a')).toHaveLength(2);
    expect(screen.queryByText('No other notes link here.')).toBeNull();
    // Under Links to and under Linked from.
    expect(screen.getAllByText(BOTH)).toHaveLength(2);
  });

  it('AC1 design8-linked-from-none: with nothing linking here it keeps "Nothing links here yet." (positive control)', () => {
    show(note(['Projects/Flat hunt/Flat 3.md'], []));
    expect(screen.getByText('Nothing links here yet.')).toBeInTheDocument();
    expect(screen.queryByText(BOTH)).toBeNull();
  });

  it('AC1 design8-linked-from-other: a note linking here one way is listed, and Linked from does not say only (positive control)', () => {
    show(note(['Projects/Flat hunt/Flat 7.md'], ['Projects/Flat hunt/Flat 7.md', 'About me.md']));
    expect(screen.getByRole('link', { name: /About me/ })).toBeInTheDocument();
    // Only under Links to, whose one link is the two-way one.
    expect(screen.getAllByText(BOTH)).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Links to' }).nextElementSibling).toHaveTextContent(BOTH);
  });
});
