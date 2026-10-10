import { animationsEnd, expectAxeClean } from './axe';
import { expect, test } from './fixtures';

const COPY = 'This note is empty. To write in it, open your Bower folder on your computer with Google Drive for desktop, then use any notes app.';

for (const width of [375, 1440]) {
  test(`empty-note help and Open in Drive at ${width}px`, async ({ page }) => {
    // Create through the same phone menu at either size, then measure the requested viewport.
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/files/Resources/Cooking?source=demo&scenario=default&time=instant');
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    await page.getByRole('button', { name: 'More for Cooking', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'New note', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'New note', exact: true });
    await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill('Soup ideas');
    await sheet.getByRole('button', { name: 'Make the note', exact: true }).click();
    await expect(page).toHaveURL(/\/note\/Resources\/Cooking\/Soup%20ideas\.md/);
    await page.setViewportSize({ width, height: 900 });
    const help = page.getByText(COPY, { exact: true });
    const action = page.getByRole('main').getByRole('button', { name: 'Open in Drive', exact: true });
    await expect(help).toBeVisible();
    await expect(action).toBeVisible();
    await animationsEnd(page);
    const textBox = await help.boundingBox();
    const buttonBox = await action.boundingBox();
    if (!textBox || !buttonBox) throw new Error('Empty-note help or action has no box.');
    expect(buttonBox.width).toBeGreaterThanOrEqual(44);
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    const row = help.locator('..');
    await expect(row.getByRole('button', { name: 'Open in Drive', exact: true })).toBeVisible();
    expect(await row.evaluate((el) => getComputedStyle(el).gap)).toBe('12px');
    if (width === 375) {
      expect(buttonBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height);
      expect(buttonBox.x).toBe(textBox.x);
    } else {
      expect(buttonBox.x).toBeGreaterThanOrEqual(textBox.x + textBox.width);
      expect(buttonBox.y).toBeLessThan(textBox.y + textBox.height);
      expect(buttonBox.y + buttonBox.height).toBeGreaterThan(textBox.y);
    }
    await expectAxeClean(page, { include: 'main article', wcag22: true });
    await action.click();
    await expect(page.getByRole('status').getByText('This demo has no folder in Google Drive.', { exact: true })).toBeVisible();
  });
}
