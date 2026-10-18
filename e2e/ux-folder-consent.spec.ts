/**
 * ux-folder-consent: Bower asks before it makes the folder. Opening the page, reloading it or arriving by an old
 * tour address makes nothing; the press makes it once; an existing folder says welcome back. Fake only: the
 * Bower folders in the pretend Drive's root are counted. One Bower animates at a time, and each opt-out stills it.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';
import { expectAxeClean } from './axe';

const CREATE = 'Make my Bower folder';

/** Bower folders in the root of the pretend Drive, as the tab last kept it. */
const bowerRoots = (page: Page, scenario: string): Promise<number> =>
  page.evaluate((key) => {
    const kept = sessionStorage.getItem(key);
    if (!kept) return 0;
    const files = (JSON.parse(kept) as { files: Array<{ meta: { name: string; folder?: boolean; parents: string[] }; trashed: boolean }> }).files;
    return files.filter((f) => f.meta.folder && f.meta.name === 'Bower' && f.meta.parents[0] === 'root' && !f.trashed).length;
  }, `bower:fake:${scenario}`);

async function open(page: Page, path: string, scenario: string): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
}

test('AC1 nothing is made before the press, and exactly one folder after it', async ({ page }) => {
  await open(page, '/welcome?step=0', 'first');
  await expect(page.getByRole('heading', { level: 1, name: 'Where Bower keeps things' })).toBeVisible();
  await expect(page.getByRole('button', { name: CREATE })).toBeEnabled();
  await expect(page.getByText('Inbox')).toHaveCount(0);
  if (isFake) expect(await bowerRoots(page, 'first')).toBe(0);
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('button', { name: CREATE })).toBeEnabled();
  if (isFake) expect(await bowerRoots(page, 'first')).toBe(0);
  await page.getByRole('button', { name: CREATE }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  if (isFake) await expect.poll(() => bowerRoots(page, 'first')).toBe(1);
});

test('AC4 a folder that is there says welcome back, and an old tour address goes Home', async ({ page }) => {
  await open(page, '/welcome?step=1', 'default');
  await expect(page).not.toHaveURL(/welcome/);
  await open(page, '/welcome', 'default');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Your Bower folder is still in My Drive, with everything in it.')).toBeVisible();
  await expectAxeClean(page, { include: 'main' });
  await page.getByRole('button', { name: 'Open Bower' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeFocused();
});

test('AC4 an old tour address with no folder asks first', async ({ page }) => {
  await open(page, '/welcome?step=2', 'first');
  await expect(page.getByRole('button', { name: CREATE })).toBeVisible();
  await expect(page).toHaveURL(/welcome\?step=2/);
  if (isFake) expect(await bowerRoots(page, 'first')).toBe(0);
});

test('AC3 Not now, sign out leaves without making anything', async ({ page }) => {
  await open(page, '/welcome', 'first');
  await expect(page.getByRole('button', { name: 'Not now, sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Not now, sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in|\/landing\//);
  if (isFake) expect(await bowerRoots(page, 'first')).toBe(0);
});

/** Bower animates (its flyer has no `posed` class) or sits still, by the control being tested. */
const motion = [
  { name: 'Bower moves on', prefs: true, reduced: 'no-preference' as const, animated: 1 },
  { name: 'Bower moves off', prefs: false, reduced: 'no-preference' as const, animated: 0 },
  { name: 'reduced motion', prefs: true, reduced: 'reduce' as const, animated: 0 },
];
for (const m of motion) {
  test(`AC5 setup has ${m.animated ? 'one animated Bower' : 'a still scene'} with ${m.name}`, async ({ page }) => {
    await page.addInitScript((moves) => localStorage.setItem('bower:prefs', JSON.stringify({ birdMoves: moves })), m.prefs);
    await page.emulateMedia({ reducedMotion: m.reduced });
    await page.goto('/welcome?scenario=first&time=demo');
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByRole('button', { name: CREATE })).toBeVisible();
    await page.getByRole('button', { name: CREATE }).click();
    await expect(page.getByRole('button', { name: 'Making it…' })).toBeDisabled();
    await expect(page.locator('[data-bird]')).toHaveCount(1);
    await expect(page.locator('[data-bird]:not(.posed)')).toHaveCount(m.animated);
    await expectAxeClean(page, { include: 'main' });
  });
}
