/**
 * ux-safe-question-actions: on the fake and the demo, phone and desktop, Home fills the answer that leaves notes as
 * they are, keeps the keyboard order yes then no, and focuses the next card after an answer (rulings R3, R6, R7).
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

async function open(page: Page): Promise<void> {
  if (test.info().project.name === 'phone') await resize(page, { width: 390, height: 844 });
  await page.goto('/?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
}
const questions = (page: Page) => page.getByRole('region', { name: /^\d+ questions? for you$/ });
const merge = (page: Page) => questions(page).getByRole('listitem').filter({ hasText: 'Keep one note for both?' });
const receipts = (page: Page) => questions(page).getByRole('listitem').filter({ hasText: 'paid twice' });
const since = (page: Page) => page.getByRole('region', { name: 'Since the last tidy-up' });

/** The element's computed property against a token resolved through a probe (q1-questions' tokenColor approach). */
async function colorOf(element: Locator, property: 'color' | 'backgroundColor', token?: string): Promise<{ actual: string; expected: string }> {
  return element.evaluate((el, args) => {
    const style = getComputedStyle(el);
    let expected = '';
    if (args.token) {
      const probe = document.createElement('span');
      probe.style.color = style.getPropertyValue(args.token).trim(); el.append(probe);
      expected = getComputedStyle(probe).color; probe.remove();
    }
    return { actual: style[args.property], expected };
  }, { property, token });
}

async function expectFill(filled: Locator, outlined: Locator): Promise<void> {
  await expect(filled).toHaveClass(/primary/);
  await expect(outlined).toHaveClass(/ghost/);
  await expect(outlined).not.toHaveClass(/primary/);
  const bg = await colorOf(filled, 'backgroundColor', '--brand');
  expect(bg.actual).toBe(bg.expected);
  const fg = await colorOf(filled, 'color', '--on-brand');
  expect(fg.actual).toBe(fg.expected);
  expect((await colorOf(outlined, 'backgroundColor')).actual).toBe('rgba(0, 0, 0, 0)');
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC4 fill (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    await expectFill(merge(page).getByRole('button', { name: 'No, keep both', exact: true }), merge(page).getByRole('button', { name: 'Yes, merge', exact: true }));
    await expectFill(receipts(page).getByRole('button', { name: 'Keep both', exact: true }), receipts(page).getByRole('button', { name: 'Keep one', exact: true }));
    await expectAxeClean(page, { include: 'main', wcag22: true });
  });
}

test('AC4 keyboard_and_focus', async ({ page }) => {
  await open(page);
  await expect(merge(page).getByRole('button')).toHaveText(['Yes, merge', 'No, keep both']);
  await expect(receipts(page).getByRole('button')).toHaveText(['Keep both', 'Keep one']);
  await merge(page).getByRole('button', { name: 'Yes, merge', exact: true }).focus();
  await page.keyboard.press('Tab');
  const keep = merge(page).getByRole('button', { name: 'No, keep both', exact: true });
  await expect(keep).toBeFocused();
  await expect(keep).toHaveClass(/primary/);
  await page.keyboard.press('Enter');
  await expect(merge(page)).toHaveCount(0);
  await expect(page.getByText('You chose "No, keep both". Bower does it in the next tidy-up.', { exact: true })).toBeVisible();
  await expect(since(page)).toContainText('Answered "No, keep both" to a question');
  await expect(receipts(page).getByRole('button', { name: 'Keep both', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(questions(page)).toHaveCount(0);
  await expect(since(page)).toContainText('Answered "Keep both" to a question');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});
