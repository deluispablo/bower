/**
 * qa5-panel-request-clamp (qa-5 Claude F5): in the desktop panel a "You asked" request is cut to two lines by the same
 * clamp the rules beside it use (design-rules-block AC5, `.panelRuleText`), its whole text kept in the page. The
 * measured two lines are the e2e `e2e/qa5-panel-request-clamp.spec.ts`; this red pins the one clamp.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Request } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerPanel } from './BowerPanel';

afterEach(cleanup);

const LONG = 'Alex would like every receipt from the flat move kept together with the lease papers, sorted by month, with the deposit letters first.';
const rule = { id: 'r1', text: 'Receipts go in Money.', since: Date.UTC(2026, 9, 3) };

async function show(requests: Request[]) {
  const never = (): Promise<never> => new Promise(() => undefined);
  const sources = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'requests') return async () => requests;
      if (k === 'rules') return async () => [rule];
      if (k === 'rulesProse') return async () => '';
      if (k === 'questions' || k === 'failedChanges') return async () => [];
      return never;
    },
  });
  render(
    <MemoryRouter initialEntries={['/bower']}>
      <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
        <BowerPanel />
      </DataProvider>
    </MemoryRouter>,
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** Vitest's CSS modules are not scoped (vite.config.ts): an element's class is the module's own name. */
const clamp = (el: Element | null): string => el?.className ?? '';

it('AC2 panel-request-same-clamp: a waiting request\'s text sits in the rules\' two-line clamp, whole', async () => {
  await show([{ id: 'q1', text: LONG, at: Date.UTC(2026, 9, 15) }, { id: 'q2', text: 'Done one', at: Date.UTC(2026, 9, 14), done: 'Filed it' }]);
  const section = screen.getByRole('heading', { name: 'You asked' }).closest('section');
  if (!section) throw new Error('no You asked section');
  // Positive control: the rule beside it is clamped by that class.
  expect(clamp(screen.getByText(rule.text, { exact: true }))).toContain('panelRuleText');
  const text = within(section).getByText(LONG, { exact: true });
  expect(clamp(text)).toContain('panelRuleText');
  expect(text.closest('li')?.textContent).toBe(`${LONG}Waits for the next tidy-up`);
  // A done request is not listed (unchanged).
  expect(within(section).queryByText('Done one')).toBeNull();
});
