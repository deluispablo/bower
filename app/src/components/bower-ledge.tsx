/**
 * Bower's ledge (R-BIRD-4, spec 6.21): on a computer he rests on a 66 px
 * ledge at the foot of the sidebar whenever no other bird is on screen, and
 * flies with a paper while a run goes. The ledge is the shell's `ledge` slot
 * (#741), which is `aria-hidden`: it is decoration, the header chip is the
 * control and the status. `BowerLedgeFiller` fills the slot; it is mounted
 * by `RunChipFiller`, which already knows the run.
 *
 * `useBirdRoom` is shared with the phone bar (`run-chip.tsx`): a bird that
 * counts in the presence store must not hide itself, so it subtracts its own
 * registration from the count before asking whether it is alone.
 */

import type { JSX } from 'preact';
import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';

import { useBirdCount } from '../bird-presence.js';
import { useRun } from '../run-store.js';
import { useMediaQuery } from '../use-media-query.js';
import { Bird } from './bird.js';
import { useShellSlot } from './shell-slots.js';

import '../styles/bower-ledge.css';

/**
 * Whether a bird wanted by `want` may be drawn: no other bird is on screen.
 * `counts` says whether the bird it draws registers in the presence store (a
 * perched bird does not), so its own registration is not held against it.
 */
export function useBirdRoom(want: boolean, counts: boolean): boolean {
  const count = useBirdCount();
  const mine = useRef(false);
  const room = want && count - (mine.current ? 1 : 0) === 0;
  // Children register in their layout effect, before this one runs.
  useLayoutEffect(() => {
    mine.current = room && counts;
  });
  return room;
}

/** Pure: whether a run is going, from the run store's phase. */
export function isRunning(phase: string): boolean {
  return phase === 'starting' || phase === 'queued' || phase === 'running';
}

export interface LedgeProps {
  running: boolean;
}

export function BowerLedge({ running }: LedgeProps): JSX.Element | null {
  const room = useBirdRoom(true, running);
  if (!room) return null;
  return (
    <div class="bower-ledge">
      <span class="bower-ledge-line" />
      <span class="bower-ledge-bird">
        <Bird state={running ? 'flying' : 'perched'} size={52} />
      </span>
    </div>
  );
}

/** Fills the `ledge` slot from 900 px; renders nothing itself. */
export function BowerLedgeFiller(): null {
  const { phase } = useRun();
  const desktop = useMediaQuery('(min-width: 900px)');
  const running = isRunning(phase);
  const content = useMemo(
    () => (desktop ? <BowerLedge running={running} /> : null),
    [desktop, running],
  );
  useShellSlot('ledge', content);
  return null;
}
