/**
 * ux-first-tidy-checklist: Home teaches the first tidy-up with three steps above an unchanged Inbox. Progress lives in
 * the folder (`firstTidy` / `markFirstTidy`); step 2 is marked when Confirm's start resolves and step 3 only when a done
 * report or replay actually opens. A failed mark says so and retries alone (rulings R2-R7). Made-up words only.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DemoWorld } from '@/data/demo/world';
import type { TimeScale } from '@/data/demo/scenario';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError } from '@/data/types';
import { FIRST_TIDY_SAVE_FAILED } from '@/data/contracts/first-tidy';
import { Replay } from '@/features/tidy/Replay';
import { TidySheet } from '@/features/tidy/TidySheet';
import { Home } from './Home';
import { useFirstTidyFailure } from './useFirstTidy';

const NAME = 'Your first tidy-up';
const worlds: DemoWorld[] = [];

afterEach(() => {
  cleanup();
  worlds.splice(0).forEach((w) => w.dispose());
  useUi.setState({ tidyOpen: false, tidyReportRunId: null, replayRunId: null });
  useFirstTidyFailure.setState({ failure: null });
  vi.restoreAllMocks();
});

type Scenario = 'empty' | 'default' | 'back' | 'running' | 'fail-run';
function world(scenario: Scenario, scale: TimeScale = 'instant'): Sources {
  const w = new DemoWorld({ scenario, scale, latency: 0 });
  worlds.push(w);
  return w.sources();
}

async function mount(sources: Sources): Promise<void> {
  await act(async () => {
    render(<MemoryRouter><DataProvider sources={sources}><Home /><TidySheet /><Replay /></DataProvider></MemoryRouter>);
  });
}

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const region = () => screen.findByRole('region', { name: NAME });
const items = (r: HTMLElement) => within(r).getAllByRole('listitem');
const doneItems = (r: HTMLElement) => items(r).flatMap((li, i) => (li.textContent?.includes('Done') ? [i + 1] : []));
const currentItem = (r: HTMLElement) => items(r).findIndex((li) => li.getAttribute('aria-current') === 'step') + 1;

describe('ux-first-tidy-checklist: the first tidy-up on Home', () => {
  it('AC1 three_steps_in_order: three steps with their sentences, in order', async () => {
    await mount(world('empty'));
    const r = await region();
    const list = within(r).getByRole('list');
    expect(list.tagName).toBe('OL');
    const li = within(list).getAllByRole('listitem');
    expect(li).toHaveLength(3);
    expect(li[0]).toHaveTextContent('Add a few things');
    expect(li[0]).toHaveTextContent('Photos, PDFs, links or notes, from your phone or computer.');
    expect(li[1]).toHaveTextContent('Press Tidy up');
    expect(li[1]).toHaveTextContent('Bower reads each one, names it and files it. About 5 minutes; you can close the app.');
    expect(li[2]).toHaveTextContent('See where it went');
    expect(li[2]).toHaveTextContent('Bower shows you everything it did, and asks if it is unsure.');
  });

  it.each([
    ['empty', 'instant', ['Add a pile'], [], 1],
    ['default', 'instant', ['Tidy up'], [1], 2],
    ['back', 'instant', ['See the report'], [1, 2], 3],
    ['running', 'demo', [], [1, 2], 3],
  ] as const)('AC1 one_button_for_the_current_step: %s', async (scenario, scale, buttons, done, current) => {
    await mount(world(scenario, scale));
    const r = await region();
    await waitFor(() => expect(currentItem(r)).toBe(current));
    const found = within(r).queryAllByRole('button');
    expect(found.map((b) => b.textContent)).toEqual(buttons);
    for (const b of found) expect(b.className).not.toMatch(/ghost/);
    expect(doneItems(r)).toEqual(done);
  });

  it('AC1 search_follows_the_checklist: the checklist comes before search and the Inbox', async () => {
    await mount(world('default'));
    const r = await region();
    const search = screen.getByRole('button', { name: /Search your notes and files/ });
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(r.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(r.compareDocumentPosition(inbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC1 inbox_stays (guard): the Inbox keeps its own Tidy up', async () => {
    await mount(world('default'));
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(await within(inbox).findByRole('button', { name: /^Tidy up \d+ things$/ })).toBeVisible();
  });

  it('AC1 hidden_when_unknown_or_done (a, guard): a vault without firstTidy shows no checklist and logs nothing', async () => {
    const errors = vi.spyOn(console, 'error');
    const src = world('empty');
    await mount({ ...src, vault: { ...src.vault, firstTidy: undefined } as unknown as Sources['vault'] });
    expect(await screen.findByText('Nothing waiting. Add something and it stays here until the next tidy-up.')).toBeVisible();
    await settle();
    expect(screen.queryByRole('region', { name: NAME })).toBeNull();
    expect(screen.getByRole('region', { name: 'Inbox' })).toBeVisible();
    expect(errors).not.toHaveBeenCalled();
  });

  it('AC1 hidden_when_unknown_or_done (b, guard): a failed read shows no checklist', async () => {
    const src = world('empty');
    await mount({ ...src, vault: { ...src.vault, firstTidy: () => Promise.reject(new BowerError('unknown', 'Drive did not answer.')) } });
    expect(await screen.findByText('Nothing waiting. Add something and it stays here until the next tidy-up.')).toBeVisible();
    await settle();
    expect(screen.queryByRole('region', { name: NAME })).toBeNull();
  });

  it('AC1 hidden_when_unknown_or_done (c): once reviewed, the checklist goes away', async () => {
    const src = world('back');
    await mount(src);
    await region();
    await act(async () => { await src.vault.markFirstTidy('reviewed'); });
    await waitFor(() => expect(screen.queryByRole('region', { name: NAME })).toBeNull());
  });

  it('AC3 report_without_replay_opens_the_sheet: a done, seen run with no replay opens its report and marks step 3', async () => {
    const src = world('back');
    const real = await src.runs.current();
    if (!real) throw new Error('the back world has a run');
    const seenRun = { ...real, seen: true, scope: 'instructions' as const };
    const mark = vi.spyOn(src.vault, 'markFirstTidy');
    await mount({ ...src, runs: { ...src.runs, current: async () => seenRun } });
    const r = await region();
    fireEvent.click(await within(r).findByRole('button', { name: 'See the report' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeVisible();
    await waitFor(() => expect(mark).toHaveBeenCalledWith('reviewed'));
  });

  it('AC4 failed_mark_is_visible_and_retryable: a failed mark says so, and Try again only marks again', async () => {
    const src = world('back');
    const mark = vi.spyOn(src.vault, 'markFirstTidy').mockRejectedValueOnce(new BowerError('unknown', FIRST_TIDY_SAVE_FAILED));
    const start = vi.spyOn(src.runs, 'start');
    const add = vi.spyOn(src.vault, 'addPile');
    await mount(src);
    const r = await region();
    fireEvent.click(await within(r).findByRole('button', { name: 'See the report' }));
    const alert = await within(r).findByRole('alert');
    expect(alert).toHaveTextContent(/^Your first tidy-up progress could not be saved\. Try again\.$/);
    await act(async () => { fireEvent.click(within(r).getByRole('button', { name: 'Try again' })); });
    expect(mark).toHaveBeenCalledTimes(2);
    expect(mark).toHaveBeenLastCalledWith('reviewed');
    expect(start).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('region', { name: NAME })).toBeNull());
  });

  it('AC4 failed_run_does_not_mark: a failed run started from Confirm never marks step 3', async () => {
    const src = world('fail-run');
    const mark = vi.spyOn(src.vault, 'markFirstTidy');
    await mount(src);
    const r = await region();
    fireEvent.click(await within(r).findByRole('button', { name: 'Tidy up' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /^Tidy up \d+ things$/ }));
    expect(await within(dialog).findByRole('button', { name: 'Close' })).toBeVisible();
    await settle();
    expect(mark).not.toHaveBeenCalledWith('reviewed');
    // The open sheet hides the page from the accessibility tree; the checklist is still there under it.
    const third = within(r).getAllByRole('listitem', { hidden: true })[2];
    expect(third).toHaveTextContent('See where it went');
    expect(third).not.toHaveTextContent('Done');
  });

  it('AC4 reopening_is_not_completing: a remount makes no mark', async () => {
    const src = world('back');
    const mark = vi.spyOn(src.vault, 'markFirstTidy');
    await mount(src);
    expect(await within(await region()).findByRole('button', { name: 'See the report' })).toBeVisible();
    cleanup();
    await mount(src);
    expect(await within(await region()).findByRole('button', { name: 'See the report' })).toBeVisible();
    expect(mark).not.toHaveBeenCalled();
  });
});
