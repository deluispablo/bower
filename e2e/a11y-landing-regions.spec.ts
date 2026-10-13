import { expect, test } from '@playwright/test';
import { axeScan } from './axe';
import { resize } from './viewport';

for (const [label, width, height] of [['phone', 375, 800], ['desktop', 1440, 900]] as const) {
  test(`AC1 the exported landing has one main and no content outside landmarks (${label})`, async ({ page }, info) => {
    // Both widths run in one project; the other project would repeat them.
    test.skip(info.project.name !== 'desktop', 'Run once, in the desktop project.');
    await resize(page, { width, height });
    await page.goto('/landing/index.html');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Drive, tidied by a bowerbird.');
    // The landing is built by its page logic: wait for it (the CSP spec's own sign).
    await expect.poll(() => page.locator('path[d]').count()).toBeGreaterThan(5);
    await expect.soft(page.getByRole('main')).toHaveCount(1);
    const results = await axeScan(page);
    const landmarks = results.violations.filter((v) => v.id === 'landmark-one-main' || v.id === 'region');
    expect(landmarks.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
