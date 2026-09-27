/**
 * `/notes`, the Notes tab (#317): the full tree with its filter field and
 * the Health row, the same explorer the drawer and the desktop sidebar show,
 * laid out as a screen of its own (`Explorer`'s `page` variant). The Notes
 * tab's own design (no sort, the hidden-files line at the bottom) is #353.
 */

import type { JSX } from 'preact';

import { Explorer, useHealthIsNew } from '../components/explorer.js';
import { useShellSlot } from '../components/shell-slots.js';

/** The phone top bar's title: a stable element, so it never refills the
 * shell's `crumb` slot on a re-render (`shell-slots.ts`). */
const CRUMB = <h1 class="topbar-title">Notes</h1>;

export function Notes(): JSX.Element {
  const healthIsNew = useHealthIsNew();
  useShellSlot('crumb', CRUMB);
  return (
    <div class="notes-screen">
      <h1 class="screen-title">Notes</h1>
      <Explorer variant="page" healthIsNew={healthIsNew} />
    </div>
  );
}
