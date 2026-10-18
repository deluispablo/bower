import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerPanel } from './BowerPanel';
import { RightPanel } from '@/features/note/RightPanel';
import { useUi } from '@/app/ui-store';

describe('the side panel while loading', () => {
  it('names the rules without claiming there are none', async () => {
    render(
      <MemoryRouter>
        <DataProvider sources={loadingSources()}>
          <BowerPanel />
        </DataProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.queryByText(/^0 rules$/)).toBeNull();
    expect(screen.queryByText(/^Resting/)).toBeNull();
  });
});

describe('the side panel shows what failed', () => {
  it('the side panel shows a change Bower could not note until it is put away', async () => {
    const off = (): (() => void) => () => undefined;
    const never = (): Promise<never> => new Promise(() => undefined);
    const listeners = new Set<() => void>();
    let failed = [{ id: 'L1', what: 'New rule: "receipts go in money"', sentence: "Bower couldn't keep that rule." }];
    const putAway = vi.fn(async (id: string) => {
      failed = failed.filter((f) => f.id !== id);
      listeners.forEach((l) => l());
    });
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
        if (k === 'failedChanges') return async () => failed;
        if (k === 'putAwayFailed') return putAway;
        if (k === 'rules' || k === 'requests' || k === 'questions') return async () => [];
        return never;
      },
    });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: off } }}>
          <BowerPanel />
        </DataProvider>
      </MemoryRouter>,
    );
    // expected: a missing card is the assertion below, not a query error.
    expect(await screen.findAllByText("Bower couldn't keep that rule.").catch(() => [])).toHaveLength(1);
    expect(screen.getByText('New rule: "receipts go in money"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Put it away' }));
    await waitFor(() => expect(screen.queryByText("Bower couldn't keep that rule.")).toBeNull());
    expect(putAway).toHaveBeenCalledWith('L1');
  });
});

describe('what failed is found once on a note', () => {
  it('the right panel turns to Bower once when a change could not be noted', async () => {
    const never = (): Promise<never> => new Promise(() => undefined);
    const listeners = new Set<() => void>();
    let failed: Array<{ id: string; what: string; sentence: string }> = [];
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
        if (k === 'failedChanges') return async () => failed;
        if (k === 'rules' || k === 'requests' || k === 'questions') return async () => [];
        return never;
      },
    });
    useUi.getState().setRightTab('links');
    render(
      <MemoryRouter initialEntries={['/note/Projects/Flat.md']}>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
          <RightPanel />
        </DataProvider>
      </MemoryRouter>,
    );
    // On a note the panel opens on its links; nothing has failed yet.
    expect(screen.getByRole('tab', { name: 'Linked notes' })).toHaveAttribute('aria-selected', 'true');
    // A line is refused in the background: the panel turns to Bower, where it shows.
    failed = [{ id: 'L1', what: 'Moved Cooking to Archive', sentence: "Your change was made, but Bower couldn't make a note of it." }];
    listeners.forEach((l) => l());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByText("Your change was made, but Bower couldn't make a note of it.")).toBeInTheDocument();
    // Once: the person goes back to the links, and the panel stays there.
    fireEvent.click(screen.getByRole('tab', { name: 'Linked notes' }));
    listeners.forEach((l) => l());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('tab', { name: 'Linked notes' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('what failed is found once, and focus stays with the person', () => {
  beforeEach(cleanup);
  afterEach(cleanup);
  const note = { path: 'Projects/Flat.md', title: 'Flat', summary: '', properties: [], tags: [], currentState: [], body: '# Rent\n\nSee [[Money]].', timeline: [], links: ['Areas/Money.md'], backlinks: [], byBower: false };
  const panel = (failed: () => Array<{ id: string; what: string; sentence: string; seen?: true }>, seen: (id: string) => void) => {
    const never = (): Promise<never> => new Promise(() => undefined);
    const listeners = new Set<() => void>();
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
        if (k === 'failedChanges') return async () => failed();
        if (k === 'markFailedSeen') return async (id: string) => { seen(id); listeners.forEach((l) => l()); };
        if (k === 'note') return async () => note;
        if (k === 'rules' || k === 'requests' || k === 'questions') return async () => [];
        return never;
      },
    });
    useUi.getState().setRightTab('links');
    render(
      <MemoryRouter initialEntries={['/note/Projects/Flat.md']}>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
          <RightPanel />
        </DataProvider>
      </MemoryRouter>,
    );
    return { changed: () => listeners.forEach((l) => l()) };
  };

  it('the right panel turns to Bower once per failure and marks it seen, so a reload does not turn it again', async () => {
    let failed: Array<{ id: string; what: string; sentence: string; seen?: true }> = [];
    const seen: string[] = [];
    const { changed } = panel(() => failed, (id) => {
      seen.push(id);
      failed = failed.map((f) => (f.id === id ? { ...f, seen: true } : f));
    });
    failed = [{ id: 'L2', what: 'Moved Cooking to Archive', sentence: "Your change was made, but Bower couldn't make a note of it." }];
    changed();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true'));
    // Turned once, then marked seen where what failed is kept, so the next page load knows.
    await waitFor(() => expect(seen).toEqual(['L2']));
    // A failure already turned to on an earlier load (seen) does not turn the panel again.
    fireEvent.click(screen.getByRole('tab', { name: 'Linked notes' }));
    failed = [...failed, { id: 'L3', what: 'Renamed Soup', sentence: "Your change was made, but Bower couldn't make a note of it.", seen: true }];
    changed();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('tab', { name: 'Linked notes' })).toHaveAttribute('aria-selected', 'true');
    expect(seen).toEqual(['L2']);
  });

  it('a turn to Bower moves focus from the panel that closes to the Bower tab, never to the page', async () => {
    let failed: Array<{ id: string; what: string; sentence: string; seen?: true }> = [];
    const { changed } = panel(() => failed, () => undefined);
    // The person is on a link in the links panel when a line fails in the background.
    const link = (await screen.findAllByRole('link', { name: /Money/ })).at(-1) as HTMLElement;
    link.focus();
    expect(document.activeElement).toBe(link);
    failed = [{ id: 'L4', what: 'Moved Taxes to Money', sentence: "Your change was made, but Bower couldn't make a note of it." }];
    changed();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Activity' })));
    expect(document.activeElement).not.toBe(document.body);
  });
});

