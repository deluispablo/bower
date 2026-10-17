/**
 * design8-links-both-ways (designer, post-qa-7, P3-5): on a note page, Links to marks two rows "Links both ways", then
 * Linked from says "No other notes link here.", which reads as if nothing links here. When every note linking here is
 * one of those, Linked from says so. Made-up notes only.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { Note } from '@/data/types';
import { LinkedList } from './RightPanel';

afterEach(cleanup);

const BOTH = "Only the notes marked both ways link here.";
const note = (links: string[], backlinks: string[]): Note => ({
  path: 'Projects/Flat hunt/Flat hunt.md', title: 'Flat hunt', summary: '', properties: [], tags: [], currentState: [], body: '', timeline: [], links, backlinks, byBower: true,
});
const show = (n: Note): void => {
  render(<MemoryRouter><LinkedList note={n} /></MemoryRouter>);
};

describe('AC1 Linked from names the two-way notes', () => {
  it('AC1 design8-linked-from-both: when every note linking here links both ways, Linked from says only those link here', () => {
    show(note(['Projects/Flat hunt/Flat 3.md', 'Projects/Flat hunt/Flat 7.md'], ['Projects/Flat hunt/Flat 3.md', 'Projects/Flat hunt/Flat 7.md']));
    // Positive control: both rows are marked under Links to.
    expect(screen.getAllByText('Links both ways')).toHaveLength(2);
    expect(screen.queryByText('No other notes link here.')).toBeNull();
    expect(screen.getByText(BOTH)).toBeInTheDocument();
  });

  it('AC1 design8-linked-from-none: with nothing linking here it keeps "Nothing links here yet." (positive control)', () => {
    show(note(['Projects/Flat hunt/Flat 3.md'], []));
    expect(screen.getByText('Nothing links here yet.')).toBeInTheDocument();
    expect(screen.queryByText(BOTH)).toBeNull();
  });

  it('AC1 design8-linked-from-other: a note linking here one way is listed, and the sentence is not shown (positive control)', () => {
    show(note(['Projects/Flat hunt/Flat 7.md'], ['Projects/Flat hunt/Flat 7.md', 'About me.md']));
    expect(screen.getByRole('link', { name: /About me/ })).toBeInTheDocument();
    expect(screen.queryByText(BOTH)).toBeNull();
  });
});
