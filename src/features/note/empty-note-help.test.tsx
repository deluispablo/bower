import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Note, TreeNode } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import * as report from '@/ui/report';
import { NoteScreen } from './NoteScreen';

const PATH = 'Resources/Soup ideas.md';
const COPY = 'This note is empty. To write in it, open your Bower folder on your computer with Google Drive for desktop, then use any notes app.';
const empty: Note = {
  path: PATH, title: 'Soup ideas', summary: '', properties: [], tags: [],
  currentState: [], body: ' \n ', timeline: [], links: [], backlinks: [], byBower: false,
};
const node: TreeNode = { path: PATH, name: 'Soup ideas.md', type: 'file', kind: 'note', modified: 0, created: 0 };
const folder: TreeNode = { path: 'Resources', name: 'Resources', type: 'folder', modified: 0, created: 0, children: [node] };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function show(note: Note) {
  const base = loadingSources();
  const vault = new Proxy(base.vault, {
    get: (target, key, receiver) => {
      if (key === 'tree') return async () => [folder];
      if (key === 'note') return async () => note;
      if (key === 'changes') return async () => [];
      if (key === 'markSeen') return async () => undefined;
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  const sources: Sources = { ...base, vault };
  render(
    <MemoryRouter initialEntries={[`/note/${PATH}`]}>
      <DataProvider sources={sources}><NoteScreen /></DataProvider>
    </MemoryRouter>,
  );
  return vault;
}

it('an empty note says how to write in it and offers Open in Drive', async () => {
  const openDrive = vi.spyOn(report, 'openDrive').mockImplementation(() => undefined);
  const vault = show(empty);
  await screen.findByRole('heading', { name: 'Soup ideas', level: 1 });
  const help = screen.getByText(COPY, { exact: true });
  const button = screen.getByRole('button', { name: 'Open in Drive' });
  expect(help.parentElement).toContainElement(button);
  expect(button.querySelector('svg')).toBeInTheDocument();
  fireEvent.click(button);
  expect(openDrive).toHaveBeenCalledTimes(1);
  expect(openDrive.mock.calls[0]?.[0] === vault).toBe(true);
  expect(openDrive.mock.calls[0]?.[1]).toBe(PATH);
});

it.each([
  ['body', { body: 'My own words.' }],
  ['summary', { summary: 'Soup ideas to try.' }],
  ['Current state', { currentState: ['Try lentil soup.'] }],
  ['Timeline', { timeline: [{ date: '2026-10-10', text: 'Started collecting ideas.' }] }],
] satisfies [string, Partial<Note>][])(
  'omits empty-note help and its action when %s is present', async (_name, content) => {
    show({ ...empty, ...content });
    await screen.findByRole('heading', { name: 'Soup ideas', level: 1 });
    expect(screen.queryByText(COPY, { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open in Drive' })).not.toBeInTheDocument();
  },
);
