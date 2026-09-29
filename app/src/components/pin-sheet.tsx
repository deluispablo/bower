/**
 * The pin actions for one drawer or tree row (spec §14, issue #216): a
 * bottom sheet under 900 px (opened by a held drawer row, `tree.tsx`,
 * `use-long-press.ts`), a menu pinned under the row from 900 px up (opened
 * by a tree row's own `contextmenu`, right-click or the keyboard's Menu
 * key) — one component, `pin-sheet.css`'s breakpoint switches the
 * presentation, the same way `note-menu.tsx` already does for the note's
 * own menu. Rows: Pin to Home (or Unpin, `pinned`), Open the folder (the
 * row itself for a folder, its containing folder for a note — useful
 * either way, since a folder row only toggles open/closed here), Ask Bower
 * about this note/folder, Open in Drive, Cancel.
 *
 * It is an `Overlay` menu named by the row (`aria-label={name}`): the scrim,
 * focus trap, Escape, inert page and scroll lock come from `overlay.tsx`
 * (R-OVL-2). It portals into `document.body`, outside the inert shell.
 */

import type { JSX } from 'preact';

import { IconChat, IconExternalLink, IconFolder, IconPin } from './icons.js';
import { Overlay } from './overlay.js';
import { Queued } from './queued-overlay.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import '../styles/pin-sheet.css';

export interface PinSheetProps {
  kind: 'note' | 'folder';
  /** The row's own name, for the dialog's `aria-label` and the "Ask Bower"
   * row's wording. */
  name: string;
  pinned: boolean;
  /** The row's own folder screen (a folder row) or its containing folder
   * (a note row). */
  openHref: string;
  /** "Ask Bower about this": opens the send-to-Bower sheet. */
  onAsk: () => void;
  driveHref: string;
  onTogglePin: () => void;
  onClose: () => void;
}

export function PinSheet({
  kind,
  name,
  pinned,
  openHref,
  onAsk,
  driveHref,
  onTogglePin,
  onClose,
}: PinSheetProps): JSX.Element {
  function selectAndClose(action: () => void): () => void {
    return () => {
      onClose();
      action();
    };
  }

  return (
    <Queued id="pin-sheet" priority={OVERLAY_PRIORITY.own}>
      <Overlay kind="menu" label={name} onClose={onClose}>
        <div class="pin-sheet-rows">
          <button
            type="button"
            role="menuitem"
            class="pin-sheet-row"
            onClick={selectAndClose(onTogglePin)}
          >
            <IconPin />
            <span>{pinned ? 'Unpin from Home' : 'Pin to Home'}</span>
          </button>
          <a
            role="menuitem"
            class="pin-sheet-row"
            href={openHref}
            onClick={onClose}
          >
            <IconFolder />
            <span>Open the folder</span>
          </a>
          <button
            type="button"
            role="menuitem"
            class="pin-sheet-row"
            onClick={selectAndClose(onAsk)}
          >
            <IconChat />
            <span>Ask Bower about this {kind}</span>
          </button>
          <a
            role="menuitem"
            class="pin-sheet-row"
            href={driveHref}
            target="_blank"
            rel="noopener"
            onClick={onClose}
          >
            <IconExternalLink />
            <span>Open in Drive</span>
          </a>
          <button
            type="button"
            role="menuitem"
            class="pin-sheet-row pin-sheet-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </Overlay>
    </Queued>
  );
}
