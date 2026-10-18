import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Note, TreeNode } from '@/data/types';
import { parseNote } from '@/data/contracts/note-format';
import { useUi } from '@/app/ui-store';
import { loadingSources } from '@/testing/loading-sources';
import { NoteScreen } from './NoteScreen';
import { RightPanel } from './RightPanel';
import { noteOutline } from './markdown';

// prod1-document-heading: a generated document shows its page title once; nothing else is touched.
const PATH = 'Resources/Links/Trip plan.md';
const TITLE = 'Trip plan';
const tree: TreeNode[] = [{ path: 'Resources', name: 'Resources', type: 'folder', modified: 0, created: 0, children: [
  { path: 'Resources/Links', name: 'Links', type: 'folder', modified: 0, created: 0, children: [
    { path: PATH, name: 'Trip plan.md', type: 'file', kind: 'note', modified: 0, created: 0 }] }] }];

afterEach(() => {
  cleanup();
  useUi.setState({ rightTab: 'links' });
});

const generated = (body: string, front = 'by: bower\ntype: document'): Note => ({ ...parseNote(PATH, `---\n${front}\n---\n\n${body}`), title: TITLE, backlinks: [] });

async function show(note: Note) {
  useUi.setState({ rightTab: 'outline' });
  const vault = new Proxy({}, { get: (_t, k) => {
    if (k === 'subscribe') return () => () => undefined;
    if (k === 'tree') return async () => tree;
    if (k === 'note') return async () => note;
    if (k === 'changes') return async () => [];
    if (k === 'markSeen') return async () => undefined;
    return () => new Promise(() => undefined);
  } });
  const { container } = render(<MemoryRouter initialEntries={[`/note/${PATH}`]}>
    <DataProvider sources={{ ...loadingSources(), vault } as unknown as Sources}><NoteScreen /><RightPanel /></DataProvider>
  </MemoryRouter>);
  const article = await screen.findByRole('article');
  await screen.findByRole('tab', { name: 'Outline' });
  const headings = [...article.querySelectorAll('h1, h2, h3')].map((h) => h.textContent);
  const list = container.querySelector('ul[class*="outline"]');
  const entries = list ? within(list as HTMLElement).getAllByRole('button').map((b) => b.textContent) : [];
  return { headings, entries };
}

it('generated_document_leading_title_is_shown_once', async () => {
  const { headings, entries } = await show(generated(`# ${TITLE}\n\nIntro.\n\n## Packing\n\n- Socks`));
  expect(headings).toEqual([TITLE, 'Packing']);
  expect(entries).toEqual([TITLE, 'Packing']);
});

it.each([
  ['blank lines and comment-only lines', `\n\n<!-- note -->\n# ${TITLE}\n\n## Packing`],
  ['bold', `# **${TITLE}**\n\n## Packing`],
  ['italic', `# *${TITLE}*\n\n## Packing`],
  ['code', `# \`${TITLE}\`\n\n## Packing`],
  ['a wikilink label', `# [[Other|${TITLE}]]\n\n## Packing`],
  ['CRLF and trailing spaces', `# ${TITLE}  \r\n\r\n## Packing`],
])('the leading title is hidden once: %s', async (_n, body) => {
  const { headings, entries } = await show(generated(body));
  expect(headings.slice(0, 2)).toEqual([TITLE, 'Packing']); // a link adds its own sections after the body
  expect(entries).toEqual([TITLE, 'Packing']);
});

it('different_or_personal_heading_is_preserved', async () => {
  const kept = async (note: Note, expected: string[]) => {
    const { headings, entries } = await show(note);
    expect(headings).toEqual(expected);
    expect(entries).toEqual(expected);
    cleanup();
  };
  const body = `# ${TITLE}\n\n## Packing`;
  await kept(generated(body, 'by: bower\ntype: log'), [TITLE, TITLE, 'Packing']);
  await kept(generated(body, 'type: document'), [TITLE, TITLE, 'Packing']);
  await kept(generated('# Other plan\n\n## Packing'), [TITLE, 'Other plan', 'Packing']);
});

it.each([
  ['prose first', `Intro.\n\n# ${TITLE}`],
  ['a different case', '# trip plan'],
  ['different internal spacing', '# Trip  plan'],
  ['a multiline comment before it', `<!--\nx\n-->\n# ${TITLE}`],
])('the heading stays: %s', async (_n, body) => {
  const { headings } = await show(generated(body));
  expect(headings).toHaveLength(2);
});

it('only_the_initial_heading_is_removed', async () => {
  const note = generated(`# ${TITLE}\n\n## Notes\n\nMine.\n\n# ${TITLE}\n\nMy own words.`);
  const before = JSON.stringify(note);
  const { headings, entries } = await show(note);
  expect(headings).toEqual([TITLE, 'Notes', TITLE]);
  expect(entries).toEqual([TITLE, 'Notes', TITLE]);
  expect(screen.getByText('My own words.')).toBeInTheDocument();
  expect(JSON.stringify(note)).toBe(before);
});

it('a_title_only_document_has_an_empty_outline', async () => {
  const { headings } = await show(generated(`# ${TITLE}`));
  expect(headings).toEqual([TITLE]);
  expect(await screen.findByText('This note has no headings.')).toBeInTheDocument();
});

it('noteOutline_keeps_its_minimal_inputs', () => {
  expect(noteOutline({ currentState: [], body: `# ${TITLE}`, timeline: [] }).map((h) => h.text)).toEqual([TITLE]);
});
