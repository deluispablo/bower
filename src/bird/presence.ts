import { useEffect, useId, useSyncExternalStore } from 'react';

/**
 * One animated Bower per screen. Every bird registers here; the newest bird
 * with the highest priority (an overlay outranks the page) is the one that
 * moves, every other bird holds still.
 */
interface Entry {
  id: string;
  priority: number;
  order: number;
}
let entries: Entry[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

function activeId(): string | null {
  let best: Entry | null = null;
  for (const e of entries) {
    if (!best || e.priority > best.priority || (e.priority === best.priority && e.order > best.order)) best = e;
  }
  return best?.id ?? null;
}

export function useBirdTurn(priority = 0): boolean {
  const id = useId();
  useEffect(() => {
    entries = [...entries, { id, priority, order: ++counter }];
    emit();
    return () => {
      entries = entries.filter((e) => e.id !== id);
      emit();
    };
  }, [id, priority]);
  const active = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    activeId,
    activeId,
  );
  return active === id;
}

const topPriority = (): number => entries.reduce((m, e) => Math.max(m, e.priority), -Infinity);

/** True while a bird of a higher priority (an overlay's) is on screen: this one steps out of sight. */
export function useOutranked(priority = 0): boolean {
  const top = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    topPriority,
    topPriority,
  );
  return top > priority;
}
