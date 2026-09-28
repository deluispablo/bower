/**
 * Shared set-up for the end-to-end flows (#196): a `test` whose page runs
 * on a fixed clock (so the fixture's dates, the greeting and the sent times
 * read the same on every run), with the "What is Bower" intro already seen
 * unless a test opts out, plus the few helpers every flow needs.
 */

import { expect, test as base } from '@playwright/test';
import type { Locator, Page, Route, TestInfo } from '@playwright/test';

// No `@types/node` in this repo; `process` is a real Node global here.
declare const process: { env: Record<string, string | undefined> };

/**
 * Sunday 27 September 2026, mid-morning: the day the demo fixture is written
 * for (`src/demo/fixture.ts`). The clock runs on from here as real time
 * passes, and a test can jump it forward with `page.clock.fastForward`.
 */
export const DEMO_NOW = new Date('2026-09-27T10:44:00+01:00');

/** `localStorage` key of the intro-seen flag (`src/intro.ts`). */
const INTRO_SEEN_KEY = 'bower:intro:seen';

interface Options {
  /** Whether the visitor has already seen the "What is Bower" intro. */
  introSeen: boolean;
}

/**
 * The demo never talks to anyone (#365, handover D.6): the scripted run
 * and the in-memory vault answer everything, so a demo build page should
 * make no request to any host but its own — no network, no Google, no
 * Claude. Route interception records every request this page makes and
 * aborts (never lets through) any whose origin differs from `baseURL`;
 * the offenders are asserted empty once the test that used `page` is
 * done, so a stray request fails that test with the URLs in the message,
 * not a silent pass or a hang on the aborted request.
 */
async function guardAgainstOtherHosts(
  page: Page,
  baseURL: string | undefined,
): Promise<() => void> {
  const own = baseURL !== undefined ? new URL(baseURL).origin : undefined;
  const offHost: string[] = [];
  await page.route('**/*', (route: Route) => {
    const url = route.request().url();
    // `data:`/`about:` URLs (inline SVGs, the initial blank page) have no
    // remote host to speak of; `blob:` ones (a Drive file's local preview)
    // carry the creating page's own origin.
    if (url.startsWith('data:') || url.startsWith('about:')) {
      void route.continue();
      return;
    }
    const origin = new URL(url).origin;
    if (own === undefined || origin === own) {
      void route.continue();
      return;
    }
    offHost.push(url);
    void route.abort('failed');
  });
  return () => {
    expect(
      offHost,
      `the demo talked to another host: ${offHost.join(', ')}`,
    ).toEqual([]);
  };
}

export const test = base.extend<Options>({
  introSeen: [true, { option: true }],
  page: async ({ page, introSeen, baseURL }, use) => {
    const assertNoOtherHost = await guardAgainstOtherHosts(page, baseURL);
    await page.clock.install({ time: DEMO_NOW });
    if (introSeen) {
      await page.addInitScript((key: string) => {
        localStorage.setItem(key, '1');
      }, INTRO_SEEN_KEY);
    }
    await use(page);
    assertNoOtherHost();
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
  const tour = page.getByRole('dialog', { name: 'Home' });
  await expect(tour.getByText('Tour · 1 of 4')).toBeVisible();
  await tour.getByRole('button', { name: 'Skip' }).click();
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

/**
 * One of the Bower tab's three parts, Rules, Requests or Activity: a tab
 * panel under 1200 px, a column (a region named by its header) from there
 * (#357). The desktop project runs at 1280, so it gets the columns.
 */
export function bowerPart(page: Page, name: string): Locator {
  return page
    .getByRole('tabpanel', { name, exact: true })
    .or(page.getByRole('region', { name, exact: true }));
}

/** Brings a part of the Bower tab on screen: taps its tab under 1200 px;
 * from 1200 px all three columns already are (#357). */
export async function showBowerPart(page: Page, name: string): Promise<void> {
  await expect(
    page.getByRole('tablist').or(page.locator('.bower-columns')),
  ).toBeVisible();
  const tab = page.getByRole('tab', { name, exact: true });
  if ((await tab.count()) > 0) await tab.click();
  await expect(bowerPart(page, name)).toBeVisible();
}
