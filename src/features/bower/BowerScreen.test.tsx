import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerScreen } from './BowerScreen';

afterEach(cleanup);

describe('a request that waits', () => {
  it('a request sent again after a wait goes as the same request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent: Array<[string, unknown]> = [];
    let full = true;
    const never = (): Promise<never> => new Promise(() => undefined);
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return () => () => undefined;
        if (k === 'rules' || k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
        if (k === 'addRequest') return async (text: string, intent?: unknown) => {
          sent.push([text, intent]);
          if (full) throw new BowerError('unknown', 'Your Google Drive is full. Bower kept this and will send it later.');
          return { id: 'R1', text, at: 0 };
        };
        return never;
      },
    });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
          <BowerScreen />
        </DataProvider>
      </MemoryRouter>,
    );
    const box = screen.getByRole('textbox', { name: 'Your request' });
    fireEvent.change(box, { target: { value: 'Put my id papers together' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(sent).toHaveLength(1));
    // The words stay in the composer (P4-37e minor); sent again, they are the same request, never a second one.
    await waitFor(() => expect(box).toHaveValue('Put my id papers together'));
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[0]?.[1]).toEqual(expect.any(String));
    expect(sent[1]?.[1]).toBe(sent[0]?.[1]);
    // Other words are another request.
    fireEvent.change(box, { target: { value: 'Compare the flats' } });
    full = false;
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2]?.[1]).not.toBe(sent[0]?.[1]);
    await waitFor(() => expect(box).toHaveValue(''));
  });
});

describe('removing a rule', () => {
  const setup = (removal: Promise<() => Promise<void>>) => {
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return () => () => undefined;
        if (k === 'rules') return async () => [{ id: 'r1', text: 'Keep receipts', since: 0 }];
        if (k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
        if (k === 'removeRule') return () => removal;
        return () => new Promise(() => undefined);
      },
    });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
          <main id="main" tabIndex={-1} />
          <BowerScreen />
        </DataProvider>
      </MemoryRouter>,
    );
  };

  it('puts the keyboard on the page when nothing else has it', async () => {
    setup(Promise.resolve(async () => undefined));
    const remove = await screen.findByRole('button', { name: /^Remove the rule/ });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('main')));
  });

  it('leaves the keyboard where the person moved while the removal waited', async () => {
    let done: (undo: () => Promise<void>) => void = () => undefined;
    setup(new Promise((r) => { done = r; }));
    const remove = await screen.findByRole('button', { name: /^Remove the rule/ });
    remove.focus();
    fireEvent.click(remove);
    const box = screen.getByRole('textbox', { name: 'Your request' });
    box.focus();
    await act(async () => { done(async () => undefined); });
    expect(document.activeElement).toBe(box);
  });
});

/**
 * rules-original-ui (spec docs/design/specs/2026-10-10-rules-original.md, TL-P4-53): the person's own rules text,
 * read-only, above the rules added in Bower. `prose` stands for the source's `rulesProse` read: a string, a pending
 * read (`'pending'`), a refusal (a BowerError), or no read at all (`'none'`, the demo).
 */
