/**
 * The shell every screen that needs it sits in (spec §5.1, §5.2, §14). The
 * sign-in, Not invited, Privacy, Terms and the onboarding render outside it
 * instead, in a bare `<main>` (`app.tsx`).
 *
 * Phone: a top bar (#318, Phone-Home and Phone-Note boards) — on a tab,
 * nothing before the title (the Notes tab is the only explorer, #586); on an
 * inner screen (`isInnerScreen`), Back (the `back` slot, or Back to Home); then
 * the title (the wordmark as text on Home, the screen's own title from the
 * `crumb` slot elsewhere), the `actions` slot (a note's More, #144), "?"
 * (About this screen) and the avatar that opens Settings — and four tabs at the bottom (#317): Home, Notes,
 * Add, Bower. Health is reached from the Notes tab's Health row.
 *
 * Desktop (900 px and wider): the explorer as a permanent left column, a
 * header row over the content (breadcrumb slot, "?" — Back, the phone title, the actions slot and the avatar are phone-only;
 * Settings is a sidebar row there; the theme control lives only in
 * Settings › Look, #324),
 * and on note screens the About panel, filled through the `aside` shell slot
 * (#144, `shell-slots.ts` — the note screen sits inside `children`, so it
 * cannot reach these any other way).
 *
 * Right of the sidebar, one centred container (#355, Desktop-Responsive
 * board): 980 px wide, 1200 on a note with the About panel, holding the
 * header row, the banners, the content and the panel. What is left of a
 * wide window is margin; the toast centres on the same container.
 *
 * There is no Tidy up in the bar (#320): the button lives on Home's Inbox
 * card and in Add's hint, and the bar shows nothing while a run goes. The
 * working sheet and the notifications prompt are mounted once, here
 * (`RunSheets`), whichever screen the run was started from.
 *
 * The sidebar's waiting-count bubble (#326, C.9): the Desktop-Home and
 * Desktop-Add boards both put it on the Home row, not Add — the board
 * wins over the issue's own title and C.9's text, which say Add. Same
 * count as Home's Inbox card and Add's hint (`inboxCount`, #741); hidden at
 * zero, same convention as the Notes tree's counts.
 *
 * v5 slots (#741, spec 7b T14), all empty by default and so invisible: on the
 * phone a docked row between the page and the tab bar (`tidyBar`, else
 * `uploadChip`: the tidy-up bar wins, 6.15b); from 900 px the same content is a
 * chip in the top bar before "?", plus a `breadcrumb` slot in the bar; and
 * under the sidebar's explorer a 66 px `ledge`, outside the nav landmark.
 * `OverlayHost` (#740) is mounted once. The sidebar's width comes from
 * `bower:pref:sidebarWidth`, read in the first render (T15).
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { isDemo, loginUrl } from '../api.js';
import { tourOnScreen } from '../onboarding.js';
import { inboxCount, inboxTotal } from '../inbox-count.js';
import { useSession } from '../session.js';
import {
  BOWER_PATH,
  IDEAS_PATH,
  helpScreenFor,
  isInnerScreen,
} from '../shell-routes.js';
import { replayTour, useTour } from '../tour-store.js';
import { useVault } from '../vault-store.js';
import type { HelpTab } from '../help-rows.js';
import { BackLink } from './back-link.js';
import { DemoBanner } from './demo-banner.js';
import { Explorer, useHealthIsNew } from './explorer.js';
import { HelpSheet } from './help-sheet.js';
import { SidebarSeparator } from './sidebar-separator.js';
import { useShellSlots } from './shell-slots.js';
import {
  IconChat,
  IconFolder,
  IconHelp,
  IconHome,
  IconPlus,
  IconSliders,
} from './icons.js';
import { OfflineBanner } from './offline-banner.js';
import { OverlayHost } from './overlay.js';
import { RunSheets } from './run-sheets.js';
import { Switcher } from './switcher.js';
import { Toast } from './toast.js';

interface NavLink {
  href: string;
  label: string;
  Icon: () => JSX.Element;
  /** The tab a help sheet sits over (`components/help-sheet.tsx`). */
  tour?: HelpTab;
}

const HOME: NavLink = {
  href: '/',
  label: 'Home',
  Icon: IconHome,
  tour: 'home',
};
const NOTES: NavLink = {
  href: '/notes',
  label: 'Notes',
  Icon: IconFolder,
  tour: 'notes',
};
const ADD: NavLink = {
  href: '/add',
  label: 'Add',
  Icon: IconPlus,
  tour: 'add',
};
/** The Bower tab (#317): the old Tell Bower screen lives here until #340. */
const BOWER: NavLink = {
  href: BOWER_PATH,
  label: 'Bower',
  Icon: IconChat,
  tour: 'bower',
};
const SETTINGS: NavLink = {
  href: '/settings',
  label: 'Settings',
  Icon: IconSliders,
};

/** The four tabs at the bottom of the phone (#317, Phone-Home board). */
const TABS: readonly NavLink[] = [HOME, NOTES, ADD, BOWER];

