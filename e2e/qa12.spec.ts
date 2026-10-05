/** Regression checks from the independent P2 review and phone evaluation. */
import { expect, test } from './fixtures';

for (const type of ['note', 'folder'] as const) {
  test(`phone creation refuses a leading dot and retries a dotted name (${type})`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the phone page menu and NameSheet');
    await page.goto('/files/Resources/Cooking?scenario=default&time=instant');
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    const title = type === 'note' ? 'New note' : 'New folder';
    const make = type === 'note' ? 'Make the note' : 'Make the folder';
    await page.getByRole('button', { name: 'More for Cooking', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: title, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: title, exact: true });
    await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill(type === 'note' ? '.Garden.md' : '.Garden');
    await sheet.getByRole('button', { name: make, exact: true }).click();
    await expect(page.getByRole('status').getByText('A name cannot start with a dot.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/files\/Resources\/Cooking(?:\?|$)/);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Cooking');
    await expect(sheet).toBeHidden();
    // NameSheet closes before saving; reopen the existing menu to retry.
    await page.getByRole('button', { name: 'More for Cooking', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: title, exact: true }).click();
    await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill('Garden.2026');
    await sheet.getByRole('button', { name: make, exact: true }).click();
    await expect(page).toHaveURL(type === 'note' ? /\/note\/Resources\/Cooking\/Garden\.2026\.md(?:\?|$)/ : /\/files\/Resources\/Cooking\/Garden\.2026(?:\?|$)/);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Garden.2026');
  });
}

test('timeline source links use plain file names and retain aliases', async ({ page, isMobile }) => {
  const flat = '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md';
  await page.goto(`${flat}?scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });
  const lease = timeline.getByRole('link', { name: 'Lease draft', exact: true });
  const photo = timeline.getByRole('link', { name: 'IMG_2290', exact: true });
  await expect(page.getByRole('main').locator('dl').getByRole('link', { name: 'Lease draft', exact: true })).toHaveAttribute('href', '/note/Projects/Flat%20hunt/Lease%20draft.pdf');
  await expect(lease).toBeVisible();
  await expect(lease).toHaveAttribute('href', '/note/Projects/Flat%20hunt/Lease%20draft.pdf');
  await expect(photo).toHaveAttribute('href', '/note/Projects/Flat%20hunt/Viewing%20photos/IMG_2290.jpg');
  const web = timeline.getByRole('link', { name: 'flat-listing.example', exact: true });
  await expect(web).toHaveAttribute('href', 'https://flat-listing.example');
  await expect(web).toHaveAttribute('target', '_blank');
  await lease.click();
  await expect(page).toHaveURL(/\/note\/Projects\/Flat%20hunt\/Lease%20draft\.pdf(?:\?|$)/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Lease draft');
  await page.goBack();
  await photo.click();
  await expect(page).toHaveURL(/\/note\/Projects\/Flat%20hunt\/Viewing%20photos\/IMG_2290\.jpg(?:\?|$)/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('IMG_2290');
  await page.goto('/note/Projects/Flat%20hunt/Flat%207%2C%20Cobble%20Row.md?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const alias = timeline.getByRole('link', { name: 'Lease copy.pdf', exact: true });
  await expect(alias).toBeVisible();
  await expect(alias).toHaveAttribute('href', '/note/Projects/Flat%20hunt/Lease%20draft.pdf');
  const otherWeb = timeline.getByRole('link', { name: 'cobble-row-listing.example', exact: true });
  await expect(otherWeb).toHaveAttribute('href', 'https://cobble-row-listing.example');
  await alias.click();
  await expect(page).toHaveURL(/\/note\/Projects\/Flat%20hunt\/Lease%20draft\.pdf(?:\?|$)/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Lease draft');
  await page.goto('/files/Projects/Flat%20hunt/Viewing%20photos?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  if (isMobile) {
    await page.getByRole('button', { name: 'More for Viewing photos', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Rename', exact: true }).click();
    const rename = page.getByRole('dialog', { name: 'Rename', exact: true });
    await rename.getByRole('textbox', { name: 'Name', exact: true }).fill('Viewing photos.2026');
    await rename.getByRole('button', { name: 'Rename', exact: true }).click();
  } else {
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    await tree.getByRole('treeitem', { name: /^Viewing photos/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await page.getByRole('textbox', { name: 'New name for Viewing photos', exact: true }).fill('Viewing photos.2026');
    await page.keyboard.press('Enter');
  }
  await expect(page).toHaveURL(/\/files\/Projects\/Flat%20hunt\/Viewing%20photos\.2026(?:\?|$)/);
  // Keep the same source instance and its rename journal while returning to the note.
  if (isMobile) await page.getByRole('button', { name: 'Back', exact: true }).click();
  else await page.getByRole('link', { name: 'Projects / Flat hunt', exact: true }).first().click();
  await page.getByRole('main').getByRole('link', { name: /^Flat 7, Cobble Row/ }).click();
  const folder = timeline.getByRole('link', { name: 'Viewing photos.2026', exact: true });
  await expect(folder).toBeVisible();
  await folder.click();
  await expect(page).toHaveURL(/\/files\/Projects\/Flat%20hunt\/Viewing%20photos\.2026(?:\?|$)/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Viewing photos.2026');
});
