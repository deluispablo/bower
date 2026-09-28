/**
 * `/notes`, the Notes tab (#317, #589): the one explorer as a screen. Search,
 * a slot for the "Just filed" row (#616), Pinned, "Your folders" (the five
 * landmarks with their marks and meaning lines, a divider, the other
 * folders), the Health row and the hidden-files line at the bottom, and no
 * sort (`Explorer`'s `page` variant). Its one bar button, Expand/Collapse
 * all folders, lives in the header's `actions` slot instead of an inline
 * tools row, since that is where the Phone-Notes board puts it.
 */

import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';

import {
  COLLAPSE_LABEL,
  EXPAND_LABEL,
  Explorer,
  useExpandToggle,
  useHealthIsNew,
} from '../components/explorer.js';
import { IconCollapse } from '../components/icons.js';
import { useShellSlot } from '../components/shell-slots.js';

/** The phone top bar's title: a stable element, so it never refills the
 * shell's `crumb` slot on a re-render (`shell-slots.ts`). */
const CRUMB = <h1 class="topbar-title">Notes</h1>;

export function Notes(): JSX.Element {
  const healthIsNew = useHealthIsNew();
  const { expanded, collapseKey, expandKey, toggle } = useExpandToggle();

  const expandLabel = expanded ? COLLAPSE_LABEL : EXPAND_LABEL;
  const actions = useMemo(
    () => (
      <button
        type="button"
        class="icon-button"
        aria-label={expandLabel}
        title={expandLabel}
        onClick={toggle}
      >
        <IconCollapse />
      </button>
    ),
    // `toggle` is a new closure every render, but it only reads `expanded`,
    // which the label already tracks.
    [expandLabel],
  );

  useShellSlot('crumb', CRUMB);
  useShellSlot('actions', actions);

  return (
    <div class="notes-screen">
      <h1 class="screen-title">Notes</h1>
      <Explorer
        variant="page"
        healthIsNew={healthIsNew}
        collapseKey={collapseKey}
        expandKey={expandKey}
      />
    </div>
  );
}
