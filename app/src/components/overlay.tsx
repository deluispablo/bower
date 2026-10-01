/**
 * The one overlay (R-OVL-1; #907, spec §3.8 to §3.11).
 *
 * `Overlay` draws a modal: the scrim, the panel with its role and name,
 * and, for as long as it is mounted, `inert` on the page behind
 * (`#app > .shell`), a locked body scroll, a focus trap with Escape, and
 * focus back on the opener when it goes.
 *
 * The contract (frozen in #907; #910 and every sheet build on it):
 *
 * | `kind`   | phone (< 900 px)             | desktop (>= 900 px)                  |
 * | -------- | ---------------------------- | ------------------------------------ |
 * | `sheet`  | content sheet, hugs, ✕       | side panel, `--panel-side` (440), ✕  |
 * | `menu`   | action sheet, hugs, Cancel   | popover 320 under its button         |
 * | `dialog` | sheet                        | the centred dialog (R-DIALOG-1 only) |
 *
 * `desktopPlacement` overrides the desktop column (`right`, `center`,
 * `anchor`). Inside, new consumers use `.overlay-body` for the padding of
 * each placement and `OverlayHeader` for the title and ✕, named with one
 * of `OverlayCloseLabel`. A content sheet has ✕ only, an action sheet
 * Cancel only, never both (R-SHEET-2, R-PANEL-2).
 *
 * Overlays do not mount themselves: they ask the queue (`overlay-queue.ts`)
 * to open, and `OverlayHost`, mounted once in the shell, renders the entry
 * in front. The host renders into `document.body`, outside the shell, so
 * the overlay itself is never inside the inert page.
 */

import { Fragment } from 'preact';
import { useLocation } from 'preact-iso';
import type { ComponentChildren, JSX, RefObject } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { currentOverlay, subscribeOverlays } from '../overlay-queue.js';
import type { OverlayEntry } from '../overlay-queue.js';
import { IconClose } from './icons.js';
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
   * How an `anchor` popover lines up with its button: `start` (the default,
   * the *-More boards) opens to the right from the button's left edge;
   * `end` puts its right edge on the button's and lifts it level with the
   * section heading above (PF/LI/GR-Filter-1280, #950 F-8).
   */
  desktopAlign?: 'start' | 'end';
  /**
   * A scrim tap this many ms after the overlay opened is ignored (#510): a
   * fast double-tap on the opener can land its second tap on the scrim that
   * now covers the same spot. Off by default; Escape is never guarded.
   */
  scrimGuardMs?: number;
  /**
   * What takes focus when the overlay opens, instead of its first control:
   * a selector inside the panel or a ref (the tour's main button). Left
   * out, or not found, the first control does.
   */
  initialFocus?: string | RefObject<HTMLElement>;
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
/** The popover's width (R-POP-1, `--popover-width`). */
export const POPOVER_WIDTH = 320;
/** The popover sits this far under (or over) its button (spec §3.10). */
const ANCHOR_OFFSET = 6;
/** An `end` popover's top sits this far above its button's top, level with
 * the section heading over the button (PF-Filter-1280: top 212, button 232). */
const END_LIFT = 20;

/**
 * Every ✕ name, exactly as the boards' `aria-label`s (#907). A consumer
 * passes one of these to `OverlayHeader`; nothing else names a close.
 */
export const OVERLAY_CLOSE_LABELS = [
  'Close Help',
  'Close Ask Bower',
  'Close the rule',
  'Close the pile',
  'Close the tidy-up',
  'Close the tidy-up result',
  'Close Sort by',
  'Close Columns',
  'Close About this note',
  'Close About this file',
  'Close Rename',
  'Close Add a paragraph',
  'Close Move to',
  'Close Filter and sort',
  'Close Search',
  'Close your folders',
] as const;

export type OverlayCloseLabel = (typeof OVERLAY_CLOSE_LABELS)[number];

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

/**
 * Places a desktop popover 6 px under `opener`, opening to the right from
 * the button's left edge (the *-More boards win over spec §3.10's right
 * alignment, #920 DA-4), kept inside the window: flipped above when there
 * is no room below, and pulled left when the button is near the right edge.
 * `end` (#950 F-8) puts the right edge on the button's instead, its top
 * level with the heading over the button.
 */
function anchorTo(
  panel: HTMLElement,
  opener: Element | null,
  align: 'start' | 'end',
): void {
  if (opener === null || opener === document.body) return;
  const rect = opener.getBoundingClientRect();
  const width = Math.min(POPOVER_WIDTH, window.innerWidth * 0.88);
  const maxLeft = window.innerWidth - width - ANCHOR_GAP;
  const wanted = align === 'end' ? rect.right - width : rect.left;
  const left = Math.max(ANCHOR_GAP, Math.min(wanted, maxLeft));
  // Under the opener; above it when there is no room below; clamped into
  // the window when neither side fits.
  const height = panel.offsetHeight;
  const below =
    align === 'end' ? rect.top - END_LIFT : rect.bottom + ANCHOR_OFFSET;
  const above = rect.top - ANCHOR_OFFSET - height;
  const lowest = window.innerHeight - height - ANCHOR_GAP;
  let top = below;
  if (below > lowest) top = above >= ANCHOR_GAP ? above : lowest;
  top = Math.max(ANCHOR_GAP, top);
  panel.style.setProperty('--overlay-anchor-top', `${top}px`);
  panel.style.setProperty('--overlay-anchor-left', `${left}px`);
}

/*
 * Browser and system Back close the overlay on top and stay on the page
 * (#920 T-3). While any overlay is open, one history entry of its own (same
 * address, `bowerOverlay` in its state) sits on top: Back pops it and the
 * newest overlay closes. Closing every overlay any other way takes that
 * entry back off; an overlay that hands over to the next (a menu opening
 * Help) keeps it. A link inside an overlay that navigates ("See what
 * changed", "Show in folders") closes it and replaces the overlay's entry
 * instead of pushing on top of it (`linkLeavesOverlay`, #920 F-2), so the
 * next Back leaves the new page in one step.
 */
const backClosers: Array<{ close: () => void }> = [];
let ignorePops = 0;
let reconcileQueued = false;
let popListening = false;

function hasOverlayEntry(): boolean {
  const state: unknown = history.state;
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { bowerOverlay?: unknown }).bowerOverlay === true
  );
}

