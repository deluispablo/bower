import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { TreeNode } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { NoteScreen } from './NoteScreen';

const link: TreeNode = { path: 'Inbox/flat-listing.example.url', name: 'flat-listing.example.url', type: 'file', kind: 'link', modified: 0, created: 0 } as TreeNode;
const inbox: TreeNode = { path: 'Inbox', name: 'Inbox', type: 'folder', modified: 0, created: 0, children: [link] } as TreeNode;

describe('a saved link page', () => {
  it('a link that cannot be read says so, and still offers Drive', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'subscribe') return () => () => undefined;
        if (k === 'tree') return async () => [inbox];
        if (k === 'changes') return async () => [];
        if (k === 'linkAddress') return async () => Promise.reject(new TypeError('Failed to fetch'));
        return () => new Promise(() => undefined);
      },
    });
    render(
      <MemoryRouter initialEntries={['/note/Inbox/flat-listing.example.url']}>
        <DataProvider sources={{ ...base, vault } as unknown as Sources}>
          <NoteScreen />
        </DataProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/could not read this link's web address/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open in Drive/ })).toBeInTheDocument();
  });
});
