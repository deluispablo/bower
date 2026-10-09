import { test, expect } from './fixtures';
import { expectAxeClean } from './axe';

for (const width of [375, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('the boot says still opening after 3 s', async ({ page }) => {
      // Keep the slow demo's two session reads pending past 3.5 s.
      await page.addInitScript(() => { Math.random = () => 0.99; });
      await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
      await page.goto('/?scenario=slow&time=instant');
      await expect.poll(() => page.locator('#root').evaluate((root) => root.childElementCount)).toBeGreaterThan(0);
      // Let React mount before pausing; the two sequential session reads still need more than 3.5 s.
      await page.clock.pauseAt(await page.evaluate(() => new Date(Date.now())));
      const boot = page.locator('#boot');
      await expect(boot.locator('[data-boot-line]')).toHaveText('');
      await page.clock.runFor(3500);
      await expect(boot.locator('b')).toHaveText('Still opening');
      await expect(boot.locator('b')).toHaveCSS('font-size', '18px');
      await expect(boot.locator('b')).toHaveCSS('font-weight', '600');
      await expect(boot.locator('[data-boot-line]')).toContainText('Your Drive is answering slowly. Bower keeps trying.');
      await expect(boot.locator('[data-boot-line]')).toHaveCSS('font-size', '15px');
      await expect(boot.locator('.bird')).toHaveClass(/\bread\b/);
      await expect(boot.locator('.b-eye')).toHaveCSS('animation-name', 'blink');
      await expectAxeClean(page, { include: '#boot' });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(boot.locator('.b-eye')).toHaveCSS('animation-name', 'none');
    });

    test('a failed boot says it could not open and offers try again', async ({ page, allowConsole }) => {
      // Synthetic failure: a missing demo module rejects buildSources in main.tsx.
      allowConsole(/Failed to (fetch dynamically imported module|load resource)|net::ERR_FAILED/, 'synthetic boot module failure');
      let failedModuleRequests = 0;
      await page.route('**/src/data/demo/world.ts*', (route) => {
        failedModuleRequests += 1;
        return route.abort('failed');
      });
      await page.goto('/?source=demo&time=instant');
      const boot = page.locator('#boot');
      await expect(boot.locator('b')).toHaveText('Bower could not open');
      await expect(boot).toContainText('Something went wrong while opening. Your notes are safe in your Drive.');
      await expect(boot.locator('.bird')).toHaveClass(/\balarm\b/);
      const retry = boot.getByRole('button', { name: 'Try again', exact: true });
      await expect(retry).toBeFocused();
      const box = await retry.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(160);
      await expectAxeClean(page, { include: '#boot' });
      const requestsBeforeRetry = failedModuleRequests;
      await retry.click();
      await expect.poll(() => failedModuleRequests).toBeGreaterThan(requestsBeforeRetry);
    });
  });
}
