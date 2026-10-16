/**
 * qa5-welcome-progress (qa-5 Claude F1 = Codex F1): on each tour step the progress is read as text ("Step 1 of 3"), and
 * axe WCAG 2.2 finds no name on a role-less element (`aria-prohibited-attr`), the oracle both testers used.
 */
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';

for (const [step, heading, progress] of [[0, 'Throw it in', 'Step 1 of 3'], [2, 'Find it later', 'Step 3 of 3']] as const) {
  test(`qa5-welcome-progress: AC3 welcome-progress-axe: step ${step + 1} says ${progress} and passes axe`, async ({ page }) => {
    await page.goto(`/welcome?step=${step}&scenario=default&time=instant`);
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    // In the accessibility tree, as text: a role-less aria-label never reaches it.
    expect(await main.ariaSnapshot()).toContain(progress);
    await expectAxeClean(page, { include: 'main', wcag22: true });
  });
}