/** The desktop sidebar's links (Desktop-Home board): the tree below them
 * is the Notes tab there. Settings is a row here; the phone has the avatar. */
const SIDEBAR_LINKS: readonly NavLink[] = [HOME, ADD, BOWER, SETTINGS];

function currentFor(href: string, path: string): 'page' | undefined {
  return href === path ? 'page' : undefined;
}

/** The avatar's letter: the first letter of the account's email. */
export function avatarInitial(email: string | undefined): string {
  const first = email?.trim().charAt(0) ?? '';
  return first === '' ? '?' : first.toUpperCase();
}

const HOME_BACK = <BackLink href="/" label="Home" />;

const SIDEBAR_WIDTH_KEY = 'bower:pref:sidebarWidth';
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 480;
/** The main column never gets narrower than this (R-SIDE-2). */
export const MAIN_WIDTH_MIN = 560;
const DESKTOP_QUERY = '(min-width: 900px)';

/** A sidebar width kept to 200 to 480 px and to what leaves the main column
 * at least 560 px in a window `viewport` px wide (the 200 floor wins). */
export function clampSidebarWidth(px: number, viewport: number): number {
  const max = Math.max(
    SIDEBAR_WIDTH_MIN,
    Math.min(SIDEBAR_WIDTH_MAX, viewport - MAIN_WIDTH_MIN),
  );
  return Math.min(max, Math.max(SIDEBAR_WIDTH_MIN, Math.round(px)));
}

/** The stored width in px (a bare number, as `prefs.ts` stores values), or
 * `null` when there is none, it is not a number or storage is blocked. */
export function readStoredSidebarWidth(): number | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    // Storage blocked or the value is corrupt: the stylesheet's width stands.
    return null;
  }
}

function useDesktop(): boolean {
  const query = (): boolean =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DESKTOP_QUERY).matches;
  const [desktop, setDesktop] = useState(query);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(DESKTOP_QUERY);
    const update = (): void => {
      setDesktop(list.matches);
    };
    update();
    list.addEventListener('change', update);
    return () => {
      list.removeEventListener('change', update);
    };
  }, []);
  return desktop;
}

/** `--sidebar-width` for the shell, read in the first render (T15: no inline
 * script, no CSP change) and kept clamped as the window resizes; `undefined`
 * means "no stored width", the stylesheet's 264 px. */
function useSidebarWidth(): number | undefined {
  const [stored, setStored] = useState(readStoredSidebarWidth);
  const [viewport, setViewport] = useState(() => window.innerWidth);
  useEffect(() => {
    // The resize handle writes the new width when a drag (or a key press, or
    // a double click) ends; reading it again keeps this state in step, so a
    // window resize does not bring the old width back.
    const reread = (): void => {
      setStored(readStoredSidebarWidth());
    };
    const update = (): void => {
      setViewport(window.innerWidth);
      reread();
    };
    window.addEventListener('resize', update);
    document.addEventListener('pointerup', reread);
    document.addEventListener('keyup', reread);
    document.addEventListener('dblclick', reread);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('pointerup', reread);
      document.removeEventListener('keyup', reread);
      document.removeEventListener('dblclick', reread);
    };
  }, []);
  return stored === null ? undefined : clampSidebarWidth(stored, viewport);
}

interface LayoutProps {
  children: ComponentChildren;
}

