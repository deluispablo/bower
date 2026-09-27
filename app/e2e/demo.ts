/**
 * Shared set-up for the end-to-end flows (#196): a `test` whose page runs
 * on a fixed clock (so the fixture's dates, the greeting and the sent times
 * read the same on every run), with the "What is Bower" intro already seen
 * unless a test opts out, plus the few helpers every flow needs.
 */

import { expect, test as base } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';

// No `@types/node` in this repo; `process` is a real Node global here.
declare const process: { env: Record<string, string | undefined> };

/**
 * Sunday 27 September 2026, mid-morning: the day the demo fixture is written
 * for (`src/demo/fixture.ts`). The clock runs on from here as real time
 * passes, and a test can jump it forward with `page.clock.fastForward`.
 */
export const DEMO_NOW = new Date('2026-09-27T10:30:00+01:00');

/** `localStorage` key of the intro-seen flag (`src/intro.ts`). */
const INTRO_SEEN_KEY = 'bower:intro:seen';

interface Options {
  /** Whether the visitor has already seen the "What is Bower" intro. */
  introSeen: boolean;
}

export const test = base.extend<Options>({
  introSeen: [true, { option: true }],
  page: async ({ page, introSeen }, use) => {
    await page.clock.install({ time: DEMO_NOW });
    if (introSeen) {
      await page.addInitScript((key: string) => {
        localStorage.setItem(key, '1');
      }, INTRO_SEEN_KEY);
    }
    await use(page);
  },
});

export { expect };

/** The first visible element `locator` matches (the phone and the desktop
 * shell both render some controls, only one of them on screen). */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/** Opens Home and skips the first-run tour, which the demo shows on every load. */
export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  const tour = page.getByRole('dialog', { name: 'Drop anything here.' });
  await expect(tour).toBeVisible();
  await tour.getByRole('button', { name: 'Skip tour' }).click();
  await expect(tour).toBeHidden();
}

/** Follows the shell's navigation link called `name` (sidebar or bottom nav). */
export async function navigate(page: Page, name: RegExp): Promise<void> {
  await visible(page.getByRole('link', { name })).click();
}

/** Opens Settings: the avatar in the top bar on the phone, a sidebar row
 * on desktop (#318); both are links named "Settings". */
export async function openSettings(page: Page): Promise<void> {
  await navigate(page, /^Settings$/);
}

/**
 * Saves the screen as `e2e/screenshots/<project>/<name>.png` (uploaded as a
 * CI artifact). With `BOWER_README_SHOTS=1` (`pnpm e2e:shots`) the desktop
 * run also writes it to `docs/assets/screenshots/`, where the README shows it.
 */
export async function shot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const options = { animations: 'disabled', caret: 'hide' } as const;
  const { testDir, name: project } = testInfo.project;
  await page.screenshot({
    ...options,
    path: `${testDir}/screenshots/${project}/${name}.png`,
  });
  if (process.env.BOWER_README_SHOTS === '1' && project === 'desktop') {
    await page.screenshot({
      ...options,
      path: `${testDir}/../../docs/assets/screenshots/${name}.png`,
    });
  }
}
