import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DemoWorld } from '@/data/demo/world';
import { PHASE_MS } from '@/data/demo/scenario';
import { DataProvider } from '@/data/provider';
import { BowerError } from '@/data/types';
import { NoteScreen } from './NoteScreen';

const PATH = 'Areas/Documents/Passport renewal.md';
const LABEL = 'Photo form signed by a witness';
const worlds: DemoWorld[] = [];

afterEach(() => {
  cleanup();
  worlds.splice(0).forEach((world) => world.dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

function fixture(scenario: 'default' | 'fail-run') {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const world = new DemoWorld({ scenario, scale: 'demo', latency: 0 });
  worlds.push(world);
  return world.sources();
}

it.each(['default', 'fail-run'] as const)('mounted note checkboxes follow the %s run and tick afterward', async (scenario) => {
  const sources = fixture(scenario);
  const toggle = vi.spyOn(sources.vault, 'toggleTask');
  await act(async () => {
    render(<MemoryRouter initialEntries={[`/note/${PATH}`]}>
      <DataProvider sources={sources}><NoteScreen /></DataProvider>
    </MemoryRouter>);
  });
  const checkbox = () => screen.getByRole('checkbox', { name: LABEL });
  expect(checkbox()).toBeEnabled();
  expect(checkbox()).not.toBeChecked();
  await act(async () => { await sources.runs.start('all'); });
  const phases = scenario === 'default' ? ['queued', 'reading', 'writing', 'saving'] as const : ['queued', 'reading', 'writing'] as const;
  for (const phase of phases) {
    expect((await sources.runs.current())?.phase).toBe(phase);
    for (const box of screen.getAllByRole('checkbox')) expect.soft(box).toBeDisabled();
    await act(async () => { fireEvent.click(checkbox()); });
    expect.soft(toggle).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(PHASE_MS.demo[phase]); });
  }
  expect((await sources.runs.current())?.phase).toBe(scenario === 'default' ? 'done' : 'failed');
  for (const box of screen.getAllByRole('checkbox')) expect(box).toBeEnabled();
  await act(async () => { fireEvent.click(checkbox()); });
  expect(toggle).toHaveBeenLastCalledWith(PATH, 4);
  expect(checkbox()).toBeChecked();
  expect((await sources.vault.note(PATH)).body).toContain(`- [x] ${LABEL}`);
});

it.each(['default', 'fail-run'] as const)('demo refuses direct task edits without changing note or journal during the %s run', async (scenario) => {
  const { vault, runs } = fixture(scenario);
  await runs.start('all');
  const phases = scenario === 'default' ? ['queued', 'reading', 'writing', 'saving'] as const : ['queued', 'reading', 'writing'] as const;
  for (const phase of phases) {
    expect((await runs.current())?.phase).toBe(phase);
    const before = await vault.note(PATH);
    const journal = await vault.changes();
    await expect.soft(vault.toggleTask(PATH, 4)).rejects.toMatchObject(new BowerError('conflict', 'Wait for the tidy-up to end.'));
    expect.soft(await vault.note(PATH)).toEqual(before);
    expect.soft(await vault.changes()).toEqual(journal);
    await vi.advanceTimersByTimeAsync(PHASE_MS.demo[phase]);
  }
  expect((await runs.current())?.phase).toBe(scenario === 'default' ? 'done' : 'failed');
  const before = await vault.note(PATH);
  const journal = await vault.changes();
  await vault.toggleTask(PATH, 4);
  expect((await vault.note(PATH)).body).toBe(before.body.replace(`- [ ] ${LABEL}`, `- [x] ${LABEL}`));
  expect(await vault.changes()).toHaveLength(journal.length + 1);
});
