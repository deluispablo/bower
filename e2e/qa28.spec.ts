/**
 * pile-member-reselection (qa-23, D02 part 2, TL-P2-07): a declared thing
 * whose bytes are not on this device is chosen again from the pile's Try
 * again. Only the same file is sent, once, under its declared member; a
 * different one is refused in one sentence and nothing is sent; the thing
 * that arrived is never sent again. A link is pasted again in the pile's
 * field, normalised as Add does. Try again in the Inbox says what to do and
 * opens the pile, ready at that thing (TL-P2-27). Phone and desktop, on fake
 * only: the demo keeps every pile in memory with nothing declared, so no
 * thing of it can be missing from a device; the pretend Drive loses the
 * thing as another device would see it.
 */
import type { Page } from '@playwright/test';
import { expectAxeClean } from './axe';
import { expect, isFake, test } from './fixtures';

const NOT_ARRIVED = 'Some of its things have not arrived yet.';
/** Approved (TL-P2-27): `NOT_THE_SAME_TEXT` in drive-vault.ts. */
const NOT_THE_SAME = "That isn't the same file. Choose the file you added before.";
const NOT_THE_SAME_LINK = "That isn't the same link. Paste the link you added before.";
const FAKE_KEY = 'bower:fake:empty';

const open = async (page: Page, path: string, scenario = 'empty', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').getByText(text);
const inbox = (page: Page) => page.getByRole('region', { name: 'Inbox' });
const rowOf = (page: Page, name: RegExp) => inbox(page).getByRole('listitem').filter({ has: page.getByRole('link', { name }) });
const axeClean = async (page: Page): Promise<void> => {
  await expectAxeClean(page, { include: 'main' });
};
const pdf = (name: string, text = `%PDF ${name}`) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(text) });

type Kept = { files: Array<{ meta: { name: string; parents: string[]; modifiedTime: string; folder?: boolean }; trashed: boolean; content: unknown }> };

/** Nothing waits in this device's upload queue: no record left in its IndexedDB (none at all if it was never made). */
const queueEmpty = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const known = await indexedDB.databases();
    if (!known.some((d) => d.name === 'bower-uploads')) return 0;
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
    } finally {
      db.close();
    }
  });

/** The pretend Drive as this tab keeps it. */
const kept = async (page: Page): Promise<Kept | null> => {
  const raw = await page.evaluate((key) => sessionStorage.getItem(key), FAKE_KEY);
  return raw === null ? null : (JSON.parse(raw) as Kept);
};

/** How many live files named `name` (or matching it) the pretend Drive keeps. */
const inDrive = async (page: Page, name: string | RegExp): Promise<number> => ((await kept(page))?.files ?? []).filter((f) => (typeof name === 'string' ? f.meta.name === name : name.test(f.meta.name)) && !f.trashed && !f.meta.folder).length;

/**
 * Waits until `file` is in Drive, the queue is empty and the pretend Drive's
 * kept copy has stopped changing; then takes the file out of it, as if it
 * had never left another device, and reloads: this device has no bytes for it.
 */
async function neverArrived(page: Page, file: string | RegExp): Promise<void> {
  await expect.poll(() => queueEmpty(page)).toBe(0);
  let last: string | null = null;
  await expect
    .poll(async () => {
      const now = JSON.stringify(await kept(page));
      const stable = now === last && (await inDrive(page, file)) === 1;
      last = now;
      return stable;
    }, { intervals: [500] })
    .toBe(true);
  await page.evaluate(([key, source, flags]) => {
    const was = JSON.parse(sessionStorage.getItem(key) ?? '{}') as Kept;
    const lost = new RegExp(source, flags);
    was.files = was.files.filter((f) => f.meta.folder || !lost.test(f.meta.name));
    sessionStorage.setItem(key, JSON.stringify(was));
  }, [FAKE_KEY, typeof file === 'string' ? `^${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$` : file.source, typeof file === 'string' ? '' : file.flags] as const);
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
}

/** Try again on the pile's screen opens the file picker; `file` is chosen in it. */
async function chooseAgain(page: Page, file: ReturnType<typeof pdf>): Promise<void> {
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('main').getByRole('button', { name: 'Try again', exact: true }).click();
  await (await picker).setFiles(file);
}

