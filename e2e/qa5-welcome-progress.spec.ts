/**
 * qa5-welcome-progress (qa-5 Claude F1 = Codex F1): the setup screen has no tour progress, and axe WCAG 2.2 finds no
 * name on a role-less element (`aria-prohibited-attr`) on any of its views, the oracle both testers used.
 */
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

for (const [scenario, path, heading] of [
  ['first', '/welcome', 'Where Bower keeps things'],
  ['first', '/welcome?step=0', 'Where Bower keeps things'],
  ['default', '/welcome', 'Welcome back'],
] as const) {
  test(`qa5-welcome-progress: AC3 welcome-progress-axe: ${path} on ${scenario} shows "${heading}", no tour, and passes axe`, async ({ page }, testInfo) => {
    // The phone project is Pixel 7 (412px); the contract is 375 and 1440.
    const phone = testInfo.project.name === 'phone';
    if (phone) await resize(page, { width: 375, height: 812 });
    expect(page.viewportSize()?.width).toBe(phone ? 375 : 1440);
    await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=instant`);
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    // In the accessibility tree, as text: no step progress, no name on a role-less element.
    expect(await main.ariaSnapshot()).not.toMatch(/Step \d of \d/);
    await expectAxeClean(page, { include: 'main', wcag22: true });
  });
}
