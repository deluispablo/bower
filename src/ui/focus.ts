/**
 * The button pressed went away with what it closed: the keyboard goes to the
 * start of the page (`#main`), never to nothing.
 */
export function focusMain(): void {
  setTimeout(() => {
    if (typeof document === 'undefined') return;
    if (!document.activeElement || document.activeElement === document.body) document.getElementById('main')?.focus();
  }, 0);
}

/**
 * The keyboard goes to the page's heading (an h1 made focusable with
 * tabindex="-1"), or to `#main` when there is none. Only when focus has fallen
 * to nothing: a link or button still holding focus keeps it.
 */
export function focusHeading(): void {
  if (document.activeElement && document.activeElement !== document.body) return;
  const h1 = document.querySelector<HTMLElement>('#main h1');
  if (h1) {
    if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
    h1.focus({ preventScroll: true });
  } else document.getElementById('main')?.focus({ preventScroll: true });
}

const LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/** The opener last handed out; the control last focused inside a layer; for each such control, its layer's opener. */
let lastOpener: HTMLElement | null = null;
let inLayer: HTMLElement | null = null;
const layerOpener = new WeakMap<HTMLElement, HTMLElement>();

if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (e) => {
      const at = e.target instanceof HTMLElement ? e.target : null;
      if (at?.closest(LAYER)) {
        inLayer = at;
        if (lastOpener && lastOpener !== at && lastOpener.isConnected) layerOpener.set(at, lastOpener);
      } else inLayer = null;
    },
    true,
  );
}

/**
 * What holds the keyboard now, if it is a control: the opener a layer about to open will give it
 * back to. A control inside an open layer (a menu sheet's Rename) keeps the opener of that layer,
 * and when that control left with its layer a moment before (focus fell to the body), it is still
 * the opener: `returnFocusTo` then falls back to the layer's opener.
 */
export function openerNow(): HTMLElement | null {
  const at = typeof document === 'undefined' ? null : document.activeElement;
  if (!(at instanceof HTMLElement) || at === document.body) return inLayer && !inLayer.isConnected && layerOpener.has(inLayer) ? inLayer : null;
  lastOpener = at;
  return at;
}

let endWatch: (() => void) | null = null;

/**
 * Back to what opened a dialog (WAI-ARIA APG, modal dialog: on close, focus returns to the
 * element that opened it). With no opener, or one that has left the page, focus goes to the
 * page's heading. When the opener goes away a moment later (a card that closing the dialog
 * dismisses), it goes to the heading then. No timer: the watch ends when the opener goes, or
 * when focus lands on anything else.
 */
export function returnFocusTo(first: HTMLElement | null): void {
  endWatch?.();
  // The opener, else the opener of the layer it was in, else the heading.
  const outer = first ? layerOpener.get(first) : undefined;
  const opener = first && document.contains(first) ? first : outer;
  if (!opener || !document.contains(opener) || opener === document.body) {
    focusHeading();
    return;
  }
  opener.focus();
  // A disabled, inert or hidden opener cannot take focus: the heading instead, with no watch.
  if (document.activeElement !== opener) return focusHeading();
  const onIn = (e: FocusEvent): void => {
    if (e.target !== opener) end();
  };
  const watch = new MutationObserver(() => {
    if (typeof document === 'undefined') {
      end();
      return;
    }
    if (document.contains(opener)) return;
    end();
    focusHeading();
  });
  const end = (): void => {
    watch.disconnect();
    if (typeof document !== 'undefined') document.removeEventListener('focusin', onIn, true);
    if (endWatch === end) endWatch = null;
  };
  endWatch = end;
  document.addEventListener('focusin', onIn, true);
  watch.observe(document.body, { childList: true, subtree: true });
}

/**
 * The close-focus hook for a layer (Radix `onCloseAutoFocus`): the library's own guess is
 * stopped, and focus goes back to what opened the layer through `returnFocusTo`. Only when focus
 * has fallen to nothing: a field in the next sheet this one made room for keeps the keyboard.
 */
