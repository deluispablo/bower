import type { Page } from '@playwright/test';
import { test } from './fixtures';

// Screenshots of every screen for the design canvas. Runs only with SHOTS=<dir>.
const DIR = process.env.SHOTS;
test.skip(!DIR, 'set SHOTS to a folder to take the screenshots');
test.use({ colorScheme: 'dark' });

const go = async (page: Page, path: string, scenario = 'default', time = 'demo') => {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}scenario=${scenario}&time=${time}`);
  await page.locator('#boot').waitFor({ state: 'detached', timeout: 8000 });
  await page.addStyleTag({ content: 'button[aria-label="Demo situations"]{display:none!important}' });
  await page.waitForTimeout(900);
};
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `${DIR}/${project}-${name}.png` });

test('screens', async ({ page }, info) => {
  test.setTimeout(120_000);
  const p = info.project.name;
  const desktop = p === 'desktop';
  await page.goto('/?scenario=default');
  await page.waitForTimeout(150);
  await shot(page, '00-boot', p);

  await go(page, '/sign-in', 'signed-out');
  await shot(page, '01-sign-in', p);

  await go(page, '/', 'first');
  await page.waitForTimeout(4200);
  await shot(page, '02-first-folder', p);

  await go(page, '/');
  await shot(page, '03-home', p);

  await go(page, '/', 'back');
  await shot(page, '04-home-back', p);

  await go(page, '/add');
  await page.getByLabel('What is this?').fill('Receipts from the Saltmere weekend');
  await page.getByLabel('Paste a link').fill('https://hotel.example/invoice');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.waitForTimeout(1500);
  await shot(page, '05-add', p);

  await go(page, '/pile/p1');
  await shot(page, '06-pile', p);

  await go(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md');
  await shot(page, '07-note', p);

  await go(page, '/note/Areas/Documents/Passport%20renewal.md');
  await page.locator('.md-task input').nth(4).click();
  await page.waitForTimeout(400);
  await shot(page, '08-checklist', p);

  if (desktop) {
    await go(page, '/files/Projects/Job%20hunt/Applications');
    await page.getByRole('radio', { name: /Table/ }).click();
    await page.waitForTimeout(500);
    await shot(page, '09-folder-table', p);
    await go(page, '/');
    await page.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.waitForTimeout(300);
    await shot(page, '10-explorer-menu', p);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByPlaceholder('Type a command or a note').fill('flat');
    await page.waitForTimeout(300);
    await shot(page, '11-palette', p);
  } else {
    await go(page, '/files');
    await shot(page, '09-files', p);
    await go(page, '/files/Projects/Flat%20hunt');
    await shot(page, '10-folder', p);
  }

  await go(page, '/bower');
  await page.getByRole('radio', { name: 'A rule' }).click();
  await page.getByRole('button', { name: 'anything from the dentist goes in health' }).click();
  await page.getByRole('button', { name: 'Keep this rule' }).click();
  await page.waitForTimeout(400);
  await shot(page, '12-bower', p);

  await go(page, '/settings');
  await shot(page, '13-settings', p);

  await go(page, '/');
  await page.getByRole('button', { name: /^Tidy up \d+ things$/ }).first().click();
  await page.waitForTimeout(500);
  await shot(page, '14-tidy-confirm', p);
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
  await page.waitForTimeout(5600);
  await shot(page, '15-tidy-reading', p);
  await page.waitForTimeout(6000);
  await shot(page, '16-tidy-writing', p);
  await page.waitForTimeout(8500);
  await shot(page, '17-tidy-saving', p);

  await go(page, '/', 'back');
  await page.getByRole('button', { name: 'Watch what Bower did' }).first().click();
  await page.waitForTimeout(4200);
  await shot(page, '18-replay', p);
  await page.waitForTimeout(9000);
  await shot(page, '19-replay-done', p);
});
