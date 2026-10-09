import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunReport } from '@/data/types';
import { RunLinks } from './RunLinks';

afterEach(cleanup);

const PAIR = 'Not merged: the other note was already in the Bin.';
const STATE = 'Not written: Weeknight curry had moved or gone to the Bin before Bower got to it.';
const report: Pick<RunReport, 'created' | 'updated' | 'answered'> = {
  created: [{ path: 'Projects/Flat hunt/Viewing notes.md', what: 'Made from 1 thing' }],
  updated: [{ path: 'Projects/Flat hunt.md', what: 'Brought up to date' }],
  answered: [
    { questionId: 'q-pair-a.b', kind: 'pair', outcome: 'subject-gone', why: PAIR, note: 'Projects/Flat hunt/Flat 7, Cobble Row.md' },
    { questionId: 'q-state-c', kind: 'state', outcome: 'subject-gone', why: STATE },
  ],
};

describe('the run result labels each list of rows', () => {
  it('the answered rows have their own label and never sit under brought up to date', () => {
    render(<MemoryRouter><RunLinks report={report} /></MemoryRouter>);
    const answered = screen.getByRole('list', { name: 'Answers Bower could not act on' });
    expect(within(answered).getByText(PAIR)).toBeTruthy();
    expect(within(answered).getByText(STATE)).toBeTruthy();
    const updated = screen.getByRole('list', { name: 'Brought up to date' });
    expect(within(updated).queryByText(PAIR)).toBeNull();
    expect(within(updated).queryByText(STATE)).toBeNull();
    // One label component: the answered label is the same element, in the same style, as "New notes".
    const made = screen.getByText('New notes', { selector: '[id]' });
    const label = screen.getByText('Answers Bower could not act on', { selector: '[id]' });
    expect(label.tagName).toBe(made.tagName);
    expect(label.className).toBe(made.className);
    expect(answered.getAttribute('aria-labelledby')).toBe(label.id);
  });
});
