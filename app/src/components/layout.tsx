/**
 * The shell every screen that needs it sits in (spec §5.1, §5.2, §14). The
 * sign-in, Not invited, Privacy, Terms and the onboarding render outside it
 * instead, in a bare `<main>` (`app.tsx`).
 *
 * Phone: a top bar (#318, Phone-Home and Phone-Note boards) — on a tab,
 * the folder menu button that opens the explorer drawer; on an inner screen
 * (`isInnerScreen`), Back instead (the `back` slot, or Back to Home); then
 * the title (the wordmark as text on Home, the screen's own title from the
 * `crumb` slot elsewhere), the `actions` slot (a note's More, #144), "?"
 * (About this screen) and the avatar that opens Settings — and four tabs at the bottom (#317): Home, Notes,
 * Add, Bower. Health is reached from the explorer's Health row.
 *
 * Desktop (900 px and wider): the explorer as a permanent left column, a
 * header row over the content (breadcrumb slot, theme toggle, "?" — the menu button, Back, the phone title, the actions slot and the
 * avatar are phone-only; Settings is a sidebar row there),
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
import { BOWER_PATH, helpStepFor, isInnerScreen } from '../shell-routes.js';
import { effectiveTheme, setTheme } from '../theme.js';
import { BackLink } from './back-link.js';
import { DemoBanner } from './demo-banner.js';
import { Explorer, ExplorerDrawer, useHealthIsNew } from './explorer.js';
import { useShellSlots } from './shell-slots.js';
import {
  IconChat,
  IconFolder,
  IconHelp,
  IconHome,
  IconMenu,
  IconMoon,
  IconPlus,
  IconSliders,
  IconSun,
} from './icons.js';
import { OfflineBanner } from './offline-banner.js';
import { RunSheets } from './run-sheets.js';
import { Switcher } from './switcher.js';
import { Toast } from './toast.js';
import { Tour } from './tour.js';

interface NavLink {
  href: string;
  label: string;
  Icon: () => JSX.Element;
  /** The first-run tour's anchor (`components/tour.tsx`). */
  tour?: 'add' | 'tell';
}

const HOME: NavLink = { href: '/', label: 'Home', Icon: IconHome };
const NOTES: NavLink = { href: '/notes', label: 'Notes', Icon: IconFolder };
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
  tour: 'tell',
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

/** Desktop header: flips between light and dark (Settings keeps "system"). */
function ThemeToggle(): JSX.Element {
  const [theme, setThemeState] = useState(effectiveTheme);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      class="icon-button theme-toggle"
      aria-label="Switch theme"
      title="Switch theme"
      onClick={() => {
        setTheme(next);
        setThemeState(next);
      }}
    >
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  );
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
  const { path } = useLocation();
  const { back, crumb, actions, aside } = useShellSlots();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // "?" (About this screen): the tour, at the step for this tab, until
  // each tab has its own help sheet (#330).
  const [helpOpen, setHelpOpen] = useState(false);
  const inner = isInnerScreen(path);
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
      <nav class="shell-sidebar" aria-label="Your notes">
        <Explorer
          variant="sidebar"
          healthIsNew={healthIsNew}
          nav={sidebarNav}
        />
      </nav>
      <div class="shell-main">
        <div ref={headRef}>
          <header class="topbar">
            {inner ? (
              (back ?? HOME_BACK)
            ) : (
              <button
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
            <ThemeToggle />
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
        <aside class="shell-aside" aria-label="About this note">
          {aside}
        </aside>
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
      {drawerOpen && (
        <ExplorerDrawer healthIsNew={healthIsNew} onClose={closeDrawer} />
      )}
      {helpOpen && (
        <Tour
          startAt={helpStepFor(path)}
          onEnd={() => {
            setHelpOpen(false);
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
