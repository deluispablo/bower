/**
 * The shell every screen sits in (spec §5.1, §5.2).
 *
 * Phone: a top bar (the bird and the wordmark, the Tidy up pill, the menu
 * button that opens the explorer drawer) and a bottom nav (Home, Add,
 * Tell, Settings). Health is reached from the explorer's Health row. On a
 * note screen the wordmark is replaced by the back link (the `crumb` slot),
 * and the `actions` slot next to the pill holds Open in Drive (#144).
 *
 * Desktop (900 px and wider): the explorer as a permanent left column, a
 * header row over the content (breadcrumb slot, theme toggle, the pill),
 * and on note screens a third column, filled through the `aside` shell slot
 * (#144, `shell-slots.ts` — the note screen sits inside `children`, so it
 * cannot reach these any other way).
 *
 * The header is one element restyled per breakpoint, so the pill (which
 * owns the working sheet and its toasts) is only ever mounted once.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { loginUrl } from '../api.js';
import { findReport, isReportNew } from '../health-report.js';
import { getPref } from '../prefs.js';
import { useSession } from '../session.js';
import { effectiveTheme, setTheme } from '../theme.js';
import { useVault } from '../vault-store.js';
import { Bird } from './bird.js';
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
        <header class="topbar">
          {crumb === null ? (
            <a href="/" class="brand topbar-brand" aria-label="Bower home">
              <Bird state="looking" size={32} />
              <span class="brand-word">Bower</span>
            </a>
          ) : (
            <div class="topbar-crumb">{crumb}</div>
          )}
          <ThemeToggle />
          <div class="topbar-slot" data-slot="process">
            <ProcessButton />
          </div>
          <div class="topbar-slot topbar-actions" data-slot="actions">
            {actions}
          </div>
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
        </header>
        <OfflineBanner />
        {me?.needsReauth === true && (
          <div class="reauth-banner">
            <span>Google access needs to be renewed.</span>
            <a href={loginUrl()}>Reconnect Google</a>
          </div>
        )}
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
    </div>
  );
}
