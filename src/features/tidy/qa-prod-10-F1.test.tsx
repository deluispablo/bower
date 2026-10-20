/**
 * qa-prod-10-F1: a request Bower answered is said as answered, not done, on the run sheet and in its list, whatever
 * the reply says (specs/qa-prod-10/plan.md, F1). Prior art: NN/g, system status messages say what happened; GOV.UK
 * confirmation pages say what has happened, in the person's words. The list takes the Ask screen's heading.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Request, RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { RunLinks } from './RunLinks';
import { runDetail } from './run-words';

afterEach(cleanup);

const R = 'Suggest a view of my offers sorted by start date.';
const REPLY = "I can't suggest this view yet: no note type declares a start date property.";
const done = (requests: string[]): RunState => ({
  id: 'r', scope: 'all', phase: 'done', requestedAt: 0, phaseAt: 1, finishedAt: 1, seen: false,
  report: { filed: [], created: [], updated: [], setAside: [], questions: [], requests },
});

describe('qa-prod-10-F1', () => {
  it('AC1 qa10-requests-answered-words: the sheet says the requests were answered, never done', () => {
    const two = runDetail(done(['a', 'b']));
    expect(two, 'AC1: two requests are answered').toContain('2 things you asked answered');
    expect(two).not.toMatch(/you asked done/);
    expect(runDetail(done([R])), 'AC1: one request, in its words').toBe(`"${R}" answered.`);
  });

  it('AC2 qa10-requests-list-label: the requests and Bower\'s replies are listed under "What you asked"', async () => {
    const base = loadingSources();
    const doors: Record<string, unknown> = { tree: async () => [], changes: async () => [], requests: async (): Promise<Request[]> => [{ id: 'r1', text: R, at: 10, done: REPLY }] };
    const vault = new Proxy(base.vault, { get: (t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(t, k)) }) as Sources['vault'];
    await act(async () => {
      render(<MemoryRouter><DataProvider sources={{ ...base, vault }}><RunLinks report={{ created: [], updated: [], requests: [R] }} /></DataProvider></MemoryRouter>);
    });
    const row = within(screen.getByRole('list', { name: 'What you asked' })).getByRole('listitem');
    expect(within(row).getByText(R)).toBeTruthy();
    expect(row.textContent).toContain(REPLY);
    expect(screen.queryByRole('list', { name: 'Done for you' })).toBeNull();
  });
});
