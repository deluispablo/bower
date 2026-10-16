import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it } from 'vitest';
import { DataProvider, useNote } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Note } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';

afterEach(cleanup);

/** A vault whose note reads wait until the test answers them, and whose change listener the test can call. */
function controlled() {
  const pending: { path: string; answer: (n: Note) => void }[] = [];
  let changed = (): void => undefined;
  const base = loadingSources();
  const vault = new Proxy(base.vault, {
    get: (target, key) => {
      if (key === 'note') return (path: string) => new Promise<Note>((answer) => pending.push({ path, answer }));
      if (key === 'subscribe') return (cb: () => void) => { changed = cb; return () => undefined; };
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
  return { wrapper, pending, answerLast, change: () => act(() => changed()) };
}

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