function reconcileHistory(): void {
  reconcileQueued = false;
  const want = backClosers.length > 0;
  const have = hasOverlayEntry();
  if (want && !have) {
    const state: unknown = history.state;
    const base = typeof state === 'object' && state !== null ? state : {};
    history.pushState({ ...base, bowerOverlay: true }, '', location.href);
  } else if (!want && have) {
    ignorePops += 1;
    history.back();
  }
}

function queueReconcile(): void {
  if (reconcileQueued) return;
  reconcileQueued = true;
  setTimeout(reconcileHistory, 0);
}

/**
 * The app path a click on an in-app link inside an overlay goes to, or
 * `null` when the router would not take it (a modified click, another
 * origin, a new tab, a download, a `#` link) and the browser should.
 */
function inAppLinkTarget(event: MouseEvent): string | null {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return null;
  }
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest('a[href]');
  if (!(link instanceof HTMLAnchorElement)) return null;
  const href = link.getAttribute('href') ?? '';
  if (
    link.origin !== location.origin ||
    href.startsWith('#') ||
    !/^(_?self)?$/i.test(link.target) ||
    link.hasAttribute('download')
  ) {
    return null;
  }
  return link.href.replace(location.origin, '');
}

function onBackPop(): void {
  if (ignorePops > 0) {
    ignorePops -= 1;
    return;
  }
  if (hasOverlayEntry()) return;
  backClosers[backClosers.length - 1]?.close();
  queueReconcile();
}

/**
 * Lets Back close this overlay (or the drawer) while `open`; `onClose` is
 * read at the time Back is pressed.
 */
export function useBackCloses(onClose: () => void, open = true): void {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!open) return;
    if (!popListening) {
      popListening = true;
      window.addEventListener('popstate', onBackPop);
    }
    const entry = {
      close: () => {
        latest.current();
      },
    };
    backClosers.push(entry);
    queueReconcile();
    return () => {
      const at = backClosers.indexOf(entry);
      if (at !== -1) backClosers.splice(at, 1);
      queueReconcile();
    };
  }, [open]);
}

