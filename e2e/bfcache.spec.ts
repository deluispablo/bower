/**
 * bfcache-reload (qa-25, TL-P2-28): a page restored from the back/forward
 * cache reloads (web.dev/articles/bfcache), so it never writes with the
 * session it held before. Playwright's Chromium runs with the cache turned
 * off, so the restore is the browser's own events (`pagehide`, then
 * `pageshow` with `persisted`), dispatched on the page. The reloaded page
 * starts afresh: it takes the lease again (a second page then asks first)
 * and, on fake, sends what waited in this browser's outbox.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test, withSource } from './fixtures';

const ADDRESS = '/?scenario=default&time=instant';
const FAKE_KEY = 'bower:fake:default';

const settled = async (page: Page): Promise<void> => {
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const home = (page: Page) => page.getByRole('heading', { level: 1, name: /Hello, Alex/ });
const blocked = (page: Page) => page.getByRole('heading', { level: 1, name: 'Bower is open in another window.' });

/** Marks the page's document, so a reload (which forgets the mark) shows. */
const mark = (page: Page): Promise<void> =>
  page.evaluate(() => {
    (window as unknown as { kept?: boolean }).kept = true;
  });
const marked = (page: Page): Promise<boolean> => page.evaluate(() => (window as unknown as { kept?: boolean }).kept === true);

/** Leaves the page and comes back to it from the back/forward cache; settles once it loaded again. */
async function restore(page: Page): Promise<void> {
  const loaded = page.waitForEvent('load');
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    // After this call returns, so the reload does not cut it short.
    setTimeout(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })), 0);
  });
  await loaded;
  await settled(page);
}

type Kept = { files: Array<{ meta: { id: string; name: string; parents: string[]; folder?: boolean }; trashed: boolean }> };
const keptOf = (page: Page): Promise<string | null> => page.evaluate((key) => sessionStorage.getItem(key), FAKE_KEY);
const hasFile = (kept: string | null, name: string): boolean => kept !== null && (JSON.parse(kept) as Kept).files.some((f) => f.meta.name === name && !f.trashed);

test('a page restored from the back/forward cache reloads and starts afresh', async ({ page }) => {
  await page.goto(ADDRESS);
  await settled(page);
  await expect(home(page)).toBeVisible();
  await mark(page);
  await restore(page);
  // A new document: the restored one was never used again.
  expect(await marked(page)).toBe(false);
  await expect(home(page)).toBeVisible();
  await expect(blocked(page)).toHaveCount(0);
  // It holds the session again: another page asks first.
  const second = await page.context().newPage();
  await second.goto(withSource(ADDRESS));
  await settled(second);
  await expect(blocked(second)).toBeVisible();
  await second.close();
});

test('the outbox survives the reload and goes once the page holds the session again', async ({ page }) => {
  test.skip(!isFake, 'the outbox is the fake source');
  await page.goto(ADDRESS);
  await settled(page);
  await expect(home(page)).toBeVisible();
  await expect.poll(() => keptOf(page)).not.toBeNull();
  const root = (JSON.parse((await keptOf(page)) ?? '{"files":[]}') as Kept).files.find((f) => f.meta.folder && f.meta.name === 'Bower' && f.meta.parents[0] === 'root')?.meta.id;
  expect(root).toBeTruthy();
  const line = { v: 1, id: '2026-01-02T03-04-05.000Z-bfc4ab', at: Date.parse('2026-01-02T03:04:05Z'), kind: 'task', what: 'Water the plants', device: 'bfcache' };
  const outbox = `bower:outbox:${root ?? ''}`;
  // A line waits in this browser's outbox while the page is away (offline, say).
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [outbox, JSON.stringify([line])] as const);
  await restore(page);
  await expect(home(page)).toBeVisible();
  // The reloaded page sends it, once, with the session it just took.
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), outbox)).toBeNull();
  await expect.poll(async () => hasFile(await keptOf(page), `${line.id}.json`)).toBe(true);
});
