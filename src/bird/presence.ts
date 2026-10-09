import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { BirdEngine } from './engine';

/**
 * One animated Bower per screen. Every bird registers here; the newest bird
 * with the highest priority (an overlay outranks the page) is the one that
 * moves, every other bird holds still. A minor bird (the run chip's) never
 * takes the turn and never outranks another bird.
 */
interface Entry {
  id: string;
  priority: number;
  order: number;
  minor: boolean;
  /** The bird's engine while it moves: where d-v2-24's `react()` finds the bird to act on. */
  handle: BirdEngine | null;
}
let entries: Entry[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function activeId(): string | null {
  let best: Entry | null = null;
  for (const e of entries) {
    if (e.minor) continue;
    if (!best || e.priority > best.priority || (e.priority === best.priority && e.order > best.order)) best = e;
  }
  return best?.id ?? null;
}

/**
 * The engine of the bird holding the turn, or null while that bird is still.
 * @public d-v2-24's `react()` calls it; nothing in the app does yet.
 */
export function activeHandle(): BirdEngine | null {
  const id = activeId();
  return entries.find((e) => e.id === id)?.handle ?? null;
}

export interface BirdTurn {
  turn: boolean;
  /** Hands presence this bird's engine (null when it has none). */
  setHandle: (handle: BirdEngine | null) => void;
}

export function useBirdTurn(priority = 0, { minor = false }: { minor?: boolean } = {}): BirdTurn {
  const id = useId();
  const handle = useRef<BirdEngine | null>(null);
  useEffect(() => {
    entries = [...entries, { id, priority, order: ++counter, minor, handle: handle.current }];
    emit();
    return () => {
      entries = entries.filter((e) => e.id !== id);
      emit();
    };
  }, [id, priority, minor]);
  const setHandle = useCallback(
    (h: BirdEngine | null) => {
      handle.current = h;
      const entry = entries.find((e) => e.id === id);
      if (entry) entry.handle = h;
    },
    [id],
  );
  const active = useSyncExternalStore(subscribe, activeId, activeId);
  return { turn: active === id, setHandle };
}

const topPriority = (): number => entries.reduce((m, e) => (e.minor ? m : Math.max(m, e.priority)), -Infinity);

/** True while a bird of a higher priority (an overlay's) is on screen: this one steps out of sight. */
export function useOutranked(priority = 0): boolean {
  const top = useSyncExternalStore(subscribe, topPriority, topPriority);
  return top > priority;
}
