/**
 * Accessibility (#314, spec Part A 6.2.10): every icon-only control has a
 * name, every switch is named by its label, every link has text.
 * `@axe-core/playwright` (dev-only: it drives the same demo build these
 * e2e tests already spin up, no network of its own, no new runtime
 * dependency) checks Home, a note and Settings for `button-name` and
 * `link-name` violations — the two rules that catch an icon-only control
 * or a link with nothing inside it.
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, openHome, openSettings, test, visible } from './demo.js';

async function expectNoNameViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withRules(['button-name', 'link-name'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test('Home has no button-name or link-name violations', async ({ page }) => {
  await openHome(page);
  await expectNoNameViolations(page);
});

test('a note has no button-name or link-name violations', async ({ page }) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /Search or jump to a note/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Lisbon');
  await switcher
    .getByRole('option', { name: /Lisbon Trip/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/note\//);
  await expectNoNameViolations(page);
});

test('Settings has no button-name or link-name violations', async ({
  page,
}) => {
  await openHome(page);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expectNoNameViolations(page);
});
