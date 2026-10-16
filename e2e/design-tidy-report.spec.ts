import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

// design-tidy-report: the tidy-up's report sheet keeps its buttons in reach however long the report is. The
// report's question is the first thing after the summary, so it is in view when the sheet opens. Made-up data.

/** Whether the element is fully inside the sheet's visible area and the window, and on top there. */
async function inReach(sheet: Locator, el: Locator): Promise<boolean> {
  return el.evaluate((node, dialog) => {
    const r = node.getBoundingClientRect();
    const d = (dialog as Element).getBoundingClientRect();
    const inside = r.top >= d.top - 0.5 && r.bottom <= d.bottom + 0.5 && r.bottom <= window.innerHeight + 0.5 && r.height > 0;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return inside && !!top && (node === top || node.contains(top));
  }, await sheet.elementHandle());
}

for (const width of [375, 1440]) {
  test(`design-tidy-report: Done and Watch stay in reach while the report scrolls, at ${width}`, async ({ page }) => {
    await resize(page, { width, height: width < 900 ? 812 : 900 });
    await page.goto('/?scenario=default&time=instant');
    await page.getByRole('button', { name: /^Tidy up \d+ things$/ }).first().click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
    await expect(sheet.getByText(/^Done\. \d+ things filed$/).last()).toBeVisible();
    const done = sheet.getByRole('button', { name: 'Done', exact: true });
    const watch = sheet.getByRole('button', { name: 'Watch what Bower did', exact: true });
    const clock = sheet.getByText(/^Finished /);
    await expect(done).toBeAttached();

    const scrolls = await sheet.evaluate((d) => d.scrollHeight > d.clientHeight + 1);
    if (width < 900) expect(scrolls, 'positive control: the report is longer than the phone sheet').toBe(true);
    for (const at of ['top', 'middle', 'bottom'] as const) {
      await sheet.evaluate((d, where) => { d.scrollTop = where === 'top' ? 0 : where === 'bottom' ? d.scrollHeight : d.scrollHeight / 2; }, at);
      expect(await inReach(sheet, done), `Done in reach at the ${at}`).toBe(true);
      expect(await inReach(sheet, watch), `Watch in reach at the ${at}`).toBe(true);
    }
    // At the bottom the last line of the report shows whole, not under the buttons.
    expect(await inReach(sheet, clock), 'the last line of the report in view at the bottom').toBe(true);
    // The question comes first after the summary: in view when the sheet opens.
    await sheet.evaluate((d) => { d.scrollTop = 0; });
    const asked = sheet.getByText('Bower has a question', { exact: true });
    if (await asked.count()) expect(await inReach(sheet, asked), 'the question label in view at the top').toBe(true);
    await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
    await done.click();
    await expect(sheet).toHaveCount(0);
  });
}
