/**
 * qa5-start-fail-focus (qa-5 Claude F2; WAI-ARIA APG modal dialog: focus stays inside the dialog): while a tidy-up is
 * starting, the sheet's button waits with aria-disabled, not disabled, so it keeps the keyboard (a disabled button
 * drops focus to the page behind the sheet). When the start fails, the same button, now "Try again", still has it and
 * the message is announced. The pattern is the pile page's (PileScreen: "Waiting, it keeps the focus").
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type Pile, type RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { TidySheet } from './TidySheet';

const AT = 1_800_000_000_000;
const piles: Pile[] = [{ id: 'p-1', text: '', createdAt: AT, items: [{ id: 'i-1', name: 'lease.pdf', kind: 'pdf', origin: 'From this device' }] }];
const FAILED = "Something went wrong on Bower's side. Try again later.";

async function settle(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

/** The confirm sheet over one waiting thing; `start` waits for the test to answer it. */
async function mount() {
  const base = loadingSources();
  let answer!: { fail: () => void; ok: (run: RunState) => void };
  const start = vi.fn(() => new Promise<RunState>((ok, no) => {
    answer = { fail: () => no(new BowerError('unknown', FAILED)), ok };
  }));
  const methods: Record<string, unknown> = { piles: async () => piles, subscribe: () => () => undefined };
  const vault = new Proxy(base.vault, { get: (t, k) => (typeof k === 'string' && k in methods ? methods[k] : Reflect.get(t, k)) });
  const sources: Sources = { ...base, vault, runs: { ...base.runs, start, current: async () => null, subscribe: () => () => undefined } };
  render(<MemoryRouter><DataProvider sources={sources}><TidySheet /></DataProvider></MemoryRouter>);
  await settle();
  const sheet = screen.getByRole('dialog');
  // Positive control: the confirm sheet with its one thing.
  expect(sheet).toHaveAccessibleName('Tidy up 1 thing?');
  return { sheet, start, fail: async () => { await act(async () => { answer.fail(); }); await settle(); } };
}

beforeEach(() => {
  vi.useFakeTimers();
  useUi.setState({ tidyOpen: true, tidyReportRunId: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useUi.setState({ tidyOpen: false });
});

describe('qa5-start-fail-focus: a failed start keeps the keyboard in the sheet', () => {
  it('AC1 start-waits-keeps-focus: while starting, the button keeps focus (aria-disabled, enabled) and a second press does nothing', async () => {
    const m = await mount();
    const button = within(m.sheet).getByRole('button', { name: 'Tidy up 1 thing' });
    button.focus();
    fireEvent.click(button);
    await settle();
    expect(button).toHaveTextContent('Starting…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(m.start).toHaveBeenCalledOnce();
  });

  it('R2 try-again-focus: when the start fails, "Try again" holds the keyboard and the message is announced (guard; jsdom keeps focus on a disabled button, so the red is the e2e)', async () => {
    const m = await mount();
    const button = within(m.sheet).getByRole('button', { name: 'Tidy up 1 thing' });
    button.focus();
    fireEvent.click(button);
    await settle();
    await m.fail();
    expect(within(m.sheet).getByRole('alert')).toHaveTextContent(FAILED);
    const again = within(m.sheet).getByRole('button', { name: 'Try again' });
    expect(again).not.toHaveAttribute('aria-disabled');
    expect(again).toHaveFocus();
    expect(m.sheet.contains(document.activeElement)).toBe(true);
    // Try again starts once more.
    fireEvent.click(again);
    expect(m.start).toHaveBeenCalledTimes(2);
    // A duplicate press while the retry is pending does nothing; the next failure restores the retry, with focus.
    await settle();
    fireEvent.click(again);
    expect(m.start).toHaveBeenCalledTimes(2);
    await m.fail();
    expect(within(m.sheet).getByRole('alert')).toHaveTextContent(FAILED);
    const third = within(m.sheet).getByRole('button', { name: 'Try again' });
    expect(third).not.toHaveAttribute('aria-disabled');
    expect(third).toHaveFocus();
    expect(m.start).toHaveBeenCalledTimes(2);
  });

  it('R3 same-act-double-press: two activations within one act start once', async () => {
    const m = await mount();
    const button = within(m.sheet).getByRole('button', { name: 'Tidy up 1 thing' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(m.start).toHaveBeenCalledOnce();
  });
});
