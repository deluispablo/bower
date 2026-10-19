import { test, expect, isFake } from './fixtures';
import { expectAxeClean } from './axe';

for (const width of [375, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('the boot says still opening after 3 s', async ({ page }) => {
      // The pretend Drive opens in about 2.3 s even under scenario=slow (one 1.5 s answer), so the boot is gone
      // before 3 s there; the slow answers that keep the boot up are the demo's (two sequential 1.5 s reads).
      test.skip(isFake, 'scenario=slow keeps the boot up past 3 s only on the demo source');
      // Keep the boot up until the checks are done: the demo's module is held (playwright.dev/docs/network), an event,
      // not the time its slow reads have left.
      let release = (): void => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route('**/src/data/demo/world.ts*', async (route) => { await held; await route.continue(); });
      // Install and pause before the page loads (playwright.dev/docs/clock): the clock then stands still from the first
      // script, so no machine speed can put it past a time read later.
      await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
      await page.goto('/?scenario=slow&time=instant');
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
      await page.clock.resume();
      await expectAxeClean(page, { include: '#boot' });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(boot.locator('.b-eye')).toHaveCSS('animation-name', 'none');
      release();
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
