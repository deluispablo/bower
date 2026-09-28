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
 * count as Home's Inbox card and Add's hint (`pendingCount`); hidden at
 * zero, same convention as the Notes tree's counts.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { isDemo, loginUrl } from '../api.js';
import { tourOnScreen } from '../onboarding.js';
import { pendingCount } from '../run-store.js';
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

interface LayoutProps {
  children: ComponentChildren;
}

export function Layout({ children }: LayoutProps): JSX.Element {
  const { me } = useSession();
  const { files } = useVault();
  const { path, route } = useLocation();
  const tour = useTour();
  const { back, crumb, actions, aside } = useShellSlots();
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
  const pending = pendingCount(files);

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
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <nav class="shell-sidebar" aria-label="Your notes" data-tour="notes">
        <Explorer
          variant="sidebar"
          healthIsNew={healthIsNew}
          nav={sidebarNav}
        />
      </nav>
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
              <aside class="shell-aside" aria-label="About this note">
                {aside}
              </aside>
            )}
          </div>
        </div>
      </div>
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
      {/* The one toast (`toast-store.ts`): a pin, a finished run. */}
      <Toast />
    </div>
  );
}
