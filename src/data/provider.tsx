import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Sources, Unsubscribe } from './sources';
import { BowerError } from './types';

const Ctx = createContext<Sources | null>(null);

export function DataProvider({ sources, children }: { sources: Sources; children: ReactNode }) {
  return <Ctx.Provider value={sources}>{children}</Ctx.Provider>;
}

export function useSources(): Sources {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSources outside DataProvider');
  return s;
}

export interface Loaded<T> {
  data: T | undefined;
  error: BowerError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Reads something from a source and reads it again whenever the source says
 * it changed. Keeps the last good answer while a new one is on its way, so
 * screens do not flash.
 */
export function useLoad<T>(
  load: (s: Sources) => Promise<T>,
  subscribe: (s: Sources, cb: () => void) => Unsubscribe,
  deps: readonly unknown[] = [],
): Loaded<T> {
  const sources = useSources();
  const [state, setState] = useState<{ data: T | undefined; error: BowerError | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });
  const seq = useRef(0);

  const run = useCallback(() => {
    const n = ++seq.current;
    loadRef.current(sources).then(
      (data) => n === seq.current && setState({ data, error: null, loading: false }),
      (e: unknown) => {
        if (n !== seq.current) return;
        const err = e instanceof BowerError ? e : new BowerError('unknown', 'Something went wrong.');
        if (!(e instanceof BowerError)) console.error(e);
        setState((s) => ({ ...s, error: err, loading: false }));
      },
    );
  }, [sources]);

  useEffect(() => {
    run();
    return subscribe(sources, run);
    // deps are the caller's own (a path, an id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, run, ...deps]);

  return { ...state, reload: run };
}

export const useTree = () => useLoad((s) => s.vault.tree(), (s, cb) => s.vault.subscribe(cb));
export const usePiles = () => useLoad((s) => s.vault.piles(), (s, cb) => s.vault.subscribe(cb));
export const useQuestions = () => useLoad((s) => s.vault.questions(), (s, cb) => s.vault.subscribe(cb));
export const useRules = () => useLoad((s) => s.vault.rules(), (s, cb) => s.vault.subscribe(cb));
export const useSuggestions = () => useLoad((s) => s.vault.suggestions(), (s, cb) => s.vault.subscribe(cb));
export const useRun = () => useLoad((s) => s.runs.current(), (s, cb) => s.runs.subscribe(cb));
export const useNote = (path: string) =>
  useLoad((s) => s.vault.note(path), (s, cb) => s.vault.subscribe(cb), [path]);
export const useChanges = () => useLoad((s) => s.vault.changes(), (s, cb) => s.vault.subscribe(cb));
