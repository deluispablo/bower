/**
 * qa7-a11y-empty (qa-7 Claude F3, Codex F2): Home with nothing waiting still renders the Inbox's list with no items, so a
 * screen reader announces "list, 0 items" after "Nothing waiting" (the rule of qa6-a11y AC4: a list with no items is not
 * rendered). Made-up words only.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { DemoWorld } from '@/data/demo/world';
import { Home } from './Home';

afterEach(cleanup);

const emptyLists = (root: HTMLElement): string[] =>
  within(root).queryAllByRole('list').filter((l) => l.querySelectorAll('li').length === 0).map((l) => l.outerHTML.slice(0, 80));

function home(scenario: 'empty' | 'default'): void {
  const world = new DemoWorld({ scenario, scale: 'instant', latency: 0 });
  render(<MemoryRouter><DataProvider sources={world.sources()}><Home /></DataProvider></MemoryRouter>);
}

describe('qa7-a11y-empty: an empty Inbox holds no list', () => {
  it('AC1 qa7-a11y-empty-inbox: Home with nothing waiting says so and exposes no empty list', async () => {
    home('empty');
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    // Positive control: the Inbox has loaded and says nothing waits.
    expect(await within(inbox).findByText('Nothing waiting. Add something and it stays here until the next tidy-up.')).toBeVisible();
    expect(within(inbox).getByRole('button', { name: 'Add a pile' })).toBeVisible();
    expect(emptyLists(inbox)).toEqual([]);
  });

  it('AC1 qa7-a11y-empty-inbox-piles: an Inbox with piles keeps its list', async () => {
    home('default');
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    const list = await within(inbox).findByRole('list');
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});
