import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { loginUrl } from '../api.js';
import { useSession } from '../session.js';
import { useVault } from '../vault-store.js';
import { OfflineBanner } from './offline-banner.js';
import { ProcessButton } from './process-button.js';
import { Search } from './search.js';
import { Tree } from './tree.js';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/add', label: 'Add' },
  { href: '/tell', label: 'Tell Bower' },
  { href: '/settings', label: 'Settings' },
];

interface LayoutProps {
  children: ComponentChildren;
}

export function Layout({ children }: LayoutProps) {
  const { me, signOut } = useSession();
  const { index } = useVault();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeMenu = (): void => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  // The drawer traps no focus (Tab can still reach the rest of the page),
  // but it must still close on Escape like any dismissible panel.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') closeMenu();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div class="shell">
      <header class="topbar">
        <a href="/" class="topbar-logo" aria-label="Bower home">
          <img src="/logo.svg" alt="" width="32" height="32" />
        </a>
        <Search />
        <div class="topbar-slot" data-slot="process">
          <ProcessButton />
        </div>
        <div class="menu">
          <button
            type="button"
            ref={menuButtonRef}
            class="menu-button"
            aria-label="Menu"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                fill="none"
              />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div class="menu-backdrop" onClick={closeMenu} />
              <div class="menu-panel" aria-label="Menu">
                <div class="menu-tree">
                  {index !== null && (
                    <Tree index={index} onNavigate={closeMenu} />
                  )}
                </div>
                {me && <p class="menu-email">{me.email}</p>}
                <button
                  type="button"
                  class="menu-signout"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>
      <OfflineBanner />
      {me?.needsReauth && (
        <div class="reauth-banner">
          <span>Google access needs to be renewed.</span>
          <a href={loginUrl()}>Reconnect Google</a>
        </div>
      )}
      <div class="body">
        <nav class="sidebar" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
          <div class="sidebar-tree">
            {index !== null && <Tree index={index} />}
          </div>
        </nav>
        <main class="content">{children}</main>
      </div>
      <nav class="bottom-nav" aria-label="Primary">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
