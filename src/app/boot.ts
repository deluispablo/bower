/**
 * The start-up screen lives in index.html, so it shows before any script.
 * It covers the setup the app does on opening (the session, the folder
 * check), and always lets Bower finish its landing on the twig: the land
 * pose takes about 2 s (arrive, squash, tail flick, a look round). Then it
 * fades into the app. A line appears if it takes long; offline and error
 * states replace the line.
 */

/** Long enough for Bower to land and look round (the boot's land pose, 2.4 s). */
const MIN_SHOWN_MS = 2000;
const SLOW_MS = 8000;

const t0 = performance.now();
let slowTimer: ReturnType<typeof setTimeout> | undefined;
let lineTimer: ReturnType<typeof setTimeout> | undefined;

function el(): HTMLElement | null {
  return document.getElementById('boot');
}
function line(): HTMLElement | null {
  return el()?.querySelector<HTMLElement>('[data-boot-line]') ?? null;
}

export function bootStart(): void {
  lineTimer = setTimeout(() => line()?.classList.add('show'), 3000);
  slowTimer = setTimeout(() => {
    const l = line();
    if (!l) return;
    l.innerHTML = '<b>Still loading</b>This is taking longer than usual. Your notes are safe in your Drive.';
    l.classList.add('show');
  }, SLOW_MS);
}

export function bootDone(): void {
  clearTimeout(slowTimer);
  clearTimeout(lineTimer);
  const b = el();
  if (!b) return;
  const shown = performance.now() - t0;
  setTimeout(
    () => {
      b.classList.add('leaving');
      setTimeout(() => b.remove(), 420);
    },
    Math.max(0, MIN_SHOWN_MS - shown),
  );
}

export function bootFail(kind: 'offline' | 'error', retry: () => void): void {
  clearTimeout(slowTimer);
  clearTimeout(lineTimer);
  const l = line();
  if (!l) return;
  const bird = el()?.querySelector('.bird');
  bird?.classList.remove('land');
  bird?.classList.add(kind === 'offline' ? 'sleep' : 'alarm');
  l.innerHTML =
    kind === 'offline'
      ? "<b>You're offline</b>Bower opens when you're back online."
      : "<b>Bower couldn't open</b>Google didn't answer. Nothing was lost.";
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Try again';
  btn.addEventListener('click', retry);
  l.appendChild(btn);
  l.classList.add('show');
  btn.focus();
}
