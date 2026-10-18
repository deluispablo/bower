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
  /**
   * Resolves (never rejects) once the newest read has landed and is on screen, a read replaced by a newer one not counting
   * (TanStack Query: a mutation waits for the refetch). At once if nothing is in flight or the reader is unmounted.
   */
  settled: () => Promise<void>;
}

const sameDeps = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Reads something from a source and reads it again whenever the source says
 * it changed. Keeps the last good answer while a new one is on its way, so
 * screens do not flash; new deps (another note) start over, since that answer
 * belongs to the deps it was read for.
 */
export function useLoad<T>(
  load: (s: Sources, again: boolean) => Promise<T>,
  subscribe: (s: Sources, cb: () => void) => Unsubscribe,
  deps: readonly unknown[] = [],
): Loaded<T> {
  const sources = useSources();
  type State = { data: T | undefined; error: BowerError | null; loading: boolean; deps: readonly unknown[] };
  const [kept, setState] = useState<State>({ data: undefined, error: null, loading: true, deps });
  let state = kept;
  if (!sameDeps(kept.deps, deps)) {
    // Adjusting state while rendering when a prop changes (React: you might not need an effect); this render shows it too.
    state = { data: undefined, error: null, loading: true, deps };
    setState(state);
  }
  const loadRef = useRef({ load, deps });
  useLayoutEffect(() => {
    loadRef.current = { load, deps };
  });
  const seq = useRef(0);
  // `landed`: the newest read that answered; `shown`: the newest answer committed to the screen (layout effect below).
  const landed = useRef(0);
  const shown = useRef(0);
  const alive = useRef(true);
  const waiters = useRef<Array<() => void>>([]);
  const release = useCallback(() => {
    if (alive.current && shown.current !== seq.current) return;
    waiters.current.splice(0).forEach((done) => done());
  }, []);
  useLayoutEffect(() => {
    shown.current = landed.current;
    release();
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      release();
    };
  }, [release]);

  const run = useCallback((again = false) => {
    const n = ++seq.current;
    const { load: read, deps: asked } = loadRef.current;
    // An answer lands only on the deps it was asked for (seq orders answers for the same deps).
    const mine = (s: State) => sameDeps(s.deps, asked);
    read(sources, again).then(
      (data) => {
        if (n !== seq.current) return;
        landed.current = n;
        setState((s) => (mine(s) ? { data, error: null, loading: false, deps: s.deps } : s));
      },
      (e: unknown) => {
        if (n !== seq.current) return;
        landed.current = n;
        const err = e instanceof BowerError ? e : new BowerError('unknown', 'Something went wrong.');
        if (!(e instanceof BowerError)) console.error(e);
        setState((s) => (mine(s) ? { ...s, error: err, loading: false } : s));
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
  const settled = useCallback(
    () => (!alive.current || shown.current === seq.current ? Promise.resolve() : new Promise<void>((done) => waiters.current.push(done))),
    [],
  );
  return { data: state.data, error: state.error, loading: state.loading, reload, settled };
}

export const useTree = () => useLoad((s) => s.vault.tree(), (s, cb) => s.vault.subscribe(cb));
export const usePiles = () => useLoad((s) => s.vault.piles(), (s, cb) => s.vault.subscribe(cb));
export const usePilesListed = () => useLoad(async (s) => (await s.vault.pilesListed?.()) ?? null, (s, cb) => s.vault.subscribe(cb));
export const useQuestions = () => useLoad((s) => s.vault.questions(), (s, cb) => s.vault.subscribe(cb));
export const useRules = () => useLoad((s) => s.vault.rules(), (s, cb) => s.vault.subscribe(cb));
export const useRulesProse = () => useLoad(async (s) => (await s.vault.rulesProse?.()) ?? '', (s, cb) => s.vault.subscribe(cb));
/** The rules section's two reads as one: one error (the rules', else the prose's) and one retry for both. */
export function useRulesSection(): {
  rules: Rule[] | undefined;
  prose: string | undefined;
  error: BowerError | null;
  reload: () => void;
  /** The rules list has shown what the last change left (see `Loaded.settled`). */
  settled: () => Promise<void>;
} {
  const rules = useRules();
  const prose = useRulesProse();
  return { rules: rules.data, prose: prose.data, error: rules.error ?? prose.error, reload: () => { rules.reload(); prose.reload(); }, settled: rules.settled };
}
export const useSuggestions = () => useLoad((s) => s.vault.suggestions(), (s, cb) => s.vault.subscribe(cb));
export const useRun = () => useLoad((s, again) => s.runs.current({ again }), (s, cb) => s.runs.subscribe(cb));
export const useNote = (path: string) =>
  useLoad((s) => s.vault.note(path), (s, cb) => s.vault.subscribe(cb), [path]);
export const useFailedChanges = () => useLoad(async (s) => (await s.vault.failedChanges?.()) ?? [], (s, cb) => s.vault.subscribe(cb));
export const useChanges = () => useLoad((s) => s.vault.changes(), (s, cb) => s.vault.subscribe(cb));
export const useRequests = () => useLoad((s) => s.vault.requests(), (s, cb) => s.vault.subscribe(cb));
export const useUser = () => useLoad((s) => s.session.current(), (s, cb) => s.session.subscribe(cb));