export function closeFocus(e: Event, opener: HTMLElement | null): void {
  e.preventDefault();
  const at = document.activeElement;
  if (at && at !== document.body && at.isConnected) return;
  returnFocusTo(opener);
}

/** A menu, sheet or dialog open on screen owns the keyboard; the route rule leaves it alone. */
const OPEN_LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open]';

const heading = (): HTMLElement | null => document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1');

export const toHeading = (h1: HTMLElement): void => {
  if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
  h1.focus({ preventScroll: true });
};

/** Focus has fallen to nothing: on the body, or on an element the change took away. */
const fallen = (): boolean => {
  const at = document.activeElement;
  return !at || at === document.body || !at.isConnected;
};

/**
 * After a route change, once the new view has rendered, the keyboard goes to the new
 * view's h1 (tabindex="-1") only when focus has fallen to nothing (the body, or an
 * element the change took away). Focus the view set itself (an autofocused field), a
 * control that navigated and is still on screen (a top-bar link), and an open menu,
 * sheet or dialog are never taken. This is the rule of Reach Router and React Router's
 * focus-management guidance, Gatsby's route-change study (Fable Tech Labs) and GOV.UK:
 * move focus to the new page's heading, and do not fight focus placed after navigation.
 * Returns a cancel function.
 */
export function focusRouteHeading(): () => void {
  let tries = 0;
  let timer = 0;
  // The old view's heading may still be on screen while the new view loads; wait for it
  // to go, unless it is reused (the same screen showing another note).
  const old = heading();
  // Focus placed after the change, by the view or the person (a field, a menu that
  // opened and closed), ends the rule: what they placed, or what a closing menu hands
  // back, is never taken. Only the rule's own moves to a heading do not count.
  let placed = false;
  let mine: EventTarget | null = null;
  const onIn = (e: FocusEvent): void => {
    if (typeof document === 'undefined') return;
    if (e.target !== mine) placed = true;
  };
  document.addEventListener('focusin', onIn, true);
  const leaveAlone = (): boolean => placed || Boolean(document.querySelector(OPEN_LAYER));
  const move = (h1: HTMLElement): void => {
    mine = h1;
    toHeading(h1);
  };
  const step = (): void => {
    if (typeof document === 'undefined') return;
    if (leaveAlone()) return;
    const h1 = heading();
    // Still on something on screen: wait while the old view may yet go, then leave it.
    if (!fallen()) {
      if (++tries < 12) timer = window.setTimeout(step, 50);
      return;
    }
    if (h1 && (h1 !== old || tries >= 4)) {
      move(h1);
      keep(h1);
      return;
    }
    if (++tries < 12) timer = window.setTimeout(step, 50);
    else document.getElementById('main')?.focus({ preventScroll: true });
  };
  // A view that loads its content after its heading replaces the heading: if focus
  // falls to nothing in the next moment, it goes to the new heading.
  let watch: MutationObserver | undefined;
  let stop = 0;
  const keep = (focused: HTMLElement): void => {
    watch = new MutationObserver(() => {
      if (typeof document === 'undefined') {
        watch?.disconnect();
        return;
      }
      if (leaveAlone() || focused.isConnected || !fallen()) return;
      const next = heading();
      if (next) move(next);
    });
    watch.observe(document.body, { childList: true, subtree: true });
  };
  timer = window.setTimeout(step, 50);
  stop = window.setTimeout(() => {
    if (typeof document === 'undefined') return;
    watch?.disconnect();
    document.removeEventListener('focusin', onIn, true);
  }, 1600);
  return () => {
    clearTimeout(timer);
    clearTimeout(stop);
    watch?.disconnect();
    if (typeof document !== 'undefined') {
      document.removeEventListener('focusin', onIn, true);
    }
  };
}
