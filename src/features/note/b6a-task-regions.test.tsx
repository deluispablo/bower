import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { FakeDrive } from '@/data/drive/fake-drive';
import { DriveVault } from '@/data/vault/drive-vault';
import { serializeNote } from '@/data/contracts/note-format';
import { parseOwnership } from '@/data/contracts/ownership-format';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import * as markdown from './markdown';
import { NoteScreen } from './NoteScreen';

const PATH = 'Project.md';
const activeVaults: DriveVault[] = [];

afterEach(() => {
  cleanup();
  activeVaults.splice(0).forEach((vault) => vault.dispose());
  vi.restoreAllMocks();
  localStorage.clear();
});

async function projectScreen() {
  localStorage.clear();
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const raw = serializeNote({ template: 'project', byBower: true,
    summary: 'Alex grows mint.', tags: [], currentState: ['Alex has seeds.'], timeline: [],
    properties: [
      { key: 'type', label: 'Type', value: 'project' },
      { key: 'created', label: 'Created', value: '2026-10-10' },
      { key: 'updated', label: 'Updated', value: '2026-10-10' },
      { key: 'source', label: 'Source', value: 'Garden bulletin' },
      { key: 'related', label: 'Related', value: 'Gardening', link: 'Gardening' },
    ],
    body: '## Goal\nGrow mint.\n\n## Next steps\n- [ ] Plant mint.\n\n## Notes\n- [ ] Buy a pot.',
  });
  const file = await drive.createText(root, PATH, raw);
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  activeVaults.push(vault);
  const ownership = parseOwnership(new TextEncoder().encode(raw));
  expect(ownership.status, 'The fixture has production template ownership').toBe('v2');
  if (ownership.status !== 'v2') throw new Error('Expected valid template ownership');
  expect(ownership.tasks.map((task) => task.label), 'Only Notes is personal').toEqual(['Buy a pot.']);
  const note = await vault.note(PATH);
  // The Markdown callback contract is the task position in its input text. Exercise
  // NoteScreen's real callback without requiring Bower tasks to look like checkboxes.
  const tasks = [...note.body.matchAll(/^\s*[-*]\s+\[[ x]\]\s+(.+)$/gm)].map((match) => match[1]);
  const originalMarkdown = markdown.Markdown;
  let toggle: ((index: number) => void) | undefined;
  vi.spyOn(markdown, 'Markdown').mockImplementation((props) => {
    toggle = props.onToggle;
    return originalMarkdown(props);
  });
  const originalToggle = vault.toggleTask.bind(vault);
  let pending: Promise<void> | undefined;
  const mutation = vi.spyOn(vault, 'toggleTask').mockImplementation((path, index) => {
    pending = originalToggle(path, index);
    return pending;
  });
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const writes = vi.spyOn(drive, 'writeText');
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/note/${PATH}`]}>
    <DataProvider sources={{ ...base, vault }}><NoteScreen /></DataProvider>
  </MemoryRouter>);
  await screen.findByRole('heading', { name: 'Project', level: 1 });
  return { drive, file, raw, errors, writes, mutation,
    aim: async (label: string) => {
      const index = tasks.indexOf(label);
      if (index < 0 || !toggle) throw new Error('Expected a task identity and the production screen callback');
      let failure: unknown;
      await act(async () => {
        toggle?.(index);
        if (!pending) throw new Error('Expected the production mutation');
        try { await pending; } catch (error) { failure = error; }
      });
      return failure;
    },
  };
}

it('B6a fix 3: toggling the personal Project task changes only Buy a pot', async () => {
  const { drive, file, raw, aim, errors, writes } = await projectScreen();
  const failure = await aim('Buy a pot.');
  expect.soft(failure, 'The personal task remains actionable after a Bower task').toBeUndefined();
  expect.soft(await drive.readText(file.id), 'No toggle reaches another region or changes its framing')
    .toBe(raw.replace('- [ ] Buy a pot.', '- [x] Buy a pot.'));
  expect.soft(writes.mock.calls.filter(([id]) => id === file.id)).toHaveLength(1);
  expect.soft(errors).not.toHaveBeenCalled();
});

it('B6a fix 3: a toggle aimed at the Project Bower task refuses unchanged and logs one BowerError', async () => {
  const { drive, file, raw, aim, errors, writes, mutation } = await projectScreen();
  const before = await drive.snapshot();
  const failure = await aim('Plant mint.');
  expect(mutation, 'The attempt crosses the production screen and mutation API').toHaveBeenCalledTimes(1);
  expect.soft(failure, 'A Bower-region identity cannot alias a personal task').toBeInstanceOf(BowerError);
  expect.soft(await drive.readText(file.id), 'Neither region changes').toBe(raw);
  expect.soft(await drive.snapshot(), 'Refusal creates no task journal or other effects').toBe(before);
  expect.soft(writes).not.toHaveBeenCalled();
  expect.soft(errors).toHaveBeenCalledTimes(1);
  expect.soft(errors.mock.calls[0]?.[0], 'The production screen reports the refused mutation once').toBeInstanceOf(BowerError);
});
