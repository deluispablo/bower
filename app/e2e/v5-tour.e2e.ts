/**
 * The tour as a queued dialog with Bower pointing at the tab (#776, spec
 * R-OVL-3 and R-BIRD-10, board Tour-375), against the demo build, which
 * shows the tour on every load.
 */

import { expect, test, visible } from './demo.js';

const SKIP_TOAST = 'Replay the tour any time from Settings.';

test.describe('the tour', () => {
  test('stands an 80 px bird on the tab bar, pointing down, with the card 150 px up', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'phone',
      'the tab bar is a phone thing',
    );
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: 'Home' });
    await expect(tour.getByText('Tour · 1 of 4')).toBeVisible();

    const bird = page.locator('.tour-bird svg');
    await expect(bird).toHaveClass(/\bpd\b/);
    const bar = await page.locator('nav.bottom-nav').boundingBox();
    const feet = await bird.boundingBox();
    const card = await tour.boundingBox();
    const viewport = page.viewportSize();
    if (bar === null || feet === null || card === null || viewport === null) {
      throw new Error('the tour did not lay out');
    }
    expect(feet.width).toBe(80);
    expect(feet.height).toBe(80);
    expect(Math.abs(feet.y + feet.height - bar.y)).toBeLessThanOrEqual(2);
    expect(
      Math.abs(viewport.height - (card.y + card.height) - 150),
    ).toBeLessThanOrEqual(2);
  });

  test('goes back, and Escape ends it with the replay toast', async ({
    page,
  }) => {
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: 'Home' });
    await expect(tour.getByRole('button', { name: 'Back' })).toHaveCount(0);
    await tour.getByRole('button', { name: 'Next: Folders' }).click();
    const notes = page.getByRole('dialog', { name: 'Folders' });
    await expect(notes.getByText('Tour · 2 of 4')).toBeVisible();
    await notes.getByRole('button', { name: 'Back' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Home' }).getByText('Tour · 1 of 4'),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText(SKIP_TOAST)).toBeVisible();
  });

  test('on a desktop the bird faces the sidebar row and step 2 rings the explorer', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the sidebar is desktop');
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: 'Home' });
    await expect(tour.getByText('Tour · 1 of 4')).toBeVisible();
    const bird = page.locator('.tour-bird svg');
    await expect(bird).toHaveClass(/\bflip\b/);
    await expect(bird).not.toHaveClass(/\bpd\b/);
    await tour.getByRole('button', { name: 'Next: Folders' }).click();
    const spot = await page.locator('.tour-spot').boundingBox();
    const tree = await visible(page.locator('.explorer-tree')).boundingBox();
    if (spot === null || tree === null) throw new Error('no ring');
    expect(spot.y + spot.height).toBeGreaterThan(tree.y);
  });

  test('Show me around from a Help goes to Home and starts at step 1 (R-TR-4)', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('dialog', { name: 'Home' })
      .getByRole('button', { name: 'Skip' })
      .click();
    await page.goto('/settings');
    // The ⋯ menu's "Help and about this" sends this event (`requestHelp`).
    await page.evaluate(() => {
      window.dispatchEvent(new Event('bower:open-help', { cancelable: true }));
    });
    const help = page.getByRole('dialog', { name: 'Settings' });
    await expect(help.getByText('Help and about this')).toBeVisible();
    await help.getByRole('button', { name: 'Show me around' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('dialog', { name: 'Home' }).getByText('Tour · 1 of 4'),
    ).toBeVisible();
  });

  test('Skip ends it with the replay toast', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('dialog', { name: 'Home' })
      .getByRole('button', { name: 'Skip' })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText(SKIP_TOAST)).toBeVisible();
  });

  test('"Let\'s go" opens the Bower tab (R-TR-5)', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('dialog');
    for (const next of ['Next: Folders', 'Next: Add', 'Next: Bower']) {
      await tour.getByRole('button', { name: next }).click();
    }
    await tour.getByRole('button', { name: "Let's go" }).click();
    await expect(tour).toBeHidden();
    await expect(page).toHaveURL(/\/bower$/);
    await expect(page.getByText(SKIP_TOAST)).toHaveCount(0);
    await expect(visible(page.locator('[data-tour="bower"]'))).not.toHaveClass(
      /help-tab-on/,
    );
  });
});
