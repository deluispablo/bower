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

import {
  bowerPart,
  expect,
  openHome,
  openSettings,
  test,
  visible,
} from './demo.js';

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
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Lisbon');
  await switcher
    .getByRole('option', { name: /Lisbon Trip/ })
    // The folder of the same name is listed first (#593): open the note.
    .filter({ has: page.locator('[data-kind="note"]') })
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

test('the Bower tab has no button-name or link-name violations', async ({
  page,
}) => {
  await openHome(page);
  await visible(page.getByRole('link', { name: /^Bower$/ })).click();
  await page.getByRole('button', { name: 'Things you can ask' }).click();
  await expect(bowerPart(page, 'Rules')).toBeVisible();
  await expectNoNameViolations(page);
});

test('Ideas has no button-name or link-name violations, and its nine Copy links each get a distinct name (#511)', async ({
  page,
}) => {
  await openHome(page);
  await page.goto('/ideas');
  // `.screen-title` (the h1) is phone-hidden — the crumb slot has the
  // title there instead (`flows.e2e.ts`'s Ideas test) — so wait on a row
  // instead of the heading.
  await expect(
    page.getByRole('link', { name: /^Copy:/ }).first(),
  ).toBeVisible();
  await expectNoNameViolations(page);

  const names = await page
    .getByRole('link', { name: /^Copy:/ })
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute('aria-label')),
    );
  expect(names.length).toBeGreaterThan(1);
  expect(new Set(names).size).toBe(names.length);
});

/** The tree and list roles' rules (#920 T-4, T-5). */
const ROLE_RULES = [
  'aria-required-children',
  'aria-required-parent',
  'nested-interactive',
];

async function expectNoRoleViolations(
  page: Page,
  include: string,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include(include)
    .withRules(ROLE_RULES)
    .analyze();
  expect(results.violations).toEqual([]);
}

async function openLisbonNote(page: Page): Promise<void> {
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Lisbon');
  await switcher
    .getByRole('option', { name: /Lisbon Trip/ })
    .filter({ has: page.locator('[data-kind="note"]') })
    .first()
    .click();
  await expect(page).toHaveURL(/\/note\//);
}

test('the folders tree owns treeitems only, its chevrons inside them (#920 T-4)', async ({
  page,
}) => {
  await openHome(page);
  const desktop = (page.viewportSize()?.width ?? 0) >= 900;
  if (!desktop) {
    await page.getByRole('button', { name: 'Open your folders' }).click();
  }
  const host = desktop ? '.shell-sidebar' : '.folders-drawer';
  const tree = page.locator(`${host} [role="tree"]`).first();
  await expect(tree.getByRole('treeitem').first()).toBeVisible();
  await tree
    .getByRole('button', { name: /^Expand / })
    .first()
    .click();
  await expectNoRoleViolations(page, host);
});

test('Move to… holds radios only in its radiogroup (#920 T-4)', async ({
  page,
}) => {
  await openHome(page);
  await openLisbonNote(page);
  await visible(
    page.getByRole('button', { name: 'More for Lisbon Trip' }),
  ).click();
  await page.getByRole('menuitem', { name: /^Move to/ }).click();
  const group = page.getByRole('radiogroup', { name: 'Destination folder' });
  await expect(group.getByRole('radio').first()).toBeVisible();
  await expectNoRoleViolations(page, '.overlay-panel');
});

test('a quick switcher option holds no link or button (#920 T-5)', async ({
  page,
}) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('lease');
  await expect(switcher.getByRole('option').first()).toBeVisible();
  await expectNoRoleViolations(page, '.overlay-panel');
});

test('the first Tab on a root folder reaches Skip to content (#920 T-2)', async ({
  page,
}) => {
  await openHome(page);
  await page.goto('/folder/1-Projects');
  await expect(
    page.locator('h1.page-header-title', { hasText: 'Projects' }),
  ).toBeVisible();
  // The tree has opened on the folder and scrolled to it.
  await expect(page.locator('.tree-row-open').first()).toBeAttached();
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
});
