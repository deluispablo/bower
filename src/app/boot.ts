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
const STATUS_MS = 3000;

const t0 = performance.now();
let statusTimer: ReturnType<typeof setTimeout> | undefined;

function el(): HTMLElement | null {
  return document.getElementById('boot');
}
function line(): HTMLElement | null {
  return el()?.querySelector<HTMLElement>('[data-boot-line]') ?? null;
}

export function bootStart(): void {
  statusTimer = setTimeout(() => {
    const l = line();
    if (!l) return;
    l.innerHTML = '<b>Still opening</b>Your Drive is answering slowly. Bower keeps trying.';
    const bird = el()?.querySelector('.bird');
    bird?.classList.remove('land');
    bird?.classList.add('read');
    l.classList.add('opening', 'show');
  }, STATUS_MS);
}

export function bootDone(): void {
  clearTimeout(statusTimer);
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
  clearTimeout(statusTimer);
  const l = line();
  if (!l) return;
  l.classList.remove('opening');
  const bird = el()?.querySelector('.bird');
  bird?.classList.remove('land', 'read');
  bird?.classList.add(kind === 'offline' ? 'sleep' : 'alarm');
  l.innerHTML =
    kind === 'offline'
      ? "<b>You're offline</b>Bower opens when you're back online."
      : '<b>Bower could not open</b>Something went wrong while opening. Your notes are safe in your Drive.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Try again';
  if (kind === 'error') btn.classList.add('primary');
  btn.style.display = 'block';
  btn.style.margin = '18px auto 0';
  btn.addEventListener('click', () => {
    btn.textContent = 'Trying…';
    btn.disabled = true;
    setTimeout(retry, 300);
  });
  l.appendChild(btn);
  l.classList.add('show');
  btn.focus();
}
