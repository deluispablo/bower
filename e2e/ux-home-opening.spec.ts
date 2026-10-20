import { expect, test } from './fixtures';
import type { Locator, Page } from '@playwright/test';

/** What the page saw: when the start-up screen left, what Home showed at that moment, and every layout shift. */
interface Opening {
  headingAt: number | null;
  leftAt: number | null;
  removedAt: number | null;
  sawLooking: boolean;
  snap: { sub: string | null; questions: string | null; buttons: string[]; placeholders: number } | null;
  shifts: Array<{ value: number; at: number; input: boolean }>;
}

/** Installed before the page's own scripts, so it sees the start-up screen from its first frame. */
async function record(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const o: Opening = { headingAt: null, leftAt: null, removedAt: null, sawLooking: false, snap: null, shifts: [] };
    (window as unknown as { __opening: Opening }).__opening = o;
    // Layout Instability API (web.dev/articles/cls): buffered, so shifts before this script's turn count too.
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        o.shifts.push({ value: e.value, at: e.startTime, input: e.hadRecentInput });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    let seen = false;
    new MutationObserver(() => {
      const boot = document.getElementById('boot');
      const root = document.getElementById('root');
      if (boot) seen = true;
      if (o.headingAt === null && root?.querySelector('h1')) o.headingAt = performance.now();
      if (seen && o.leftAt === null && (!boot || boot.classList.contains('leaving'))) {
        o.leftAt = performance.now();
        const inbox = root?.querySelector('section[aria-labelledby="inbox"]');
        o.snap = {
          sub: inbox?.querySelector('p.muted')?.textContent ?? null,
          questions: document.getElementById('qs')?.textContent ?? null,
          buttons: [...(root?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim() ?? ''),
          placeholders: root?.querySelectorAll('[role="status"][aria-label^="Opening"]').length ?? 0,
        };
      }
      if (seen && !boot && o.removedAt === null) o.removedAt = performance.now();
      if (o.leftAt !== null && root?.textContent?.includes('Looking…')) o.sawLooking = true;
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}
const opening = (page: Page): Promise<Opening> => page.evaluate(() => (window as unknown as { __opening: Opening }).__opening);
/** Where a box starts: its size may follow its text, its place may not move. */
const at = async (l: Locator): Promise<{ x: number; y: number } | null> => {
  const box = await l.boundingBox();
  return box && { x: box.x, y: box.y };
};
const releaseInbox = (page: Page): Promise<void> => page.evaluate(() => (window as unknown as { __releaseInbox: () => void }).__releaseInbox());

test('AC1 first_frame: reads that land before the cap open Home finished, with no late insertion', async ({ page }) => {
  await record(page);
  await page.goto('/?scenario=inbox-held&time=instant');
  const boot = page.locator('#boot');
  await expect(boot.locator('b')).toHaveText('Still opening', { timeout: 6000 });
  await releaseInbox(page);
  await expect(boot).toHaveCount(0);
  const inbox = page.getByRole('region', { name: 'Inbox' });
  await expect(inbox.locator('p.muted').first()).toHaveText(/^\d+ things? waiting/);
  const { snap, sawLooking } = await opening(page);
  // The first uncovered frame is the finished one: the count, the questions, and the checklist's Tidy up.
  expect(snap?.sub).toBe(await inbox.locator('p.muted').first().textContent());
  expect(snap?.questions).toMatch(/^\d+ questions? for you$/);
  expect(snap?.questions).toBe(await page.locator('#qs').textContent());
  expect(snap?.buttons).toContain('Tidy up');
  expect(snap?.placeholders).toBe(0);
  expect(sawLooking).toBe(false);
});

test('AC2 cap: a held read keeps the screen past 3 s; at about 8 s Home opens with placeholders, and nothing moves when it lands', async ({ page }) => {
  test.setTimeout(45_000);
  await record(page);
  await page.goto('/?scenario=inbox-held&time=instant');
  const boot = page.locator('#boot');
  await expect(boot.locator('b')).toHaveText('Still opening', { timeout: 6000 });
  await expect(boot).toHaveCount(0, { timeout: 12_000 });
  const { leftAt } = await opening(page);
  expect(leftAt).toBeGreaterThan(7500);
  expect(leftAt).toBeLessThan(9500);
  const inbox = page.getByRole('region', { name: 'Inbox' });
  await expect(inbox.getByRole('status', { name: 'Opening your inbox' })).toBeVisible();
  await expect(page.getByText('Looking…')).toHaveCount(0);
  // Usable: nothing covers it (a trial click checks that the button would get the press).
  await inbox.getByRole('button', { name: 'Add a pile' }).click({ trial: true });
  const checklist = page.getByRole('region', { name: 'Your first tidy-up' });
  const before = { inbox: await at(page.locator('#inbox')), checklist: await at(checklist) };
  await releaseInbox(page);
  await expect(inbox.locator('a[href^="/pile/"]').first()).toBeVisible();
  await expect(inbox.locator('p.muted').first()).toHaveText(/^\d+ things? waiting/);
  await expect(inbox.getByRole('status', { name: 'Opening your inbox' })).toHaveCount(0);
  expect(await at(page.locator('#inbox'))).toEqual(before.inbox);
  expect(await at(checklist)).toEqual(before.checklist);
  // First-ten-second CLS, without shifts that follow input (web.dev/articles/cls).
  await page.waitForFunction(() => performance.now() > 10_000);
  const { shifts } = await opening(page);
  const cls = shifts.filter((s) => !s.input && s.at < 10_000).reduce((sum, s) => sum + s.value, 0);
  expect(cls).toBeLessThan(0.1);
});

test('AC3 signed_out: sign-in shows within 600 ms of being ready, without Bower’s landing', async ({ page }) => {
  // The clock stands still from the first script (playwright.dev/docs/clock): only runFor moves it.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto('/sign-in?scenario=signed-out&time=instant');
  await expect(page.locator('#root h1')).toBeAttached();
  await page.clock.runFor(600);
  await expect(page.locator('#boot')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('AC3 deep_link: a deep link does not wait for Home’s reads', async ({ page }) => {
  await record(page);
  await page.goto('/files/Projects?scenario=inbox-held&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 7000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  expect((await opening(page)).leftAt).toBeLessThan(7000);
});
