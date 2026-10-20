/** ux-loading-polish (rulings, "Final acceptance and reds"): still shapes in place of "Looking…", and loading, empty and failed told apart. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type Note, type TreeNode } from '@/data/types';
import { BowerPanel } from '@/features/bower/BowerPanel';
import { BookmarksPanel } from '@/features/files/BookmarksPanel';
import { FolderScreen } from '@/features/files/FolderScreen';
import { NameSheet } from '@/features/files/NameSheet';
import { NoteScreen } from '@/features/note/NoteScreen';
import { loadingSources } from '@/testing/loading-sources';

const initial = useUi.getState();
afterEach(() => {
  cleanup();
  useUi.setState(initial, true);
  localStorage.clear();
  vi.restoreAllMocks();
});

const AT = Date.UTC(2026, 9, 11);
const file = (path: string, hub = false): TreeNode => ({ path, name: path.slice(path.lastIndexOf('/') + 1), type: 'file', kind: 'note', created: AT, modified: AT, ...(hub ? { hub } : {}) });
const TREE: TreeNode[] = [
  { path: 'Projects', name: 'Projects', type: 'folder', created: AT, modified: AT, children: [
    { path: 'Projects/Flat hunt', name: 'Flat hunt', type: 'folder', created: AT, modified: AT, children: [
      file('Projects/Flat hunt/Flat hunt.md', true),
      file('Projects/Flat hunt/Lease notes.md'),
    ] },
  ] },
];
const noteOf = (path: string, title: string, summary = ''): Note =>
  ({ path, title, summary, properties: [], tags: [], currentState: [], body: 'Alex keeps the lease here.', timeline: [], links: [], backlinks: [], byBower: false }) as unknown as Note;
const settle = (): Promise<void> => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

/** Sources whose vault answers what the test gives and never answers the rest. */
function sourcesWith(answers: Record<string, unknown>): Sources {
  const base = loadingSources();
  const vault = new Proxy(base.vault, { get: (target, key) => (typeof key === 'string' && key in answers ? answers[key] : Reflect.get(target, key)) });
  return { ...base, vault } as Sources;
}
const show = (at: string, sources: Sources, ui: ReactNode) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <DataProvider sources={sources}>
        <Routes>
          <Route path="/files/*" element={ui} />
          <Route path="/note/*" element={ui} />
          <Route path="*" element={ui} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  );

