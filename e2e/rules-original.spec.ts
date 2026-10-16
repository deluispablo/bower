import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

// rules-original-ui (spec docs/design/specs/2026-10-10-rules-original.md): the person's own rules text above the rules
// added in Bower, on the Bower screen and in the desktop panel. Made-up text; one long unbroken word checks the wrap.
const PROSE = [
  'Alex keeps paper letters for a year, then scans them.',
  '',
  '## Rules',
  '',
  '- Bills go in Money, by month.',
  '- Anything from www.example-council-tax-and-water-rates-office.example goes in Home.',
].join('\n');
const FOOT = 'Bower follows these too. To change them, edit the note.';

// Stub only the prose read, leaving the real Bower screen, panel, routing, rules and styling in place.
// The read's real Drive cases belong to src/data/vault/rules-original.test.ts.
async function proseRead(page: Page): Promise<{ served: boolean }> {
  const module = isFake ? 'drive-vault' : 'world';
  const seen = { served: false };
  await page.route(new RegExp(`/src/data/(?:vault|demo)/${module}\\.ts(?:\\?|$)`), async (route) => {
    const response = await route.fetch();
    const text = await response.text();
    // Positive control: the module the stub extends is the one served.
    expect(text).toMatch(isFake ? /\bclass DriveVault\b/ : /\bclass DemoWorld\b/);
    seen.served = true;
    const stub = isFake
      ? `DriveVault.prototype.rulesProse = async function () { return ${JSON.stringify(PROSE)}; };`
      : `const roVault = DemoWorld.prototype.vault; DemoWorld.prototype.vault = function () { const door = roVault.call(this); door.rulesProse = async () => ${JSON.stringify(PROSE)}; return door; };`;
    await route.fulfill({ response, body: `${text}\n${stub}\n` });
  });
  return seen;
}

for (const width of [375, 1440]) {
  test(`rules-original-ui: the prose, the rules added in Bower and the panel, with WCAG 2.2, at ${width}`, async ({ page }) => {
    await resize(page, { width, height: width < 900 ? 812 : 900 });
    const stub = await proseRead(page);
    await page.goto('/bower?scenario=default&time=instant');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Your rules', exact: true })).toBeVisible();
    expect(stub.served, 'the prose read is stubbed').toBe(true);
    const written = main.getByRole('region', { name: 'Written in your rules note', exact: true });
    await expect(written).toBeVisible();
    await expect(written.getByText('Alex keeps paper letters for a year, then scans them.', { exact: true })).toBeVisible();
    // The prose keeps the note viewer's look: its list is a bulleted list, never rule cards.
    const item = written.getByRole('listitem').filter({ hasText: 'Bills go in Money, by month.' });
    await expect(item).toBeVisible();
    expect(await item.evaluate((li) => ({ list: getComputedStyle(li).listStyleType, border: getComputedStyle(li).borderBottomWidth }))).toEqual({ list: 'disc', border: '0px' });
    await expect(written.getByRole('button')).toHaveCount(0);
    await expect(main.getByText(FOOT, { exact: true })).toBeVisible();
    const added = main.getByText('Added in Bower', { exact: true });
    await expect(added).toBeVisible();
    const remove = main.getByRole('button', { name: /^Remove the rule: / }).first();
    await expect(remove).toBeVisible();
    expect(await written.evaluate((region, label) => !!(region.compareDocumentPosition(label as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await added.elementHandle())).toBe(true);
    // One column at both widths, and the page never scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectAxeClean(page, { include: 'main', wcag22: true });

    if (width >= 900) {
      const panel = page.getByRole('complementary', { name: 'Right panel', exact: true });
      const heading = panel.getByRole('heading', { name: 'Rules', exact: true });
      await expect(heading).toBeVisible();
      await expect(panel.getByRole('heading', { name: /^\d+ rules?$/ })).toHaveCount(0);
      const first = panel.locator('section', { has: page.getByRole('heading', { name: 'Rules', exact: true }) }).getByRole('listitem').first();
      await expect(first.getByRole('link', { name: 'Your rules note', exact: true })).toBeVisible();
      await expectAxeClean(page, { include: 'aside[aria-label="Right panel"]', wcag22: true });
    }

    await main.getByRole('link', { name: 'Open your rules note', exact: true }).click();
    await expect(page).toHaveURL(/\/note\/Rules\.md(?:\?|$)/);
    await expect(page.getByRole('heading', { level: 1, name: 'Rules', exact: true })).toBeVisible();
  });
}
