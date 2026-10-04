/**
 * The start-up screen lives in index.html, so it shows before any script.
 * This hands over to the app: gone at once when the app is quick (people who
 * come back every day should not watch a splash), kept a moment when it was
 * already showing, with a line after a while and the offline and error states.
 */

const INSTANT_MS = 600;
const MIN_SHOWN_MS = 1100;
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
  lineTimer = setTimeout(() => line()?.classList.add('show'), 1800);
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
  if (shown < INSTANT_MS) {
    b.remove();
    return;
  }
  setTimeout(
    () => {
      b.classList.add('leaving');
      setTimeout(() => b.remove(), 260);
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
