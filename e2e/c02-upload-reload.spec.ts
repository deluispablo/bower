import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

// Hold the existing upload lock, as qa26 does, so files stay waiting across reloads without a timing race.
async function holdSending(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const locks = navigator.locks;
    const real = locks.request.bind(locks) as (...args: unknown[]) => Promise<unknown>;
    Object.defineProperty(locks, 'request', { configurable: true, value: (name: string, ...args: unknown[]) => {
      if (!name.startsWith('bower-uploads:') || typeof args[0] === 'function') return real(name, ...args);
      const [opts, cb] = args as [LockOptions, LockGrantedCallback<unknown>];
      if (opts.ifAvailable) return Promise.resolve(cb(null));
      return new Promise<unknown>(() => undefined);
    } });
  });
}

async function addTwo(page: Page): Promise<void> {
  await page.goto('/add?scenario=empty&time=demo');
  await page.locator('textarea').first().fill('Papers from Alex');
  await page.locator('input[type=file][multiple]').setInputFiles(['a.pdf', 'b.pdf'].map((name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF ${name}`) })));
  await page.getByRole('button', { name: 'Put 2 things in the inbox', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Inbox' }).getByRole('link', { name: /Papers from Alex/ })).toBeVisible();
}

async function keptCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((db) => db.name === 'bower-uploads')) return 0;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('bower-uploads');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      if (!db.objectStoreNames.contains('pending')) return 0;
      return await new Promise<number>((resolve, reject) => {
        const count = db.transaction('pending').objectStore('pending').count();
        count.onsuccess = () => resolve(count.result);
        count.onerror = () => reject(count.error);
      });
    } finally { db.close(); }
  });
}

for (const width of [375, 1440]) {
  test(`c02-upload-count-ui: Reload while files are sending at ${width}`, async ({ page }) => {
    await resize(page, { width, height: 900 });
    await holdSending(page);
    await addTwo(page);
    let pickers = 0;
    page.on('filechooser', () => { pickers += 1; });
    await page.reload();
    const row = page.getByRole('region', { name: 'Inbox' }).getByRole('listitem').filter({ has: page.getByRole('link', { name: /Papers from Alex/ }) });
    await expect(row).toBeVisible();
    await expectAxeClean(page, { include: 'main', wcag22: true });
    await row.getByRole('link', { name: /Papers from Alex/ }).click();
    await expect(page.getByRole('list', { name: 'In this pile' })).toContainText(/sending|waiting/i);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(pickers).toBe(0);
    await expectAxeClean(page, { include: 'main', wcag22: true });
  });

  test(`c02-upload-count-ui: Sign out while 2 things send at ${width}`, async ({ page }) => {
    await resize(page, { width, height: 900 });
    await holdSending(page);
    await addTwo(page);
    await expect.poll(() => keptCount(page)).toBe(2);
    await page.getByRole('link', { name: 'Your account and settings' }).click();
    await expectAxeClean(page, { include: 'main', wcag22: true });
    const opener = page.getByRole('button', { name: 'Sign out', exact: true });
    await opener.click();
    const sheet = page.getByRole('dialog', { name: 'Sign out now?', exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("2 things you added are still sending from this device. If you sign out now, they stop and you'll need to add them again.", { exact: true })).toBeVisible();
    const keep = sheet.getByRole('button', { name: 'Keep sending', exact: true });
    const signOut = sheet.getByRole('button', { name: 'Sign out', exact: true });
    await expect(keep).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(signOut).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(keep).toBeFocused();
    await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
    await keep.click();
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await keptCount(page)).toBe(2);
    await opener.click();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await keptCount(page)).toBe(2);
    await opener.click();
    await signOut.click();
    await expect.poll(() => keptCount(page)).toBe(0);
    await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  });

  test(`c02-upload-count-ui: Sign out with nothing sending at ${width}`, async ({ page }) => {
    await resize(page, { width, height: 900 });
    await page.goto('/settings?scenario=empty&time=instant');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expectAxeClean(page, { include: 'main', wcag22: true });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Sign out now?', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  });
}
