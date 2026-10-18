/**
 * qa-live-claude-F9-answer: the run report shows what Bower said for each request, under "Done for you", with the
 * request's words and its done line, links opening their note (plan F3-F9, rulings 1-3, FA-R4 to FA-R8).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Request, TreeNode } from '@/data/types';
import { noteRoute } from '@/app/paths';
import { loadingSources } from '@/testing/loading-sources';
import { RunLinks } from './RunLinks';

afterEach(cleanup);

const LABEL = 'Done for you';
const Q = 'How much is the rent at Flat 3?';
const R = 'File the council tax letter under Money.';
const NOTE = 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md';
const DONE = 'Flat 3 is 1,550 a month, per [[Flat 3, 12 Larkspur Lane]].';
const tree: TreeNode[] = [
  { path: 'Projects', name: 'Projects', type: 'folder', modified: 1, created: 1, children: [
    { path: 'Projects/Flat hunt', name: 'Flat hunt', type: 'folder', modified: 1, created: 1, children: [
      { path: NOTE, name: 'Flat 3, 12 Larkspur Lane.md', type: 'file', kind: 'note', modified: 1, created: 1 },
    ] },
  ] },
] as TreeNode[];

type Report = Parameters<typeof RunLinks>[0]['report'];

async function show(report: Report, requests: () => Promise<Request[]>, onOpen?: () => void) {
  const base = loadingSources();
  const doors: Record<string, unknown> = { tree: async () => tree, changes: async () => [], requests };
  const vault = new Proxy(base.vault, { get: (t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(t, k)) }) as Sources['vault'];
  await act(async () => {
    render(<MemoryRouter><DataProvider sources={{ ...base, vault }}><RunLinks report={report} {...(onOpen ? { onOpen } : {})} /></DataProvider></MemoryRouter>);
  });
}

describe('qa-live-claude-F9-answer', () => {
  it('FA-1: a report with only requests lists the words and the answer under "Done for you"; its link opens the note and calls onOpen', async () => {
    const onOpen = vi.fn();
    await show({ created: [], updated: [], requests: [Q] } as Report, async () => [{ id: 'r1', text: Q, at: 10, done: DONE }], onOpen);
    const list = screen.getByRole('list', { name: LABEL });
    const row = within(list).getByRole('listitem');
    expect(within(row).getByText(Q)).toBeTruthy();
    expect(row.textContent).toContain('Flat 3 is 1,550 a month, per Flat 3, 12 Larkspur Lane.');
    const link = within(row).getByRole('link', { name: 'Flat 3, 12 Larkspur Lane' });
    expect(link.getAttribute('href')).toBe(noteRoute(NOTE));
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('FA-2: repeated words with an older done row and a newer waiting row show one row, the older done line', async () => {
    await show({ created: [], updated: [], requests: [Q, Q] } as Report, async () => [
      { id: 'r2', text: Q, at: 20 },
      { id: 'r1', text: Q, at: 10, done: DONE },
    ]);
    const list = screen.getByRole('list', { name: LABEL });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Flat 3 is 1,550 a month');
  });

  it('FA-3: words with no done row show no row; while requests load or when they fail no list shows; once loaded the done row appears', async () => {
    const report = { created: [], updated: [], requests: [R, Q] } as Report;
    await show(report, async () => [{ id: 'r', text: R, at: 10, done: 'Filed it in Money.' }, { id: 'q', text: Q, at: 11 }]);
    const list = screen.getByRole('list', { name: LABEL });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText(R)).toBeTruthy();
    expect(within(list).queryByText(Q)).toBeNull();
    cleanup();

    await show({ created: [], updated: [], requests: [Q] } as Report, async () => [{ id: 'q', text: Q, at: 11 }]);
    expect(screen.queryByRole('list', { name: LABEL })).toBeNull();
    cleanup();

    let release: (rs: Request[]) => void = () => undefined;
    await show(report, () => new Promise<Request[]>((ok) => { release = ok; }));
    expect(screen.queryByRole('list', { name: LABEL })).toBeNull();
    await act(async () => { release([{ id: 'r', text: R, at: 10, done: 'Filed it in Money.' }]); });
    expect(within(screen.getByRole('list', { name: LABEL })).getByText(R)).toBeTruthy();
    cleanup();

    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await show(report, async () => { throw new Error('requests.json unreadable'); });
    expect(screen.queryByRole('list', { name: LABEL })).toBeNull();
    err.mockRestore();
  });

  it('FA-4 (guard): requests: [] plus one other row renders without a DataProvider and shows no list', () => {
    render(<MemoryRouter><RunLinks report={{ created: [{ path: 'Projects/Flat hunt/Viewing notes.md', what: 'Made from 1 thing' }], updated: [], requests: [] } as Report} /></MemoryRouter>);
    expect(screen.getByRole('list', { name: 'New notes' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: LABEL })).toBeNull();
  });
});
