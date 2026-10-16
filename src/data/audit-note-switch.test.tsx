import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider, useNote } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type Note } from '@/data/types';
import { NoteScreen } from '@/features/note/NoteScreen';
import { loadingSources } from '@/testing/loading-sources';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A vault whose note reads wait until the test answers them, and whose change listener the test can call. */
function controlled() {
  const pending: { path: string; answer: (n: Note) => void; fail: (e: unknown) => void }[] = [];
  let changed = (): void => undefined;
  const toggleTask = vi.fn(async (_path: string, _index: number) => undefined);
  const base = loadingSources();
  const vault = new Proxy(base.vault, {
    get: (target, key) => {
      if (key === 'note') return (path: string) => new Promise<Note>((answer, fail) => pending.push({ path, answer, fail }));
      if (key === 'subscribe') return (cb: () => void) => { changed = cb; return () => undefined; };
      if (key === 'toggleTask') return toggleTask;
      if (key === 'markSeen') return async () => undefined;
      return Reflect.get(target, key);
    },
  });
  const sources = { ...base, vault } as Sources;
  const wrapper = ({ children }: { children: ReactNode }) => <DataProvider sources={sources}>{children}</DataProvider>;
  const note = (path: string) => ({ path, title: path }) as unknown as Note;
  const answerLast = async () => {
    const last = pending[pending.length - 1];
    if (!last) throw new Error('No note read is waiting.');
    await act(async () => last.answer(note(last.path)));
  };
  return { wrapper, sources, pending, answerLast, toggleTask, change: () => act(() => changed()) };
}

const noteOf = (path: string, body = '') =>
  ({ path, title: path, summary: '', properties: [], tags: [], currentState: [], body, timeline: [], links: [], backlinks: [], byBower: false }) as Note;

it('AC1 audit-note-switch-starts-over: a new path shows nothing until its own note arrives', async () => {
  const c = controlled();
  const { result, rerender } = renderHook(({ path }) => useNote(path), { wrapper: c.wrapper, initialProps: { path: 'A.md' } });
  await c.answerLast();
  expect(result.current.data?.path).toBe('A.md');

  rerender({ path: 'B.md' });
  // The old note must never be on screen under the new path: no data, still loading.
  expect(result.current.data).toBeUndefined();
  expect(result.current.loading).toBe(true);

  // A late answer for A (asked before the switch) never lands on B.
  await act(async () => c.pending[0]?.answer({ path: 'A.md', title: 'A.md' } as unknown as Note));
  expect(result.current.data).toBeUndefined();

  await c.answerLast();
  expect(result.current.data?.path).toBe('B.md');
  expect(result.current.loading).toBe(false);
});

it('R1 audit-note-switch-refresh-keeps: a refresh of the same path keeps the note on screen (no flash)', async () => {
  const c = controlled();
  const { result } = renderHook(({ path }) => useNote(path), { wrapper: c.wrapper, initialProps: { path: 'A.md' } });
  await c.answerLast();
  c.change();
  expect(c.pending).toHaveLength(2);
  expect(result.current.data?.path).toBe('A.md');
  await c.answerLast();
  expect(result.current.data?.path).toBe('A.md');
});

it('AC1 audit-note-switch-late-refresh: a refresh of the old path still on its way never replaces the new one', async () => {
  for (const order of ['old first', 'new first'] as const) {
    const c = controlled();
    const { result, rerender, unmount } = renderHook(({ path }) => useNote(path), { wrapper: c.wrapper, initialProps: { path: 'A.md' } });
    await c.answerLast();
    c.change(); // A's refresh, unanswered
    const refreshA = c.pending[1];
    rerender({ path: 'B.md' });
    const readB = c.pending[2];
    expect(readB?.path, order).toBe('B.md');
    if (order === 'old first') {
      await act(async () => refreshA?.answer(noteOf('A.md')));
      expect(result.current.data, order).toBeUndefined();
      expect(result.current.loading, order).toBe(true);
      await act(async () => readB?.answer(noteOf('B.md')));
    } else {
      await act(async () => readB?.answer(noteOf('B.md')));
      await act(async () => refreshA?.answer(noteOf('A.md')));
    }
    expect(result.current.data?.path, order).toBe('B.md');
    expect(result.current.loading, order).toBe(false);
    unmount();
  }
});

