/**
 * The shell every screen that needs it sits in (spec §5.1, §5.2, §14). The
 * sign-in, Not invited, Privacy, Terms and the onboarding render outside it
 * instead, in a bare `<main>` (`app.tsx`).
 *
 * Phone: a top bar (spec §14 order) — the menu button that opens the
 * explorer drawer, then the wordmark (Home) or the screen title (Add, Tell
 * Bower, Settings, the `crumb` slot) or the back link (a note, also the
 * `crumb` slot), then the `actions` slot (Open in Drive on a note, #144),
 * then the Tidy up pill flush to the right edge — and a bottom nav (Home,
 * Add, Tell, Settings). Health is reached from the explorer's Health row.
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
import { findReport, isReportNew } from '../health-report.js';
import { getPref } from '../prefs.js';
import { useSession } from '../session.js';
import { effectiveTheme, setTheme } from '../theme.js';
import { useVault } from '../vault-store.js';
import { DemoBanner } from './demo-banner.js';
import { Explorer, ExplorerDrawer, HEALTH_PATH } from './explorer.js';
import { useShellSlots } from './shell-slots.js';
import {
  IconChat,
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
  /** Bottom nav label (phone). */
  short: string;
  /** Sidebar label (desktop). */
  label: string;
  Icon: () => JSX.Element;
  /** The first-run tour's anchor (`components/tour.tsx`). */
  tour?: 'add' | 'tell';
}

const NAV_LINKS: readonly NavLink[] = [
  { href: '/', short: 'Home', label: 'Home', Icon: IconHome },
  { href: '/add', short: 'Add', label: 'Add', Icon: IconPlus, tour: 'add' },
  {
    href: '/tell',
    short: 'Tell',
    label: 'Tell Bower',
    Icon: IconChat,
    tour: 'tell',
  },
  {
    href: '/settings',
    short: 'Settings',
    label: 'Settings',
    Icon: IconSliders,
  },
];

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
  const { index } = useVault();
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

  // Re-read on every render: the health screen updates the pref, and a
  // route change re-renders the layout. No badge while on that screen.
  const reportTime =
    index === null ? undefined : findReport(index)?.modifiedTime;
  const healthIsNew =
    path !== HEALTH_PATH && isReportNew(reportTime, getPref('healthSeenAt'));

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
      {NAV_LINKS.map(({ href, label, Icon, tour }) => (
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
        {NAV_LINKS.map(({ href, short, Icon, tour }) => (
          <a
            key={href}
            href={href}
            aria-current={currentFor(href, path)}
            data-tour={tour}
          >
            <Icon />
            <span>{short}</span>
          </a>
        ))}
      </nav>
      {drawerOpen && (
        <ExplorerDrawer healthIsNew={healthIsNew} onClose={closeDrawer} />
      )}
      <Switcher />
      {/* The one toast (`toast-store.ts`): a pin, a finished run. */}
      <Toast />
    </div>
  );
}