export function Layout({ children }: LayoutProps): JSX.Element {
  const { me } = useSession();
  const { files, status } = useVault();
  const { path, route } = useLocation();
  const tour = useTour();
  const {
    back,
    crumb,
    actions,
    aside,
    tidyBar,
    uploadChip,
    breadcrumb,
    ledge,
  } = useShellSlots();
  // One bar slot for both chips: the tidy-up bar wins (spec 6.15b).
  const bar = tidyBar ?? uploadChip;
  const desktop = useDesktop();
  const sidebarWidth = useSidebarWidth();
  // "?" (About this screen): the help sheet for the screen on show (#330).
  const [helpOpen, setHelpOpen] = useState(false);
  const inner = isInnerScreen(path, isDemo());
  const headRef = useRef<HTMLDivElement>(null);
  // The quick switcher's own top offset (spec §14, `switcher.css`'s
  // `--switcher-top`): the live bottom edge of the header *and* whichever
  // banners are showing under it, so opening the switcher never covers the
  // offline banner or the reconnect-Google one. A fixed pixel guess (the
  // old 76 px) drifts as soon as a banner appears or the header wraps.
  useEffect(() => {
    const el = headRef.current;
    if (el === null || typeof ResizeObserver !== 'function') return;
    const setOffset = (): void => {
      document.documentElement.style.setProperty(
        '--switcher-top',
        `${el.getBoundingClientRect().bottom}px`,
      );
    };
    setOffset();
    const observer = new ResizeObserver(setOffset);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const healthIsNew = useHealthIsNew();
  const pending = inboxTotal(inboxCount(files, status === 'loading'));

  // Any route change closes the help sheet.
  useEffect(() => {
    setHelpOpen(false);
  }, [path]);

  const sidebarNav = (
    <nav class="explorer-nav" aria-label="Primary">
      {SIDEBAR_LINKS.map(({ href, label, Icon, tour }) => (
        <a
          key={href}
          href={href}
          class="explorer-row"
          aria-current={currentFor(href, path)}
          data-tour={tour}
        >
          <Icon />
          <span class="explorer-row-label">{label}</span>
          {href === ADD.href && pending > 0 && (
            // aria-hidden: the link's accessible name stays plain "Add"
            // (screen-reader users meet the same count on Home's own
            // Inbox card); it also keeps `Add` matchable by name in the
            // e2e flows' navigation helper. #422/#326: the waiting count
            // belongs on Add, where the pile gets filled, not on Home.
            <span class="nav-badge" aria-hidden="true">
              {pending}
            </span>
          )}
        </a>
      ))}
    </nav>
  );

  return (
    <div
      class={[
        'shell',
        aside !== null && 'shell-with-aside',
        // The Bower tab's wider column for its three columns (#357).
        path === BOWER_PATH && 'shell-bower',
        // The folder's three panes from 1200 px (#614, D13).
        path.startsWith('/folder/') && 'shell-folder',
        // A docked bar on the phone shrinks the scroll area (#741).
        !desktop && bar !== null && 'shell-with-dock',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        sidebarWidth === undefined
          ? undefined
          : { '--sidebar-width': `${sidebarWidth}px` }
      }
    >
      {/* `data-tour` sits on the whole column, as it did on the old nav: the
          help sheet lights the target's box and places itself by it. */}
      <div class="shell-sidebar" data-tour="notes">
        <nav class="shell-sidebar-nav" aria-label="Your notes">
          <Explorer
            variant="sidebar"
            healthIsNew={healthIsNew}
            nav={sidebarNav}
          />
        </nav>
        {/* The ledge (#741): a 66 px strip under the explorer, decoration
            only, so outside the landmark and hidden from assistive tech. */}
        <div class="shell-ledge" data-slot="ledge" aria-hidden="true">
          {ledge}
        </div>
        <SidebarSeparator />
      </div>
      <div class="shell-main">
        {/* The one centred container (#355, Desktop-Responsive board): the
            header row, the banners, the content and, on a note, the About
            panel all sit inside it, so nothing reaches the viewport's right
            edge however wide the window is. */}
        <div class="shell-container">
          <div ref={headRef}>
            <header class="topbar">
              {inner && (back ?? HOME_BACK)}
              <div class="topbar-crumb">
                {crumb ?? <span class="topbar-title">Bower</span>}
              </div>
              <div class="topbar-slot topbar-breadcrumb" data-slot="breadcrumb">
                {breadcrumb}
              </div>
              <div class="topbar-slot topbar-actions" data-slot="actions">
                {actions}
              </div>
              {desktop && bar !== null && (
                <div class="topbar-slot topbar-chip" data-slot="chip">
                  {bar}
                </div>
              )}
              <button
                type="button"
                class="icon-button topbar-help"
                aria-label="About this screen"
                aria-haspopup="dialog"
                onClick={() => {
                  setHelpOpen(true);
                }}
              >
                <IconHelp />
              </button>
              <a
                href={SETTINGS.href}
                class="topbar-avatar"
                aria-label="Settings"
              >
                <span aria-hidden="true">{avatarInitial(me?.email)}</span>
              </a>
            </header>
            <DemoBanner tourOpen={path === '/' && tourOnScreen(me, tour)} />
            <OfflineBanner />
            {me?.needsReauth === true && (
              <div class="reauth-banner">
                <span>Google access needs to be renewed.</span>
                <a href={loginUrl()}>Reconnect Google</a>
              </div>
            )}
          </div>
          <div class="shell-body">
            <main class="content">{children}</main>
            {aside !== null && (
              <aside
                class="shell-aside"
                aria-label={
                  path.startsWith('/folder/') ? 'Preview' : 'About this note'
                }
              >
                {aside}
              </aside>
            )}
          </div>
        </div>
      </div>
      {!desktop && bar !== null && (
        // A flex item of the shell, not fixed: it sticks just above the tab
        // bar and `.shell-with-dock` gives the content room for it.
        <div class="shell-dock" data-slot="dock">
          {bar}
        </div>
      )}
      <nav class="bottom-nav" aria-label="Primary">
        {TABS.map(({ href, label, Icon, tour }) => (
          <a
            key={href}
            href={href}
            aria-current={currentFor(href, path)}
            data-tour={tour}
          >
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      {helpOpen && (
        <HelpSheet
          screen={helpScreenFor(path)}
          ideasHref={IDEAS_PATH}
          onClose={() => {
            setHelpOpen(false);
          }}
          onShowMeAround={() => {
            setHelpOpen(false);
            replayTour();
            route('/');
          }}
        />
      )}
      <Switcher />
      <RunSheets />
      {/* The one overlay host (#740): sheets, dialogs and menus queue here. */}
      <OverlayHost />
      {/* The one toast (`toast-store.ts`): a pin, a finished run. */}
      <Toast />
    </div>
  );
}
