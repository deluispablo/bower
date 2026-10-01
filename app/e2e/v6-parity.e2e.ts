/**
 * The M50 design gate (#920, R-GLOBAL-3): one screenshot of every canvas
 * tab's main state at 375 and 1280 on the demo build, named after its
 * board (`HM-Main-375.png`), and an axe run on the ten busiest routes with
 * no serious or critical violation.
 *
 * The screenshots are artifacts for the reviewers, not snapshot
 * assertions: they land in `e2e/results/parity/` (git-ignored, emptied on
 * every run). The demo keeps the tour's seen flag in `sessionStorage`; it
 * is set for every shot but the tour's own.
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

import { expect, test, visible } from './demo.js';

/** `sessionStorage` key of the demo's tour-seen flag (`src/demo/store.ts`). */
const TOUR_SEEN_KEY = 'bower:demo:tourSeenAt';

// The boards are the dark theme, so the shots and the axe run are too. The
// light theme is deferred (#920 T-7, lead ruling): its known contrast gaps
// are not this gate's.
test.use({ colorScheme: 'dark' });

const MOONEE_PONDS =
  '/folder/1-Projects/Housing%20Search%20Australia/Moonee%20Ponds';
const JOB_SEARCH = '/folder/1-Projects/Job%20Search%20Australia';
const APPLICATIONS = `${JOB_SEARCH}/Applications`;
const AREAS = '/folder/2-Areas';

/** Marks the tour seen before any page script runs. */
async function skipTour(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    sessionStorage.setItem(key, '2026-09-30T08:00:00.000Z');
  }, TOUR_SEEN_KEY);
}

/** Lets fonts, lazy panes and the tree settle before a shot or an axe run. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(300);
}

/** Saves the screen as `e2e/results/parity/<board>-<width>.png`. */
async function parityShot(
  page: Page,
  testInfo: TestInfo,
  board: string,
): Promise<void> {
  await settle(page);
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: `${testInfo.project.testDir}/results/parity/${board}-${String(width)}.png`,
    animations: 'disabled',
    caret: 'hide',
  });
}

/** The demo id of the note or file called `title`, read off a folder. */
async function hrefOf(
  page: Page,
  folder: string,
  kind: 'note' | 'file',
  title: string,
): Promise<string> {
  await page.goto(folder);
  const link = page.locator(`a[href^="/${kind}/"]`, { hasText: title }).first();
  await expect(link).toBeAttached();
  const href = await link.getAttribute('href');
  if (href === null) throw new Error(`no link to ${title}`);
  return href;
}

/** Opens the Search dialog (the quick switcher), with `query` typed. */
async function openSearch(page: Page, query: string): Promise<void> {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeAttached();
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await expect(switcher).toBeVisible();
  if (query !== '') {
    await switcher.getByRole('combobox').fill(query);
    await expect(switcher.getByRole('option').first()).toBeVisible();
  }
}

/** The ten routes the axe run covers, each opened as a reviewer would. */
const AXE_ROUTES: readonly {
  name: string;
  open: (page: Page) => Promise<void>;
}[] = [
  { name: 'Home', open: (page) => page.goto('/').then(() => undefined) },
  {
    name: 'Moonee Ponds',
    open: (page) => page.goto(MOONEE_PONDS).then(() => undefined),
  },
  {
    name: 'Applications',
    open: (page) => page.goto(APPLICATIONS).then(() => undefined),
  },
  { name: 'Areas', open: (page) => page.goto(AREAS).then(() => undefined) },
  {
    name: 'CV insights',
    open: async (page) => {
      await page.goto(await hrefOf(page, JOB_SEARCH, 'note', 'CV insights'));
    },
  },
  {
    name: 'Cover Letter - Alex',
    open: async (page) => {
      await page.goto(
        await hrefOf(page, JOB_SEARCH, 'file', 'Cover Letter - Alex'),
      );
    },
  },
  { name: 'Add', open: (page) => page.goto('/add').then(() => undefined) },
  {
    name: 'Bower',
    open: (page) => page.goto('/bower').then(() => undefined),
  },
  { name: 'Search', open: (page) => openSearch(page, 'Lisbon') },
  {
    name: 'Settings',
    open: (page) => page.goto('/settings').then(() => undefined),
  },
];

