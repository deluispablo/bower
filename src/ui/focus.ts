/**
 * The button pressed went away with what it closed: the keyboard goes to the
 * start of the page (`#main`), never to nothing.
 */
export function focusMain(): void {
  setTimeout(() => {
    if (!document.activeElement || document.activeElement === document.body) document.getElementById('main')?.focus();
  }, 0);
}
