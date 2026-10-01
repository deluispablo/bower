/**
 * The shell every screen that needs it sits in (spec §5.1, §5.2, §14). The
 * sign-in, Not invited, Privacy, Terms and the onboarding render outside it
 * instead, in a bare `<main>` (`app.tsx`).
 *
 * Phone (#906, spec §3.1): a 56 px top bar in one of three variants
 * (`topBarVariant`): `tab` on Home, Add and Bower (the files button "Open
 * your folders", the screen's title from the `crumb` slot at 24 px, the ⋯
 * from the `actions` slot right after it, the avatar pinned right);
 * `inner` everywhere else (files button, Back from the `back` slot or Back
 * to Home, the avatar; no avatar on Settings); `explorer` on the Folders tab
 * (the title "Folders", ⋯, avatar; no files button). There is no "?" in
 * the bar (R-TOPBAR-1): Help lives in each screen's ⋯ menu. Until a screen
 * adopts `PageHeader` it may still fill `crumb` and `actions` on an inner
 * screen; the bar shows them after Back. At the bottom, four tabs (§3.2):
 * Home, Folders, Add, Bower, lit by `activeTab`.
 *
 * Desktop (900 px and wider): the explorer as a permanent left column, a
 * header row over the content (the breadcrumb slot and the tidy-up or upload
 * chip, which never shows its done state there: no "Done · 1 filed" pill,
 * E-9, `layout.css`). The files button, Back, the phone title, the actions slot
 * and the avatar are phone-only; Settings is a sidebar row there; the theme
 * control lives only in Settings › Look, #324),
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

import { loginUrl } from '../api.js';
import { HELP_REQUEST_EVENT } from '../more-menu.js';
import { tourOnScreen } from '../onboarding.js';
import { inboxCount, inboxTotal } from '../inbox-count.js';
import { personOf, useSession } from '../session.js';
import {
  BOWER_PATH,
  FOLDERS_LANDMARK,
  FOLDERS_PATH,
  FOLDERS_TAB_LABEL,
  SETTINGS_PATH,
  activeTab,
  barHasAvatar,
  helpScreenFor,
  topBarVariant,
} from '../shell-routes.js';
import type { TabId } from '../shell-routes.js';
import { lazyOverlay, whenIdle } from '../lazy-overlay.js';
import { replayTour, useTour } from '../tour-store.js';
import { useVault } from '../vault-store.js';
import type { HelpTab } from '../help-rows.js';
import { BackLink } from './back-link.js';
import { BowerMark } from './bird.js';
import { DemoBanner } from './demo-banner.js';
import { openFoldersDrawer } from '../folders-drawer.js';
import { Explorer, HEALTH_PATH } from './explorer.js';
import { SidebarSeparator } from './sidebar-separator.js';
import { useShellSlots } from './shell-slots.js';
import {
  IconChat,
  IconFolder,
  IconHeart,
  IconHome,
  IconPanel,
  IconPlus,
  IconSliders,
} from './icons.js';
import { OfflineBanner } from './offline-banner.js';
import { OverlayHost } from './overlay.js';
import { RunSheets, preloadRunSheets } from './run-sheets.js';
import { SwitcherHost, preloadSwitcher } from './switcher-host.js';
import { Toast } from './toast.js';

interface NavLink {
  href: string;
  label: string;
  Icon: () => JSX.Element;
  /** The tab a help sheet sits over (`components/help-sheet.tsx`). */
  tour?: HelpTab;
  /** The phone tab this link is (`activeTab`). */
  tab?: TabId;
}

const HOME: NavLink = {
  href: '/',
  label: 'Home',
  Icon: IconHome,
  tour: 'home',
  tab: 'home',
};
const FOLDERS: NavLink = {
  href: FOLDERS_PATH,
  label: FOLDERS_TAB_LABEL,
  Icon: IconFolder,
  tour: 'notes',
  tab: 'folders',
};
const ADD: NavLink = {
  href: '/add',
  label: 'Add',
  Icon: IconPlus,
  tour: 'add',
  tab: 'add',
};
/** The Bower tab (#317): the old Tell Bower screen lives here until #340. */
const BOWER: NavLink = {
  href: BOWER_PATH,
  label: 'Bower',
  Icon: IconChat,
  tour: 'bower',
  tab: 'bower',
};
const SETTINGS: NavLink = {
  href: SETTINGS_PATH,
  label: 'Settings',
  Icon: IconSliders,
};
/** Health check (K-30, R-SIDEBAR-3): a sidebar nav item on desktop. */
const HEALTH: NavLink = {
  href: HEALTH_PATH,
  label: 'Health check',
  Icon: IconHeart,
};

/** The four tabs at the bottom of the phone (§3.2, R-TABBAR-1 as the owner
 * review renamed it): Home, Folders, Add, Bower. */
const TABS: readonly NavLink[] = [HOME, FOLDERS, ADD, BOWER];

/** The desktop sidebar's links (§3.3): Home, Add, Bower, Settings, Health
 * check; there is no Folders item (the tree below is the Folders tab
 * there). */
