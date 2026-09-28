/**
 * The shell every screen that needs it sits in (spec §5.1, §5.2, §14). The
 * sign-in, Not invited, Privacy, Terms and the onboarding render outside it
 * instead, in a bare `<main>` (`app.tsx`).
 *
 * Phone: a top bar (#318, Phone-Home and Phone-Note boards) — on a tab,
 * the folder menu button that opens the folder menu (#319,
 * `folder-menu.tsx`; the page behind goes inert while it is open); on an inner screen
 * (`isInnerScreen`), Back instead (the `back` slot, or Back to Home); then
 * the title (the wordmark as text on Home, the screen's own title from the
 * `crumb` slot elsewhere), the `actions` slot (a note's More, #144), "?"
 * (About this screen) and the avatar that opens Settings — and four tabs at the bottom (#317): Home, Notes,
 * Add, Bower. Health is reached from the Notes tab's Health row.
 *
 * Desktop (900 px and wider): the explorer as a permanent left column, a
 * header row over the content (breadcrumb slot, "?" — the menu button,
 * Back, the phone title, the actions slot and the avatar are phone-only;
 * Settings is a sidebar row there; the theme control lives only in
 * Settings › Look, #324),
 * and on note screens a third column, filled through the `aside` shell slot
 * (#144, `shell-slots.ts` — the note screen sits inside `children`, so it
 * cannot reach these any other way).
 *
 * There is no Tidy up in the bar (#320): the button lives on Home's Inbox
 * card and in Add's hint, and the bar shows nothing while a run goes. The
 * working sheet and the notifications prompt are mounted once, here
 * (`RunSheets`), whichever screen the run was started from.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { loginUrl } from '../api.js';
import { useSession } from '../session.js';
import { BOWER_PATH, helpScreenFor, isInnerScreen } from '../shell-routes.js';
import { replayTour } from '../tour-store.js';
import type { HelpTab } from '../help-rows.js';
import { BackLink } from './back-link.js';
import { DemoBanner } from './demo-banner.js';
import { Explorer, useHealthIsNew } from './explorer.js';
import { FolderMenu } from './folder-menu.js';
import { HelpSheet } from './help-sheet.js';
import { useShellSlots } from './shell-slots.js';
import {
  IconChat,
  IconFolder,
  IconHelp,
  IconHome,
  IconMenu,
  IconPlus,
  IconSliders,
} from './icons.js';
import { OfflineBanner } from './offline-banner.js';
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

const DESKTOP_QUERY = '(min-width: 900px)';

function currentFor(href: string, path: string): 'page' | undefined {
  return href === path ? 'page' : undefined;
}

/** The avatar's letter: the first letter of the account's email. */
export function avatarInitial(email: string | undefined): string {
  const first = email?.trim().charAt(0) ?? '';
  return first === '' ? '?' : first.toUpperCase();
}

const HOME_BACK = <BackLink href="/" label="Home" />;

interface LayoutProps {
  children: ComponentChildren;
}

export function Layout({ children }: LayoutProps): JSX.Element {
  const { me } = useSession();
  const { path, route } = useLocation();
  const { back, crumb, actions, aside } = useShellSlots();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // "?" (About this screen): the help sheet for the screen on show (#330).
  const [helpOpen, setHelpOpen] = useState(false);
  const inner = isInnerScreen(path);
  const headRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const wasDrawerOpen = useRef(false);
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

  const closeDrawer = (): void => {
    setDrawerOpen(false);
  };

  // Any route change (a note opened from the tree or the search) closes
  // the drawer; so does growing the window into the desktop layout, where
  // the explorer is always on screen.
  useEffect(() => {
    setDrawerOpen(false);
    setHelpOpen(false);
  }, [path]);

  // The folder menu's focus trap hands focus back to the menu button as it
  // closes, but the button is still inside the inert page at that moment,
  // so the browser drops it on the body. Once the page is live again, put
  // it back there, unless something else took it meanwhile (the switcher,
  // opened from the menu's search row).
  useEffect(() => {
    const closed = wasDrawerOpen.current && !drawerOpen;
    wasDrawerOpen.current = drawerOpen;
    if (!closed) return;
    const active = document.activeElement;
    if (active === null || active === document.body) menuRef.current?.focus();
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DESKTOP_QUERY);
    function onChange(): void {
      if (query.matches) setDrawerOpen(false);
    }
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [drawerOpen]);

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
        </a>
      ))}
    </nav>
  );

  return (
    <div class={aside === null ? 'shell' : 'shell shell-with-aside'}>
      <nav
        class="shell-sidebar"
        aria-label="Your notes"
        data-tour="notes"
        inert={drawerOpen}
      >
        <Explorer
          variant="sidebar"
          healthIsNew={healthIsNew}
          nav={sidebarNav}
        />
      </nav>
      <div class="shell-main" inert={drawerOpen}>
        <div ref={headRef}>
          <header class="topbar">
            {inner ? (
              (back ?? HOME_BACK)
            ) : (
              <button
                ref={menuRef}
                type="button"
                class="icon-button menu-button"
                aria-label="Your folders"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                onClick={() => {
                  setDrawerOpen(true);
                }}
              >
                <IconMenu />
              </button>
            )}
            <div class="topbar-crumb">
              {crumb ?? <span class="topbar-title">Bower</span>}
            </div>
            <div class="topbar-slot topbar-actions" data-slot="actions">
              {actions}
            </div>
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
            <a href={SETTINGS.href} class="topbar-avatar" aria-label="Settings">
              <span aria-hidden="true">{avatarInitial(me?.email)}</span>
            </a>
          </header>
          <DemoBanner />
          <OfflineBanner />
          {me?.needsReauth === true && (
            <div class="reauth-banner">
              <span>Google access needs to be renewed.</span>
              <a href={loginUrl()}>Reconnect Google</a>
            </div>
          )}
        </div>
        <main class="content">{children}</main>
      </div>
      {aside !== null && (
        <aside
          class="shell-aside"
          aria-label="About this note"
          inert={drawerOpen}
        >
          {aside}
        </aside>
      )}
      <nav class="bottom-nav" aria-label="Primary" inert={drawerOpen}>
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
      {drawerOpen && <FolderMenu onClose={closeDrawer} />}
      {helpOpen && (
        <HelpSheet
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
      <Switcher />
      <RunSheets />
      {/* The one toast (`toast-store.ts`): a pin, a finished run. */}
      <Toast />
    </div>
  );
}
