/**
 * T950-1 (#922): on a slow read a folder shows skeletons, never a guessed
 * state. With the demo's slow switch (`bower:demo:slow`, every note read
 * waits about 1.5 s) the first rows, the split, the cards and the Compare
 * tab that appear are already the final ones.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './demo.js';

const TOUR_SEEN_KEY = 'bower:demo:tourSeenAt';
const SLOW_KEY = 'bower:demo:slow';

const HOUSING = '/folder/1-Projects/Housing%20Search%20Australia';
const MOONEE_PONDS = `${HOUSING}/Moonee%20Ponds`;
const JOB_SEARCH = '/folder/1-Projects/Job%20Search%20Australia';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([tour, slow]: string[]) => {
      sessionStorage.setItem(tour ?? '', '2026-09-30T08:00:00.000Z');
      sessionStorage.setItem(slow ?? '', '1');
    },
    [TOUR_SEEN_KEY, SLOW_KEY],
  );
});

/** The folder's body text the first moment a row or card shows. */
async function firstBody(page: Page, path: string): Promise<string> {
  await page.goto(path);
  const body = page.locator('.folder-view');
  await expect(
    body.locator('a[href^="/note/"], a[href^="/file/"], a[href^="/folder/"]'),
  ).not.toHaveCount(0, { timeout: 15_000 });
  return body.innerText();
}

/** The same text once every read has settled. */
async function settledBody(page: Page): Promise<string> {
  await page.waitForTimeout(4000);
  return page.locator('.folder-view').innerText();
}

test.describe('a slow folder never guesses (T950-1)', () => {
  test('the split and the rows are final when they first show', async ({
    page,
  }) => {
    const first = await firstBody(page, JOB_SEARCH);
    const last = await settledBody(page);
    expect(first).toBe(last);
  });

  test('the Compare tab is there with the first rows', async ({ page }) => {
    const first = await firstBody(page, MOONEE_PONDS);
    expect(first).toMatch(/Compare \d+/);
    expect(first).toBe(await settledBody(page));
  });

  test("a folder of folders' cards show their final counts", async ({
    page,
  }) => {
    const first = await firstBody(page, HOUSING);
    expect(first).toBe(await settledBody(page));
  });
});
