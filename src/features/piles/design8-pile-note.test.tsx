/**
 * design8-pile-note (designer, post-qa-7, demo on main f40585c0): P2-2, the pile note says "Saved with the pile." next
 * to "Save the note" while its words are not saved. P2-3, leaving the box for Save saves on blur, then Save goes away
 * and the keyboard falls to the page's body; pressing Save must not save the same words twice. Made-up words only.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { DemoWorld } from '@/data/demo/world';
import type { Sources } from '@/data/sources';
import { BowerError, type Pile } from '@/data/types';
import { PileScreen } from './PileScreen';

let sources: Sources;
let pile: Pile;
const WORDS = 'Lease papers for Alex ZZ1';

beforeEach(async () => {
  sessionStorage.clear();
  sources = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 }).sources();
  pile = await sources.vault.addPile({ text: 'Lease papers for Alex', items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob(['%PDF lease']) }] });
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

async function open(): Promise<HTMLElement> {
  render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={sources}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  return screen.findByRole('textbox', { name: 'What is this?' });
}
/** The next save waits until `release`; every save is counted by `update`. */
function hold(): { update: ReturnType<typeof vi.spyOn>; release: () => void } {
  let release = (): void => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const real = sources.vault.updatePile.bind(sources.vault);
  const update = vi.spyOn(sources.vault, 'updatePile').mockImplementationOnce((id, text, base) => gate.then(() => real(id, text, base)));
  return { update, release: () => release() };
}
const saveGone = (): Promise<void> => waitFor(() => expect(screen.queryByRole('button', { name: /Save the note|Saving/ })).toBeNull());
const savedText = async (): Promise<string | undefined> => (await sources.vault.piles()).find((p) => p.id === pile.id)?.text;

describe('AC1 the note says when its words are not saved', () => {
  it('AC1 design8-pile-note-unsaved: changed words say they are not saved yet, never saved with the pile', async () => {
    const box = await open();
    // Positive control: the saved note says so.
    expect(screen.getByText('Saved with the pile.')).toBeVisible();
    fireEvent.change(box, { target: { value: WORDS } });
    expect(screen.getByRole('button', { name: 'Save the note' })).toBeVisible();
    expect(screen.queryByText('Saved with the pile.')).toBeNull();
    expect(screen.getByText('Not saved yet.')).toBeVisible();
  });
});