test('fake: a thing that never arrived is chosen again on its pile; only the same file is sent, once', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the pretend Drive loses the thing as another device would see it');
  allowConsole(/BowerError: Choose b\.pdf again on this device to send it\./, 'file missing after upload failure');
  allowConsole(/BowerError: That isn't the same file\. Choose the file you added before\./, 'wrong file selected');
  test.setTimeout(60_000);
  await open(page, '/add');
  await page.locator('textarea').first().fill('Papers from Alex');
  await page.locator('input[type=file][multiple]').setInputFiles([pdf('a.pdf'), pdf('b.pdf')]);
  await page.getByRole('button', { name: 'Add 2 things to the inbox' }).click();
  await expect(toast(page, '2 things in the inbox')).toBeVisible();
  await expect(rowOf(page, /Papers from Alex/)).toBeVisible();
  await neverArrived(page, 'b.pdf');

  // Try again in the Inbox says what to do and opens the pile, ready at the thing: no dead end.
  await expect(rowOf(page, /Papers from Alex/).getByText(NOT_ARRIVED, { exact: true })).toBeVisible();
  await rowOf(page, /Papers from Alex/).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(toast(page, 'Choose b.pdf again on this device to send it.')).toBeVisible();
  await expect(page).toHaveURL(/\/pile\//);
  await expect(page.getByRole('main').getByRole('button', { name: 'Try again', exact: true })).toBeFocused();
  const things = page.getByRole('list', { name: 'In this pile' });
  await expect(page.getByRole('main').getByText(NOT_ARRIVED, { exact: true })).toBeVisible();
  await expect(things.getByRole('listitem').filter({ hasText: 'b.pdf' })).toContainText("Didn't arrive");
  await axeClean(page);

  // Another file, even under the same name: refused in one sentence, and nothing is sent.
  await chooseAgain(page, pdf('b.pdf', '%PDF not b'));
  await expect(toast(page, NOT_THE_SAME)).toBeVisible();
  await expect(things.getByRole('listitem').filter({ hasText: 'b.pdf' })).toContainText("Didn't arrive");
  expect(await inDrive(page, 'b.pdf')).toBe(0);

  // The same file, under any name: sent once, and its sibling is not sent again.
  await chooseAgain(page, pdf('b copy.pdf', '%PDF b.pdf'));
  await expect(page.getByRole('main').getByText(NOT_ARRIVED, { exact: true })).toHaveCount(0, { timeout: 15_000 });
  await expect(things.getByRole('listitem').filter({ hasText: 'b.pdf' })).not.toContainText("Didn't arrive");
  await expect.poll(() => queueEmpty(page)).toBe(0);
  await expect.poll(() => inDrive(page, 'b.pdf')).toBe(1);
  expect(await inDrive(page, 'a.pdf')).toBe(1);
  expect(await inDrive(page, 'b copy.pdf')).toBe(0);
  await axeClean(page);
});

test('fake: a link that never arrived is pasted again on its pile; only the same link is sent, once', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the pretend Drive loses the thing as another device would see it');
  allowConsole(/BowerError: Paste the link again on this device to send it\./, 'link missing after upload failure');
  allowConsole(/BowerError: That isn't the same link\. Paste the link you added before\./, 'wrong link pasted');
  test.setTimeout(60_000);
  await open(page, '/add');
  await page.locator('textarea').first().fill('Reading from Alex');
  await page.locator('input[type=file][multiple]').setInputFiles([pdf('a.pdf')]);
  await page.getByRole('textbox', { name: 'Paste a link' }).fill('source.example/path');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByRole('button', { name: 'Add 2 things to the inbox' }).click();
  await expect(toast(page, '2 things in the inbox')).toBeVisible();
  await expect(rowOf(page, /Reading from Alex/)).toBeVisible();
  await neverArrived(page, /\.url$/);

  const row = rowOf(page, /Reading from Alex/);
  await expect(row.getByText(NOT_ARRIVED, { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(toast(page, 'Paste the link again on this device to send it.')).toBeVisible();
  await expect(page).toHaveURL(/\/pile\//);
  const field = page.getByRole('main').getByRole('textbox', { name: 'Paste a link' });
  await expect(field).toBeFocused();
  await axeClean(page);

  // Another link: refused in one sentence, and nothing is sent.
  await field.fill('source.example/other');
  await page.getByRole('main').getByRole('button', { name: 'Send', exact: true }).click();
  await expect(toast(page, NOT_THE_SAME_LINK)).toBeVisible();
  expect(await inDrive(page, /\.url$/)).toBe(0);

  // The same link, pasted as Add takes it: sent once, and its sibling is not sent again.
  await field.fill('https://source.example/path');
  await page.getByRole('main').getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('main').getByText(NOT_ARRIVED, { exact: true })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('main').getByRole('textbox', { name: 'Paste a link' })).toHaveCount(0);
  await expect.poll(() => inDrive(page, /\.url$/)).toBe(1);
  expect(await inDrive(page, 'a.pdf')).toBe(1);
  await axeClean(page);
});
