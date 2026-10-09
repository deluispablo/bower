import { expectAxeClean } from './axe';
import { expect, test } from './fixtures';

test('nothing pulses in the running tidy-up', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 375 : 1440, height: 812 });
  // Reuse qa5/qa10's running scenario. Real phase timing keeps it running through the axe scan.
  await page.goto('/?source=fake&scenario=running&time=real');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const opener = page.getByRole('button', { name: /Reading \d+ things|Writing your notes|Getting ready|Putting them away/ }).first();
  await expect(opener).toBeVisible({ timeout: 12_000 });
  await opener.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const mark = dialog.locator('[aria-current="step"] > span > span');
  await expect(mark).toHaveCount(1);
  await expect(mark).toBeVisible();
  expect.soft(await mark.evaluate((element) => element.getAnimations().length)).toBe(0);

  // The phone uses Bower in its run chip; the desktop has live dots in its button and status bar.
  const liveDots = page.locator('[class*="_live_"]');
  await expect(liveDots).toHaveCount(isMobile ? 0 : 2);
  for (const dot of await liveDots.all()) {
    await expect(dot).toBeVisible();
    expect.soft(await dot.evaluate((element) => element.getAnimations().length)).toBe(0);
  }

  await expectAxeClean(page, { include: '[role="dialog"]' });
  await expect(mark).toBeVisible();
});
