/**
 * prod1-adoption-targets (R4, R6 test 8): the panel shows a question's note links as names, never as link marks.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Question } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerPanel } from './BowerPanel';

afterEach(cleanup);

const AT = Date.UTC(2026, 9, 15);
const questions: Question[] = [
  { id: 'q-adopt-states', text: 'Bower found summaries it did not write, for example in [[Archive/Flat hunt]] and [[Flat hunt]]. May it keep every summary it did not write up to date?', yes: 'Keep them up to date', no: 'Leave them', askedAt: AT },
];

/** Copied from qa5-home-panel-questions.test.tsx. */
async function show(path: string): Promise<void> {
  const never = (): Promise<never> => new Promise(() => undefined);
  const sources = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'questions') return async () => questions;
      if (k === 'rules' || k === 'requests' || k === 'failedChanges') return async () => [];
      if (k === 'rulesProse') return async () => '';
      return never;
    },
  });
  const router = createMemoryRouter([{
    path: '*',
    element: (
      <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
        <BowerPanel />
      </DataProvider>
    ),
  }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe('prod1-adoption-targets: the panel question', () => {
  it('panel_question_shows_note_names_not_link_marks', async () => {
    await show('/notes/x');
    expect(screen.getByRole('heading', { name: 'Now' })).toBeInTheDocument();
    const p = screen.getByText(/for example in/);
    expect(p.textContent).toContain('Flat hunt');
    expect(p.textContent).not.toContain('[[');
    expect(p.textContent).not.toContain(']]');
  });
});