const MENU_ITEMS =
  '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]';

/** Where focus goes when the control that opened an overlay is gone. */
/** False when the element or an ancestor is `display: none`. */
function isDisplayed(el: HTMLElement): boolean {
  for (
    let node: HTMLElement | null = el;
    node !== null;
    node = node.parentElement
  ) {
    if (window.getComputedStyle(node).display === 'none') return false;
  }
  return true;
}

function firstShown(selector: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(selector);
  for (const el of Array.from(all)) {
    // Skip what is not on screen: focusing a `display: none` element does
    // nothing and would leave BODY focused (the phone hides the desktop
    // heading and sidebar).
    if (!isDisplayed(el)) continue;
    return el;
  }
  return null;
}

function focusFallback(): void {
  const active = document.activeElement;
  if (active !== null && active !== document.body) return;
  // The page heading: the screen's h1, or on a phone, where the header bar
  // carries the title, that title.
  const heading = firstShown('#app h1, #app .topbar-title');
  if (heading !== null) {
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus();
    if (document.activeElement === heading) return;
  }
  firstShown(
    '#app a[href], #app button:not([disabled]), #app input:not([disabled])',
  )?.focus();
}

export function Overlay(props: OverlayProps): JSX.Element {
  const { kind, onClose, children } = props;
  const placement = props.desktopPlacement ?? DEFAULT_PLACEMENT[kind];
  const align = props.desktopAlign ?? 'start';
  const panel = useRef<HTMLDivElement>(null);
  // `undefined` outside the router (unit tests): links then go the
  // router's own way.
  const router = useLocation() as
    Partial<ReturnType<typeof useLocation>> | undefined;
  const route = router?.route;

  // A link that leaves the overlay closes it and takes the overlay's Back
  // entry (replace), so the next Back leaves the new page in one step
  // (#920 F-2). It runs before the router's own click listener.
  const onLinkClick = (event: MouseEvent): void => {
    if (route === undefined) return;
    const url = inAppLinkTarget(event);
    if (url === null) return;
    // The router's window listener would push the link even when its own
    // handler prevented the default (an in-place reveal): it never sees it.
    event.stopPropagation();
    if (event.defaultPrevented) return;
    event.preventDefault();
    const replace = hasOverlayEntry();
    onClose();
    route(url, replace);
  };

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
      anchorTo(element, active, align);
    }
    return lockPage();
  }, [placement, align]);

  useFocusTrap(panel, onClose, opener);
  useBackCloses(onClose);

  // Declared after the trap, so it runs after the trap focused the first
  // control, and wins.
  const initialFocus = props.initialFocus;
  useEffect(() => {
    if (initialFocus === undefined) return;
    const target =
      typeof initialFocus === 'string'
        ? panel.current?.querySelector<HTMLElement>(initialFocus)
        : initialFocus.current;
    target?.focus();
  }, []);

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
    // Only the items on screen: the desktop popover hides the phone's
    // Cancel row, which End must skip (R-MORE-6, #950 F-21).
    const shown = (selector: string): HTMLElement[] =>
      Array.from(panelEl.querySelectorAll<HTMLElement>(selector)).filter(
        isDisplayed,
      );
    let items = shown(MENU_ITEMS);
    if (items.length === 0) items = shown('button:not([disabled]),a[href]');
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
        onClick={onLinkClick}
      >
        <div class="overlay-grab" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

export interface OverlayHeaderProps {
  /** The heading's id, for the overlay's `labelledBy`. */
  titleId: string;
  title: ComponentChildren;
  /** The ✕'s name, one of the boards' (`OVERLAY_CLOSE_LABELS`). */
  closeLabel: OverlayCloseLabel;
  onClose: () => void;
}

/** A content sheet's or side panel's header: the title and ✕ (§3.8, §3.9). */
export function OverlayHeader({
  titleId,
  title,
  closeLabel,
  onClose,
}: OverlayHeaderProps): JSX.Element {
  return (
    <div class="overlay-head">
      <h2 id={titleId} class="overlay-title" tabIndex={-1}>
        {title}
      </h2>
      <button
        type="button"
        class="icon-button overlay-close"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <IconClose />
      </button>
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
