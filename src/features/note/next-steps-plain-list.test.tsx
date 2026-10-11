import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { FakeDrive } from '@/data/drive/fake-drive';
import { DriveVault } from '@/data/vault/drive-vault';
import { parseNote, serializeNote, type NoteFile } from '@/data/contracts/note-format';
import { parseOwnership } from '@/data/contracts/ownership-format';
import type { Note } from '@/data/contracts/types';
import { DemoWorld } from '@/data/demo/world';
import { NOTES } from '@/data/demo/notes';
import { seedFakeDrive } from '@/data/fake/seed';
import { loadingSources } from '@/testing/loading-sources';
import * as markdown from './markdown';
import { NoteScreen } from './NoteScreen';

const PATH = 'Project.md';
const PROJECT_NOTE: NoteFile = { template: 'project', byBower: true,
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
};
const TASK_REGIONS = ['bower', 'bower', 'bower', 'personal', 'personal'];
const activeVaults: DriveVault[] = [];

afterEach(() => {
  cleanup();
  activeVaults.splice(0).forEach((vault) => vault.dispose());
  vi.restoreAllMocks();
  localStorage.clear();
});

async function projectVault() {
  localStorage.clear();
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const raw = serializeNote(PROJECT_NOTE);
  const file = await drive.createText(root, PATH, raw);
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  activeVaults.push(vault);
  const ownership = parseOwnership(new TextEncoder().encode(raw));
  expect(ownership.status, 'Positive control: production framing grants ownership').toBe('v2');
  if (ownership.status !== 'v2') throw new Error('Expected valid template ownership');
  expect(ownership.tasks.map((task) => [task.index, task.label, task.done]))
    .toEqual([[0, 'Buy a pot.', false], [1, 'Water mint.', true]]);
  return { drive, file, vault, raw };
}

async function projectScreen() {
  const { drive, file, vault, raw } = await projectVault();
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
  expect.soft(toggleIndexes, 'Each personal checkbox keeps its global body index').toEqual([4]);
  // Only personal tasks are controls; the preceding Bower tasks still occupy body indexes.
  expect.soft(screen.getAllByRole('checkbox').map((checkbox) => checkbox.closest('label')?.textContent))
    .toEqual(['Buy a pot.', 'Water mint.']);
});

it('NSPL first personal tick', async () => {
  const { raw, read, tick, errors, toggleIndexes } = await projectScreen();
  // Positive control: tick and untick the first personal task by its accessible name.
  await tick(screen.getByRole('checkbox', { name: 'Buy a pot.' }));
  expect(await read()).toBe(raw.replace('- [ ] Buy a pot.', '- [x] Buy a pot.'));
  await tick(screen.getByRole('checkbox', { name: 'Buy a pot.' }));
  expect(await read()).toBe(raw);
  expect(errors).not.toHaveBeenCalled();
  // The first on-screen checkbox carries body index 3, after three Bower tasks.
  // The full raw comparison also protects other tasks, ownership framing and line endings.
  const first = screen.getAllByRole('checkbox')[0];
  if (!first) throw new Error('Expected the first personal checkbox');
  await tick(first);
  expect.soft(await read()).toBe(raw.replace('- [ ] Buy a pot.', '- [x] Buy a pot.'));
  expect.soft(screen.getByRole('checkbox', { name: 'Buy a pot.' })).toBeChecked();
  expect.soft(errors).not.toHaveBeenCalled();
  expect.soft(toggleIndexes).toEqual([3, 3, 3]);
});

