/**
 * design8-pile-note (designer, post-qa-7, demo on main f40585c0): P2-2, the pile note says "Saved with the pile." next
 * to "Save the note" while its words are not saved. P2-3, leaving the box for Save saves on blur, then Save goes away
 * and the keyboard falls to the page's body; pressing Save must not save the same words twice. Made-up words only.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { DemoWorld } from '@/data/demo/world';
import type { Sources } from '@/data/sources';
import type { Pile } from '@/data/types';
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
