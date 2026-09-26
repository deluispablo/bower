import type { ComponentChildren } from 'preact';

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
  return (
    <div class="shell">
      <header class="topbar">
        <a href="/" class="topbar-logo" aria-label="Bower home">
          <img src="/logo.svg" alt="" width="32" height="32" />
        </a>
        <div class="topbar-slot" data-slot="process" />
        <button type="button" class="menu-button" aria-label="Menu">
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
      </header>
      <div class="body">
        <nav class="sidebar" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
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
