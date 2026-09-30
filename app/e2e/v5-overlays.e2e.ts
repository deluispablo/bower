/**
 * R-OVL-6 (#778): with any overlay open, the page behind takes no tap and
 * does not scroll, at 375 and 1280 (both projects run this file), and Escape
 * returns focus to the control that opened it. Two overlay kinds are
 * covered: the tidy-up confirmation (a dialog) and the help sheet.
 */

import type { Locator, Page } from '@playwright/test';

import { expect, openHome, test, visible } from './demo.js';

interface Case {
  name: string;
  /** Goes to the screen the overlay opens on. */
  prepare: (page: Page) => Promise<void>;
  /** Opens the overlay. */
  open: (page: Page) => Promise<void>;
  dialog: string | RegExp;
  /** The control focus returns to on Escape, when it stays on screen. */
  opener?: (page: Page) => Locator;
}

async function openNote(page: Page): Promise<void> {
  await openHome(page);
  await visible(
    page
      .locator('.home-notes a[href^="/note/"]')
      .filter({ hasText: /10-43 Buckley St, Moonee Ponds/ }),
  ).click();
  await expect(page).toHaveURL(/\/note\//);
}

const more = (page: Page): Locator =>
  visible(page.getByRole('button', { name: 'More' }));
const tidy = (page: Page): Locator =>
  visible(page.getByRole('button', { name: 'Tidy up' }));
const photo = (page: Page): Locator =>
  page.getByRole('button', { name: /Tap to see it whole/ }).first();

const CASES: readonly Case[] = [
  {
    name: 'the tidy-up confirmation',
    prepare: openHome,
    open: (page) => tidy(page).click(),
    dialog: 'Is that everything?',
    opener: tidy,
  },
  {
    name: 'the note More menu',
    prepare: openNote,
    open: (page) => more(page).click(),
    dialog: 'Note actions',
    opener: more,
  },
  {
    name: 'the quick switcher',
    prepare: openHome,
    open: (page) => page.keyboard.press('Control+k'),
    dialog: 'Quick switcher',
  },
  {
    name: 'the send-to-Bower sheet',
    prepare: openNote,
    open: async (page) => {
      await more(page).click();
      await page.getByRole('menuitem', { name: /Move to…/ }).click();
    },
    dialog: 'Move',
  },
  {
    name: 'the photo viewer',
    prepare: async (page) => {
      await page.goto('/file/demo-37');
    },
    open: (page) => photo(page).click(),
    dialog: /.+/,
    opener: photo,
  },
];

for (const item of CASES) {
  test(`${item.name}: the page behind takes no tap and does not scroll`, async ({
    page,
  }) => {
    await item.prepare(page);
    const url = page.url();
    await item.open(page);
    const dialog = page.getByRole(
      item.name.includes('More menu') ? 'menu' : 'dialog',
      {
        name: item.dialog,
      },
    );
    await expect(dialog).toBeVisible();

    // The page is inert and the body cannot scroll.
    await expect(page.locator('#app > .shell')).toHaveAttribute('inert', '');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      'hidden',
    );

    // Wherever a control of the page sits, the tap lands on the overlay.
    const links = page.locator('#app > .shell a[href]');
    const count = await links.count();
    let probed = 0;
    for (let i = 0; i < count; i += 1) {
      const box = await links.nth(i).boundingBox();
      if (box === null || box.width === 0 || box.height === 0) continue;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const hit = await page.evaluate(
        ([px, py]) => {
          const el = document.elementFromPoint(px ?? 0, py ?? 0);
          return el !== null && el.closest('.overlay') !== null;
        },
        [x, y],
      );
      expect(hit, 'the point is covered by the overlay').toBe(true);
      probed += 1;
      if (probed === 3) break;
    }
    expect(probed).toBeGreaterThan(0);

    // No route changed.
    expect(page.url()).toBe(url);
  });

  test(`${item.name}: Escape closes it and returns focus`, async ({ page }) => {
    await item.prepare(page);
    await item.opener?.(page).focus();
    await item.open(page);
    const dialog = page.getByRole(
      item.name.includes('More menu') ? 'menu' : 'dialog',
      {
        name: item.dialog,
      },
    );
    await expect(dialog).toBeVisible();
    // The trap takes focus a frame after it opens; Escape needs it there.
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    if (item.opener !== undefined)
      await expect(item.opener(page)).toBeFocused();
    else
      expect(
        await page.evaluate(() => document.activeElement?.tagName),
      ).not.toBe('BODY');
    await expect(page.locator('#app > .shell')).not.toHaveAttribute(
      'inert',
      '',
    );
  });
}

test('a wheel over the scrim does not scroll the page behind', async ({
  page,
}) => {
  await openHome(page);
  // Make sure the page scrolls, whatever the screen holds.
  await page.evaluate(() => {
    document.body.style.minHeight = '4000px';
  });
  await page.evaluate(() => window.scrollTo(0, 300));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  await page.keyboard.press('Control+k');
  await expect(
    page.getByRole('dialog', { name: 'Quick switcher' }),
  ).toBeVisible();
  await page.mouse.move(8, 400);
  await page.mouse.wheel(0, 600);
  await page.mouse.wheel(0, -100);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});
