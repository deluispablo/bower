/**
 * qa-prod-5-F3: every way to start a tidy-up says it is starting. One `useStartRun()` (start-run.ts) holds the busy
 * state with the Confirm sheet's ref guard (React's useTransition/isPending: the pending flag in a hook, the error with
 * the caller). While `start` is held each button reads "Starting…", is aria-disabled (focus kept) and a second press
 * calls nothing; a failed start restores the label and each caller keeps its own message (rulings R1-R3).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { ChangeEntry, Pile, Request, RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { useToasts } from '@/ui/toast';
import { Home } from '@/features/home/Home';
import { BowerScreen } from '@/features/bower/BowerScreen';
import { TidySheet } from './TidySheet';

const change: ChangeEntry = { id: 'c-1', at: 1, kind: 'move', what: 'Moved Lease draft to Areas / Home' } as ChangeEntry;
const request: Request = { id: 'r-1', text: 'Put my id papers together', at: 1 };
const pile: Pile = { id: 'p-1', text: '', createdAt: 1, items: [{ id: 'i-1', name: 'lease.pdf', kind: 'pdf', origin: 'From this device' }] };
const stopped: RunState = { id: 'run-1', scope: 'instructions', phase: 'failed', requestedAt: 1, phaseAt: 2, failure: 'It stopped.', seen: false };

afterEach(() => {
  cleanup();
  for (const t of useToasts.getState().list) useToasts.getState().dismiss(t.id);
  useUi.setState({ tidyOpen: false, tidyReportRunId: null });
  vi.restoreAllMocks();
});

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

/** A screen over sources whose `runs.start` waits until the test answers it. */
function mount(ui: ReactNode, doors: Record<string, unknown>, current: RunState | null = null) {
  const base = loadingSources();
  const answers: Array<{ ok: (r: RunState) => void; no: (e: unknown) => void }> = [];
  const start = vi.fn(() => new Promise<RunState>((ok, no) => answers.push({ ok, no })));
  const all: Record<string, unknown> = {
    subscribe: () => () => undefined, orphanSummary: async () => ({ count: 0, complete: true }), uploadNotice: async () => null,
    piles: async () => [], pilesListed: async () => [], questions: async () => [], changes: async () => [], suggestions: async () => [],
    rules: async () => [], requests: async () => [], failedChanges: async () => [], ...doors,
  };
  const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in all ? all[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
  const runs = { ...base.runs, start, current: async () => current, subscribe: () => () => undefined } as Sources['runs'];
  render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs }}>{ui}</DataProvider></MemoryRouter>);
  const last = () => answers[answers.length - 1] as (typeof answers)[number];
  return {
    start,
    fail: async (e: unknown) => { await act(async () => { last().no(e); }); await settle(); },
  };
}

const toasts = () => useToasts.getState().list.map((t) => t.text);

/** Pressed: "Starting…" and aria-disabled in the same act; a second press while held calls `start` no more. */
async function startsOnce(button: HTMLElement, start: ReturnType<typeof vi.fn>) {
  button.focus();
  fireEvent.click(button);
  expect(button).toHaveTextContent('Starting…');
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(button).toBeEnabled();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  await settle();
  expect(start).toHaveBeenCalledOnce();
  expect(button).toHaveTextContent('Starting…');
}

describe('qa-prod-5-F3: every way to start a tidy-up says it is starting', () => {
  it('AC1 request_run_start_shows_starting_at_once: "Let Bower read it now" on Home', async () => {
    const m = mount(<Home />, { changes: async () => [change] });
    const button = await screen.findByRole('button', { name: 'Let Bower read it now' });
    await startsOnce(button, m.start);
  });

  it('AC1 request_run_start_shows_starting_at_once: "Let Bower do it now" on Bower', async () => {
    const m = mount(<BowerScreen />, { requests: async () => [request] });
    const button = await screen.findByRole('button', { name: 'Let Bower do it now' });
    await startsOnce(button, m.start);
  });

  it('AC2 stopped_try_again_shows_starting: Home\'s Stopped "Try again"', async () => {
    const m = mount(<Home />, {}, stopped);
    const card = await screen.findByRole('alert');
    const button = within(card).getByRole('button', { name: 'Try again' });
    await startsOnce(button, m.start);
  });

  it('AC2 stopped_try_again_shows_starting: the sheet\'s "Try again"', async () => {
    useUi.setState({ tidyOpen: true, tidyReportRunId: null });
    const m = mount(<TidySheet />, {}, stopped);
    const sheet = await screen.findByRole('dialog');
    const button = await within(sheet).findByRole('button', { name: 'Try again' });
    await startsOnce(button, m.start);
  });

  it('AC3 failed_start_restores_the_button: "Let Bower read it now" with a plain Error, one toast and the label back', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const m = mount(<Home />, { changes: async () => [change] });
    const button = await screen.findByRole('button', { name: 'Let Bower read it now' });
    fireEvent.click(button);
    await m.fail(new Error('boom'));
    expect(toasts()).toEqual(['It did not start. Try again.']);
    expect(button).toHaveTextContent('Let Bower read it now');
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(quiet).toHaveBeenCalledOnce();
  });

  it('AC3 failed_start_restores_the_button: pressed twice while held, then a plain Error: one toast, one console.error', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const m = mount(<Home />, { changes: async () => [change] });
    const button = await screen.findByRole('button', { name: 'Let Bower read it now' });
    fireEvent.click(button);
    fireEvent.click(button);
    await m.fail(new Error('boom'));
    expect(m.start).toHaveBeenCalledOnce();
    expect(toasts()).toEqual(['It did not start. Try again.']);
    expect(quiet).toHaveBeenCalledOnce();
    expect(button).toHaveTextContent('Let Bower read it now');
  });

  it('AC3 failed_start_restores_the_button: Confirm keeps its inline alert and shows no toast (guard)', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useUi.setState({ tidyOpen: true, tidyReportRunId: null });
    const m = mount(<TidySheet />, { piles: async () => [pile] });
    const sheet = await screen.findByRole('dialog', { name: 'Tidy up 1 thing?' });
    const button = within(sheet).getByRole('button', { name: 'Tidy up 1 thing' });
    fireEvent.click(button);
    expect(button).toHaveTextContent('Starting…');
    fireEvent.click(button);
    await m.fail(new Error('boom'));
    expect(m.start).toHaveBeenCalledOnce();
    expect(within(sheet).getByRole('alert')).toHaveTextContent('The tidy-up did not start. Try again.');
    expect(within(sheet).getByRole('button', { name: 'Try again' })).not.toHaveAttribute('aria-disabled');
    expect(toasts()).toEqual([]);
    expect(quiet).toHaveBeenCalledOnce();
  });
});
