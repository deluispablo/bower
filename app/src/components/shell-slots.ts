/**
 * Lets a screen fill four places in the shell (#144, #318): the top bar's
 * Back link (`back`, shown on an inner screen;
 * `Layout` falls back to Back to Home when a screen leaves it empty), the header's
 * breadcrumb (the desktop breadcrumb, or the phone back link, in place of
 * the wordmark), the header's `actions` slot next to the Tidy up pill (the
 * phone "Open in Drive" icon button), and the "About this note" third
 * column. `Layout` wraps `Router` (`app.tsx`), so it renders before, and
 * above, the route that has the content for those places — a route cannot
 * pass `Layout` props the ordinary way. `ShellSlotsProvider`, placed around
 * both in `app.tsx`, holds the current content instead; `Layout` reads it
 * with `useShellSlots`, a route sets it with `useShellSlot`.
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

/** The tab's label and the sidebar landmark's name (#906, owner review
 * O-R5), re-exported so the shell's other parts (the explorer, the drawer)
 * name them from one place. */
export { FOLDERS_LANDMARK, FOLDERS_TAB_LABEL } from '../shell-routes.js';

/*
 * v5 (#741) reserves four more places, all empty by default, so the issues
 * that fill them never edit the shell: `tidyBar` (the tidy-up bar: docked
 * above the phone tab bar, a chip in the desktop top bar), `uploadChip` (the
 * upload chip, same place; the tidy-up bar wins when both are set, spec
 * 6.15b) and `breadcrumb` (the desktop top bar's own breadcrumb).
 */
export type ShellSlot =
  | 'back'
  | 'crumb'
  | 'actions'
  | 'aside'
  | 'tidyBar'
  | 'uploadChip'
  | 'breadcrumb';

interface ShellSlotsState {
  back: ComponentChildren;
  crumb: ComponentChildren;
  actions: ComponentChildren;
  aside: ComponentChildren;
  tidyBar: ComponentChildren;
  uploadChip: ComponentChildren;
  breadcrumb: ComponentChildren;
}

type ShellSlotsSetters = {
  [K in ShellSlot as `set${Capitalize<K>}`]: (value: ComponentChildren) => void;
};

interface ShellSlotsApi extends ShellSlotsState, ShellSlotsSetters {}

function noop(): void {
  // No provider above: filling a slot does nothing.
}

const DEFAULT_API: ShellSlotsApi = {
  back: null,
  crumb: null,
  actions: null,
  aside: null,
  tidyBar: null,
  uploadChip: null,
  breadcrumb: null,
  setBack: noop,
  setCrumb: noop,
  setActions: noop,
  setAside: noop,
  setTidyBar: noop,
  setUploadChip: noop,
  setBreadcrumb: noop,
};

const ShellSlotsContext = createContext<ShellSlotsApi>(DEFAULT_API);

export interface ShellSlotsProviderProps {
  children: ComponentChildren;
}

export function ShellSlotsProvider({
  children,
}: ShellSlotsProviderProps): JSX.Element {
  const [back, setBack] = useState<ComponentChildren>(null);
  const [crumb, setCrumb] = useState<ComponentChildren>(null);
  const [actions, setActions] = useState<ComponentChildren>(null);
  const [aside, setAside] = useState<ComponentChildren>(null);
  const [tidyBar, setTidyBar] = useState<ComponentChildren>(null);
  const [uploadChip, setUploadChip] = useState<ComponentChildren>(null);
  const [breadcrumb, setBreadcrumb] = useState<ComponentChildren>(null);
  return h(
    ShellSlotsContext.Provider,
    {
      value: {
        back,
        crumb,
        actions,
        aside,
        tidyBar,
        uploadChip,
        breadcrumb,
        setBack,
        setCrumb,
        setActions,
        setAside,
        setTidyBar,
        setUploadChip,
        setBreadcrumb,
      },
    },
    children,
  );
}

/** `Layout`: the slots' current content. */
export function useShellSlots(): ShellSlotsState {
  const { back, crumb, actions, aside, tidyBar, uploadChip, breadcrumb } =
    useContext(ShellSlotsContext);
  return {
    back,
    crumb,
    actions,
    aside,
    tidyBar,
    uploadChip,
    breadcrumb,
  };
}

const SETTERS: Record<ShellSlot, keyof ShellSlotsSetters> = {
  back: 'setBack',
  crumb: 'setCrumb',
  actions: 'setActions',
  aside: 'setAside',
  tidyBar: 'setTidyBar',
  uploadChip: 'setUploadChip',
  breadcrumb: 'setBreadcrumb',
};

/**
 * A route: fills `slot` with `content` while mounted, clears it (back to
 * `null`) on unmount so the next route starts empty. See the file header
 * about memoizing `content`.
 */
export function useShellSlot(
  slot: ShellSlot,
  content: ComponentChildren,
): void {
  const api = useContext(ShellSlotsContext);
  const set = api[SETTERS[slot]];
  useEffect(() => {
    set(content);
    return () => {
      set(null);
    };
  }, [set, content]);
}
