import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Note, TreeNode } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { NoteScreen } from './NoteScreen';

const PATH = 'Projects/Flat hunt/Flat hunt.md';
const node = { path: PATH, name: 'Flat hunt.md', type: 'file', kind: 'note', modified: 0, created: 0 } as TreeNode;
const hub = { path: 'Projects/Flat hunt', name: 'Flat hunt', type: 'folder', modified: 0, created: 0, children: [node] } as TreeNode;
const projects = { path: 'Projects', name: 'Projects', type: 'folder', modified: 0, created: 0, children: [hub] } as TreeNode;
const note: Note = {
  path: PATH, title: 'Flat hunt', summary: 'Flats we looked at.', properties: [], tags: [], currentState: [], body: 'Your own words about the flats.',
  timeline: [{ date: '2 Oct', text: 'Started the flat hunt.' }, { date: '2026-10-06', text: 'A fourth flat added.' }],
  links: [], backlinks: [], byBower: true,
};

// TL-P2-20 R3-7 m8 (review M5): the note screen shows a YYYY-MM-DD Timeline date as "6 Oct"; a free-form one as written.
describe('the note screen Timeline dates', () => {
  it('shows an ISO Timeline date as "6 Oct" and a free-form date as written', async () => {
    const base = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'subscribe') return () => () => undefined;
        if (k === 'tree') return async () => [projects];
        if (k === 'note') return async () => note;
        if (k === 'changes') return async () => [];
        if (k === 'markSeen') return async () => undefined;
        return () => new Promise(() => undefined);
      },
    });
    render(
      <MemoryRouter initialEntries={[`/note/${PATH}`]}>
        <DataProvider sources={{ ...base, vault } as unknown as Sources}>
          <NoteScreen />
        </DataProvider>
      </MemoryRouter>,
    );
    const timeline = await screen.findByRole('region', { name: 'Timeline' });
    const rows = within(timeline).getAllByRole('listitem');
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual(['2 Oct', '6 Oct']);
    expect(within(timeline).queryByText('2026-10-06')).toBeNull();
  });
});
