/**
 * prod1-recent-kinds: Recent on Home names each row's kind with the one shared word (`KIND_WORD`), so a note and a PDF
 * with the same title are two rows that differ by kind, and a saved link reads as its name with the word "Link".
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { FileKind, TreeNode } from '@/data/types';
import { Home } from '@/features/home/Home';
import { loadingSources } from '@/testing/loading-sources';

const file = (name: string, kind: FileKind, modified: number): TreeNode => ({
  path: `Areas/Car/${name}`, name, type: 'file', kind, modified, created: modified,
});
const tree: TreeNode[] = [{ path: 'Areas', name: 'Areas', type: 'folder', modified: 1, created: 1, children: [
  { path: 'Areas/Car', name: 'Car', type: 'folder', modified: 1, created: 1, children: [
    file('Car insurance.md', 'note', 4000), file('Car insurance.pdf', 'pdf', 3000),
    file('Dashboard.jpg', 'image', 2000), file('insurer.example - renewal.url', 'link', 1000),
  ] },
] }];

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, replayRunId: null }); });

async function recent(): Promise<HTMLElement> {
  const base = loadingSources();
  const doors: Record<string, unknown> = { piles: async () => [], pilesListed: async () => null, tree: async () => tree,
    changes: async () => [], questions: async () => [], suggestions: async () => [], uploadNotice: async () => null };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in doors ? doors[key] : Reflect.get(target, key) }) as Sources['vault'];
  const sources = { ...base, vault, runs: { ...base.runs, current: async () => null } };
  await act(async () => { render(<MemoryRouter><DataProvider sources={sources}><main id="main" tabIndex={-1}><Home /></main></DataProvider></MemoryRouter>); });
  const region = screen.getByRole('heading', { name: 'Recent', level: 2 }).closest('section');
  if (!region) throw new Error('Missing Recent');
  return region;
}

describe('prod1-recent-kinds', () => {
  it('AC1 same_title_note_and_pdf_have_distinct_accessible_rows', async () => {
    const r = await recent();
    const pair = within(r).getAllByRole('link', { name: /^Car insurance/ });
    expect(pair).toHaveLength(2);
    const words = pair.map((l) => ['Note', 'PDF'].filter((w) => within(l).queryByText(w, { exact: true })));
    expect(words.flat().sort()).toEqual(['Note', 'PDF']);
    expect(words.every((w) => w.length === 1)).toBe(true);
    expect(within(within(r).getByRole('link', { name: /^Dashboard/ })).getByText('Photo', { exact: true })).toBeVisible();
    for (const l of within(r).getAllByRole('link')) expect(l.textContent).not.toMatch(/\.(md|pdf|jpg)\b/);
  });

  it('AC2 saved_link_recent_row_uses_readable_identity', async () => {
    const r = await recent();
    expect(within(r).getAllByRole('link', { name: /^insurer\.example - renewal/ })).toHaveLength(1);
    const link = within(r).getByRole('link', { name: /^insurer\.example - renewal/ });
    expect(within(link).getByText('insurer.example - renewal', { exact: true })).toBeVisible();
    expect(within(link).getByText('Link', { exact: true })).toBeVisible();
    expect(link.textContent).not.toContain('.url');
    expect(link.hasAttribute('aria-label')).toBe(false);
    expect(link.getAttribute('href')).toBe('/note/Areas/Car/insurer.example%20-%20renewal.url');
  });
});
