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
  /**
   * A scrim tap this many ms after the overlay opened is ignored (#510): a
   * fast double-tap on the opener can land its second tap on the scrim that
   * now covers the same spot. Off by default; Escape is never guarded.
   */
  scrimGuardMs?: number;
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
  // Under the opener; above it when there is no room below; clamped into
  // the window when neither side fits.
  const height = panel.offsetHeight;
  const below = rect.bottom + 4;
  const above = rect.top - 4 - height;
  const lowest = window.innerHeight - height - ANCHOR_GAP;
  let top = below;
  if (below > lowest) top = above >= ANCHOR_GAP ? above : lowest;
  top = Math.max(ANCHOR_GAP, top);
  panel.style.setProperty('--overlay-anchor-top', `${top}px`);
  panel.style.setProperty('--overlay-anchor-left', `${left}px`);
}

const MENU_ITEMS =
  '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]';

/** Where focus goes when the control that opened an overlay is gone. */
function focusFallback(): void {
  const active = document.activeElement;
  if (active !== null && active !== document.body) return;
  const heading = document.querySelector<HTMLElement>('#app h1');
  if (heading !== null) {
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus();
    return;
  }
  document
    .querySelector<HTMLElement>(
      '#app a[href], #app button:not([disabled]), #app input:not([disabled])',
    )
    ?.focus();
}

export function Overlay(props: OverlayProps): JSX.Element {
  const { kind, onClose, children } = props;
  const placement = props.desktopPlacement ?? DEFAULT_PLACEMENT[kind];
  const panel = useRef<HTMLDivElement>(null);

  const opener = useRef<HTMLElement | null>(null);
  // Set on the first render, not in an effect, so a second tap that arrives
  // before the next paint still reads the open time.
  const openedAt = useRef(Date.now());
  const guardMs = props.scrimGuardMs ?? 0;
  const onScrim = (): void => {
    if (Date.now() - openedAt.current < guardMs) return;
    onClose();
  };

  // Runs before `lockPage()` makes the page inert (which blurs the opener)
  // and before the focus trap's effect, so the opener is still focused.
  useLayoutEffect(() => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    const element = panel.current;
    if (element !== null && placement === 'anchor') {
      anchorTo(element, active);
    }
    return lockPage();
  }, [placement]);

  useFocusTrap(panel, onClose, opener);

  // Declared after the trap, so it runs after focus went back to the opener:
  // an opener that unmounted meanwhile (the run chip) leaves BODY focused.
  useEffect(
    () => () => {
      queueMicrotask(focusFallback);
    },
    [],
  );

  // WAI-ARIA menu: arrows, Home and End rove; Tab closes the menu.
  const onMenuKey = (
    event: JSX.TargetedKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (kind !== 'menu') return;
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const panelEl = event.currentTarget;
    let items = Array.from(panelEl.querySelectorAll<HTMLElement>(MENU_ITEMS));
    if (items.length === 0) {
      items = Array.from(
        panelEl.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]'),
      );
    }
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (at + 1) % items.length;
        break;
      case 'ArrowUp':
        next = at <= 0 ? items.length - 1 : at - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  };

  const dialog = kind !== 'menu';
  // Always portalled to the body, whoever renders it: an overlay drawn
  // inside `#app > .shell` would sit in the page it makes inert.
  return createPortal(
    <div class={`overlay overlay--${kind} overlay--desktop-${placement}`}>
      <div class="overlay-scrim" aria-hidden="true" onClick={onScrim} />
      <div
        ref={panel}
        class="overlay-panel"
        role={dialog ? 'dialog' : 'menu'}
        aria-modal={dialog ? 'true' : undefined}
        aria-labelledby={props.labelledBy}
        aria-label={props.label}
        tabIndex={-1}
        onKeyDown={onMenuKey}
      >
        <div class="overlay-grab" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
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
