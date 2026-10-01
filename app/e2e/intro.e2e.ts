/**
 * The five-page intro (#796): the page is in the URL and back and reload
 * resume it (R-INTRO-2), focus goes to the heading, the other pages are
 * inert, the status and Back are there (R-INTRO-3), the illustrations never
 * loop (R-INTRO-5), and the birds stay inside the window at every sampled
 * point of their motion (R-BIRD-7).
 */

import type { Page } from '@playwright/test';

import { expect, test } from './demo.js';
import { MOTION_ON, SAMPLE_POINTS, seekAnimations } from './motion.js';

const HEADINGS = [
  /Bower files it/,
  /Bower's note/,
  /the dots/,
  /own words/,
  /Only your Drive/,
];

function next(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('button', { name: 'Next', exact: true });
}

function back(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('button', { name: 'Back', exact: true });
}

test.describe('the intro, five pages (#796)', () => {
  test.use({ introSeen: false });

  test('the page is in the URL: Next and Back push, back and reload resume, bad values clamp', async ({
    page,
  }) => {
    await page.goto('/welcome');
    await expect(page).toHaveURL(/\/welcome\?page=1$/);
    await expect(
      page.getByRole('heading', { name: HEADINGS[0] }),
    ).toBeVisible();

    await next(page).click();
    await expect(page).toHaveURL(/page=2$/);
    await next(page).click();
    await expect(page).toHaveURL(/page=3$/);
    await expect(page.locator('.intro-status')).toHaveText('3 of 5');

    // Browser back is the previous page, not the way out of the intro.
    await page.goBack();
    await expect(page).toHaveURL(/page=2$/);
    await expect(page.locator('.intro-status')).toHaveText('2 of 5');
    await expect(
      page.getByRole('heading', { name: HEADINGS[1] }),
    ).toBeFocused();

    // A reload resumes.
    await page.reload();
    await expect(page).toHaveURL(/page=2$/);
    await expect(page.locator('.intro-status')).toHaveText('2 of 5');

    // Invalid values clamp to 1 to 5.
    await page.goto('/welcome?page=99');
    await expect(page).toHaveURL(/page=5$/);
    await page.goto('/welcome?page=0');
    await expect(page).toHaveURL(/page=1$/);
  });

  test('typing ?page=5 does not mark the intro seen; reaching it with Next does', async ({
    page,
  }) => {
    const seen = (): Promise<string | null> =>
      page.evaluate(() => localStorage.getItem('bower:intro:seen'));
    await page.goto('/welcome?page=5');
    await expect(page.locator('.intro-status')).toHaveText('5 of 5');
    expect(await seen()).toBeNull();

    await page.goto('/welcome?page=4');
    await next(page).click();
    await expect(page).toHaveURL(/page=5$/);
    expect(await seen()).toBe('1');
  });

  test('Skip replaces the entry and lands on the sign-in', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/welcome/);
  });

  test('from=login and from=settings return where they came from', async ({
    page,
  }) => {
    await page.goto('/welcome?from=login');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/welcome?from=settings&page=5');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('replayed while signed in, the last button reads Back to Bower and goes Home (R-IN-6)', async ({
    page,
  }) => {
    await page.goto('/welcome?from=settings&page=5');
    await page.getByRole('button', { name: 'Back to Bower' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('focus goes to the heading, other pages are inert, Back and the status are there, Skip is top right', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/welcome');
    await expect(back(page)).toHaveCount(0);

    await next(page).click();
    await expect(
      page.getByRole('heading', { name: HEADINGS[1] }),
    ).toBeFocused();
    await expect(back(page)).toBeVisible();
    await expect(page.locator('.intro-status')).toHaveText('2 of 5');

    // One h1 in the accessibility tree; the other four pages are inert.
    await expect(page.locator('.intro-page:not([inert])')).toHaveCount(1);
    await expect(page.locator('.intro-page[inert]')).toHaveCount(4);

    const skip = page.getByRole('button', { name: 'Skip', exact: true });
    const box = await skip.boundingBox();
    expect(box).not.toBeNull();
    if (box !== null) {
      expect(box.y).toBeLessThan(80);
      expect(box.x + box.width).toBeGreaterThan(375 - 40);
    }

    await back(page).click();
    await expect(
      page.getByRole('heading', { name: HEADINGS[0] }),
    ).toBeFocused();
  });

  test('the last page offers sign-in and no other link (IN-P5)', async ({
    page,
  }) => {
    await page.goto('/welcome?page=5');
    await expect(
      page.getByRole('heading', { name: HEADINGS[4] }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'See examples and use cases' }),
    ).toHaveCount(0);
  });

  test('the illustrations never loop, and with motion on the birds stay inside the window', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const n of [1, 3]) {
      await page.goto(`/welcome?page=${n}`);
      await expect(page.locator('.intro-status')).toHaveText(`${n} of 5`);
      // No CSS animation outside the bird's own.
      const loops = await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a): a is CSSAnimation => a instanceof CSSAnimation)
            .filter((a) => {
              const target = (a.effect as KeyframeEffect | null)?.target;
              return (
                target instanceof Element &&
                target.closest('.intro-art') !== null &&
                target.closest('svg.b') === null
              );
            }).length,
      );
      expect(loops).toBe(0);
    }
  });
});

test.describe('the intro birds, motion on (R-BIRD-7)', () => {
  test.use({ introSeen: false, ...MOTION_ON });

  for (const n of [1, 3]) {
    test(`page ${n}: the bird stays inside the window at 0, 25, 50 and 75%`, async ({
      page,
    }) => {
      await page.goto(`/welcome?page=${n}`);
      const current = page.locator('.intro-page:not([inert])');
      const bird = current.locator('svg.b').first();
      await expect(bird).toBeVisible();
      const size = page.viewportSize();
      expect(size).not.toBeNull();
      for (const percent of SAMPLE_POINTS) {
        await seekAnimations(current, percent);
        const box = await bird.boundingBox();
        expect(box, `bird box at ${percent}%`).not.toBeNull();
        if (box !== null && size !== null) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        }
      }
    });
  }
});
