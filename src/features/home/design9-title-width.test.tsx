/**
 * design9-title-width (tester, P3): at a window of about 1560-1600 px with both side panels, Home is just wide enough
 * for its two columns (design8-layout's container query, 760 px of Home), so Recent ("Just filed" after a tidy-up)
 * sits in the narrow side column and a note's title is cut with an ellipsis, most of all beside a "New" pill. A note's
 * title is its name: it wraps, it is never cut (WCAG 2.2 SC 1.4.10 Reflow: no loss of content at a narrow width).
 * The inbox's pile line (a pile's own words, one line by design) is not a note title and keeps its one line.
 * jsdom does not load a component's CSS import nor lay out: the test puts Home's own stylesheet in the document (as
 * `bird/sparkle-gate.test.tsx` does; class names are not scoped in Vitest) and reads each line's cascaded style.
 */
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Pile, TreeNode } from '@/data/types';
import { Home } from '@/features/home/Home';
import { loadingSources } from '@/testing/loading-sources';

const LONG = 'Flats on the shortlist, compared, with the commute and the rent side by side';
const note = (name: string, modified: number, isNew = false): TreeNode => ({
  path: `Projects/Flat hunt/${name}.md`, name: `${name}.md`, type: 'file', kind: 'note', modified, created: modified, byBower: true, ...(isNew ? { isNew } : {}),
});
const tree: TreeNode[] = [{ path: 'Projects', name: 'Projects', type: 'folder', modified: 1, created: 1, children: [
  { path: 'Projects/Flat hunt', name: 'Flat hunt', type: 'folder', modified: 1, created: 1, children: [note(LONG, 3000, true), note('Flat hunt', 2000)] },
] }];
const pile: Pile = { id: 'p', path: 'Inbox/Job offer', text: 'Job offer and a flat near it. Compare the commute before you say yes.', createdAt: 1000,
  items: [{ id: 'f', name: 'offer.pdf', kind: 'pdf', origin: 'From this computer' }] };

const sheet = document.createElement('style');
beforeAll(() => {
  sheet.textContent = readFileSync('src/features/home/home.module.css', 'utf8');
  document.head.append(sheet);
});
afterAll(() => sheet.remove());
afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, replayRunId: null }); });

async function home() {
  const base = loadingSources();
  const doors: Record<string, unknown> = { piles: async () => [pile], pilesListed: async () => null, tree: async () => tree,
    changes: async () => [], questions: async () => [], suggestions: async () => [], uploadNotice: async () => null };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in doors ? doors[key] : Reflect.get(target, key) }) as Sources['vault'];
  const sources = { ...base, vault, runs: { ...base.runs, current: async () => null } };
  await act(async () => { render(<MemoryRouter><DataProvider sources={sources}><main id="main" tabIndex={-1}><Home /></main></DataProvider></MemoryRouter>); });
}

/** A line held on one line is cut at the column's edge (its ellipsis or overflow follow from that). */
const cut = (el: Element): boolean => getComputedStyle(el).whiteSpace === 'nowrap';

describe('AC1 a note title on Home is never cut', () => {
  it('AC1 design9-title-width-recent: a Recent title, beside a New pill, wraps instead of being cut', async () => {
    await home();
    const recent = screen.getByRole('heading', { name: 'Recent', level: 2 }).closest('section');
    if (!recent) throw new Error('Missing Recent');
    const title = within(recent).getByText(LONG, { exact: true });
    expect(within(recent).getByText('New', { exact: true })).toBeVisible();
    expect(cut(title)).toBe(false);
    expect(cut(within(recent).getByText('Flat hunt', { exact: true }))).toBe(false);
  });

  it('AC1 design9-title-width-pile-control: the inbox pile line keeps its one line (control)', async () => {
    await home();
    const line = screen.getByText(pile.text, { exact: true });
    expect(cut(line)).toBe(true);
  });
});
