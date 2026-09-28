/**
 * `/notes`, the Notes tab (#317): the search row, the tree (root folders
 * with their meaning and count, projects expandable), the Health row and
 * the hidden-files line at the bottom, and no sort — the same explorer the
 * drawer and the desktop sidebar show, laid out as a screen of its own
 * (`Explorer`'s `page` variant, #353, C.5). Its one bar button —
 * Expand/Collapse all — lives in the header's `actions` slot instead of an
 * inline tools row, since that is where the Phone-Notes board puts it.
 */

import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';

import { Explorer, useHealthIsNew } from '../components/explorer.js';
import { IconCollapse } from '../components/icons.js';
import { useShellSlot } from '../components/shell-slots.js';

/** The phone top bar's title: a stable element, so it never refills the
 * shell's `crumb` slot on a re-render (`shell-slots.ts`). */
const CRUMB = <h1 class="topbar-title">Notes</h1>;

export function Notes(): JSX.Element {
  const healthIsNew = useHealthIsNew();
  const [collapseKey, setCollapseKey] = useState(0);
  const [expandKey, setExpandKey] = useState(0);
  // Tracks the toggle's own last action, not the tree's real state (a
  // folder a person expands or collapses by hand doesn't flip it back):
  // simple on purpose, same as a one-way Collapse all would have been.
  const [expanded, setExpanded] = useState(false);

  function toggleExpandCollapse(): void {
    if (expanded) setCollapseKey((key) => key + 1);
    else setExpandKey((key) => key + 1);
    setExpanded((was) => !was);
  }

  const expandLabel = expanded ? 'Collapse all' : 'Expand all';
  const actions = useMemo(
    () => (
      <button
        type="button"
        class="icon-button"
        aria-label={expandLabel}
        title={expandLabel}
        onClick={toggleExpandCollapse}
      >
        <IconCollapse />
      </button>
    ),
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