it('AC1 audit-note-switch-no-old-render: no render under the new path ever sees the old note', async () => {
  const c = controlled();
  const seen: { path: string; data: string | undefined; loading: boolean }[] = [];
  const { rerender } = renderHook(
    ({ path }) => {
      const r = useNote(path);
      seen.push({ path, data: r.data?.path, loading: r.loading });
      return r;
    },
    { wrapper: c.wrapper, initialProps: { path: 'A.md' } },
  );
  await c.answerLast();
  rerender({ path: 'B.md' });
  await c.answerLast();
  const underB = seen.filter((r) => r.path === 'B.md');
  expect(underB.length).toBeGreaterThan(0);
  expect(underB.filter((r) => r.data === 'A.md'), 'A rendered under B').toEqual([]);
  expect(underB.filter((r) => r.data === undefined && !r.loading), 'B shown as loaded with nothing').toEqual([]);
});

it('AC1 audit-note-switch-error-belongs: an error for the old path is gone on the new one, which shows only its own', async () => {
  const c = controlled();
  const { result, rerender } = renderHook(({ path }) => useNote(path), { wrapper: c.wrapper, initialProps: { path: 'A.md' } });
  await act(async () => c.pending[0]?.fail(new BowerError('unknown', 'A failed.')));
  expect(result.current.error?.message).toBe('A failed.');

  rerender({ path: 'B.md' });
  expect(result.current.error).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => c.pending[1]?.fail(new BowerError('unknown', 'B failed.')));
  expect(result.current.error?.message).toBe('B failed.');
  expect(result.current.data).toBeUndefined();

  // A loaded, then a failing B: B shows its own error and none of A.
  rerender({ path: 'A.md' });
  await c.answerLast();
  expect(result.current.data?.path).toBe('A.md');
  rerender({ path: 'B.md' });
  await act(async () => c.pending[3]?.fail(new BowerError('unknown', 'B failed again.')));
  expect(result.current.error?.message).toBe('B failed again.');
  expect(result.current.data).toBeUndefined();
});

it("AC1 audit-note-switch-task-tick: the old note's tasks leave with it and the new note's own task ticks on the new note", async () => {
  const c = controlled();
  let go: NavigateFunction = () => undefined;
  function Nav() {
    go = useNavigate();
    return null;
  }
  render(
    <MemoryRouter initialEntries={['/note/A.md']}>
      <DataProvider sources={c.sources}><Nav /><NoteScreen /></DataProvider>
    </MemoryRouter>,
  );
  const readA = c.pending.find((p) => p.path === 'A.md');
  await act(async () => readA?.answer(noteOf('A.md', '- [ ] Water the mint.')));
  expect(screen.getByRole('checkbox', { name: 'Water the mint.' })).toBeInTheDocument();

  act(() => void go('/note/B.md'));
  expect(c.pending.some((p) => p.path === 'B.md'), 'B is being read').toBe(true);
  expect(screen.queryByRole('heading', { name: 'A.md' }), 'A off screen while B loads').toBeNull();
  expect(screen.queryByRole('checkbox'), 'no task box to tick while B loads').toBeNull();
  expect(c.toggleTask).not.toHaveBeenCalled();

  const readB = c.pending.find((p) => p.path === 'B.md');
  await act(async () => readB?.answer(noteOf('B.md', '- [ ] Buy soil.')));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Buy soil.' }));
  expect(c.toggleTask.mock.calls).toEqual([['B.md', 0]]);
});