test.describe('parity screenshots (#920)', () => {
  test.beforeEach(async ({ page }) => {
    await skipTour(page);
  });

  const pages: readonly [board: string, path: string][] = [
    ['HM-Main', '/'],
    ['NT-Main', '/notes'],
    ['AR-Main', AREAS],
    ['PF-Main', MOONEE_PONDS],
    ['LI-Main', APPLICATIONS],
    ['PF-Compare', `${MOONEE_PONDS}?view=compare`],
    ['AD-Main', '/add'],
    ['JF-Main', '/just-filed'],
    ['BW-Main', '/bower'],
    ['ST-Top', '/settings'],
  ];
  for (const [board, path] of pages) {
    test(board, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeAttached();
      await parityShot(page, testInfo, board);
    });
  }

  test('GR-Main', async ({ page }, testInfo) => {
    await page.goto(APPLICATIONS);
    await page.getByRole('button', { name: /^Filter and sort/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filter & sort' });
    await sheet
      .getByRole('radiogroup', { name: 'Layout' })
      .getByRole('radio', { name: 'Grid' })
      .click();
    await sheet.getByRole('button', { name: /^Show \d+ things?$/ }).click();
    await expect(sheet).toBeHidden();
    await parityShot(page, testInfo, 'GR-Main');
  });

  test('NO-Main', async ({ page }, testInfo) => {
    await page.goto(await hrefOf(page, JOB_SEARCH, 'note', 'CV insights'));
    await expect(page).toHaveURL(/\/note\//);
    await parityShot(page, testInfo, 'NO-Main');
  });

  test('FI-Main', async ({ page }, testInfo) => {
    await page.goto(
      await hrefOf(page, JOB_SEARCH, 'file', 'Cover Letter - Alex'),
    );
    await expect(page).toHaveURL(/\/file\//);
    await parityShot(page, testInfo, 'FI-Main');
  });

  test('SE-Empty and SE-Query', async ({ page }, testInfo) => {
    await openSearch(page, '');
    await parityShot(page, testInfo, 'SE-Empty');
    await page
      .getByRole('dialog', { name: 'Quick switcher' })
      .getByRole('combobox')
      .fill('Lisbon');
    await expect(
      page.getByRole('dialog', { name: 'Quick switcher' }).getByRole('option'),
    ).not.toHaveCount(0);
    await parityShot(page, testInfo, 'SE-Query');
  });

  test.describe('the intro', () => {
    test.use({ introSeen: false });

    test('IN-P1', async ({ page }, testInfo) => {
      await page.goto('/welcome');
      await expect(page.getByRole('heading').first()).toBeVisible();
      await parityShot(page, testInfo, 'IN-P1');
    });
  });
});

test.describe('the tour (#920)', () => {
  test('TR-Home', async ({ page }, testInfo) => {
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: 'Home' });
    await expect(tour.getByText('Tour · 1 of 4')).toBeVisible();
    await parityShot(page, testInfo, 'TR-Home');
  });
});

test.describe('axe on the ten routes (#920)', () => {
  test.beforeEach(async ({ page }) => {
    await skipTour(page);
  });

  for (const route of AXE_ROUTES) {
    test(`${route.name} has no serious or critical violations`, async ({
      page,
    }) => {
      await route.open(page);
      await expect(page.locator('h1').first()).toBeAttached();
      await settle(page);
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations
        .filter(
          (violation) =>
            violation.impact === 'serious' || violation.impact === 'critical',
        )
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          targets: violation.nodes.map((node) => node.target.join(' ')),
        }));
      expect(bad).toEqual([]);
    });
  }
});
