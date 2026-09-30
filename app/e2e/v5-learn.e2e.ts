/**
 * Learn Bower (#797): `/learn` and an example page render at 375 and 1280
 * (both projects) without sideways scroll, the intro's last page links to
 * it, and each example opens its four acts.
 */

import { expect, test } from './demo.js';

test.describe('Learn Bower (#797)', () => {
  test('/learn lists the intro, four cards, six examples and Ideas, without sideways scroll', async ({
    page,
  }) => {
    await page.goto('/learn');
    // On a phone the top bar carries the title and the h1 is hidden.
    await expect(page.locator('h1')).toHaveText('Learn Bower');
    await expect(page.getByRole('link', { name: /The intro/ })).toBeVisible();
    await expect(page.locator('.learn-how-card')).toHaveCount(4);
    await expect(page.locator('.learn-examples li')).toHaveCount(6);
    await expect(
      page.getByRole('link', { name: /Ideas to try/ }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('an example opens with its four acts and goes back to Learn', async ({
    page,
  }) => {
    await page.goto('/learn');
    await page.getByRole('link', { name: /Flat hunting/ }).click();
    await expect(page).toHaveURL(/\/learn\/flat-hunting$/);
    await expect(page.locator('h1')).toHaveText('Flat hunting');
    await expect(page.locator('.learn-act h2')).toHaveText([
      'You add',
      'Bower files and writes',
      'You ask',
      'You get',
    ]);
    await expect(page.locator('.learn-hint')).toContainText(
      'your own Bower learns your way',
    );
  });

  test.describe('from the intro', () => {
    test.use({ introSeen: false });

    test('the last page links to Learn', async ({ page }) => {
      await page.goto('/welcome?page=5');
      await page
        .getByRole('link', { name: 'See examples and use cases' })
        .click();
      await expect(page).toHaveURL(/\/learn$/);
    });
  });
});
