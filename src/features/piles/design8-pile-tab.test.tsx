/**
 * design8-pile-tab: leaving the pile note for its own Save the note does not save on blur, so Tab lands on an enabled
 * Save and Enter saves once; leaving it for anything else still saves on blur. Made-up words only.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
const WORDS = 'Lease papers for Alex ZZ8';

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

describe('AC1 Tab from the pile note lands on Save the note', () => {
  it('AC1 design8-pile-tab: blur onto Save saves nothing, Save is focused and enabled, then Enter saves once', async () => {
    const user = userEvent.setup();
    const box = await open();
    const update = vi.spyOn(sources.vault, 'updatePile');
    await user.click(box);
    await user.type(box, ' ZZ8');
    await user.tab();
    const save = screen.getByRole('button', { name: 'Save the note' });
    expect(document.activeElement).toBe(save);
    expect(save).toBeEnabled();
    expect(update).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await vi.waitFor(async () => expect(await savedText()).toBe(WORDS));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Save the note|Saving/ })).toBeNull());
    expect(update).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(document.body);
    await waitFor(() => expect(document.activeElement).toBe(box), { timeout: 90 });
  });

  it('AC1 design8-pile-tab-elsewhere: blur onto another control still saves once, and the keyboard stays there', async () => {
    const user = userEvent.setup();
    const box = await open();
    const update = vi.spyOn(sources.vault, 'updatePile');
    await user.click(box);
    await user.type(box, ' ZZ8');
    const back = screen.getByRole('button', { name: 'Back' });
    act(() => back.focus());
    await vi.waitFor(async () => expect(await savedText()).toBe(WORDS));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Save the note|Saving/ })).toBeNull());
    expect(update).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(back);
  });
});

// Ledger item 4: a busy Save is aria-disabled, never disabled, so the keyboard on it never drops to the page (WAI-ARIA
// APG, "Focusability of disabled controls"); a press while busy is ignored.
describe('AC1 review gaps 4: the busy Save keeps the keyboard', () => {
  it('AC1 design8-pile-tab-slow: Enter on Save with a slow save, the keyboard stays on Save and a second Enter sends nothing', async () => {
    const user = userEvent.setup();
    const box = await open();
    let release = (): void => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const real = sources.vault.updatePile.bind(sources.vault);
    const update = vi.spyOn(sources.vault, 'updatePile').mockImplementationOnce((id, text, base) => gate.then(() => real(id, text, base)));
    await user.click(box);
    await user.type(box, ' ZZ8');
    await user.tab();
    await user.keyboard('{Enter}');
    const busy = await screen.findByRole('button', { name: 'Saving…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).not.toHaveAttribute('disabled');
    expect(document.activeElement).toBe(busy);
    await user.keyboard('{Enter}');
    expect(update).toHaveBeenCalledOnce();
    act(() => release());
    await vi.waitFor(async () => expect(await savedText()).toBe(WORDS));
    expect(update).toHaveBeenCalledOnce();
  });

  it('AC1 design8-pile-tab-failed: a failed save leaves the keyboard on Save, ready to press again', async () => {
    const user = userEvent.setup();
    const box = await open();
    let fail = (): void => undefined;
    const gate = new Promise<never>((_, no) => (fail = () => no(new BowerError('offline', 'You are offline.'))));
    const update = vi.spyOn(sources.vault, 'updatePile').mockImplementationOnce(() => gate);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await user.click(box);
    await user.type(box, ' ZZ8');
    await user.tab();
    const save = screen.getByRole('button', { name: 'Save the note' });
    await user.keyboard('{Enter}');
    // jsdom keeps focus on a disabled button where a browser drops it to the page: the attribute is the check.
    await screen.findByRole('button', { name: 'Saving…' });
    expect(save).not.toHaveAttribute('disabled');
    expect(document.activeElement).toBe(save);
    act(() => fail());
    await screen.findByRole('button', { name: 'Save the note' });
    expect(update).toHaveBeenCalledOnce();
    expect(save).not.toHaveAttribute('disabled');
    expect(save).not.toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(save);
  });
});
