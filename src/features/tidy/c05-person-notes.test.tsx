import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { RunReport } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { RunLinks } from './RunLinks';
import { notesUpdated } from './run-words';

afterEach(cleanup);

it('C05 person notes: result links row 5, leaves row 7 unlinked and counts neither as updated', () => {
  const missing = "Bower didn't add the line: this note has no Timeline.";
  const tooMany = "Bower didn't update any note: this request names more than three. Ask for three at most at a time.";
  const report: RunReport & { leftAsWritten: Array<{ name: string; why: string; fileId?: string }> } = {
    filed: [], created: [{ path: 'Areas/Home/Control.md', what: 'Made from 1 thing' }], updated: [], setAside: [], questions: [],
    leftAsWritten: [{ name: 'Areas/Home/Garden plot.md', why: missing, fileId: 'garden-note' }, { name: 'Request', why: tooMany }],
  };
  render(<MemoryRouter><DataProvider sources={loadingSources()}><RunLinks report={report} /></DataProvider></MemoryRouter>);
  // Existing list and routing are the positive control; the new collection uses the same visible list component.
  expect(within(screen.getByRole('list', { name: 'New notes' })).getByRole('link', { name: 'Control' }))
    .toHaveAttribute('href', '/note/Areas/Home/Control.md');
  const left = screen.getByRole('list', { name: 'Left as you wrote them' });
  const rows = within(left).getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  const missingRow = rows[0]; const overflowRow = rows[1];
  expect(missingRow).toBeDefined(); expect(overflowRow).toBeDefined();
  if (!missingRow || !overflowRow) return;
  expect(within(missingRow).getByRole('link', { name: 'Garden plot' }))
    .toHaveAttribute('href', '/note/Areas/Home/Garden%20plot.md');
  expect(within(missingRow).getByText(missing, { exact: true })).toBeVisible();
  expect(within(overflowRow).queryByRole('link')).toBeNull();
  expect(within(overflowRow).getByText(tooMany, { exact: true })).toBeVisible();
  expect(screen.queryByRole('list', { name: 'Brought up to date' })).toBeNull();
  expect(notesUpdated(report)).toBe(0);
});
