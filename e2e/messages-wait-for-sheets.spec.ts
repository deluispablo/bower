import type { Locator, Page } from '@playwright/test';
import { animationsEnd, expectAxeClean } from './axe';
import { expect, test } from './fixtures';
import { DESKTOP } from '../src/ui/media';

const NOTE = 'Garden plans from Alex';
const NOTE_MESSAGE = 'Your note is in the inbox';
const ANSWER_MESSAGE = 'You chose "Keep one". Bower does it in the next tidy-up.';
const dockMessages = (page: Page): Locator => page.getByTestId('dock-stack').locator('[role="status"] > div');

/** The fixtures add `source=`; the phone and desktop projects supply the width. */
const isDesktop = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= Number(DESKTOP.match(/^\(min-width: (\d+)px\)$/)?.[1]);

/**
 * Pause the controlled clock. The installed clock keeps running in real time, so a time read from the page is
 * already past when pauseAt gets it; one small step ahead is always in the future (nothing here is due within it).
 */
async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 500);
}

async function open(page: Page, path = '/add', scenario = 'empty'): Promise<void> {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto(`${path}?scenario=${scenario}&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
}

async function addNote(page: Page): Promise<Locator> {
  await page.getByRole('textbox', { name: 'What is this?', exact: true }).fill(NOTE);
  await page.getByRole('button', { name: 'Put the note in the inbox', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Inbox' }).getByRole('link', { name: new RegExp(`^${NOTE}`) })).toBeVisible();
  const message = dockMessages(page).filter({ hasText: NOTE_MESSAGE });
  // Positive control: every modal test starts with an actual message, not an empty dock.
  await expect(message).toBeVisible();
  await expect(message.getByRole('button', { name: 'Tidy up now', exact: true })).toBeVisible();
  await animationsEnd(page);
  await pauseClock(page);
  return message;
}

async function openTidy(page: Page): Promise<Locator> {
  await page.getByRole('region', { name: 'Inbox' }).getByRole('button', { name: 'Tidy up 1 thing', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Tidy up 1 thing?', exact: true });
  await page.clock.runFor(300);
  await expect(sheet).toBeVisible();
  await animationsEnd(page);
  return sheet;
}

async function closeTidy(page: Page, sheet: Locator): Promise<void> {
  await sheet.getByRole('button', { name: 'Not now', exact: true }).click();
  await page.clock.runFor(300);
  await expect(sheet).toHaveCount(0);
  await animationsEnd(page);
}

/** Raw DOM visibility catches a toast that Radix hid only from the accessibility tree. */
async function expectNoMessages(page: Page): Promise<void> {
  await expect(dockMessages(page).filter({ visible: true })).toHaveCount(0);
}

/** Check every rendered line's centre and edges, plus the button centres, against actual paint order. */
async function expectUncovered(sheet: Locator): Promise<void> {
  const samples = await sheet.evaluate((dialog) => {
    const viewport = { width: innerWidth, height: innerHeight };
    const rects: DOMRect[] = [];
    const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim() || node.parentElement?.closest('[aria-hidden="true"], .sr-only')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    for (const button of dialog.querySelectorAll('button')) rects.push(button.getBoundingClientRect());
    return rects.filter((r) => r.width > 0 && r.height > 0).flatMap((r) => [r.left + 1, r.left + r.width / 2, r.right - 1].map((x) => {
      const y = r.top + r.height / 2;
      const top = document.elementsFromPoint(x, y)[0];
      return { insideViewport: x >= 0 && x < viewport.width && y >= 0 && y < viewport.height, inSheet: !!top && dialog.contains(top) };
    }));
  });
  // Positive control: the text and controls supplied real hit-test points.
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.every((p) => p.insideViewport && p.inSheet)).toBe(true);
}

test.describe('messages wait for sheets', () => {
    test('MWS a message on screen disappears and nothing covers an open sheet', async ({ page }) => {
      await open(page);
      await addNote(page);
      const sheet = await openTidy(page);
      await expectUncovered(sheet);
      await expectNoMessages(page);
      await expect(sheet.getByRole('button', { name: 'Not now', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(sheet.getByRole('button', { name: 'Tidy up 1 thing', exact: true })).toBeFocused();
      await closeTidy(page, sheet);
      await expect(dockMessages(page).filter({ hasText: NOTE_MESSAGE })).toBeVisible();
    });
  
    test('MWS the sheet closes and the message returns to its usual place', async ({ page }) => {
      await open(page);
      const message = await addNote(page);
      const before = await message.boundingBox();
      expect(before).not.toBeNull();
      const sheet = await openTidy(page);
      // Stay open much longer than either usual lifetime on the controlled clock.
      await page.clock.runFor(30_000);
      await expectNoMessages(page);
      await closeTidy(page, sheet);
      await expect(message).toBeVisible();
      const after = await message.boundingBox();
      expect(after).not.toBeNull();
      if (!before || !after) throw new Error('The message needs a box before and after the sheet.');
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    });
  
    test('MWS an answer completing while a sheet is open waits to show', async ({ page }) => {
      await open(page, '/', 'default');
      const question = page.locator('section[aria-labelledby="qs"] li').filter({ hasText: /Keep both\?/ });
      const answer = question.getByRole('button', { name: 'Keep one', exact: true });
      const tidy = page.getByRole('region', { name: 'Inbox' }).getByRole('button', { name: /^Tidy up \d+ things?$/ });
      await expect(answer).toBeVisible();
      await expect(tidy).toBeVisible();
      await pauseClock(page);
      // Start the real asynchronous answer and open the sheet in the same browser task,
      // before that answer can raise its message. No force click through an inert page.
      const tidyHandle = await tidy.elementHandle();
      if (!tidyHandle) throw new Error('The tidy opener must exist.');
      await answer.evaluate((button, opener) => {
        if (!(button instanceof HTMLElement) || !(opener instanceof HTMLElement)) throw new Error('Both controls must be buttons.');
        button.click();
        opener.click();
      }, tidyHandle);
      await tidyHandle.dispose();
      await page.clock.runFor(300);
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      // Positive completion control: the actual question disappeared after its answer was saved.
      await expect(question).toHaveCount(0);
      await expectNoMessages(page);
      await expectUncovered(sheet);
      await page.clock.runFor(30_000);
      await closeTidy(page, sheet);
      await expect(dockMessages(page).filter({ hasText: ANSWER_MESSAGE })).toBeVisible();
    });
  
    test('MWS no sheet open keeps messages exactly in the usual dock', async ({ page }) => {
      await open(page);
      const message = await addNote(page);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const box = await message.boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error('The visible message needs a bounding box.');
      expect(box.height).toBeGreaterThanOrEqual(52);
      if (!isDesktop(page)) {
        const tabs = await page.getByRole('navigation', { name: 'Main', exact: true }).boundingBox();
        if (!tabs) throw new Error('The phone tab bar needs a bounding box.');
        expect(Math.round(box.x)).toBe(16);
        expect(Math.round(box.x + box.width)).toBe((page.viewportSize()?.width ?? 0) - 16);
        expect(box.y + box.height).toBeLessThanOrEqual(tabs.y - 12 + 0.5);
      } else {
        const main = await page.getByRole('main').boundingBox();
        if (!main) throw new Error('The desktop main column needs a bounding box.');
        expect(box.width).toBeLessThanOrEqual(520);
        expect(Math.abs(box.x + box.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(1);
      }
    });
  
    test('MWS reduced motion makes the message reappear in place', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page);
      const message = await addNote(page);
      const before = await message.boundingBox();
      expect(before).not.toBeNull();
      const sheet = await openTidy(page);
      await expectNoMessages(page);
      await closeTidy(page, sheet);
      await expect(message).toBeVisible();
      const motion = await message.evaluate((node) => {
        const style = getComputedStyle(node);
        return { transform: style.transform, durations: style.animationDuration.split(',').map((part) => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000)) };
      });
      expect(motion.transform).toBe('none');
      expect(motion.durations.every((duration) => duration <= 0.01)).toBe(true);
      const after = await message.boundingBox();
      if (!before || !after) throw new Error('The message needs both boxes.');
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    });
  
    test('MWS axe WCAG 2.2 passes with a sheet open and after it closes', async ({ page }) => {
      await open(page);
      await addNote(page);
      const sheet = await openTidy(page);
      await expectNoMessages(page);
      // Axe uses its own task scheduling; let the browser clock run for the scan.
      await page.clock.resume();
      await expectAxeClean(page, { wcag22: true });
      await closeTidy(page, sheet);
      await expect(dockMessages(page).filter({ hasText: NOTE_MESSAGE })).toBeVisible();
      await expectAxeClean(page, { wcag22: true });
    });
});

test('MWS Sign out now after adding a pile reads whole', async ({ page }) => {
  test.skip(isDesktop(page), 'the phone row: the settings sheet over the phone tab bar');
  // Existing c02-upload-reload helper's lock strategy: keep two uploads waiting.
  await page.addInitScript(() => {
    const locks = navigator.locks;
    const real = locks.request.bind(locks) as (...args: unknown[]) => Promise<unknown>;
    Object.defineProperty(locks, 'request', { configurable: true, value: (name: string, ...args: unknown[]) => {
      if (!name.startsWith('bower-uploads:') || typeof args[0] === 'function') return real(name, ...args);
      const [options, callback] = args as [LockOptions, LockGrantedCallback<unknown>];
      if (options.ifAvailable) return Promise.resolve(callback(null));
      return new Promise<unknown>(() => undefined);
    } });
  });
  await open(page);
  await page.getByRole('textbox', { name: 'What is this?', exact: true }).fill('Papers from Alex');
  await page.locator('input[type=file][multiple]').setInputFiles(['a.pdf', 'b.pdf'].map((name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF ${name}`) })));
  await page.getByRole('button', { name: 'Put 2 things in the inbox', exact: true }).click();
  const message = dockMessages(page).filter({ hasText: '2 things in the inbox' });
  await expect(message).toBeVisible();
  await animationsEnd(page);
  await pauseClock(page);
  await page.getByRole('link', { name: 'Your account and settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.clock.runFor(300);
  const sheet = page.getByRole('dialog', { name: 'Sign out now?', exact: true });
  await expect(sheet).toBeVisible();
  const words = "2 things you added are still sending from this device. If you sign out now, they stop and you'll need to add them again.";
  await expect(sheet.getByText(words, { exact: true })).toBeVisible();
  await animationsEnd(page);
  await expectUncovered(sheet);
  await expectNoMessages(page);
  await expect(sheet.getByRole('button', { name: 'Keep sending', exact: true })).toBeFocused();
  await page.clock.resume();
  await expectAxeClean(page, { wcag22: true });
  // Open only: never press the confirmation that would sign out or discard uploads.
});
