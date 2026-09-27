/**
 * The shell every screen that needs it sits in (spec §5.1, §5.2, §14). The
 * sign-in, Not invited, Privacy, Terms and the onboarding render outside it
 * instead, in a bare `<main>` (`app.tsx`).
 *
 * Phone: a top bar (spec §14 order) — the menu button that opens the
 * explorer drawer, then the wordmark (Home) or the screen title (Add, Tell
 * Bower, Settings, the `crumb` slot) or the back link (a note, also the
 * `crumb` slot), then the `actions` slot (Open in Drive on a note, #144),
 * then the Tidy up pill flush to the right edge — and four tabs at the
 * bottom (#317): Home, Notes, Add, Bower. Health is reached from the
 * explorer's Health row; Settings from a row in the drawer (phone) and the
 * sidebar (desktop).
 *
 * Desktop (900 px and wider): the explorer as a permanent left column, a
 * header row over the content (breadcrumb slot, theme toggle, the pill —
 * the menu button, the phone title and the actions slot are phone-only),
 * and on note screens a third column, filled through the `aside` shell slot
 * (#144, `shell-slots.ts` — the note screen sits inside `children`, so it
 * cannot reach these any other way).
 *
 * The header is one element restyled per breakpoint, so the pill (which
 * owns the working sheet and its toasts) is only ever mounted once.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { loginUrl } from '../api.js';
import { useSession } from '../session.js';
import { BOWER_PATH } from '../shell-routes.js';
import { effectiveTheme, setTheme } from '../theme.js';
import { DemoBanner } from './demo-banner.js';
import { Explorer, ExplorerDrawer, useHealthIsNew } from './explorer.js';
import { useShellSlots } from './shell-slots.js';
import {
  IconChat,
  IconFolder,
  IconHome,
  IconMenu,
  IconMoon,
  IconPlus,
  IconSliders,
  IconSun,
} from './icons.js';
import { OfflineBanner } from './offline-banner.js';
import { ProcessButton } from './process-button.js';
import { Switcher } from './switcher.js';
import { Toast } from './toast.js';

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
 * is the Notes tab there. Settings stays a row until the avatar (#318). */
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

interface LayoutProps {
  children: ComponentChildren;
}

export function Layout({ children }: LayoutProps): JSX.Element {
  const { me } = useSession();
  const { path } = useLocation();
  const { crumb, actions, aside } = useShellSlots();
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  // Phone: Settings left the bottom row (#317); until the avatar in the top
  // bar opens it (#318), the drawer carries it as a row.
  const drawerNav = (
    <a
      href={SETTINGS.href}
      class="explorer-row"
      aria-current={currentFor(SETTINGS.href, path)}
      onClick={closeDrawer}
    >
      <SETTINGS.Icon />
      <span class="explorer-row-label">{SETTINGS.label}</span>
    </a>
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
            <button
              type="button"
              class="icon-button menu-button"
              aria-label="Your notes"
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              onClick={() => {
                setDrawerOpen(true);
              }}
            >
              <IconMenu />
            </button>
            {crumb === null ? (
              <a href="/" class="brand topbar-brand" aria-label="Bower home">
                <span class="brand-word">Bower</span>
              </a>
            ) : (
              <div class="topbar-crumb">{crumb}</div>
            )}
            <ThemeToggle />
            <div class="topbar-slot topbar-actions" data-slot="actions">
              {actions}
            </div>
            <div class="topbar-slot topbar-pill" data-slot="process">
              <ProcessButton />
            </div>
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
        <ExplorerDrawer
          healthIsNew={healthIsNew}
          nav={drawerNav}
          onClose={closeDrawer}
        />
      )}
      <Switcher />
      {/* The one toast (`toast-store.ts`): a pin, a finished run. */}
      <Toast />
    </div>
  );
}
