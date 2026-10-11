import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { FakeDrive } from '@/data/drive/fake-drive';
import { DriveVault } from '@/data/vault/drive-vault';
import { serializeNote } from '@/data/contracts/note-format';
import { parseOwnership } from '@/data/contracts/ownership-format';
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
    summary: 'Alex grows mint.', tags: [], currentState: [], timeline: [],
    properties: [
      { key: 'type', label: 'Type', value: 'project' },
      { key: 'created', label: 'Created', value: '2026-10-10' },
      { key: 'updated', label: 'Updated', value: '2026-10-10' },
      { key: 'source', label: 'Source', value: 'Garden bulletin' },
      { key: 'related', label: 'Related', value: 'Gardening', link: 'Gardening' },
    ],
    body: [
      '## Goal', 'Grow mint.', '- A normal bullet.', '- [ ] Plan the bed.', '',
      '## Next steps', '- [ ] Plant mint.', '- [x] Choose seeds.', '',
      '## Notes', '- [ ] Buy a pot.', '- [x] Water mint.',
    ].join('\n'),
  });
  const file = await drive.createText(root, PATH, raw);
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  activeVaults.push(vault);
  const ownership = parseOwnership(new TextEncoder().encode(raw));
  expect(ownership.status, 'Positive control: production framing grants ownership').toBe('v2');
  if (ownership.status !== 'v2') throw new Error('Expected valid template ownership');
  expect(ownership.tasks.map((task) => [task.index, task.label, task.done]))
    .toEqual([[0, 'Buy a pot.', false], [1, 'Water mint.', true]]);
  const toggleIndexes: number[] = [];
  const originalMarkdown = markdown.Markdown;
  vi.spyOn(markdown, 'Markdown').mockImplementation((props) => originalMarkdown({
    ...props,
    onToggle: props.onToggle ? (index) => {
      toggleIndexes.push(index);
      props.onToggle?.(index);
    } : undefined,
  }));
  const originalToggle = vault.toggleTask.bind(vault);
  let pending: Promise<void> | undefined;
  vi.spyOn(vault, 'toggleTask').mockImplementation((path, index) => {
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
  return { raw, errors, writes, toggleIndexes, fileId: file.id,
    read: () => drive.readText(file.id),
    tick: async (checkbox: HTMLElement) => {
      pending = undefined;
      await act(async () => {
        fireEvent.click(checkbox);
        if (!pending) throw new Error('The screen did not call its production task mutation');
        // NoteScreen reports a refusal itself; the assertion inspects its result and log.
        await Promise.allSettled([pending]);
      });
    },
  };
}

function item(label: string): HTMLElement {
  const element = screen.getByText(label, { exact: true }).closest('li');
  if (!element) throw new Error(`Expected a list item for ${label}`);
  return element;
}

it('NSPL Bower plain list', async () => {
  const { raw, read } = await projectScreen();
  // Positive control: a normal list item and the person's done checkbox still render.
  const normal = item('A normal bullet.');
  expect(normal.parentElement?.tagName).toBe('UL');
  expect(normal).not.toHaveClass('md-task');
  expect(screen.getByRole('checkbox', { name: 'Water mint.' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Water mint.' }).closest('label')).toHaveClass('md-done');
  for (const label of ['Plan the bed.', 'Plant mint.', 'Choose seeds.']) {
    const row = item(label);
    expect.soft(row.parentElement?.tagName).toBe('UL');
    expect.soft(within(row).queryByRole('checkbox')).not.toBeInTheDocument();
    expect.soft(row.querySelector('input, button, [role="checkbox"], [aria-disabled], [disabled]')).toBeNull();
    expect.soft(row).not.toHaveClass('md-task');
    expect.soft(row.textContent).toBe(label);
  }
  expect.soft(item('Plant mint.').querySelector('.md-done')).toBeNull();
  const done = item('Choose seeds.');
  expect.soft(done.matches('.md-done') || done.querySelector('.md-done') !== null).toBe(true);
  expect(await read(), 'Rendering does not write or rewrite Markdown').toBe(raw);
});

it('NSPL personal tasks', async () => {
  const { raw, read, tick, writes, errors, fileId, toggleIndexes } = await projectScreen();
  // Positive control: use the actual named personal control, not an injected callback.
  const done = screen.getByRole('checkbox', { name: 'Water mint.' });
  expect(done).toBeEnabled();
  expect(done).toBeChecked();
  await tick(done);
  expect(await read()).toBe(raw.replace('- [x] Water mint.', '- [ ] Water mint.'));
  expect(screen.getByRole('checkbox', { name: 'Buy a pot.' })).not.toBeChecked();
  expect(writes.mock.calls.filter(([id]) => id === fileId)).toHaveLength(1);
  expect(errors).not.toHaveBeenCalled();
  expect.soft(toggleIndexes, 'Tick positions count only personal tasks').toEqual([1]);
  // Only personal tasks are exposed as controls; Bower's preceding tasks consume none.
  expect.soft(screen.getAllByRole('checkbox').map((checkbox) => checkbox.closest('label')?.textContent))
    .toEqual(['Buy a pot.', 'Water mint.']);
});

it('NSPL first personal tick', async () => {
  const { raw, read, tick, errors } = await projectScreen();
  // Positive control: tick and untick the first personal task by its accessible name.
  await tick(screen.getByRole('checkbox', { name: 'Buy a pot.' }));
  expect(await read()).toBe(raw.replace('- [ ] Buy a pot.', '- [x] Buy a pot.'));
  await tick(screen.getByRole('checkbox', { name: 'Buy a pot.' }));
  expect(await read()).toBe(raw);
  expect(errors).not.toHaveBeenCalled();
  // With Bower items plain, the first on-screen checkbox is the person's index zero.
  // The full raw comparison also protects other tasks, ownership framing and line endings.
  const first = screen.getAllByRole('checkbox')[0];
  if (!first) throw new Error('Expected the first personal checkbox');
  await tick(first);
  expect.soft(await read()).toBe(raw.replace('- [ ] Buy a pot.', '- [x] Buy a pot.'));
  expect.soft(screen.getByRole('checkbox', { name: 'Buy a pot.' })).toBeChecked();
  expect.soft(errors).not.toHaveBeenCalled();
});
