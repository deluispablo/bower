/**
 * qa-prod-11-F3: the message after a pile is added offers "Tidy up now" only while a tidy-up can start from it. Beside a
 * stop not seen yet the tidy-up sheet shows that stop (TidySheet showRun), so the message says where the pile went and
 * offers nothing, and the stopped card's Try again stays the one launch (phone-stopped-launch). Prior art: NN/g
 * consistency and standards (the same state offers the same action wherever it is shown). Made-up words only.
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

const run = (extra: Partial<RunState>): RunState => ({ id: 'r1', scope: 'all', phase: 'done', requestedAt: 1000, phaseAt: 2000, seen: true, ...extra });
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

/** Saves a words-only pile on Add while the last run is `current`; the one message it shows. */
async function saved(current: RunState | null) {
  sessionStorage.setItem('bower:add-draft', 'Saltmere quiz night on Friday');
  const base = loadingSources();
  const addPile = async (input: NewPile): Promise<Pile> => ({ id: 'p1', text: input.text, createdAt: 1, items: [] });
  const sources = { ...base, vault: { ...base.vault, addPile, duplicates: async () => [] }, runs: { ...base.runs, current: async () => current } };
  render(<MemoryRouter initialEntries={['/add']}><DataProvider sources={sources}><Add /></DataProvider></MemoryRouter>);
  await flush();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Add .*to the inbox$/ })); });
  await flush();
  expect(vi.mocked(toast), 'setup: one message after the save').toHaveBeenCalledOnce();
  const [text, action] = vi.mocked(toast).mock.calls[0] ?? [];
  return { text, label: action?.label };
}

describe('qa-prod-11-F3: no Tidy up now beside an unseen stop', () => {
  it('AC1 qa11-no-offer-beside-stop: an unseen stop: the message says where the pile went and offers nothing', async () => {
    const { text, label } = await saved(run({ phase: 'failed', seen: false }));
    expect(text).toBe('Your note is in the inbox');
    expect(label, 'AC1: no Tidy up now beside the stopped card\'s Try again').toBeUndefined();
  });

  it.each([
    ['no run yet', null],
    ['a stop already seen', run({ phase: 'failed', seen: true })],
    ['a finished run not watched yet', run({ seen: false, finishedAt: 2000 })],
  ])('AC1 guard: %s: the message still offers Tidy up now', async (_case, current) => {
    expect((await saved(current)).label).toBe('Tidy up now');
  });
});
