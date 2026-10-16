/**
 * qa-2-F2 (WCAG 2.4.1 Bypass Blocks): every screen inside the shell starts with one "Skip to content" link that moves
 * the keyboard to the main landmark (`#main`), on the phone and the desktop frame alike. The frames and the shared
 * layers are stubbed; Shell, the one home of what every screen shares, is real.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => ({ on: true }));
vi.mock('@/ui/media', async (real) => ({ ...(await real<typeof import('@/ui/media')>()), useIsDesktop: () => desktop.on }));
vi.mock('@/data/provider', () => ({ useUser: () => ({ data: undefined }) }));
// Each frame puts its navigation before or after the page, as the real ones do (the rail first; the tab bar last).
vi.mock('./DesktopShell', () => ({
  DesktopShell: () => (
    <div>
      <nav aria-label="Rail"><a href="/files">Files</a></nav>
      <main id="main" tabIndex={-1}><button type="button">First on the page</button></main>
    </div>
  ),
}));
vi.mock('./PhoneShell', () => ({
  PhoneShell: () => (
    <div>
      <main id="main" tabIndex={-1}><button type="button">First on the page</button></main>
      <nav aria-label="Main"><a href="/files">Files</a></nav>
    </div>
  ),
}));
vi.mock('@/features/palette/Palette', () => ({ Palette: () => null }));
vi.mock('@/features/tidy/TidySheet', () => ({ TidySheet: () => null }));
vi.mock('@/features/files/ConfirmBin', () => ({ ConfirmBin: () => null }));
vi.mock('@/features/files/NameSheet', () => ({ NameSheet: () => null }));
vi.mock('@/features/files/MovePicker', () => ({ MovePicker: () => null }));
vi.mock('@/features/tidy/useRunWatcher', () => ({ useRunWatcher: () => undefined }));
vi.mock('@/features/tidy/Replay', () => ({ Replay: () => null }));

import { Shell } from './Shell';

afterEach(cleanup);

/** Where the router is, so a skip that changed the address shows. */
function Where() {
  const loc = useLocation();
  return <output data-testid="where">{`${loc.pathname}${loc.search}${loc.hash}`}</output>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<><Shell /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Elements the Tab key can reach, in document order (positive tabindex is not used in this app). */
function tabbable(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')].filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute('disabled') && !el.closest('[aria-hidden="true"], [inert]'),
  );
}

describe('qa-2-F2: a skip link to the main content', () => {
  for (const frame of ['desktop', 'phone'] as const) {
    it(`AC1 skip-link-first: the first Tab stop is "Skip to content", pointing at the main landmark (${frame})`, () => {
      desktop.on = frame === 'desktop';
      renderAt('/files?source=demo');
      // expected: a missing link is the assertion below, not a query error.
      const link = screen.queryByRole('link', { name: 'Skip to content' });
      expect(link, 'a link "Skip to content"').not.toBeNull();
      expect(tabbable()[0]).toBe(link);
      expect(link).toHaveAttribute('href', '#main');
      // In the accessibility tree while hidden: never display:none, aria-hidden or inert.
      expect(link?.closest('[aria-hidden="true"], [inert], [hidden]') ?? null).toBeNull();
      expect(screen.getAllByRole('link', { name: 'Skip to content' })).toHaveLength(1);
    });

    it(`AC2 skip-link-moves-focus: pressing it puts the keyboard on the main landmark and keeps the address (${frame})`, () => {
      desktop.on = frame === 'desktop';
      renderAt('/files?source=demo');
      // expected: a missing link is the assertion below, not a query error.
      const link = screen.queryByRole('link', { name: 'Skip to content' });
      expect(link, 'a link "Skip to content"').not.toBeNull();
      if (!link) return;
      link.focus();
      const notPrevented = fireEvent.click(link);
      expect(document.activeElement).toBe(document.getElementById('main'));
      // The router's address is unchanged (no #main), and the browser's default jump is not taken.
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/files\?source=demo$/);
      expect(notPrevented).toBe(false);
    });
  }
});
