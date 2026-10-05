/** Regression checks from the independent P2 closure review. */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}?scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

test('Open in Drive explains the pretend source', async ({ page, isMobile }) => {
  await open(page, '/settings');
  const pages = page.context().pages().length;
  await page.getByRole('button', { name: 'Open in Drive', exact: true }).click();
  await expect(page.getByRole('status').getByText('This demo has no folder in Google Drive.')).toBeVisible();
  expect(page.context().pages()).toHaveLength(pages);
  await open(page, '/note/Projects/Flat%20hunt/Lease%20draft.pdf');
  if (isMobile) {
    await page.getByRole('button', { name: /^More for Lease draft(?:\.pdf)?$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Open in Drive', exact: true }).click();
  } else {
    await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /^Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open in Drive', exact: true }).click();
  }
  await expect(page.getByRole('status').getByText('This demo has no folder in Google Drive.')).toBeVisible();
  expect(page.context().pages()).toHaveLength(pages);
});

test('sending a request or rule keeps the composer keyboard', async ({ page }) => {
  await open(page, '/bower');
  const request = page.getByRole('textbox', { name: 'Your request' });
  await request.fill('Keep garden notes together');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(request).toHaveValue('');
  await expect(request).toBeFocused();
  await page.getByRole('radio', { name: 'A rule', exact: true }).click();
  const rule = page.getByRole('textbox', { name: 'The rule' });
  await rule.fill('Garden notes go together');
  await page.getByRole('button', { name: 'Keep this rule', exact: true }).click();
  await expect(rule).toHaveValue('');
  await expect(rule).toBeFocused();
});


test('a saved link has the same name in its desktop tab', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop tabs');
  await open(page, '/note/Inbox/curry-clipping.example.url');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('curry-clipping.example');
  await expect(page.getByRole('navigation', { name: 'Open tabs' }).getByRole('button', { name: 'curry-clipping.example', exact: true })).toBeVisible();
});

test('file names agree in search messages and the change list', async ({ page, isMobile }) => {
  await open(page, '/files/Projects/Flat%20hunt');
  const listed = page.getByRole('main').getByRole('link', { name: /^Lease draft/ });
  await expect(listed.locator('[class*="name"]')).toHaveText('Lease draft');
  await open(page, '/note/Projects/Flat%20hunt/Lease%20draft.pdf');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Lease draft');
  if (isMobile) {
    await page.getByRole('button', { name: 'More for Lease draft', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Lease draft', exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Bookmark', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('link', { name: 'Files', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Bookmarks' }).getByRole('button', { name: 'Lease draft', exact: true })).toBeVisible();
    return;
  }
  await open(page, '/');
  await page.getByRole('tablist', { name: 'Side panel' }).getByRole('tab', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search your notes and files' }).fill('Dentist reminder');
  const result = page.getByRole('tabpanel', { name: 'Search' }).getByRole('button', { name: /^Dentist reminder/ });
  await expect(result).toBeVisible();
  await expect(result.locator('[class*="resTitle"]')).toHaveText('Dentist reminder');
  await page.getByRole('tablist', { name: 'Side panel' }).getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Bookmark', exact: true }).click();
  await page.getByRole('tablist', { name: 'Side panel' }).getByRole('tab', { name: 'Bookmarks', exact: true }).click();
  const marked = page.getByRole('tabpanel', { name: 'Bookmarks' }).getByRole('button', { name: /^Lease draft/ });
  await expect(marked.locator('[class*="resTitle"]')).toHaveText('Lease draft');
  await page.getByRole('tablist', { name: 'Side panel' }).getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to Bin', exact: true }).click();
  await expect(page.getByRole('status').getByText('Lease draft is in the Bin of your Drive')).toBeVisible();
  await expect(page.getByRole('main').getByText('Put Lease draft in the Bin', { exact: true })).toBeVisible();
});
