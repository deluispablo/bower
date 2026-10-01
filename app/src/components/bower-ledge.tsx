/**
 * The desktop sidebar's ledge bird is gone: no board draws it (#950 D-1).
 * What is left is `useBirdRoom`, used by the phone bar (`run-chip.tsx`): a
 * bird that counts in the presence store must not hide itself, so it subtracts its own
 * registration from the count before asking whether it is alone.
 */

import { useLayoutEffect, useRef } from 'preact/hooks';

import { useBirdCount } from '../bird-presence.js';

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