/**
 * rules-original-ui (spec docs/design/specs/2026-10-10-rules-original.md, TL-P4-53): the panel's rules summary never
 * claims a number while the person's own rules text is there, and opens the rules note first.
 */
describe('rules-original-ui: the panel\'s rules summary', () => {
  afterEach(cleanup);
  const rules = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, text: `Rule number ${i + 1} for Alex.`, since: Date.UTC(2026, 9, 3) }));
  /** Lets every read in flight finish: a macrotask after all the promise steps, no real wait. */
  const settle = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  /** What the vault tells when something changed: each listener the panel's reads subscribed. */
  let listeners: Array<() => void> = [];
  const setup = (prose: string | 'pending' | Error | (() => Promise<string>), list: ReturnType<typeof rules> | (() => Promise<ReturnType<typeof rules>>)) => {
    const never = (): Promise<never> => new Promise(() => undefined);
    const sources = loadingSources();
    listeners = [];
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return (cb: () => void) => { listeners.push(cb); return () => undefined; };
        if (k === 'rules') return async () => (typeof list === 'function' ? list() : list);
        if (k === 'rulesProse') return async () => {
          if (typeof prose === 'function') return prose();
          if (prose === 'pending') return never();
          if (prose instanceof Error) throw prose;
          return prose;
        };
        if (k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
        return never;
      },
    });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
          <BowerPanel />
        </DataProvider>
      </MemoryRouter>,
    );
  };
  /** The rules list: the one after the rules heading. */
  const rulesList = (): HTMLElement => {
    const list = screen.getByText('Rule number 1 for Alex.').closest('ul');
    if (!list) throw new Error('no rules list');
    return list;
  };

  it('AC6 rules-original-panel-prose: "Rules" with no number, up to 4 rules, and the rules note as a link row (design-rules-block AC6)', async () => {
    setup('Alex keeps paper letters for a year.', rules(5));
    await settle();
    const link = screen.queryByRole('link', { name: 'Your rules note' });
    expect(link, 'a link "Your rules note"').not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^\d+ rules?$/ })).toBeNull();
    const items = within(rulesList()).getAllByRole('listitem');
    expect(link?.getAttribute('href')).toBe('/note/Rules.md');
    expect(items.map((i) => i.textContent)).toEqual(rules(4).map((r) => r.text));
  });

  it('AC6 design-rules-panel-link-row: the rules note is a link row after the rules, never a bullet, and not muted', async () => {
    setup('Alex keeps paper letters for a year.', rules(2));
    await settle();
    const link = screen.queryByRole('link', { name: 'Your rules note' });
    expect(link, 'a link "Your rules note"').not.toBeNull();
    if (!link) return;
    expect(link.closest('li'), 'not inside a list item').toBeNull();
    expect(link.closest('ul'), 'not inside the rules list').toBeNull();
    expect(link).not.toHaveClass('muted');
    // In the rules section, after its list.
    const section = screen.getByRole('heading', { name: 'Rules' }).closest('section');
    expect(section?.contains(link)).toBe(true);
    expect(!!(rulesList().compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('AC6 rules-original-panel-prose-no-rules: with the prose and no rules added, "Rules" and the link, never "0 rules"', async () => {
    setup('Alex keeps paper letters for a year.', []);
    await settle();
    expect(screen.queryByRole('link', { name: 'Your rules note' }), 'a link "Your rules note"').not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.queryByText(/^0 rules$/)).toBeNull();
  });

  it('AC7 rules-original-panel-none: without prose, today\'s count and list', async () => {
    setup('', rules(2));
    expect(await screen.findByRole('heading', { name: '2 rules' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Your rules note' })).toBeNull();
    expect(within(rulesList()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('R8 rules-original-panel-unknown: while the prose read is on its way, or after it failed, no number is claimed', async () => {
    setup('pending', rules(2));
    await settle();
    expect(screen.queryByText('Rule number 1 for Alex.')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: '2 rules' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    cleanup();
    setup(new BowerError('unknown', 'Bower could not read your rules note.'), rules(2));
    await settle();
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Bower could not read your rules note.');
    expect(screen.queryByRole('heading', { name: '2 rules' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
  });

  it('R7 rules-original-panel-recovery: one Try again retries both reads when both failed, and the panel recovers', async () => {
    let proseCalls = 0;
    let ruleCalls = 0;
    setup(
      async () => {
        if (++proseCalls === 1) throw new BowerError('unknown', 'Bower could not read your rules note.');
        return 'Alex keeps paper letters for a year.';
      },
      async () => {
        if (++ruleCalls === 1) throw new BowerError('unknown', 'Your rules did not load.');
        return rules(2);
      },
    );
    await settle();
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Your rules did not load.');
    const retry = screen.queryAllByRole('button', { name: 'Try again' });
    expect(retry).toHaveLength(1);
    fireEvent.click(retry[0] as HTMLElement);
    await settle();
    expect([proseCalls, ruleCalls]).toEqual([2, 2]);
    expect(screen.queryAllByRole('alert')).toEqual([]);
    expect(screen.queryByRole('link', { name: 'Your rules note' })).not.toBeNull();
    expect(within(rulesList()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('R8 rules-original-panel-refresh: the heading and prose stay while the prose is read again and after that failed; a later success replaces them', async () => {
    let step: 'first' | 'refresh' | 'again' = 'first';
    let fail: (e: unknown) => void = () => undefined;
    setup(
      async () => {
        if (step === 'first') return 'Alex keeps paper letters for a year.';
        if (step === 'refresh') return new Promise<string>((_, reject) => { fail = reject; });
        return '';
      },
      rules(2),
    );
    await settle();
    expect(screen.queryByRole('link', { name: 'Your rules note' })).not.toBeNull();
    step = 'refresh';
    await act(async () => { listeners.forEach((l) => l()); });
    await settle();
    expect(screen.queryByRole('link', { name: 'Your rules note' })).not.toBeNull();
    expect(screen.queryByRole('heading', { name: '2 rules' })).toBeNull();
    fail(new BowerError('unknown', 'Bower could not read your rules note.'));
    await settle();
    // The old prose, so the same heading, with the one sentence.
    expect(screen.queryByRole('link', { name: 'Your rules note' })).not.toBeNull();
    expect(screen.queryByRole('heading', { name: '2 rules' })).toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    step = 'again';
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    // The new answer (no prose now) replaces it: today's count and list.
    expect(screen.queryByRole('heading', { name: '2 rules' })).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Your rules note' })).toBeNull();
    expect(screen.queryAllByRole('alert')).toEqual([]);
  });
});
