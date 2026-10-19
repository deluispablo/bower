/**
 * ux-home-priorities: decisions first on Home, and one tidy-up launch on screen at every stage (rulings R4-R7, R2-1).
 * A launch control opens the tidy-up sheet to start a new tidy-up: the top bar's, the Inbox's or the checklist's.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string, scenario: string, time = 'instant'): Promise<void> => {
  await page.goto(`${path}?scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const launches = (page: Page) => page.getByRole('button', { name: /^Tidy up( \d+( things?)?)?$/, disabled: false });
const checklist = (page: Page) => page.getByRole('region', { name: 'Your first tidy-up' });
const checklistTidy = (page: Page) => checklist(page).getByRole('button', { name: 'Tidy up', exact: true });
const desktop = () => test.info().project.name === 'desktop';

/** Each element follows the one before it in the document (compareDocumentPosition). */
async function expectInOrder(page: Page, parts: Locator[]): Promise<void> {
  for (const part of parts) await expect(part).toHaveCount(1, { timeout: 60_000 });
  const handles = await Promise.all(parts.map((p) => p.elementHandle()));
  const follows = await page.evaluate((els) => els.slice(1).map((el, i) => !!el && !!els[i] && !!(els[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)), handles);
  expect(follows).toEqual(parts.slice(1).map(() => true));
}

test('AC1 order: checklist, questions, Inbox, search, Recent', async ({ page }) => {
  await open(page, '/', 'default');
  await expect(checklistTidy(page)).toBeVisible();
  await expectInOrder(page, [
    checklist(page),
    page.getByRole('region', { name: /^\d+ questions? for you$/ }),
    page.getByRole('region', { name: 'Inbox' }),
    page.getByRole('button', { name: /Search your notes and files/ }),
    page.getByRole('region', { name: /^(Recent|Just filed)$/ }),
  ]);
});

test('AC3 returning_desktop: once the report is seen, the top bar is the one launch', async ({ page, allowConsole }) => {
  test.skip(!desktop(), 'the desktop top bar');
  test.setTimeout(90_000);
  allowConsole(/disposition was refused/, 'the made-up leftovers are not real dispositions');
  await open(page, '/', 'slow-report');
  await expect(page.getByText(/Tidy-up finished/)).toBeVisible({ timeout: 60_000 });
  await page.locator('section[aria-labelledby="away"]').getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(page.getByText(/Tidy-up finished/)).toHaveCount(0);
  const inbox = page.getByRole('region', { name: 'Inbox' });
  await expect(inbox.getByText(/^\d+ things? waiting/)).toBeVisible({ timeout: 60_000 });
  await expect(launches(page)).toHaveCount(1);
  await expect(launches(page)).toHaveAccessibleName(/^Tidy up \d+$/);
  await expect(inbox.getByRole('button', { name: /^Tidy up/ })).toHaveCount(0);
});

test('AC3 desktop_off_home (guard): off Home the top bar is the one launch', async ({ page }) => {
  test.skip(!desktop(), 'the desktop top bar');
  await open(page, '/files/Projects', 'default');
  await expect(page.getByRole('button', { name: /^Tidy up \d+$/ })).toBeVisible();
  await expect(launches(page)).toHaveCount(1);
  await expect(launches(page)).toHaveAccessibleName(/^Tidy up \d+$/);
});

test('AC3 phone_keeps_inbox (guard): on the phone the Inbox keeps its Tidy up', async ({ page, allowConsole }) => {
  test.skip(desktop(), 'the phone');
  test.setTimeout(90_000);
  allowConsole(/disposition was refused/, 'the made-up leftovers are not real dispositions');
  await open(page, '/', 'slow-report');
  await expect(page.getByText(/Tidy-up finished/)).toBeVisible({ timeout: 60_000 });
  const tidy = page.getByRole('region', { name: 'Inbox' }).getByRole('button', { name: /^Tidy up \d+ things?$/ });
  await expect(tidy).toBeVisible({ timeout: 60_000 });
  await expect(launches(page)).toHaveCount(1);
});

test('AC4 first_time_checklist_only: the checklist offers the one Tidy up', async ({ page }) => {
  await open(page, '/', 'default');
  await expect(checklistTidy(page)).toBeVisible();
  await expect(launches(page)).toHaveCount(1);
  await expect(checklist(page).getByRole('button', { name: /^Tidy up( \d+( things?)?)?$/, disabled: false })).toHaveCount(1);
});

test('AC4 never_two: no stage shows two launches on Home', async ({ page, allowConsole }) => {
  test.setTimeout(180_000);
  allowConsole(/disposition was refused/, 'the made-up leftovers are not real dispositions');
  const stages: Array<[string, string, (p: Page) => Locator]> = [
    ['default', 'instant', checklistTidy],
    ['slow-report', 'instant', (p) => p.getByText(/Tidy-up finished/)],
    ['running', 'demo', (p) => checklist(p).getByRole('listitem').nth(2).and(p.locator('[aria-current="step"]'))],
    ['back', 'instant', (p) => p.getByRole('button', { name: 'See the report' }).first()],
    ['empty', 'instant', (p) => checklist(p).getByRole('button', { name: 'Add a pile', exact: true })],
  ];
  for (const [scenario, time, shown] of stages) {
    await open(page, '/', scenario, time);
    await expect(shown(page), scenario).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => launches(page).count(), { message: scenario }).toBeLessThanOrEqual(1);
  }
});
