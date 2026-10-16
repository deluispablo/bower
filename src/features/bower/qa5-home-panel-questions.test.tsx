/**
 * qa5-home-panel-questions (qa-5 Codex F2; design d-v2-14, owner's OK 2026-10-09): on Home the desktop panel does not
 * repeat the questions Home already shows, nor link to the page already open. Anywhere else it still shows them with
 * "Answer on Home".
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError, type Question } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerPanel } from './BowerPanel';

afterEach(cleanup);

const AT = Date.UTC(2026, 9, 15);
const questions: Question[] = [
  { id: 'q-ask-paper', subject: 'paper', text: 'Where should these papers go?', yes: 'File them', no: 'Leave them', askedAt: AT },
  { id: 'q-ask-photo', subject: 'photo', text: 'Is this photo of the boiler for Alex?', yes: 'Yes', no: 'No', askedAt: AT },
];

async function show(path: string, read: () => Promise<Question[]> = async () => questions) {
  const never = (): Promise<never> => new Promise(() => undefined);
  const sources = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'questions') return read;
      if (k === 'rules' || k === 'requests' || k === 'failedChanges') return async () => [];
      if (k === 'rulesProse') return async () => '';
      return never;
    },
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
        <BowerPanel />
      </DataProvider>
    </MemoryRouter>,
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe('qa5-home-panel-questions: the panel stops repeating Home', () => {
  it('AC1 home-panel-no-questions: on Home the panel holds no question text, no count of them and no "Answer on Home"', async () => {
    await show('/');
    // Positive control: the panel rendered its other sections.
    expect(screen.getByRole('heading', { name: 'Now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tell Bower something' })).toBeInTheDocument();
    expect(screen.queryByText('Where should these papers go?')).toBeNull();
    expect(screen.queryByText('Is this photo of the boiler for Alex?')).toBeNull();
    expect(screen.queryByRole('heading', { name: /questions? for you/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Answer on Home' })).toBeNull();
  });

  it('AC1 home-panel-no-question-error: on Home a failed questions read is not shown twice (Home says it)', async () => {
    await show('/', async () => { throw new BowerError('offline', 'Your questions could not be read. Try again.'); });
    expect(screen.getByRole('heading', { name: 'Now' })).toBeInTheDocument();
    expect(screen.queryByText('Your questions could not be read. Try again.')).toBeNull();
  });

  it.each(['/note/Projects/Flat.md', '/bower', '/files/Areas'])('R3 elsewhere-panel-questions: on %s the questions stay, with "Answer on Home"', async (path) => {
    await show(path);
    expect(screen.getByRole('heading', { name: '2 questions for you' })).toBeInTheDocument();
    expect(screen.getByText('Where should these papers go?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Answer on Home' })).toHaveAttribute('href', '/');
  });
});
