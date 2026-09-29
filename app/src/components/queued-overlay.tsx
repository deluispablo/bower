/**
 * Puts an overlay on the queue (R-OVL-1/2, spec §5 and D4).
 *
 * `<Queued id priority>{overlay}</Queued>` asks `overlay-queue.ts` to open
 * `overlay` while it is mounted and closes the entry when it unmounts. The
 * owner keeps its own state and hooks; the host (`OverlayHost`) draws the
 * latest `children` the owner rendered, so an overlay that changes while it
 * is open (a busy flag, a query) stays live. Nothing shows until the queue
 * says so: while another overlay is in front, this one waits.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { close, open } from '../overlay-queue.js';
import type { OverlayPriority } from '../overlay-queue.js';

interface Slot {
  node: ComponentChildren;
  listeners: Set<() => void>;
}

function Mirror({ slot }: { slot: Slot }): JSX.Element {
  const [, setTick] = useState(0);
  useEffect(() => {
    const update = (): void => {
      setTick((n) => n + 1);
    };
    slot.listeners.add(update);
    return () => {
      slot.listeners.delete(update);
    };
  }, [slot]);
  return <>{slot.node}</>;
}

export interface QueuedProps {
  id: string;
  priority: OverlayPriority;
  children: ComponentChildren;
}

export function Queued({ id, priority, children }: QueuedProps): null {
  const slot = useRef<Slot>({ node: children, listeners: new Set() });
  slot.current.node = children;

  // Every render of the owner reaches the overlay in front.
  useEffect(() => {
    for (const listener of Array.from(slot.current.listeners)) listener();
  });

  useEffect(() => {
    const current = slot.current;
    open({ id, priority, render: () => <Mirror slot={current} /> });
    return () => {
      close(id);
    };
  }, [id, priority]);

  return null;
}
