import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Note, TreeNode } from '@/data/types';
import { parseNote } from '@/data/contracts/note-format';
import { timelineLine } from '@/data/contracts/timeline-line';
import { loadingSources } from '@/testing/loading-sources';
import { NoteScreen } from './NoteScreen';

// B9 (TL-P4-50 B9 Q6): a marked line reads as plain text in the existing Timeline: literal label, ordinary links, no badge.
const PATH = 'Projects/Garden visit/Visit.md';
const leaf = (name: string): TreeNode => ({ path: `Projects/Garden visit/${name}`, name, type: 'file', kind: name.endsWith('.md') ? 'note' : 'other', modified: 0, created: 0 });
const tree: TreeNode[] = [{ path: 'Projects', name: 'Projects', type: 'folder', modified: 0, created: 0, children: [
  { path: 'Projects/Garden visit', name: 'Garden visit', type: 'folder', modified: 0, created: 0,
    children: [leaf('Visit.md'), leaf('Visit booking.txt'), leaf('Garden notice.txt')] }] }];

async function shown(text: string) {
  const note: Note = { ...parseNote(PATH, `---\nby: bower\n---\n\n## Timeline\n${timelineLine({ date: '2026-10-07', text, source: 'Garden notice.txt' })}\n`), backlinks: [] };
  const vault = new Proxy({}, { get: (_t, k) => {
    if (k === 'subscribe') return () => () => undefined;
    if (k === 'tree') return async () => tree;
    if (k === 'note') return async () => note;
    if (k === 'changes') return async () => [];
    if (k === 'markSeen') return async () => undefined;
    return () => new Promise(() => undefined);
  } });
  const view = render(<MemoryRouter initialEntries={[`/note/${PATH}`]}>
    <DataProvider sources={{ ...loadingSources(), vault } as unknown as Sources}><NoteScreen /></DataProvider>
  </MemoryRouter>);
  const region = await screen.findByRole('region', { name: 'Timeline' });
  return { region, view };
}

it.each([
  ['Uncertain: The garden may close. (also from [[Visit booking.txt]])', 'Uncertain: The garden may close. (also from Visit booking.txt)'],
  ['The visit may be affected. (inferred) (also from [[Visit booking.txt]])', 'The visit may be affected. (inferred) (also from Visit booking.txt)'],
  ['Contradiction: Earlier terms give 1,450; later terms give 1,580. (also from [[Visit booking.txt]])', 'Contradiction: Earlier terms give 1,450; later terms give 1,580. (also from Visit booking.txt)'],
])('AC5 guard b9-marker-literal-display: %s', async (stored, visible) => {
  const { region, view } = await shown(stored);
  expect(region.textContent).toContain(visible);
  expect(within(region).getAllByRole('link').map((a) => a.textContent)).toEqual(['Visit booking.txt', 'Garden notice']);
  expect(region.querySelector('blockquote, button, input, sup, [title]')).toBeNull();
  view.unmount();
});
