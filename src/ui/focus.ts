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
