/**
 * Reveal (#591): the tree follows what the person opens. Desktop sidebar at
 * once, the phone's Notes tab when opened after a note. Runs on the demo's
 * sample folder.
 */

import type { Locator, Page } from '@playwright/test';

import { expect, navigate, openHome, test, visible } from './demo.js';

/** The note in Flat hunt that Recent lists. */
const NOTE = /Notes from the viewing/;

function tree(page: Page): Locator {
  return visible(page.locator('[role="tree"]'));
}

/** The tree's row link for the page the app is on. */
function currentRow(page: Page): Locator {
  return tree(page).locator('a[aria-current="page"]');
}

/** Opens a Flat hunt note from Home's Recent list. */
async function openNoteFromRecent(page: Page): Promise<void> {
  await openHome(page);
  const link = visible(
    page.locator('.home-notes a[href^="/note/"]').filter({ hasText: NOTE }),
  );
  await link.click();
  await expect(page).toHaveURL(/\/note\//);
}

test('opening a note from Recent opens Projects and Flat hunt and marks the note current', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the sidebar is desktop');
  await openNoteFromRecent(page);
  const list = tree(page);
  await expect(
    list.getByRole('button', { name: 'Collapse Projects' }),
  ).toBeVisible();
  await expect(
    list.getByRole('button', { name: 'Collapse Flat hunt' }),
  ).toBeVisible();
  await expect(currentRow(page)).toHaveCount(1);
  await expect(currentRow(page)).toHaveAttribute('href', /^\/note\//);
  await expect(currentRow(page)).toBeInViewport();
});

test('reveal never collapses a folder the person had open', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the sidebar is desktop');
  await openHome(page);
  const list = tree(page);
  await list.getByRole('button', { name: 'Expand Areas' }).click();
  await expect(
    list.getByRole('button', { name: 'Collapse Areas' }),
  ).toBeVisible();
  await visible(
    page.locator('.home-notes a[href^="/note/"]').filter({ hasText: NOTE }),
  ).click();
  await expect(currentRow(page)).toHaveCount(1);
  await expect(
    list.getByRole('button', { name: 'Collapse Flat hunt' }),
  ).toBeVisible();
  await expect(
    list.getByRole('button', { name: 'Collapse Areas' }),
  ).toBeVisible();
});

test('on the phone, Notes after a note shows the tree open at it, and Notes again scrolls to the top', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the tab is the phone layout');
  await openNoteFromRecent(page);
  await navigate(page, /^Notes$/);
  await expect(page).toHaveURL(/\/notes$/);
  const list = tree(page);
  await expect(
    list.getByRole('button', { name: 'Collapse Flat hunt' }),
  ).toBeVisible();
  await expect(currentRow(page)).toHaveCount(1);
  await expect(currentRow(page)).toBeInViewport();

  // A long tree, so there is somewhere to scroll to: the label says
  // "Collapse all" while a folder is open, so two presses end fully open.
  await page
    .getByRole('button', { name: /^(Expand|Collapse) all folders$/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /^(Expand|Collapse) all folders$/ })
    .first()
    .click();
  // Scroll away, then tap the tab again.
  const offset = (): Promise<number> =>
    page.evaluate(() => {
      let top = window.scrollY;
      const tree = document.querySelector('.tree-wrap');
      for (let el = tree?.parentElement; el; el = el.parentElement) {
        top = Math.max(top, el.scrollTop);
      }
      return top;
    });
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    const tree = document.querySelector('.tree-wrap');
    for (let el = tree?.parentElement; el; el = el.parentElement) {
      const { overflowY } = getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll') {
        el.scrollTop = el.scrollHeight;
      }
    }
  });
  await expect.poll(offset).toBeGreaterThan(0);
  await navigate(page, /^Notes$/);
  await expect.poll(offset).toBe(0);
});

test('the highlight fades by default and does not animate under reduced motion', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the sidebar is desktop');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHome(page);
  await visible(
    page.locator('.home-notes a[href^="/note/"]').filter({ hasText: NOTE }),
  ).click();
  const row = currentRow(page).locator('xpath=..');
  await expect(row).toHaveCSS('animation-name', 'tree-reveal');
  await expect(row).not.toHaveClass(/tree-row-reveal/);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await visible(
    page.locator('.home-notes a[href^="/note/"]').filter({ hasText: NOTE }),
  ).click();
  const again = currentRow(page).locator('xpath=..');
  await expect(again).toHaveCount(1);
  await expect(
    again.evaluate((el) => getComputedStyle(el).animationName),
  ).resolves.toBe('none');
});
