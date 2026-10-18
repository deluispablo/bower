/**
 * ux-ask-and-empty-states: the destinations say Ask, an empty Files root explains the four folders, and the root
 * About me note says what Bower does with it without touching the note. Fake and demo, phone and desktop.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const PARA_LINE = 'Bower files things here after a tidy-up. Projects have an end, Areas go on, Resources are for later, Archive is done.';
const ABOUT_LINE = 'Bower reads this note to understand you.';

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
}
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main', exact: true });

test('AC1 destinations_say_ask', async ({ page, isMobile }) => {
  await open(page, '/?scenario=default&time=instant');
  const ask = mainNav(page).getByRole('link', { name: 'Ask', exact: true });
  await expect(ask).toBeVisible();
  if (!isMobile) {
    await expect(ask).toHaveAttribute('title', 'Ask');
    await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  }
  await expect(page.getByRole('link', { name: /Talk to Bower/ })).toHaveCount(0);
  await ask.click();
  await expect(page).toHaveURL(/\/bower(\?|$)/);
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Bower' })).toBeVisible();
  await open(page, '/bower?scenario=default&time=instant');
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Bower' })).toBeVisible();
});

test('AC3 empty_files_explains_four_folders', async ({ page, isMobile }) => {
  await open(page, '/welcome?step=0&scenario=first&time=instant');
  await page.getByRole('button', { name: 'Make my Bower folder' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  // R11: in the app, never a new page load (the demo would build a world with no folder).
  if (isMobile) await mainNav(page).getByRole('link', { name: 'Files', exact: true }).click();
  else {
    await mainNav(page).getByRole('button', { name: 'Command palette' }).click();
    await page.getByRole('dialog', { name: 'Command palette' }).getByRole('option', { name: 'Open your folders' }).click();
  }
  await expect(page).toHaveURL(/\/files(\?|$)/);
  await expect(page.getByText(PARA_LINE, { exact: true })).toHaveCount(1);
  await open(page, '/files?scenario=default&time=instant');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(PARA_LINE, { exact: true })).toHaveCount(0);
});

type Kept = { files: Array<{ meta: { id: string; name: string; folder?: boolean; parents: string[]; modifiedTime?: string }; content: unknown; trashed: boolean }> };
/** The root About me note in the pretend Drive: its stored body and modifiedTime. */
const aboutMe = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const raw = sessionStorage.getItem('bower:fake:default');
    if (!raw) return null;
    const files = (JSON.parse(raw) as Kept).files;
    const root = files.find((f) => f.meta.folder && f.meta.name === 'Bower' && f.meta.parents[0] === 'root')?.meta.id;
    const file = files.find((f) => f.meta.name === 'About me.md' && f.meta.parents[0] === root && !f.trashed);
    return file ? JSON.stringify([file.content, file.meta.modifiedTime]) : null;
  });

test('AC3 root_about_me_line_keeps_body', async ({ page }) => {
  await open(page, '/files?scenario=default&time=instant');
  let kept: string | null = null;
  if (isFake) {
    await expect.poll(() => aboutMe(page)).not.toBeNull();
    kept = await aboutMe(page);
  }
  await open(page, '/note/About%20me.md?scenario=default&time=instant');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(ABOUT_LINE, { exact: true })).toHaveCount(1);
  if (isFake) {
    // A second's look over the kept state: nothing writes the note.
    const until = Date.now() + 1000;
    await expect.poll(async () => (await aboutMe(page)) === kept && Date.now() >= until, { timeout: 5000 }).toBe(true);
  }
});
