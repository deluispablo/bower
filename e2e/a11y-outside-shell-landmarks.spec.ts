import { expect, test } from './fixtures';
import { axeScan } from './axe';

// qa-3-F1 (WCAG 1.3.1, APG landmarks): the screens outside the shell have one main landmark and no content outside
// landmarks, read by axe's own rules (`landmark-one-main`, `region`), the oracle the finding used.
const SCREENS: Array<[string, string, RegExp]> = [
  ['privacy', '/privacy?scenario=default&time=instant', /^Privacy$/],
  ['terms', '/terms?scenario=default&time=instant', /^Terms$/],
  ['welcome', '/welcome?scenario=default&time=instant', /Your folder is ready|Welcome back/],
  ['sign-in', '/sign-in?scenario=signed-out&time=instant', /tidied by a bowerbird/],
];

for (const [name, path, heading] of SCREENS) {
  test(`qa-3-F1: ${name} has one main landmark and nothing outside landmarks`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect.soft(page.getByRole('main')).toHaveCount(1);
    const results = await axeScan(page);
    const landmarks = results.violations.filter((v) => v.id === 'landmark-one-main' || v.id === 'region');
    expect(landmarks.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