const SIDEBAR_LINKS: readonly NavLink[] = [HOME, ADD, BOWER, SETTINGS, HEALTH];

function currentFor(href: string, path: string): 'page' | undefined {
  return href === path ? 'page' : undefined;
}

/*
 * Help is opened from each screen's ⋯ menu (#907's `requestHelp` in
 * `more-menu.ts`): it dispatches `HELP_REQUEST_EVENT`, a cancelable window
 * event, and the shell, which keeps the help sheet mounted, cancels it and
 * opens the sheet for the screen on show. There is no "?" in the bar
 * (R-TOPBAR-1).
 */

const LazyHelp = lazyOverlay(() =>
  import('./help-sheet.js').then((m) => m.HelpSheet),
);
const LazyHelpSheet = LazyHelp.Component;

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
  // One bar slot for both chips on the phone: the tidy-up bar wins (spec
  // 6.15b). From 900 px the same chip sits in the top bar, except its done
  // state, the "Done · 1 filed" pill (E-9), which `layout.css` hides.
  const bar = tidyBar ?? uploadChip;
  const desktop = useDesktop();
  const sidebarWidth = useSidebarWidth();
  // The overlays' code is fetched once the page is idle, so each opens at once.
  useEffect(
    () =>
      whenIdle(() => {
        preloadSwitcher();
        preloadRunSheets();
        LazyHelp.preload();
      }),
    [],
  );
  // Help and about this (#330, #907): opened by the ⋯ menu's event.
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const onHelp = (event: Event): void => {
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener(HELP_REQUEST_EVENT, onHelp);
    return () => {
      window.removeEventListener(HELP_REQUEST_EVENT, onHelp);
    };
  }, []);
  // Any route change closes the help sheet.
  useEffect(() => {
    setHelpOpen(false);
  }, [path]);
  const variant = topBarVariant(path);
  const tab = activeTab(path);
  const person = personOf(me ?? undefined);
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

  const pending = inboxTotal(inboxCount(files, status === 'loading'));

  const sidebarNav = (
    <nav class="explorer-nav" aria-label="Main">
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
      {/* The tour's Notes step lights the "Your folders" header row inside the
          explorer (`data-tour` in explorer.tsx), not this whole column. */}
      <div class="shell-sidebar">
        <nav class="shell-sidebar-nav" aria-label={FOLDERS_LANDMARK}>
          <Explorer variant="sidebar" nav={sidebarNav} />
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
            <header
              class={[
                'topbar',
                `topbar-${variant}`,
                variant === 'inner' && crumb != null && 'topbar-has-title',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {variant === 'explorer' ? (
                <span class="topbar-lead" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  class="topbar-files"
                  aria-label="Open your folders"
                  onClick={openFoldersDrawer}
                >
                  <IconPanel />
                </button>
              )}
              {variant === 'inner' && (back ?? HOME_BACK)}
              <div class="topbar-crumb">
                {variant === 'explorer' ? (
                  <h1 class="topbar-title">{FOLDERS_TAB_LABEL}</h1>
                ) : variant === 'tab' ? (
                  (crumb ?? <span class="topbar-title">Bower</span>)
                ) : (
                  crumb
                )}
              </div>
              <div class="topbar-slot topbar-actions" data-slot="actions">
                {actions}
              </div>
              <span class="topbar-spacer" aria-hidden="true" />
              <div class="topbar-slot topbar-breadcrumb" data-slot="breadcrumb">
                {breadcrumb}
              </div>
              {desktop && bar !== null && (
                <div class="topbar-slot topbar-chip" data-slot="chip">
                  {bar}
                </div>
              )}
              {barHasAvatar(path) && (
                <button
                  type="button"
                  class="topbar-avatar"
                  aria-label="Settings"
                  onClick={() => {
                    route(SETTINGS.href);
                  }}
                >
                  <span aria-hidden="true">{person.initial}</span>
                </button>
              )}
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
                  path.startsWith('/folder/')
                    ? 'Preview'
                    : path.startsWith('/file/')
                      ? 'About this file'
                      : 'About this note'
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
      <nav class="bottom-nav" aria-label="Main">
        {TABS.map(({ href, label, Icon, tour, tab: id }) => (
          <a
            key={href}
            href={href}
            aria-current={id !== undefined && id === tab ? 'page' : undefined}
            data-tour={tour}
          >
            {/* The Bower tab is the still bird mark, 22 px (§3.2, #915). */}
            {id === 'bower' ? <BowerMark size={22} /> : <Icon />}
            <span>{label}</span>
          </a>
        ))}
      </nav>
      {helpOpen && (
        <LazyHelpSheet
          screen={helpScreenFor(path)}
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
      <SwitcherHost />
      <RunSheets />
      {/* The one overlay host (#740): sheets, dialogs and menus queue here. */}
      <OverlayHost />
      {/* The one toast (`toast-store.ts`): a pin, a finished run. */}
      <Toast />
    </div>
  );
}
