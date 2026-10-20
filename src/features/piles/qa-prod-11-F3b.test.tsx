/**
 * qa-prod-11-F3b: the saved message offers "Tidy up now" only on a run read that has answered and shows no stop not
 * seen yet. When the save lands before Add's run read answers (a fast save, a slow status read), the run is unknown, so
 * the message has no action and the Inbox launch stays the way to start; nothing waits for the read. Made-up words only.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { NewPile, Pile, RunState } from '@/data/types';
import { toast } from '@/ui/toast';
import { loadingSources } from '@/testing/loading-sources';
import { Add } from './Add';

vi.mock('@/ui/toast', () => ({ toast: vi.fn() }));
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); });

const stop: RunState = { id: 'r1', scope: 'all', phase: 'failed', requestedAt: 1000, phaseAt: 2000, seen: false };
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

/** Saves a words-only pile, its save landing before or after Add's run read answers `current`; the one message it shows. */
async function saved(current: RunState | null, order: 'save first' | 'read first') {
  sessionStorage.setItem('bower:add-draft', 'Saltmere quiz night on Friday');
  let answer: (r: RunState | null) => void = () => undefined;
  const read = new Promise<RunState | null>((ok) => { answer = ok; });
  const base = loadingSources();
  const addPile = async (input: NewPile): Promise<Pile> => ({ id: 'p1', text: input.text, createdAt: 1, items: [] });
  const sources = { ...base, vault: { ...base.vault, addPile, duplicates: async () => [] }, runs: { ...base.runs, current: () => read } };
  render(<MemoryRouter initialEntries={['/add']}><DataProvider sources={sources}><Add /></DataProvider></MemoryRouter>);
  await flush();
  if (order === 'read first') await act(async () => { answer(current); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Add .*to the inbox$/ })); });
  await flush();
  if (order === 'save first') await act(async () => { answer(current); });
  await flush();
  expect(vi.mocked(toast), 'setup: one message after the save').toHaveBeenCalledOnce();
  const [text, action] = vi.mocked(toast).mock.calls[0] ?? [];
  return { text, label: action?.label };
}

describe('qa-prod-11-F3b: the saved message offers Tidy up now only on a run it knows', () => {
  it('AC1 qa11b-known-run: the save lands first, the read says an unseen stop: no Tidy up now', async () => {
    const { text, label } = await saved(stop, 'save first');
    expect(text).toBe('Your note is in the inbox');
    expect(label, 'AC1: no Tidy up now beside the stop the read was bringing').toBeUndefined();
  });

  it('AC1 guard: the read has answered with no run before the save: the message offers Tidy up now', async () => {
    expect((await saved(null, 'read first')).label).toBe('Tidy up now');
  });
});