describe('AC2 one save, and the keyboard stays in the note', () => {
  // The single save is a guard (it holds on main); the keyboard back in the box is the red.
  it('AC2 design8-pile-note-tab-enter: Tab to Save then Enter saves once, and the keyboard is back in the box', async () => {
    const user = userEvent.setup();
    const box = await open();
    const update = vi.spyOn(sources.vault, 'updatePile');
    await user.click(box);
    await user.clear(box);
    await user.type(box, WORDS);
    await user.tab();
    await user.keyboard('{Enter}');
    await vi.waitFor(async () => expect(await savedText()).toBe(WORDS));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Save the note|Saving/ })).toBeNull());
    expect(update).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(box), { timeout: 90 });
  });

  it('AC2 design8-pile-note-click: pressing Save saves once, and the keyboard is back in the box when Save goes', async () => {
    const user = userEvent.setup();
    const box = await open();
    const update = vi.spyOn(sources.vault, 'updatePile');
    await user.click(box);
    await user.type(box, ' ZZ2');
    await user.click(screen.getByRole('button', { name: 'Save the note' }));
    await vi.waitFor(async () => expect(await savedText()).toBe('Lease papers for Alex ZZ2'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Save the note|Saving/ })).toBeNull());
    expect(update).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(box), { timeout: 90 });
  });

  it('AC2 design8-pile-note-tab-away: leaving the box by Tab with nothing changed saves nothing (positive control)', async () => {
    const user = userEvent.setup();
    const box = await open();
    const update = vi.spyOn(sources.vault, 'updatePile');
    await user.click(box);
    await user.tab();
    expect(update).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe('AC1 review gaps: the foot follows the words on screen', () => {
  it('AC1 design8-pile-note-foot-empty: an empty note typed in says not saved yet', async () => {
    pile = await sources.vault.addPile({ text: '', items: [{ name: 'plan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob(['%PDF plan']) }] });
    const box = await open();
    expect(screen.getByText('No note yet.')).toBeVisible();
    fireEvent.change(box, { target: { value: WORDS } });
    expect(screen.queryByText('No note yet.')).toBeNull();
    expect(screen.getByText('Not saved yet.')).toBeVisible();
  });

  it('AC1 design8-pile-note-foot-revert: words put back as saved say saved with the pile', async () => {
    const box = await open();
    fireEvent.change(box, { target: { value: WORDS } });
    expect(screen.getByText('Not saved yet.')).toBeVisible();
    fireEvent.change(box, { target: { value: 'Lease papers for Alex' } });
    expect(screen.queryByText('Not saved yet.')).toBeNull();
    expect(screen.getByText('Saved with the pile.')).toBeVisible();
  });

  it('AC1 design8-pile-note-foot-cleared: a note cleared and saved empty says no note yet', async () => {
    const user = userEvent.setup();
    const box = await open();
    await user.click(box);
    await user.clear(box);
    expect(screen.getByText('Not saved yet.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save the note' }));
    await vi.waitFor(async () => expect(await savedText()).toBe(''));
    await saveGone();
    expect(screen.queryByText('Not saved yet.')).toBeNull();
    expect(screen.getByText('No note yet.')).toBeVisible();
  });

  it('AC1 design8-pile-note-foot-failed: a save that failed still says not saved yet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const box = await open();
    const update = vi.spyOn(sources.vault, 'updatePile').mockRejectedValueOnce(new BowerError('offline', 'You are offline.'));
    fireEvent.change(box, { target: { value: WORDS } });
    await user.click(screen.getByRole('button', { name: 'Save the note' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    await screen.findByRole('button', { name: 'Save the note' });
    expect(screen.getByText('Not saved yet.')).toBeVisible();
    expect(screen.queryByText('Saved with the pile.')).toBeNull();
  });
});

describe('AC2 review gaps: a slow save, one write, the keyboard moved only when Save goes', () => {
  it('AC2 design8-pile-note-slow-enter: Tab to Save then Enter twice while the save waits saves once, and the keyboard is back in the box', async () => {
    const user = userEvent.setup();
    const box = await open();
    const { update, release } = hold();
    await user.click(box);
    await user.type(box, ' ZZ3');
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    act(() => release());
    await vi.waitFor(async () => expect(await savedText()).toBe('Lease papers for Alex ZZ3'));
    await saveGone();
    expect(update).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(box), { timeout: 90 });
  });

  it('AC2 design8-pile-note-slow-again: leaving the box again while its save waits does not save the same words twice', async () => {
    const user = userEvent.setup();
    const box = await open();
    const { update, release } = hold();
    await user.click(box);
    await user.type(box, ' ZZ4');
    await user.tab();
    await user.click(box);
    await user.tab();
    act(() => release());
    await vi.waitFor(async () => expect(await savedText()).toBe('Lease papers for Alex ZZ4'));
    await saveGone();
    expect(update).toHaveBeenCalledOnce();
  });

  it('AC2 design8-pile-note-moved-on: a slow save ends while the keyboard is on another control, and it stays there', async () => {
    const user = userEvent.setup();
    const box = await open();
    const { release } = hold();
    await user.click(box);
    await user.type(box, ' ZZ5');
    const back = screen.getByRole('button', { name: 'Back' });
    act(() => back.focus());
    act(() => release());
    await vi.waitFor(async () => expect(await savedText()).toBe('Lease papers for Alex ZZ5'));
    await saveGone();
    expect(document.activeElement).toBe(back);
  });

  it('AC2 design8-pile-note-still-there: a save that ends while newer words keep Save on screen leaves the keyboard alone', async () => {
    const user = userEvent.setup();
    const box = await open();
    const { release } = hold();
    fireEvent.change(box, { target: { value: 'Lease papers for Alex ZZ6' } });
    const save = screen.getByRole('button', { name: 'Save the note' });
    await user.click(save);
    expect(document.activeElement).toBe(save);
    fireEvent.change(box, { target: { value: 'Lease papers for Alex ZZ6 and more' } });
    act(() => release());
    await vi.waitFor(async () => expect(await savedText()).toBe('Lease papers for Alex ZZ6'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save the note' })).toBe(save));
    expect(document.activeElement).toBe(save);
  });

  it('AC2 design8-pile-note-retry: after a failed save, Save with the same words saves them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const box = await open();
    const update = vi.spyOn(sources.vault, 'updatePile').mockRejectedValueOnce(new BowerError('offline', 'You are offline.'));
    fireEvent.change(box, { target: { value: WORDS } });
    await user.click(screen.getByRole('button', { name: 'Save the note' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    await user.click(await screen.findByRole('button', { name: 'Save the note' }));
    await vi.waitFor(async () => expect(await savedText()).toBe(WORDS));
    expect(update).toHaveBeenCalledTimes(2);
  });
});

describe('AC2 review gaps 7: the duplicate-save guard ends with its save', () => {
  it.each(['Save', 'leaving the box'] as const)('AC2 design8-pile-note-again-later: saved A to B, changed back to A elsewhere, B typed again, %s writes B', async (how) => {
    const A = 'Lease papers for Alex';
    const B = 'Lease papers for Alex ZZ7';
    const user = userEvent.setup();
    const box = await open();
    await user.click(box);
    await user.type(box, ' ZZ7');
    await user.click(screen.getByRole('button', { name: 'Save the note' }));
    await vi.waitFor(async () => expect(await savedText()).toBe(B));
    await saveGone();
    await act(async () => {
      await sources.vault.updatePile(pile.id, A, B);
    });
    await waitFor(() => expect(box).toHaveValue(A));
    const update = vi.spyOn(sources.vault, 'updatePile');
    await user.click(box);
    await user.type(box, ' ZZ7');
    if (how === 'Save') await user.click(screen.getByRole('button', { name: 'Save the note' }));
    else await user.tab();
    await vi.waitFor(async () => expect(await savedText()).toBe(B));
    expect(update).toHaveBeenCalledOnce();
  });
});
