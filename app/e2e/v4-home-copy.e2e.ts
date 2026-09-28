/**
 * Home's cards while the folder index loads after sign-in (#584, finding
 * 26): the Inbox, Last tidy-up, Health and Notes cards show skeleton
 * blocks, never "0" or "No check yet" as if they were facts.
 */

import { expect, openHome, test } from './demo.js';

const DELAY_MS = 3000;

test('Home shows skeletons, not zeros, while the index loads (#584)', async ({
  page,
}) => {
  // Holds the demo's folder listing back (`src/demo/drive.ts`).
  await page.addInitScript((ms: number) => {
    window.__bowerDemoListDelayMs = ms;
  }, DELAY_MS);
  await openHome(page);

  const home = page.locator('.home');
  await expect(home).toHaveAttribute('data-state', 'loading');

  // Health and Notes are desktop-only cards: on a phone they are in the
  // DOM but hidden, so this reads the DOM, not the screen.
  for (const title of ['Inbox', 'Health', 'Notes']) {
    const card = page.locator('.home-card', {
      has: page.getByRole('heading', { name: title, includeHidden: true }),
    });
    await expect(card, `${title} card`).toHaveClass(/home-card-loading/);
    await expect(card.locator('.home-skeleton').first()).toHaveCount(1);
    await expect(card.locator('.home-card-count')).toHaveCount(0);
    await expect(card).not.toContainText('No check yet');
    await expect(card).not.toContainText('Not checked yet');
  }
  const loadingCards = await page.locator('.home-card-loading').count();
  expect(loadingCards).toBeGreaterThanOrEqual(3);

  // Once the listing resolves, the real numbers replace the skeletons.
  await expect(home).not.toHaveAttribute('data-state', 'loading', {
    timeout: DELAY_MS + 5_000,
  });
  await expect(page.locator('.home-card-loading')).toHaveCount(0);
});