it('NSPL Note task regions follow B6a projection in body order', () => {
  // B6a also reads stored files with appended Goal/Next steps regions. Move
  // the serializer's complete framed blocks, without inventing framing.
  const canonical = serializeNote(PROJECT_NOTE);
  const goal = canonical.indexOf('<!-- bower:ownership/2 begin goal -->');
  const current = canonical.indexOf('<!-- bower:ownership/2 begin current -->');
  expect(goal).toBeGreaterThan(0);
  expect(current).toBeGreaterThan(goal);
  const raw = canonical.slice(0, goal) + canonical.slice(current) + '\n' + canonical.slice(goal, current);
  expect(raw.indexOf('## Notes')).toBeLessThan(raw.indexOf('## Next steps'));
  const ownership = parseOwnership(new TextEncoder().encode(raw));
  expect(ownership.status).toBe('v2');
  if (ownership.status !== 'v2') throw new Error('Expected valid template ownership');
  expect(ownership.tasks.map((task) => task.label)).toEqual(['Buy a pot.', 'Water mint.']);
  const note = parseNote(PATH, raw);
  expect(note.body.indexOf('## Notes')).toBeGreaterThan(note.body.indexOf('## Next steps'));
  expect(note).toHaveProperty('taskRegions', TASK_REGIONS);
});

it('NSPL drive-vault fills Note task regions from B6a projection', async () => {
  const { vault, raw, drive, file } = await projectVault();
  const note = await vault.note(PATH);
  expect(note.body).toBe(parseNote(PATH, raw).body);
  expect(note.file?.md5).toBeTruthy();
  expect.soft(note).toHaveProperty('taskRegions', TASK_REGIONS);
  expect(await drive.readText(file.id)).toBe(raw);
});

it.each(['demo', 'fake'] as const)('NSPL %s fills Note task regions from B6a projection', async (source) => {
  const path = 'Projects/Flat hunt/Flat hunt.md';
  const previous = NOTES[path];
  if (!previous) throw new Error('Expected the existing seeded project');
  // Use the real source's seeded entry, with a strict project fixture that has
  // both Bower and personal tasks. No source or note read is mocked.
  const seed = { ...PROJECT_NOTE, links: [] };
  NOTES[path] = seed;
  const world = new DemoWorld({ scenario: 'empty', scale: 'instant', latency: 0, now: 0 });
  try {
    let vault = world.sources().vault;
    if (source === 'fake') {
      const drive = new FakeDrive({ clock: () => 0 });
      const root = await seedFakeDrive(drive, 'empty', 0);
      if (!root) throw new Error('Expected a seeded fake folder');
      const fakeVault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
      activeVaults.push(fakeVault);
      vault = fakeVault;
    }
    const note = await vault.note(path);
    expect(note.byBower).toBe(true);
    expect([...note.body.matchAll(/^\s*[-*]\s+\[[ x]\]\s+(.+)$/gm)].map((match) => match[1]))
      .toEqual(['Plan the bed.', 'Plant mint.', 'Choose seeds.', 'Buy a pot.', 'Water mint.']);
    expect(note).toHaveProperty('taskRegions', TASK_REGIONS);
  } finally {
    NOTES[path] = previous;
    world.dispose();
  }
});

it('NSPL Note without task regions renders every task as personal', async () => {
  // Compatibility row: a Note consumer can still provide the old shape. Even
  // byBower and project headings do not grant ownership without the new field.
  const note: Note = { path: PATH, title: 'Project', summary: '', properties: [],
    tags: [], currentState: [], body: PROJECT_NOTE.body, timeline: [], links: [],
    backlinks: [], byBower: true };
  expect(note).not.toHaveProperty('taskRegions');
  const { vault } = await projectVault();
  vi.spyOn(vault, 'note').mockResolvedValue(note);
  const toggleTask = vi.spyOn(vault, 'toggleTask').mockResolvedValue(undefined);
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/note/${PATH}`]}>
    <DataProvider sources={{ ...base, vault }}><NoteScreen /></DataProvider>
  </MemoryRouter>);
  await screen.findByRole('heading', { name: 'Project', level: 1 });
  const checkboxes = screen.getAllByRole('checkbox');
  expect(checkboxes.map((checkbox) => checkbox.closest('label')?.textContent))
    .toEqual(['Plan the bed.', 'Plant mint.', 'Choose seeds.', 'Buy a pot.', 'Water mint.']);
  expect(screen.getByRole('checkbox', { name: 'Choose seeds.' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Water mint.' })).toBeChecked();
  await act(async () => {
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeEnabled();
      fireEvent.click(checkbox);
    }
  });
  expect(toggleTask.mock.calls).toEqual([[PATH, 0], [PATH, 1], [PATH, 2], [PATH, 3], [PATH, 4]]);
});
