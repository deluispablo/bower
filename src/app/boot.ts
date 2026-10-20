/**
 * The start-up screen lives in index.html, so it shows before any script.
 * It covers the setup the app does on opening (the session, the folder
 * check), and always lets Bower finish its landing on the twig: the land
 * pose takes about 2 s (arrive, squash, tail flick, a look round). Home holds
 * it until its first reads land, at most until 8 s from the start, so the
 * first screen is the finished one (web.dev/articles/optimize-cls). Then it
 * fades into the app. A line appears if it takes long; offline and error
 * states replace the line.
 */

/** Long enough for Bower to land and look round (the boot's land pose, 2.4 s). */
const MIN_SHOWN_MS = 2000;
const STATUS_MS = 3000;
/** The longest Home holds the start-up screen: then it opens with its placeholders. */
const CAP_MS = 8000;

const t0 = performance.now();
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;
let capTimer: ReturnType<typeof setTimeout> | undefined;
/** Each failure starts a new attempt: holds and the cap of an earlier one never dismiss its screen. */
let attempt = 0;
let holds = 0;
let asked = false;
let now = false;
let capped = false;
let byCap = false;
const capWatchers = new Set<() => void>();

/** True once the cap, not Home's reads, let the screen go: Home then shows what is still on its way as still shapes. */
export function openedByCap(): boolean {
  return byCap;
}
/** Tells `fn` when the cap lets the screen go (useSyncExternalStore's subscribe). */
export function onCap(fn: () => void): () => void {
  capWatchers.add(fn);
  return () => void capWatchers.delete(fn);
}

function el(): HTMLElement | null {
  return document.getElementById('boot');
}
function line(): HTMLElement | null {
  return el()?.querySelector<HTMLElement>('[data-boot-line]') ?? null;
}

/**
 * While Home holds the screen, Home is laid out beneath but neither shown nor reachable: a part landing above another
 * there is not a shift anyone sees (web.dev/articles/cls), and a screen reader stays on the screen's status.
 */
function showApp(shown: boolean): void {
  const root = document.getElementById('root');
  if (root) root.style.visibility = shown ? '' : 'hidden';
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

/** Leaves once the app asked and nothing holds it (or the cap passed); `quick` skips Bower's landing. */
function settle(): void {
  clearTimeout(leaveTimer);
  if (!asked || (holds > 0 && !capped)) return;
  leaveTimer = setTimeout(() => {
    const b = el();
    if (!b) return;
    clearTimeout(statusTimer);
    clearTimeout(capTimer);
    showApp(true);
    b.classList.add('leaving');
    setTimeout(() => b.remove(), 420);
  }, now ? 0 : Math.max(0, MIN_SHOWN_MS - (performance.now() - t0)));
}

/** The app knows what to show. `quick`: a signed-out person sees sign-in without waiting for Bower's landing. */
export function bootDone(quick = false): void {
  asked = true;
  now = quick;
  settle();
}

/** Home holds the screen while its first reads are on their way; the returned release lets go (once). */
export function bootHold(): () => void {
  const b = el();
  if (!b || b.classList.contains('leaving')) return () => undefined;
  const mine = attempt;
  holds += 1;
  showApp(false);
  clearTimeout(leaveTimer);
  // From the page start (performance.now's time origin), so a slow script load does not stretch it.
  capTimer ??= setTimeout(() => {
    capped = true;
    byCap = holds > 0;
    if (byCap) capWatchers.forEach((fn) => fn());
    settle();
  }, Math.max(0, CAP_MS - performance.now()));
  let held = true;
  return () => {
    if (!held || mine !== attempt) return;
    held = false;
    holds -= 1;
    if (!holds) showApp(true);
    settle();
  };
}

/** `signOut`: a session that failed to open can be left from here (Gatekeeper's errors, not offline). */
export function bootFail(kind: 'offline' | 'error', retry: () => void, signOut?: () => Promise<void>): void {
  clearTimeout(statusTimer);
  clearTimeout(leaveTimer);
  clearTimeout(capTimer);
  capTimer = undefined;
  attempt += 1;
  holds = 0;
  asked = false;
  capped = false;
  byCap = false;
  const l = line();
  if (!l) return;
  l.classList.remove('opening');
  const bird = el()?.querySelector('.bird');
  bird?.classList.remove('land', 'read');
  bird?.classList.add(kind === 'offline' ? 'sleep' : 'alarm');
  l.innerHTML =
    kind === 'offline'
      ? "<b>You're offline</b>Bower opens when you're back online."
      : `<b>Bower could not open</b>Something went wrong while opening. Your notes are safe in your Drive.${signOut ? ' If it keeps happening, sign out and in again.' : ''}`;
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
  if (signOut) {
    const out = document.createElement('button');
    out.type = 'button';
    out.textContent = 'Sign out';
    Object.assign(out.style, { display: 'block', margin: '10px auto 0', background: 'transparent', color: 'inherit', boxShadow: 'inset 0 0 0 1.5px currentColor' });
    out.addEventListener('click', () => {
      out.disabled = true;
      signOut().catch((e: unknown) => {
        console.error(e);
        // Welcome's words for the same failure; said once, the button back to press again.
        if (!l.querySelector('[data-boot-out]')) {
          const said = document.createElement('p');
          said.dataset.bootOut = '';
          said.textContent = 'Bower could not sign you out. Try again.';
          l.insertBefore(said, btn);
        }
        out.disabled = false;
      });
    });
    l.appendChild(out);
  }
  l.classList.add('show');
  btn.focus();
}
