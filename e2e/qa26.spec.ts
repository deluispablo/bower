/**
 * pile-set-aside-reason-visible (qa-23): the Inbox tells the person what
 * needs them. A pile a tidy-up would set aside says why, on the Inbox and on
 * its own screen, with its action (Try again, or Remove this pile); the
 * reason stays after a run and goes with the pile. The upload queue's notice
 * shows once for the whole Inbox, only while something waits to be sent
 * (TL-P2-19). Phone and desktop, on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expectAxeClean } from './axe';
import { expect, isFake, openTidy, test } from './fixtures';

const CHANGED = 'Some of its things changed after they were added. Remove it and add them again.';
const NOT_ARRIVED = 'Some of its things have not arrived yet.';
const PERSIST_REFUSED = 'This browser may clear what Bower keeps here. Keep Bower open until everything is sent.';
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

/** Adds a pile of one file from Add, and waits until it is in Drive (no longer sending). */
async function addPile(page: Page, text: string, file: string): Promise<void> {
  await open(page, '/add');
  await page.locator('textarea').first().fill(text);
  await page.locator('input[type=file][multiple]').setInputFiles({ name: file, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF ${file}`) });
  await page.getByRole('button', { name: 'Add 1 thing to the inbox' }).click();
  await expect(toast(page, '1 thing in the inbox')).toBeVisible();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
  await expect(rowOf(page, new RegExp(text))).toBeVisible();
}

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

/**
 * Waits until `file` is in Drive, the queue is empty and the pretend Drive's
 * kept copy has stopped changing; then changes the file there as another
 * device would, and reloads.
 */
async function elsewhere(page: Page, file: string, change: 'edit' | 'lose'): Promise<void> {
  await expect.poll(() => queueEmpty(page)).toBe(0);
  const kept = (): Promise<string | null> => page.evaluate((key) => sessionStorage.getItem(key), FAKE_KEY);
  let last: string | null = null;
  await expect
    .poll(async () => {
      const now = await kept();
      const stable = now !== null && now === last && (JSON.parse(now) as Kept).files.some((f) => f.meta.name === file && !f.trashed && f.content !== null);
      last = now;
      return stable;
    }, { intervals: [500] })
    .toBe(true);
  await page.evaluate(([key, name, how]) => {
    const kept = JSON.parse(sessionStorage.getItem(key) ?? '{}') as Kept;
    if (how === 'lose') kept.files = kept.files.filter((f) => f.meta.name !== name);
    else for (const f of kept.files) if (f.meta.name === name) {
      f.content = { text: 'Edited somewhere else' };
      f.meta.modifiedTime = new Date(Date.parse(f.meta.modifiedTime) + 60_000).toISOString();
    }
    sessionStorage.setItem(key, JSON.stringify(kept));
  }, [FAKE_KEY, file, change] as const);
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
}

/** Tidies up from Home and closes the result. */
async function tidyUp(page: Page): Promise<void> {
  await openTidy(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things?$/ }).click();
  await expect(page.getByRole('dialog').getByText(/^Done\./).last()).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** The changed pile, from the Inbox to its screen and back: the reason, the changed thing, Remove. */
async function changedPileSaysWhy(page: Page, name: RegExp, thing: string): Promise<void> {
  const row = rowOf(page, name);
  await expect(row.getByText(CHANGED, { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Remove this pile', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
  await axeClean(page);
  await row.getByRole('link', { name }).click();
  await expect(page).toHaveURL(/\/pile\//);
  await expect(page.getByRole('main').getByText(CHANGED, { exact: true })).toBeVisible();
  const things = page.getByRole('list', { name: 'In this pile' });
  await expect(things.getByRole('listitem').filter({ hasText: thing })).toContainText('Changed');
  await expect(things).not.toContainText("Didn't arrive");
  await expect(page.getByRole('main').getByRole('button', { name: /^Remove/ })).toHaveText(['Remove this pile']);
  await axeClean(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(inbox(page)).toBeVisible();
}

/** Remove from the Inbox asks first, then the pile and its reason go. */
async function removeFromInbox(page: Page, name: RegExp): Promise<void> {
  const row = rowOf(page, name);
  await row.getByRole('button', { name: 'Remove this pile', exact: true }).click();
  await row.getByRole('button', { name: 'Remove the pile', exact: true }).click();
  await expect(toast(page, 'Pile removed')).toBeVisible();
  await expect(inbox(page).getByRole('link', { name })).toHaveCount(0);
  // The last tidy-up's report keeps its set-aside row as history (prod1-partial-results); the Inbox drops it.
  await expect(inbox(page).getByText(CHANGED, { exact: true })).toHaveCount(0);
}

test('demo: a set-aside pile says why on the Inbox and its screen, stays after a tidy-up, and goes when removed', async ({ page }) => {
  test.skip(isFake, 'demo-only control: the sample piles live in the demo panel');
  test.setTimeout(60_000);
  await open(page, '/');
  await page.getByRole('button', { name: 'Demo situations' }).click();
  await page.getByRole('button', { name: 'A pile set aside', exact: true }).click();
  await page.getByRole('button', { name: 'Just a note', exact: true }).click();
  await page.getByRole('complementary', { name: 'Demo situations' }).getByRole('button', { name: 'Close' }).click();
  await changedPileSaysWhy(page, /Bank letters for the mortgage/, 'Statement_March.pdf');
  await tidyUp(page);
  await expect(inbox(page).getByRole('link', { name: /bins go out/i })).toHaveCount(0);
  await expect(rowOf(page, /Bank letters for the mortgage/).getByText(CHANGED, { exact: true })).toBeVisible();
  await removeFromInbox(page, /Bank letters for the mortgage/);
});

test('fake: a thing changed in Drive says why on the Inbox and its screen, stays after a tidy-up, and goes when removed', async ({ page }) => {
  test.skip(!isFake, 'the pretend Drive is changed as another device would');
  test.setTimeout(60_000);
  await addPile(page, 'Papers from Alex', 'a.pdf');
  await expect(rowOf(page, /Papers from Alex/).getByText(CHANGED, { exact: true })).toHaveCount(0);
  await elsewhere(page, 'a.pdf', 'edit');
  await changedPileSaysWhy(page, /Papers from Alex/, 'a.pdf');
  // One ready pile beside it, sent before the tidy-up, so the run has something to take (TL-P2-21: a run with only
  // held piles admits nothing); the changed pile stays held.
  await addPile(page, 'Receipts for the boiler', 'boiler.pdf');
  await expect.poll(() => queueEmpty(page)).toBe(0);
  await expect(rowOf(page, /Papers from Alex/).getByText(CHANGED, { exact: true })).toBeVisible();
  await tidyUp(page);
  await expect(inbox(page).getByRole('link', { name: /Receipts for the boiler/ })).toHaveCount(0);
  await expect(rowOf(page, /Papers from Alex/).getByText(CHANGED, { exact: true })).toBeVisible();
  await removeFromInbox(page, /Papers from Alex/);
});

test('fake: the device notice shows once while something waits to be sent and goes when it is sent; a lost thing says Try again', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the upload queue and the pretend Drive are the fake source');
  allowConsole(/BowerError: Choose c\.pdf again on this device to send it\./, 'file lost after upload failure');
  test.setTimeout(60_000);
  // This browser will not promise to keep what Bower stores here, and another tab holds the uploads
  // until the test lets this one take its turn: what waits is held still, with no race.
  await page.addInitScript(() => {
    if (navigator.storage) Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false });
    const locks = navigator.locks;
    const real = locks.request.bind(locks) as (...args: unknown[]) => Promise<unknown>;
    let free!: () => void;
    const turn = new Promise<void>((r) => { free = r; });
    (window as unknown as { bowerTakeTurn: () => void }).bowerTakeTurn = () => free();
    Object.defineProperty(locks, 'request', {
      configurable: true,
      value: (name: string, ...args: unknown[]) => {
        if (!name.startsWith('bower-uploads:') || typeof args[0] === 'function') return real(name, ...args);
        const [opts, cb] = args as [LockOptions, LockGrantedCallback<unknown>];
        if (opts.ifAvailable) return Promise.resolve(cb(null));
        return turn.then(() => real(name, opts, cb));
      },
    });
  });
  await addPile(page, 'Receipts from Alex', 'c.pdf');
  const things = rowOf(page, /Receipts from Alex/);
  await expect(inbox(page).getByText(PERSIST_REFUSED, { exact: true })).toHaveCount(1);
  await expect(things).not.toContainText(PERSIST_REFUSED);
  await axeClean(page);
  // This tab takes its turn: the thing is sent and the notice goes, without a reload.
  await page.evaluate(() => (window as unknown as { bowerTakeTurn: () => void }).bowerTakeTurn());
  await expect(inbox(page).getByText(PERSIST_REFUSED, { exact: true })).toHaveCount(0, { timeout: 15_000 });
  // After the reload no tab takes a turn again, so nothing kept on the device can send it again.
  await elsewhere(page, 'c.pdf', 'lose');
  await expect(things.getByText(NOT_ARRIVED, { exact: true })).toBeVisible();
  await expect(things.getByRole('button', { name: 'Remove this pile', exact: true })).toHaveCount(0);
  await things.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(toast(page, 'Choose c.pdf again on this device to send it.')).toBeVisible();
  // TL-P2-27 (3): Try again keeps its sentence and opens the pile, ready at the thing.
  await expect(page).toHaveURL(/\/pile\//);
  await expect(page.getByRole('main').getByText(NOT_ARRIVED, { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'In this pile' }).getByRole('listitem').filter({ hasText: 'c.pdf' })).toContainText("Didn't arrive");
  await expect(page.getByRole('main').getByRole('button', { name: 'Try again', exact: true })).toHaveCount(1);
  await axeClean(page);
});