describe('AC1 still shapes, never "Looking…"', () => {
  it('AC1 no_looking_in_source: no production file says "Looking…"', () => {
    const src = join(process.cwd(), 'src');
    const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.(tsx?|css|html)$/.test(f) && !/\.test\./.test(f));
    expect(files.filter((f) => readFileSync(join(src, f), 'utf8').includes('Looking…'))).toEqual([]);
  });

  it('AC1 one_home_for_placeholders: every named still shape goes through ui/Skeleton, none drawn inline', () => {
    const hits: string[] = [];
    for (const dir of ['features', 'app']) {
      const root = join(process.cwd(), 'src', dir);
      for (const f of (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))) {
        const text = readFileSync(join(root, f), 'utf8');
        // A placeholder named by hand (role="status" or aria-busy with an "Opening…" name), or a shape styled inline.
        if (/aria-label="Opening/.test(text)) hits.push(`${dir}/${f}: aria-label="Opening…"`);
        if (/background: 'var\(--surface\)'/.test(text)) hits.push(`${dir}/${f}: inline still shape`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('AC1 activity_panel: the side panel shows a named still shape while the tidy-up state is read', async () => {
    show('/files', loadingSources(), <BowerPanel />);
    await settle();
    expect(screen.getByRole('status', { name: 'Opening the activity panel' })).toBeInTheDocument();
    expect(screen.queryByText('Looking…')).toBeNull();
  });

  it('AC1 bookmarks: one still row per bookmark while the folder is read', async () => {
    useUi.setState({ bookmarks: ['Projects/Flat hunt', 'Projects/Flat hunt/Lease notes.md'] });
    show('/', loadingSources(), <BookmarksPanel />);
    await settle();
    const busy = screen.getByRole('status', { name: 'Opening bookmarks' });
    expect(busy.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    expect(screen.queryByText('Looking…')).toBeNull();
  });

  it('AC1 name_form: renaming before the folder is read shows the name form\'s shapes', async () => {
    useUi.setState({ naming: { rename: 'Projects/Flat hunt/Lease notes.md' } });
    show('/', loadingSources(), <NameSheet />);
    await settle();
    expect(screen.getByRole('status', { name: 'Opening the name form' })).toBeInTheDocument();
    expect(screen.queryByText('Looking…')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('AC1 note_opens_in_place: the note\'s place stands and a named still shape holds its title and text', async () => {
    show('/note/Projects/Flat%20hunt/Lease%20notes.md', loadingSources(), <NoteScreen />);
    await settle();
    expect(screen.getByRole('status', { name: 'Opening the note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Projects \/ Flat hunt/ })).toBeInTheDocument();
  });
});

describe('AC2 a folder opens in place', () => {
  it('AC2 folder_opens_in_place: its name, place and view stand while it is read', async () => {
    show('/files/Projects/Flat%20hunt', loadingSources(), <FolderScreen />);
    await settle();
    expect(screen.getByRole('status', { name: 'Opening the folder' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Flat hunt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
  });

  it('AC2 hub_with_the_folder: the list waits for the folder\'s own note, then both show at once', async () => {
    let answer = (_n: Note): void => undefined;
    const sources = sourcesWith({ tree: async () => TREE, note: () => new Promise<Note>((r) => { answer = r; }), typeTable: async () => [] });
    show('/files/Projects/Flat%20hunt', sources, <FolderScreen />);
    await settle();
    expect(screen.getByRole('status', { name: 'Opening the folder' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Lease notes/ })).toBeNull();
    await act(async () => answer(noteOf('Projects/Flat hunt/Flat hunt.md', 'Flat hunt', 'Alex is looking for a flat.')));
    await settle();
    expect(screen.queryByRole('status', { name: 'Opening the folder' })).toBeNull();
    expect(screen.getByRole('link', { name: /Alex is looking for a flat/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lease notes/ })).toBeInTheDocument();
  });
});

describe('AC3 loading, empty and failed are told apart', () => {
  it('AC3 no_bookmarks_is_empty: with none kept, the empty line shows at once, not a loading state', async () => {
    useUi.setState({ bookmarks: [] });
    show('/', loadingSources(), <BookmarksPanel />);
    await settle();
    expect(screen.getByText(/^Nothing bookmarked yet/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('AC3 folder_read_fails: the error and Try again, never "Not here any more" or a still shape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const sources = sourcesWith({
      tree: async () => {
        calls += 1;
        if (calls === 1) throw new BowerError('unknown', 'Bower could not read your folders. Try again.');
        return TREE;
      },
      note: async () => noteOf('Projects/Flat hunt/Flat hunt.md', 'Flat hunt', 'Alex is looking for a flat.'),
      typeTable: async () => [],
    });
    show('/files/Projects/Flat%20hunt', sources, <FolderScreen />);
    await settle();
    const alert = screen.queryByRole('alert');
    expect(alert, 'an alert with the read error').not.toBeNull();
    expect(screen.queryByText('Not here any more')).toBeNull();
    expect(screen.queryByRole('status', { name: 'Opening the folder' })).toBeNull();
    if (!alert) return;
    expect(alert).toHaveTextContent('Bower could not read your folders. Try again.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: /Lease notes/ })).toBeInTheDocument();
  });

  it('AC3 note_read_fails: the error and Try again in the note\'s place, then the note', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const sources = sourcesWith({
      tree: async () => TREE,
      note: async (path: string) => {
        calls += 1;
        if (calls === 1) throw new BowerError('unknown', 'Bower could not read this note. Try again.');
        return noteOf(path, 'Lease notes');
      },
      markSeen: async () => undefined,
    });
    show('/note/Projects/Flat%20hunt/Lease%20notes.md', sources, <NoteScreen />);
    await settle();
    const alert = screen.queryByRole('alert');
    expect(alert, 'an alert with the read error').not.toBeNull();
    expect(screen.queryByRole('status', { name: 'Opening the note' })).toBeNull();
    if (!alert) return;
    expect(alert).toHaveTextContent('Bower could not read this note. Try again.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.getByRole('heading', { level: 1, name: 'Lease notes' })).toBeInTheDocument();
  });

  it('AC3 hub_read_fails: a failed read of the folder\'s own note shows its error in the summary\'s place, and Try again brings it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const sources = sourcesWith({
      tree: async () => TREE,
      note: async () => {
        calls += 1;
        if (calls === 1) throw new BowerError('unknown', 'Bower could not read this note. Try again.');
        return noteOf('Projects/Flat hunt/Flat hunt.md', 'Flat hunt', 'Alex is looking for a flat.');
      },
      typeTable: async () => [],
    });
    show('/files/Projects/Flat%20hunt', sources, <FolderScreen />);
    await settle();
    const alert = screen.queryByRole('alert');
    expect(alert, 'an alert with the read error').not.toBeNull();
    expect(screen.queryByRole('status', { name: 'Opening the folder' })).toBeNull();
    expect(screen.getByRole('link', { name: /Lease notes/ })).toBeInTheDocument();
    if (!alert) return;
    expect(alert).toHaveTextContent('Bower could not read this note. Try again.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: /Alex is looking for a flat/ })).toBeInTheDocument();
  });

  it('AC3 hub_reread_keeps_summary: a failed re-read keeps the summary it had and shows no alert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const listeners: Array<() => void> = [];
    const sources = sourcesWith({
      tree: async () => TREE,
      note: async () => {
        calls += 1;
        if (calls > 1) throw new BowerError('unknown', 'Bower could not read this note. Try again.');
        return noteOf('Projects/Flat hunt/Flat hunt.md', 'Flat hunt', 'Alex is looking for a flat.');
      },
      typeTable: async () => [],
      subscribe: (cb: () => void) => {
        listeners.push(cb);
        return () => undefined;
      },
    });
    show('/files/Projects/Flat%20hunt', sources, <FolderScreen />);
    await settle();
    expect(screen.getByRole('link', { name: /Alex is looking for a flat/ })).toBeInTheDocument();
    await act(async () => listeners.forEach((cb) => cb()));
    await settle();
    expect(calls).toBeGreaterThan(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: /Alex is looking for a flat/ })).toBeInTheDocument();
  });

  it('AC3 activity_panel_never_stays: a failed read shows its error, not the still shape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = loadingSources();
    const sources = { ...base, runs: { ...base.runs, current: async () => { throw new BowerError('unknown', 'Bower could not check the tidy-up. Try again.'); } } } as Sources;
    show('/files', sources, <BowerPanel />);
    await settle();
    expect(screen.getByText('Bower could not check the tidy-up. Try again.')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Opening the activity panel' })).toBeNull();
  });
});
