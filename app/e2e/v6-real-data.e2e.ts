/**
 * T950-1 (#922): on a slow read a folder shows skeletons, never a guessed
 * state. With the demo's slow switch (`bower:demo:slow`, every note read
 * waits about 1.5 s) the meta line, the rows, the split, the cards and the
 * Compare tab that first appear are already the final ones.
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

/**
 * Opens `path` from Home the way a person does, once Home's own reads are
 * done (a read after a pause waits again), and returns the folder's text the
 * first moment its meta line shows.
 */
async function firstBody(page: Page, path: string): Promise<string> {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeAttached();
  await page.waitForTimeout(4000);
  await page.evaluate((href: string) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = 'Open';
    document.querySelector('main')?.append(link);
    link.click();
  }, path);
  // The header first: its meta line and tabs are final the moment they show.
  const header = page.locator('.folder-view .page-header').first();
  await expect(header.locator('.page-header-meta')).toBeAttached({
    timeout: 15_000,
  });
  const head = await header.innerText();
  // Then the list (its module may load a moment later): final when it shows.
  const panel = page.locator('#folder-panel-list');
  await expect(panel.locator('a[href]').first()).toBeAttached({
    timeout: 15_000,
  });
  return `${head}
---
${await panel.innerText()}`;
}

/** The same text once every read has settled. */
async function settledBody(page: Page): Promise<string> {
  await page.waitForTimeout(4000);
  const head = await page
    .locator('.folder-view .page-header')
    .first()
    .innerText();
  return `${head}
---
${await page.locator('#folder-panel-list').innerText()}`;
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
