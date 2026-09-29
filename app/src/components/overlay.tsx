/**
 * The one overlay (R-OVL-1, spec §5 and D4, board System-Overlays).
 *
 * `Overlay` draws a modal: the scrim, the panel with its role and name,
 * and, for as long as it is mounted, `inert` on the page behind
 * (`#app > .shell`), a locked body scroll, a focus trap with Escape, and
 * focus back on the opener when it goes. A bottom sheet on phones; from
 * 900 px up a 440 px right panel, a centred 440 px dialog or a menu under
 * the control that opened it (`overlay.css`).
 *
 * Overlays do not mount themselves: they ask the queue (`overlay-queue.ts`)
 * to open, and `OverlayHost`, mounted once in the shell, renders the entry
 * in front. The host renders into `document.body`, outside the shell, so
 * the overlay itself is never inside the inert page.
 */

import { Fragment } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { currentOverlay, subscribeOverlays } from '../overlay-queue.js';
import type { OverlayEntry } from '../overlay-queue.js';
import { useFocusTrap } from './use-focus-trap.js';

import '../styles/overlay.css';

export type OverlayKind = 'sheet' | 'dialog' | 'menu';
export type OverlayPlacement = 'right' | 'center' | 'anchor';

interface OverlayBaseProps {
  kind: OverlayKind;
  onClose: () => void;
  children: ComponentChildren;
  /** Where it sits from 900 px up; the default follows `kind`. */
  desktopPlacement?: OverlayPlacement;
}

/** Named by a visible heading (`labelledBy`) or by a `label`, never neither. */
export type OverlayProps = OverlayBaseProps &
  (
    | { labelledBy: string; label?: never }
    | { label: string; labelledBy?: never }
  );

/** The page behind every overlay. */
export const OVERLAY_PAGE_SELECTOR = '#app > .shell';

const DEFAULT_PLACEMENT: Record<OverlayKind, OverlayPlacement> = {
  sheet: 'right',
  dialog: 'center',
  menu: 'anchor',
};

/** A menu under its opener stays this far from the window's edges. */
const ANCHOR_GAP = 8;
const ANCHOR_WIDTH = 280;

let locks = 0;
let savedOverflow = '';
let lockedPage: Element | null = null;

/** Makes the page inert and stops the body scrolling; returns the undo. */
function lockPage(): () => void {
  if (locks === 0) {
    lockedPage = document.querySelector(OVERLAY_PAGE_SELECTOR);
    lockedPage?.setAttribute('inert', '');
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks += 1;
  return () => {
    locks -= 1;
    if (locks > 0) return;
    locks = 0;
    lockedPage?.removeAttribute('inert');
    lockedPage = null;
    document.body.style.overflow = savedOverflow;
  };
}

/** Places a desktop menu under `opener`, kept inside the window. */
function anchorTo(panel: HTMLElement, opener: Element | null): void {
  if (opener === null || opener === document.body) return;
  const rect = opener.getBoundingClientRect();
  const maxLeft = window.innerWidth - ANCHOR_WIDTH - ANCHOR_GAP;
  const left = Math.max(ANCHOR_GAP, Math.min(rect.left, maxLeft));
  panel.style.setProperty('--overlay-anchor-top', `${rect.bottom + 4}px`);
  panel.style.setProperty('--overlay-anchor-left', `${left}px`);
}

export function Overlay(props: OverlayProps): JSX.Element {
  const { kind, onClose, children } = props;
  const placement = props.desktopPlacement ?? DEFAULT_PLACEMENT[kind];
  const panel = useRef<HTMLDivElement>(null);

  // Runs before the focus trap's effect, so the opener still has focus.
  useLayoutEffect(() => {
    const element = panel.current;
    if (element !== null && placement === 'anchor') {
      anchorTo(element, document.activeElement);
    }
    return lockPage();
  }, [placement]);

  useFocusTrap(panel, onClose);

  const dialog = kind !== 'menu';
  return (
    <div class={`overlay overlay--${kind} overlay--desktop-${placement}`}>
      <div class="overlay-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        class="overlay-panel"
        role={dialog ? 'dialog' : 'menu'}
        aria-modal={dialog ? 'true' : undefined}
        aria-labelledby={props.labelledBy}
        aria-label={props.label}
        tabIndex={-1}
      >
        <div class="overlay-grab" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/** Renders the overlay in front of the queue, if any. Mounted once. */
export function OverlayHost(): JSX.Element | null {
  const [entry, setEntry] = useState<OverlayEntry | null>(currentOverlay);

  useEffect(() => {
    setEntry(currentOverlay());
    return subscribeOverlays(() => {
      setEntry(currentOverlay());
    });
  }, []);

  if (entry === null) return null;
  // Keyed by id: the next overlay mounts fresh (its own trap and animation).
  return createPortal(
    <Fragment key={entry.id}>{entry.render()}</Fragment>,
    document.body,
  );
}
