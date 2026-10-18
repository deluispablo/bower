import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { MaintenanceNote } from '@/data/contracts/run-manifest';
import type { Note, TreeNode } from '@/data/types';
import { parseNote } from '@/data/contracts/note-format';
import { noteRoute } from '@/app/paths';
import { loadingSources } from '@/testing/loading-sources';
import { renderHealth } from '../../../runner/src/lint';
import { NoteScreen } from './NoteScreen';

// F5 (qa-prod-1): Bower's note is block Markdown, rendered by the shared safe Markdown component.
const FOLDER = 'Resources/Links';
const PATH = `${FOLDER}/Health.md`;
const NAMES = ['Alpha', 'Beta', 'Gamma'];
const leaf = (name: string): TreeNode => ({ path: `${FOLDER}/${name}`, name, type: 'file', kind: 'note', modified: 0, created: 0 });
const tree: TreeNode[] = [{ path: 'Resources', name: 'Resources', type: 'folder', modified: 0, created: 0, children: [
  { path: FOLDER, name: 'Links', type: 'folder', modified: 0, created: 0, children: [leaf('Health.md'), ...NAMES.map((n) => leaf(`${n}.md`))] }] }];

afterEach(cleanup);

async function shown(raw: string) {
  const note: Note = { ...parseNote(PATH, raw), backlinks: [] };
  const toggleTask = vi.fn(async () => undefined);
  const vault = new Proxy({}, { get: (_t, k) => {
    if (k === 'subscribe') return () => () => undefined;
    if (k === 'tree') return async () => tree;
    if (k === 'note') return async () => note;
    if (k === 'changes') return async () => [];
    if (k === 'markSeen') return async () => undefined;
    if (k === 'toggleTask') return toggleTask;
    return () => new Promise(() => undefined);
  } });
  render(<MemoryRouter initialEntries={[`/note/${PATH}`]}>
    <DataProvider sources={{ ...loadingSources(), vault } as unknown as Sources}><NoteScreen /></DataProvider>
  </MemoryRouter>);
  const aside = await screen.findByRole('complementary', { name: "Bower's note" });
  return { aside, toggleTask };
}

const bowerNote = (text: string): string => `---\nby: bower\n---\n\n## Bower's note\n${text}\n`;

it('health_bullets_render_as_separate_list_items', async () => {
  const notes = NAMES.map((name): MaintenanceNote => ({
    path: `${FOLDER}/${name}.md`, version: '1', summary: `Alex keeps details about ${name}.`,
    coverage: { kind: 'prefix', bytes: 100 }, owner: 'bower', lint: { links: [], tags: 0, summary: true },
  }));
  const raw = renderHealth(Object.fromEntries(notes.map((n, i) => [String(i), n])), notes.map((n) => n.path),
    Object.fromEntries(notes.map((n, i) => [String(i), { path: n.path }])));
  expect(raw.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(3);
  const { aside } = await shown(raw);
  const lists = aside.querySelectorAll('ul');
  expect(lists).toHaveLength(1);
  const items = [...(lists[0]?.children ?? [])];
  expect(items.map((li) => li.tagName)).toEqual(['LI', 'LI', 'LI']);
  expect(items.map((li) => within(li as HTMLElement).getByRole('link').getAttribute('href')))
    .toEqual(NAMES.map((n) => noteRoute(`${FOLDER}/${n}.md`)));
});

it('health_markdown_keeps_raw_html_inert', async () => {
  const img = '<img src=x onerror=alert(1)>';
  const script = '<script>alert(1)</script>';
  const { aside } = await shown(bowerNote(`- Broken link: ${img}\n\n${script}`));
  expect(aside.textContent).toContain(img);
  expect(aside.textContent).toContain(script);
  expect(aside.querySelector('img, script')).toBeNull();
});

it('health_legacy_quote_uses_markdown', async () => {
  const raw = readFileSync('testing/corpus/c17-b9-legacy-readable/folder/Resources/Garden notes/Garden notes.md', 'utf8');
  const { aside } = await shown(raw);
  const quote = aside.querySelector('blockquote');
  expect(quote?.textContent).toContain('[!contradiction] The amber notice and blue notice disagree.');
  expect(aside.textContent).not.toContain('> [!contradiction]');
  expect(quote?.nextElementSibling?.textContent).toContain('A quiet visit seems possible ^[inferred].');
});

it('health_stored_tasks_are_read_only', async () => {
  const { aside, toggleTask } = await shown(bowerNote('- [ ] Protected task'));
  const box = within(aside).getByRole('checkbox', { name: 'Protected task' });
  expect(box).toBeDisabled();
  expect(box).toHaveAttribute('readonly');
  fireEvent.click(box);
  expect(toggleTask).not.toHaveBeenCalled();
});

it('health_zero_findings_remains_prose', async () => {
  const { aside } = await shown(renderHealth({}, [], {}));
  const para = within(aside).getByText('No findings in the checked notes.');
  expect(para.tagName).toBe('P');
  expect(aside.querySelector('ul, ol, li')).toBeNull();
});
