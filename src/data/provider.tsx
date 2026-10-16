import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Sources, Unsubscribe } from './sources';
import { BowerError, type Rule } from './types';

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
  load: (s: Sources, again: boolean) => Promise<T>,
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

  const run = useCallback((again = false) => {
    const n = ++seq.current;
    loadRef.current(sources, again).then(
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
    run(false);
    return subscribe(sources, () => run(false));
    // deps are the caller's own (a path, an id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, run, ...deps]);

  // Only the person's reload asks again after a client error; mounts and listeners do not.
  const reload = useCallback(() => run(true), [run]);
  return { ...state, reload };
}

export const useTree = () => useLoad((s) => s.vault.tree(), (s, cb) => s.vault.subscribe(cb));
export const usePiles = () => useLoad((s) => s.vault.piles(), (s, cb) => s.vault.subscribe(cb));
export const usePilesListed = () => useLoad(async (s) => (await s.vault.pilesListed?.()) ?? null, (s, cb) => s.vault.subscribe(cb));
export const useQuestions = () => useLoad((s) => s.vault.questions(), (s, cb) => s.vault.subscribe(cb));
export const useRules = () => useLoad((s) => s.vault.rules(), (s, cb) => s.vault.subscribe(cb));
export const useRulesProse = () => useLoad(async (s) => (await s.vault.rulesProse?.()) ?? '', (s, cb) => s.vault.subscribe(cb));
/** The rules section's two reads as one: one error (the rules', else the prose's) and one retry for both. */
export function useRulesSection(): { rules: Rule[] | undefined; prose: string | undefined; error: BowerError | null; reload: () => void } {
  const rules = useRules();
  const prose = useRulesProse();
  return { rules: rules.data, prose: prose.data, error: rules.error ?? prose.error, reload: () => { rules.reload(); prose.reload(); } };
}
export const useSuggestions = () => useLoad((s) => s.vault.suggestions(), (s, cb) => s.vault.subscribe(cb));
export const useRun = () => useLoad((s, again) => s.runs.current({ again }), (s, cb) => s.runs.subscribe(cb));
export const useNote = (path: string) =>
  useLoad((s) => s.vault.note(path), (s, cb) => s.vault.subscribe(cb), [path]);
export const useFailedChanges = () => useLoad(async (s) => (await s.vault.failedChanges?.()) ?? [], (s, cb) => s.vault.subscribe(cb));
export const useChanges = () => useLoad((s) => s.vault.changes(), (s, cb) => s.vault.subscribe(cb));
export const useRequests = () => useLoad((s) => s.vault.requests(), (s, cb) => s.vault.subscribe(cb));
export const useUser = () => useLoad((s) => s.session.current(), (s, cb) => s.session.subscribe(cb));
