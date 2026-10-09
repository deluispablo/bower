/**
 * v2-perched-bower (TL-P4-22): a perched Bower with the turn moves through the
 * motion engine only. While the engine runs, no CSS animation runs on any
 * bird part (jsdom runs no CSS, so this lives here). Phone and desktop.
 */
import { expectAxeClean } from './axe';
import { expect, test, withSource } from './fixtures';

test('no CSS animation runs on a bird part while the engine runs', async ({ page }) => {
  await page.goto(withSource('/?scenario=default&time=instant'));
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('heading', { level: 1, name: /G'day, Alex/ })).toBeVisible();

  // One perched bird holds the turn and its engine moves it (the head's transform changes over time).
  const engineBird = page.locator('[data-bird]:not(.posed) .bird-perch');
  await expect(engineBird).toHaveCount(1);
  const head = engineBird.locator('.b-head');
  const first = await head.getAttribute('transform');
  await expect.poll(() => head.getAttribute('transform'), { timeout: 8000 }).not.toBe(first);

  const running = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          return !!target?.closest('[data-bird]') && !target.closest('.bower-spark');
        }).length,
  );
  expect(running).toBe(0);

  await expectAxeClean(page, { include: 'main' });
});
