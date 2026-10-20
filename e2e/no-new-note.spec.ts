import { resize } from './viewport';
import type { Page } from '@playwright/test';
import { expectAxeClean } from './axe';
import { expect, test } from './fixtures';

async function noNewNote(page: Page): Promise<void> {
  await expect(page.getByLabel(/^New note(?: in .*)?$/, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^New note(?: in .*)?$/, { exact: true })).toHaveCount(0);
}

test('no New note control on desktop or phone', async ({ page }) => {
  for (const width of [1280, 375]) {
    const folderName = `Empty at ${width}`;
    await resize(page, { width, height: 900 });
    await page.goto('/files?scenario=default&time=instant');
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    await noNewNote(page);
    // ux-controls-polish: the phone's tree tools are one named menu.
    await expect(page.getByRole('button', { name: width === 1280 ? 'New folder' : 'Folder tools', exact: true })).toBeVisible();
    // The unchanged right panel has a pre-existing h3 after this page's h1 (see entry notes).
    // Match the folder specs' main scope; scan each opened menu or sheet separately below.
    await expectAxeClean(page, { include: 'main', wcag22: true });
    await page.getByRole('tree').locator('[data-path="Resources"]').click({ button: 'right' });
    await noNewNote(page);
    const actions = width === 1280 ? page.getByRole('menu') : page.getByRole('dialog');
    await expect(actions.getByRole(width === 1280 ? 'menuitem' : 'button', { name: 'New folder', exact: true })).toBeVisible();
    await expectAxeClean(page, { include: width === 1280 ? '[role="menu"]' : '[role="dialog"]', wcag22: true });
    await actions.getByRole(width === 1280 ? 'menuitem' : 'button', { name: 'New folder', exact: true }).click();
    if (width === 1280) {
      const name = page.getByRole('tree').getByRole('textbox', { name: 'New folder in Resources', exact: true });
      await expect(name).toBeFocused();
      await expect(name).toHaveValue('');
      await expect(name).toHaveAttribute('placeholder', 'Name');
      await name.fill(folderName);
      await name.press('Enter');
      await page.getByRole('tree').locator(`[data-path="Resources/${folderName}"]`).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Open as a list or table', exact: true }).click();
    } else {
      const sheet = page.getByRole('dialog', { name: 'New folder', exact: true });
      await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill(folderName);
      await sheet.getByRole('button', { name: 'Make the folder', exact: true }).click();
    }
    const headingName = width === 1280 ? folderName : `${folderName} More for ${folderName}`;
    const heading = page.getByRole('main').getByRole('heading', { name: headingName, exact: true });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText(folderName);
    await expect(page.getByText('Nothing in here yet.', { exact: true })).toBeVisible();
    await noNewNote(page);
    await expectAxeClean(page, { include: 'main', wcag22: true });
  }
});
