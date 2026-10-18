/**
 * C16: every main journey by keyboard only, on the phone and on the desktop, with an axe WCAG 2.2 scan on each screen.
 * Sign in (the demo entry), Home, a note, Add, Tell Bower, a tidy-up, Undo, Settings. No pointer is used: a Tab loop
 * reaches each control (Playwright's keyboard, https://playwright.dev/docs/api/class-keyboard) and a last check
 * counts the pointer events the page saw. `BASE_URL=<address>` runs the same walk on another deployment
 * (https://playwright.dev/docs/api/class-testoptions#test-options-base-url).
 */
import type { Locator, Page } from '@playwright/test';
import { expectAxeClean } from './axe';
import { expect, test } from './fixtures';

if (process.env.BASE_URL) test.use({ baseURL: process.env.BASE_URL });

/** Tab until the control has the keyboard; it fails if it is never reached (a control the keyboard cannot get to). */
async function reach(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  for (let i = 0; i < 120 && !(await target.evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
  await expect(target).toBeFocused();
}

async function press(page: Page, target: Locator, key = 'Enter'): Promise<void> {
  await reach(page, target);
  await page.keyboard.press(key);
}

async function typeIn(page: Page, target: Locator, text: string): Promise<void> {
  await reach(page, target);
  await page.keyboard.type(text);
  await expect(target).toHaveValue(text);
}

/** The shell's own link to a screen: the tab bar on the phone, the ribbon on the desktop. */
const nav = (page: Page, phone: string, desktop: string, isMobile: boolean): Locator =>
  page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: isMobile ? phone : desktop, exact: true });

const scan = (page: Page, disableRules?: string[]): Promise<void> => expectAxeClean(page, { wcag22: true, disableRules });

test('the main journeys work by keyboard alone, and every screen passes axe', async ({ page, isMobile }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    (window as unknown as { __pointers: number }).__pointers = 0;
    addEventListener('pointerdown', () => { (window as unknown as { __pointers: number }).__pointers += 1; }, true);
  });
  const main = page.getByRole('main');

  // Sign in: the demo entry.
  await page.goto('/sign-in?scenario=signed-out&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page).toHaveURL(/\/sign-in/);
  await scan(page);
  await press(page, page.getByRole('button', { name: 'Continue with Google' }));

  // Home.
  await expect(page.getByRole('heading', { name: /G'day, Alex/ })).toBeVisible();
  await scan(page);

  // A note, from Recent.
  const flat = 'Flat 3, 12 Larkspur Lane';
  await press(page, main.getByRole('region', { name: 'Recent' }).getByRole('link', { name: new RegExp(flat) }));
  await expect(page.getByRole('heading', { name: flat, level: 1 })).toBeVisible();
  await scan(page);

  // Add: a link as a pile, into the inbox.
  await press(page, nav(page, 'Add', 'Add a pile', isMobile));
  await expect(page.getByRole('heading', { name: 'Add a pile', level: 1 })).toBeVisible();
  await scan(page);
  await typeIn(page, page.getByRole('textbox', { name: 'What is this?' }), 'Car insurance renewal');
  await typeIn(page, page.getByRole('textbox', { name: 'Paste a link' }), 'https://insurer.example/renewal');
  await press(page, page.getByRole('button', { name: 'Add link' }));
  await press(page, page.getByRole('button', { name: /Add 1 thing to the inbox/ }));
  await expect(page.getByRole('status').filter({ hasText: /inbox/i }).or(main.getByRole('link', { name: /Car insurance renewal/ })).first()).toBeVisible();

  // Tell Bower: a request, then a rule (the arrow keys pick the second choice).
  await press(page, nav(page, 'Ask', 'Ask', isMobile));
  await expect(page.getByRole('heading', { name: 'Ask Bower', level: 1 })).toBeVisible();
  await scan(page);
  await typeIn(page, page.getByRole('textbox', { name: 'Your request' }), 'Put my visa papers together');
  await press(page, page.getByRole('button', { name: 'Send' }));
  await expect(main.getByText('Put my visa papers together')).toBeVisible();
  await reach(page, page.getByRole('radio', { name: 'A request' }));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'A rule' })).toBeChecked();
  await typeIn(page, page.getByRole('textbox', { name: 'The rule' }), 'Anything from the dentist goes in Health');
  await press(page, page.getByRole('button', { name: 'Keep this rule' }));
  const keptRule = main.getByRole('button', { name: /^Remove the rule: .*dentist/i });
  await expect(keptRule).toBeVisible();
  await scan(page);

  // A tidy-up, from Home: confirm, watch it finish, close.
  await press(page, nav(page, 'Home', 'Home', isMobile));
  const tidy = /^Tidy up \d+ things$/;
  await press(page, main.getByRole('button', { name: tidy }));
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await scan(page);
  await press(page, sheet.getByRole('button', { name: tidy }));
  await expect(sheet.getByText(/Done\. \d+ things filed/).last()).toBeVisible({ timeout: 15_000 });
  await scan(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // Undo: remove a rule from Tell Bower, then take it back.
  await press(page, nav(page, 'Ask', 'Ask', isMobile));
  await expect(page.getByRole('heading', { name: 'Ask Bower', level: 1 })).toBeVisible();
  await press(page, main.getByRole('button', { name: /^Remove the rule: / }).first());
  const dock = page.getByRole('status');
  await expect(dock.getByText(/Rule removed/)).toBeVisible();
  await scan(page);
  await press(page, dock.getByRole('button', { name: 'Undo' }));
  await expect(dock.getByText('The rule is back.')).toBeVisible();
  await scan(page);

  // Settings, from the account link on Home: a switch flips with Space.
  await press(page, nav(page, 'Home', 'Home', isMobile));
  await press(page, main.getByRole('link', { name: 'Your account and settings' }));
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  const web = main.getByRole('switch', { name: 'Look things up on the web' });
  const was = await web.getAttribute('aria-checked');
  await press(page, web, 'Space');
  await expect(web).not.toHaveAttribute('aria-checked', was ?? '');
  await scan(page);

  expect(await page.evaluate(() => (window as unknown as { __pointers: number }).__pointers)).toBe(0);
});
