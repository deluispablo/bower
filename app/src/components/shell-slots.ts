/**
 * Lets the note screen fill two places in the shell (#144): the desktop
 * header's breadcrumb and the "About this note" third column. `Layout`
 * wraps `Router` (`app.tsx`), so it renders before, and above, the route
 * that has the content for those places — a route cannot pass `Layout`
 * props the ordinary way. `ShellSlotsProvider`, placed around both in
 * `app.tsx`, holds the current content instead; `Layout` reads it with
 * `useShellSlots`, a route sets it with `useShellSlot`.
 *
 * Memoize what you pass to `useShellSlot` (`useMemo`, keyed on the data
 * behind it, not on a value that changes every render). A plain JSX element
 * is a new object on every render; passed unmemoized, it would refill the
 * slot — and so re-render the whole shell — on every render of the route,
 * not just when the content actually changes.
 *
 * With no provider above (a test mounting `Layout` or a route on its own),
 * the slots simply read as empty and setting one is a no-op: no test needs
 * a provider just to render.
 */

import { createContext, h } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';

export type ShellSlot = 'crumb' | 'aside';

interface ShellSlotsState {
  crumb: ComponentChildren;
  aside: ComponentChildren;
}

interface ShellSlotsApi extends ShellSlotsState {
  setCrumb: (value: ComponentChildren) => void;
  setAside: (value: ComponentChildren) => void;
}

function noop(): void {
  // No provider above: filling a slot does nothing.
}

const DEFAULT_API: ShellSlotsApi = {
  crumb: null,
  aside: null,
  setCrumb: noop,
  setAside: noop,
};

const ShellSlotsContext = createContext<ShellSlotsApi>(DEFAULT_API);

export interface ShellSlotsProviderProps {
  children: ComponentChildren;
}

export function ShellSlotsProvider({
  children,
}: ShellSlotsProviderProps): JSX.Element {
  const [crumb, setCrumb] = useState<ComponentChildren>(null);
  const [aside, setAside] = useState<ComponentChildren>(null);
  return h(
    ShellSlotsContext.Provider,
    { value: { crumb, aside, setCrumb, setAside } },
    children,
  );
}

/** `Layout`: the slots' current content. */
export function useShellSlots(): ShellSlotsState {
  const { crumb, aside } = useContext(ShellSlotsContext);
  return { crumb, aside };
}

/**
 * A route: fills `slot` with `content` while mounted, clears it (back to
 * `null`) on unmount so the next route starts empty. See the file header
 * about memoizing `content`.
 */
export function useShellSlot(
  slot: ShellSlot,
  content: ComponentChildren,
): void {
  const { setCrumb, setAside } = useContext(ShellSlotsContext);
  const set = slot === 'crumb' ? setCrumb : setAside;
  useEffect(() => {
    set(content);
    return () => {
      set(null);
    };
  }, [set, content]);
}
