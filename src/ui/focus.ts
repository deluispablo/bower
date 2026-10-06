/**
 * The button pressed went away with what it closed: the keyboard goes to the
 * start of the page (`#main`), never to nothing.
 */
export function focusMain(): void {
  setTimeout(() => {
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

/**
 * Back to what opened a dialog (WAI-ARIA APG, modal dialog). When the opener goes
 * away a moment later (a card that closing the dialog dismisses), focus goes to the
 * page's heading instead of the body.
 */
export function returnFocusTo(opener: HTMLElement | null): void {
  if (!opener || !document.contains(opener) || opener === document.body) {
    focusHeading();
    return;
  }
  opener.focus();
  const watch = new MutationObserver(() => {
    if (document.contains(opener)) return;
    watch.disconnect();
    clearTimeout(stop);
    focusHeading();
  });
  const stop = setTimeout(() => watch.disconnect(), 3000);
  watch.observe(document.body, { childList: true, subtree: true });
}

/** Controls that stay on screen across views; a keyboard in them is already somewhere sensible. */
const PERSISTENT = '[role="tree"]';

/**
 * After a route change the keyboard goes to the new view's h1 (tabindex="-1"), wherever
 * it was: Fable Tech Labs/Gatsby routing study and GOV.UK both move focus to the new
 * page's heading. Exception: focus resting in a control that persists across views
 * (the file tree, where arrow keys keep the place) stays. Waits briefly for a view that renders its heading late.
 * Returns a cancel function.
 */
export function focusRouteHeading(): () => void {
  let tries = 0;
  let timer = 0;
  // The old view's heading may still be on screen while the new view loads; wait for it
  // to go, unless it is reused (the same screen showing another note).
  const old = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1');
  const step = (): void => {
    const held = document.activeElement;
    if (held && held !== document.body && held.isConnected && held.closest(PERSISTENT)) return;
    const h1 = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1');
    if (h1 && (h1 !== old || tries >= 4)) {
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
      keep(h1);
      return;
    }
    if (++tries < 12) timer = window.setTimeout(step, 50);
    else document.getElementById('main')?.focus({ preventScroll: true });
  };
  // A view that loads its content after its heading replaces the heading: if focus
  // falls to the body in the next moment, it goes to the new heading.
  let watch: MutationObserver | undefined;
  let stop = 0;
  const keep = (focused: HTMLElement): void => {
    watch = new MutationObserver(() => {
      // Only when the heading we focused was itself replaced and focus fell with it.
      if (focused.isConnected || (document.activeElement && document.activeElement !== document.body)) return;
      const next = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1');
      if (!next) return;
      if (!next.hasAttribute('tabindex')) next.setAttribute('tabindex', '-1');
      next.focus({ preventScroll: true });
    });
    watch.observe(document.body, { childList: true, subtree: true });
    stop = window.setTimeout(() => watch?.disconnect(), 1000);
  };
  timer = window.setTimeout(step, 50);
  return () => {
    clearTimeout(timer);
    clearTimeout(stop);
    watch?.disconnect();
  };
}
