/**
 * qa7-drafts (qa-7 Claude F5): words typed in a pile's note are saved only when the field loses focus, so a reload
 * before that loses them, while Tell Bower and Add keep their drafts for the tab (`ui/session-draft.ts`). The pile note
 * keeps its unsaved words the same way, with the words it started from, and sign-out forgets them. Made-up words only.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { forgetThisPerson } from '@/data/device';
import { DemoWorld } from '@/data/demo/world';
import type { Sources } from '@/data/sources';
import type { Pile } from '@/data/types';
import { PileScreen } from './PileScreen';

let world: DemoWorld;
let sources: Sources;
let pile: Pile;

beforeEach(async () => {
  sessionStorage.clear();
  world = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 });
  sources = world.sources();
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

describe('qa7-drafts: the pile note keeps unsaved words', () => {
  it('AC3 qa7-drafts-pile-kept: words typed and not yet saved are there again after the screen loads again', async () => {
    const box = await open();
    // Positive control: the note the pile was made with.
    expect(box).toHaveValue('Lease papers for Alex');
    fireEvent.change(box, { target: { value: 'Lease papers for Alex ZZ1' } });
    // The reload comes before the field loses focus, so nothing was saved.
    cleanup();
    expect((await sources.vault.piles()).find((p) => p.id === pile.id)?.text).toBe('Lease papers for Alex');
    expect(await open()).toHaveValue('Lease papers for Alex ZZ1');
    expect(screen.getByRole('button', { name: 'Save the note' })).toBeEnabled();
  });

  it('AC3 qa7-drafts-pile-forgotten: sign-out forgets the unsaved words', async () => {
    fireEvent.change(await open(), { target: { value: 'Lease papers for Alex ZZ1' } });
    cleanup();
    forgetThisPerson();
    expect(await open()).toHaveValue('Lease papers for Alex');
  });

  it('AC3 qa7-drafts-pile-saved-cleared: once saved, nothing comes back over the saved note', async () => {
    const box = await open();
    fireEvent.change(box, { target: { value: 'Lease papers for Alex ZZ1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the note' }));
    await vi.waitFor(async () => expect((await sources.vault.piles()).find((p) => p.id === pile.id)?.text).toBe('Lease papers for Alex ZZ1'));
    cleanup();
    expect(await open()).toHaveValue('Lease papers for Alex ZZ1');
    expect(screen.queryByRole('button', { name: 'Save the note' })).toBeNull();
  });
});
