import { expect, type Page } from '@playwright/test';
import { DESKTOP } from '../src/ui/media';

const desktopWidth = Number(DESKTOP.match(/^\(min-width: (\d+)px\)$/)?.[1]);
if (!Number.isFinite(desktopWidth)) throw new Error('The desktop breakpoint must be a minimum pixel width.');

/** Settle the shell swap before a caller takes non-retrying layout measurements. */
export async function resize(page: Page, size: { width: number; height: number }): Promise<void> {
  const previous = page.viewportSize();
  await page.setViewportSize(size);
  if (page.url() === 'about:blank') return;
  const desktop = size.width >= desktopWidth;
  if (previous && (previous.width >= desktopWidth) === desktop) return;

  // Sheets can hide the shell from accessibility while leaving its DOM and layout in place.
  const tabs = page.getByRole('navigation', { name: 'Open tabs', exact: true, includeHidden: true });
  // Both shells have Main; only the phone's navigation contains the Files link.
  const phone = page.getByRole('navigation', { name: 'Main', exact: true, includeHidden: true }).filter({
    has: page.getByRole('link', { name: 'Files', exact: true, includeHidden: true }),
  });
  await expect(desktop ? tabs : phone).toBeVisible();
  await expect(desktop ? phone : tabs).toHaveCount(0);
}