describe('rules-original-ui: the Bower screen', () => {
  const PROSE = 'Alex keeps paper letters for a year.\n\n## Rules\n\n- Bills go in Money, by month.\n- [ ] Check the post box on Fridays.';
  const FOOT = 'Bower follows these too. To change them, edit the note.';
  const rule = (id: string, text: string, pending = false) => ({ id, text, since: Date.UTC(2026, 9, 3), ...(pending ? { pending: true } : {}) });
  /** A read: its answer, never (`'pending'`), a refusal, or a function that decides at each call. */
  type Read<T> = T | 'pending' | BowerError | (() => Promise<T>);
  const answer = <T,>(r: Read<T>) => async (): Promise<T> => {
    if (typeof r === 'function') return (r as () => Promise<T>)();
    if (r === 'pending') return new Promise<T>(() => undefined);
    if (r instanceof BowerError) throw r;
    return r;
  };
  /** What the vault tells when something changed: each listener the screen's reads subscribed. */
  let listeners: Array<() => void> = [];
  /** Lets every read in flight finish: a macrotask after all the promise steps, no real wait. */
  const settle = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const deferred = <T,>() => {
    let resolve: (v: T) => void = () => undefined;
    let reject: (e: unknown) => void = () => undefined;
    const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
  };
  const setup = (prose: Read<string> | 'none', rules: Read<Array<ReturnType<typeof rule>>> = []) => {
    const sources = loadingSources();
    listeners = [];
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return (cb: () => void) => { listeners.push(cb); return () => undefined; };
        if (k === 'rules') return answer(rules);
        if (k === 'rulesProse') return prose === 'none' ? undefined : answer(prose);
        if (k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
        return () => new Promise(() => undefined);
      },
    });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
          <BowerScreen />
        </DataProvider>
      </MemoryRouter>,
    );
  };
  const before = (a: Node, b: Node): boolean => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  /** The region, or null today; a missing region is the assertion, never a query error. */
  const written = async (): Promise<HTMLElement | null> => {
    await settle();
    return screen.queryByRole('region', { name: 'Written in your rules note' });
  };

  it('AC2 rules-original-screen-prose: the prose, read-only, with its foot line and link, and no Added in Bower', async () => {
    setup(PROSE);
    const region = await written();
    expect(region, 'a region labelled "Written in your rules note"').not.toBeNull();
    if (!region) return;
    // Rendered by the note viewer's Markdown renderer: the paragraph, the heading and the list items.
    expect(within(region).getByText('Alex keeps paper letters for a year.')).toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(within(region).getByText('Bills go in Money, by month.')).toBeInTheDocument();
    // Read-only: a task box cannot be ticked, and there is no Remove or edit control.
    expect(within(region).getByRole('checkbox')).toBeDisabled();
    expect(within(region).queryAllByRole('button')).toEqual([]);
    expect(within(region).queryAllByRole('textbox')).toEqual([]);
    expect(screen.getByText(FOOT)).toBeInTheDocument();
    const open = screen.getByRole('link', { name: 'Open your rules note' });
    expect(open).toHaveAttribute('href', '/note/Rules.md');
    expect(before(region, open)).toBe(true);
    expect(screen.queryByText('Added in Bower')).toBeNull();
    // Unchanged around it: the heading, the intro line and the form.
    expect(screen.getByRole('heading', { name: 'Your rules' })).toBeInTheDocument();
    expect(screen.getByText('Bower follows these in every tidy-up. They are kept with your notes, in your Bower folder.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your request' })).toBeInTheDocument();
  });

  it('AC3 rules-original-screen-with-rules: the prose block, then Added in Bower with the cards and their Remove buttons', async () => {
    setup(PROSE, [rule('r1', 'Receipts go to Money, by month.'), rule('r2', 'Scans of letters go in Documents.')]);
    const region = await written();
    expect(region, 'a region labelled "Written in your rules note"').not.toBeNull();
    if (!region) return;
    const label = screen.getByText('Added in Bower');
    const removes = screen.getAllByRole('button', { name: /^Remove the rule: / });
    expect(removes).toHaveLength(2);
    expect(before(region, label)).toBe(true);
    for (const remove of removes) {
      expect(before(label, remove)).toBe(true);
      expect(region.contains(remove)).toBe(false);
    }
  });

  it('AC4 rules-original-screen-none: with no prose, or a source without the read, the section is exactly as today', async () => {
    for (const prose of ['', 'none'] as const) {
      setup(prose, [rule('r1', 'Receipts go to Money, by month.'), rule('r2', 'Scans of letters go in Documents.')]);
      expect(await screen.findAllByRole('button', { name: /^Remove the rule: / })).toHaveLength(2);
      expect(screen.queryByRole('region', { name: 'Written in your rules note' })).toBeNull();
      expect(screen.queryByText('Written in your rules note')).toBeNull();
      expect(screen.queryByText('Added in Bower')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Open your rules note' })).toBeNull();
      cleanup();
    }
  });

  it('AC5 rules-original-screen-pending: a pending rule shows under Added in Bower with today\'s pending note', async () => {
    setup(PROSE, [rule('p1', 'Keep invoices by month', true)]);
    const region = await written();
    expect(region, 'a region labelled "Written in your rules note"').not.toBeNull();
    if (!region) return;
    const label = screen.getByText('Added in Bower');
    const pending = screen.getByText('"Keep invoices by month"');
    expect(before(label, pending)).toBe(true);
    expect(screen.getByText('Waiting for the next tidy-up, where Bower words it clearly.')).toBeInTheDocument();
  });

  it('R7 rules-original-screen-one-alert: a failed prose read shows one sentence, and never a second when the rules failed too', async () => {
    setup(new BowerError('unknown', 'Bower could not read your rules note.'), [rule('r1', 'Receipts go to Money, by month.')]);
    await settle();
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Bower could not read your rules note.');
    cleanup();
    setup(new BowerError('unknown', 'Bower could not read your rules note.'), new BowerError('unknown', 'Your rules did not load.'));
    await settle();
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Your rules did not load.');
  });

  it('R7 rules-original-screen-recovery: one Try again retries both reads when both failed, and the section recovers', async () => {
    let proseCalls = 0;
    let ruleCalls = 0;
    setup(
      async () => {
        if (++proseCalls === 1) throw new BowerError('unknown', 'Bower could not read your rules note.');
        return PROSE;
      },
      async () => {
        if (++ruleCalls === 1) throw new BowerError('unknown', 'Your rules did not load.');
        return [rule('r1', 'Receipts go to Money, by month.')];
      },
    );
    await settle();
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    const retry = screen.queryAllByRole('button', { name: 'Try again' });
    expect(retry).toHaveLength(1);
    fireEvent.click(retry[0] as HTMLElement);
    await settle();
    expect([proseCalls, ruleCalls]).toEqual([2, 2]);
    expect(screen.queryAllByRole('alert')).toEqual([]);
    expect(screen.queryByRole('region', { name: 'Written in your rules note' })).not.toBeNull();
    expect(screen.queryByText('Added in Bower')).not.toBeNull();
  });

  it('R8 rules-original-screen-refresh: the prose shown stays while it is read again and after that failed; a later success replaces it', async () => {
    let step: 'first' | 'refresh' | 'again' = 'first';
    const refresh = deferred<string>();
    setup(
      async () => {
        if (step === 'first') return PROSE;
        if (step === 'refresh') return refresh.promise;
        return 'Alex now keeps letters for two years.';
      },
      [rule('r1', 'Receipts go to Money, by month.')],
    );
    await settle();
    expect(screen.queryByText('Alex keeps paper letters for a year.')).not.toBeNull();
    // The refresh is on its way: nothing flashes away.
    step = 'refresh';
    await act(async () => { listeners.forEach((l) => l()); });
    await settle();
    expect(screen.queryByText('Alex keeps paper letters for a year.')).not.toBeNull();
    expect(screen.queryByText('Added in Bower')).not.toBeNull();
    // It fails: the old prose stays, with the one sentence.
    refresh.reject(new BowerError('unknown', 'Bower could not read your rules note.'));
    await settle();
    expect(screen.queryByText('Alex keeps paper letters for a year.')).not.toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    // Try again: the new prose replaces it.
    step = 'again';
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.queryByText('Alex now keeps letters for two years.')).not.toBeNull();
    expect(screen.queryByText('Alex keeps paper letters for a year.')).toBeNull();
    expect(screen.queryAllByRole('alert')).toEqual([]);
  });

  it('R8 rules-original-screen-loading: while the prose read is on its way, the section shows as today with no labels', async () => {
    setup('pending', [rule('r1', 'Receipts go to Money, by month.')]);
    expect(await screen.findAllByRole('button', { name: /^Remove the rule: / })).toHaveLength(1);
    expect(screen.queryByText('Added in Bower')).toBeNull();
    expect(screen.queryByText('Written in your rules note')).toBeNull();
  });
});
