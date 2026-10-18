/**
 * single-active-session-screen (qa-25, TL-P2-13/14/24/25): one active Bower
 * per person. A second page asks before taking over and the first keeps
 * working; Use here moves the session without a reload and the first page
 * then shows the same screen, whose Use here moves it back; a reload of the
 * active page stays active; closing the active page lets the next one open
 * without asking. On fake, a blocked page writes nothing to its pretend
 * Drive. Phone and desktop, on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expectAxeClean } from './axe';
import { expect, isFake, test, withSource } from './fixtures';

const BLOCKED = 'Bower is open in another window.';
const ADDRESS = '/?scenario=default&time=instant';
const FAKE_KEY = 'bower:fake:default';

const settled = async (page: Page): Promise<void> => {
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const another = async (page: Page): Promise<Page> => {
  const next = await page.context().newPage();
  await next.goto(withSource(ADDRESS));
  await settled(next);
  return next;
};
const home = (page: Page) => page.getByRole('heading', { level: 1, name: /Hello, Alex/ });
const blocked = (page: Page) => page.getByRole('heading', { level: 1, name: BLOCKED });
const useHere = (page: Page) => page.getByRole('button', { name: 'Use here' });

/** Marks the page's document, so a reload (which forgets the mark) shows. */
const mark = (page: Page): Promise<void> =>
  page.evaluate(() => {
    (window as unknown as { kept?: boolean }).kept = true;
  });
const marked = (page: Page): Promise<boolean> => page.evaluate(() => (window as unknown as { kept?: boolean }).kept === true);

test('a second page asks before taking over, and the first keeps working', async ({ page }) => {
  await page.goto(ADDRESS);
  await settled(page);
  await expect(home(page)).toBeVisible();
  const second = await another(page);
  await expect(blocked(second)).toBeVisible();
  await expect(useHere(second)).toBeVisible();
  await expect(useHere(second)).toBeFocused();
  await expect(home(second)).toHaveCount(0);
  // Only the screen shows: one Bower, no tabs or other screens behind it.
  await expect(second.locator('[data-bird]')).toHaveCount(1);
  await expect(second.getByRole('navigation')).toHaveCount(0);
  await expectAxeClean(second, { include: 'main' });
  // The first page was never asked: it goes on as before.
  await expect(blocked(page)).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main' }).locator('a[href="/add"]').click();
  await expect(page).toHaveURL(/\/add/);
  await expect(blocked(page)).toHaveCount(0);
  await second.close();
});

test('Use here moves the session without a reload, and the first page can move it back', async ({ page }) => {
  await page.goto(ADDRESS);
  await settled(page);
  await expect(home(page)).toBeVisible();
  const second = await another(page);
  await expect(blocked(second)).toBeVisible();
  await mark(page);
  await mark(second);

  await useHere(second).click();
  await expect(home(second)).toBeVisible();
  await expect(blocked(second)).toHaveCount(0);
  expect(await marked(second)).toBe(true);
  await expect(blocked(page)).toBeVisible();
  await expect(useHere(page)).toBeVisible();

  await useHere(page).click();
  await expect(home(page)).toBeVisible();
  expect(await marked(page)).toBe(true);
  await expect(blocked(second)).toBeVisible();
  await second.close();
});

test('a reload of the active page stays active; closing it lets the next page open without asking', async ({ page }) => {
  await page.goto(ADDRESS);
  await settled(page);
  await expect(home(page)).toBeVisible();
  const second = await another(page);
  await expect(blocked(second)).toBeVisible();

  await page.reload();
  await settled(page);
  await expect(home(page)).toBeVisible();
  await expect(blocked(page)).toHaveCount(0);
  await expect(blocked(second)).toBeVisible();

  await page.close();
  const third = await another(second);
  await expect(home(third)).toBeVisible();
  await expect(blocked(third)).toHaveCount(0);
  await third.close();
  await second.close();
});

type Kept = { files: Array<{ meta: { id: string; name: string; parents: string[]; folder?: boolean }; trashed: boolean }> };
const keptOf = (page: Page): Promise<string | null> => page.evaluate((key) => sessionStorage.getItem(key), FAKE_KEY);
const hasFile = (kept: string | null, name: string): boolean => kept !== null && (JSON.parse(kept) as Kept).files.some((f) => f.meta.name === name && !f.trashed);

test('after a takeover the blocked page writes nothing, while the active one sends what waited', async ({ page }) => {
  test.skip(!isFake, 'the pretend Drive is the fake source');
  await page.goto(ADDRESS);
  await settled(page);
  await expect(home(page)).toBeVisible();
  const second = await another(page);
  await useHere(second).click();
  await expect(home(second)).toBeVisible();
  await expect(blocked(page)).toBeVisible();

  // One change waits in this browser's outbox. The outbox is per browser and Bower folder, shared by
  // both pages, so it is put there after the takeover: Use here sends what waits, and would take it.
  await expect.poll(() => keptOf(page)).not.toBeNull();
  const kept = await keptOf(page);
  const root = (JSON.parse(kept ?? '{"files":[]}') as Kept).files.find((f) => f.meta.folder && f.meta.name === 'Bower' && f.meta.parents[0] === 'root')?.meta.id;
  expect(root).toBeTruthy();
  const line = { v: 1, id: '2026-01-02T03-04-05.000Z-qa27ab', at: Date.parse('2026-01-02T03:04:05Z'), kind: 'task', what: 'Water the plants', device: 'qa27' };
  const outbox = `bower:outbox:${root ?? ''}`;
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [outbox, JSON.stringify([line])] as const);
  const waiting = (): Promise<string | null> => page.evaluate((key) => localStorage.getItem(key), outbox);

  // Back online is when a page sends what waited: first the blocked page hears it, then the active one.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await second.evaluate(() => window.dispatchEvent(new Event('online')));
  // The active page sends the line into its own pretend Drive and empties the outbox ...
  await expect.poll(waiting).toBeNull();
  await expect.poll(async () => hasFile(await keptOf(second), `${line.id}.json`)).toBe(true);
  // ... and by then the blocked page, told first, has written nothing.
  expect(hasFile(await keptOf(page), `${line.id}.json`)).toBe(false);
  expect(await keptOf(page)).toBe(kept);
  await expect(blocked(page)).toBeVisible();
  await second.close();
});
