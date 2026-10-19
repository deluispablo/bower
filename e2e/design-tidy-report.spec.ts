import type { Locator } from '@playwright/test';
import { expect, openTidy, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

// design-tidy-report: the tidy-up's report sheet keeps its buttons in reach however long the report is. The
// report's question is the first thing after the summary, so it is in view when the sheet opens. Made-up data.

/** Whether the element is fully inside the sheet's visible area and the window, and on top there. */
async function inReach(sheet: Locator, el: Locator): Promise<boolean> {
  return el.evaluate((node, dialog) => {
    const r = node.getBoundingClientRect();
    const d = (dialog as Element).getBoundingClientRect();
    const inside = r.top >= d.top - 0.5 && r.bottom <= d.bottom + 0.5 && r.left >= d.left - 0.5 && r.right <= d.right + 0.5
      && r.bottom <= window.innerHeight + 0.5 && r.right <= window.innerWidth + 0.5 && r.height > 0 && r.width > 0;
    // Edge coverage: the centre and a point just inside each edge's midpoint (the corners are rounded) must hit the element itself.
    const points: [number, number][] = [[0.5, 0.5], [0.05, 0.5], [0.95, 0.5], [0.5, 0.08], [0.5, 0.92]];
    const onTop = points.every(([x, y]) => {
      const top = document.elementFromPoint(r.left + r.width * x, r.top + r.height * y);
      return !!top && (node === top || node.contains(top));
    });
    return inside && onTop;
  }, await sheet.elementHandle());
}

for (const width of [375, 1440]) {
  test(`design-tidy-report: Done and Watch stay in reach while the report scrolls, at ${width}`, async ({ page }) => {
    await resize(page, { width, height: width < 900 ? 812 : 900 });
    await page.goto('/?scenario=default&time=instant');
    await openTidy(page);
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
    await expect(sheet.getByText(/^Done\. \d+ things filed\.$/).last()).toBeVisible();
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
    const [clockBottom, actionsTop] = await Promise.all([clock.evaluate((n) => n.getBoundingClientRect().bottom), done.evaluate((n) => n.parentElement?.getBoundingClientRect().top ?? 0)]);
    expect(clockBottom, 'the last line ends above the actions row').toBeLessThanOrEqual(actionsTop + 0.5);
    // The question comes first after the summary: in view when the sheet opens.
    await sheet.evaluate((d) => { d.scrollTop = 0; });
    const asked = sheet.getByText('Bower has a question', { exact: true });
    if (await asked.count()) expect(await inReach(sheet, asked), 'the question label in view at the top').toBe(true);
    // Tabbing through the report's links never lands one behind the actions row (WCAG 2.4.11).
    const count = await sheet.getByRole('link').count();
    expect(count, 'positive control: the report has links to tab through').toBeGreaterThan(0);
    await sheet.getByRole('link').first().focus();
    for (let i = 0; i < count * 3; i++) {
      const covered = await done.evaluate((btn) => {
        const focus = document.activeElement;
        const row = btn.parentElement?.getBoundingClientRect();
        if (!focus || !row || focus.tagName !== 'A') return false;
        const r = focus.getBoundingClientRect();
        return r.bottom > row.top + 0.5 && r.top < row.bottom;
      });
      expect(covered, `link ${i + 1} of ${count} is clear of the actions row`).toBe(false);
      await page.keyboard.press('Tab');
    }
    await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
    await done.click();
    await expect(sheet).toHaveCount(0);
  });
}

// AC1 tidy-row-flush: the pinned actions row ends at the sheet's bottom edge, so no report text scrolls below the buttons.
// The sheet's own bottom padding (and the phone's safe area) sits inside the row, not under it.
const INSET = 34; // a controlled nonzero bottom safe area, like a phone with a home indicator
for (const [width, height] of [[375, 812], [1440, 520]]) {
  test(`AC1 tidy-row-flush: the actions row ends flush at the sheet's bottom while the report scrolls, at ${width}`, async ({ page }) => {
    await resize(page, { width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: INSET } });
    await page.goto('/?scenario=default&time=instant');
    await openTidy(page);
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
    await expect(sheet.getByText(/^Done\. \d+ things filed\.$/).last()).toBeVisible();
    const done = sheet.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeAttached();

    expect(await sheet.evaluate((d) => d.scrollHeight > d.clientHeight + 1), 'positive control: the report overflows the sheet').toBe(true);
    for (const at of ['middle', 'bottom'] as const) {
      await sheet.evaluate((d, where) => { d.scrollTop = where === 'bottom' ? d.scrollHeight : d.scrollHeight / 2; }, at);
      expect(await sheet.evaluate((d) => d.scrollTop), `positive control: the report scrolled to the ${at}`).toBeGreaterThan(0);
      const [row, box, button] = await Promise.all([
        done.evaluate((n) => n.parentElement?.getBoundingClientRect().bottom ?? NaN),
        sheet.evaluate((d) => d.getBoundingClientRect().bottom),
        done.evaluate((n) => n.getBoundingClientRect().bottom),
      ]);
      expect(Math.abs(row - box), `the actions row ends at the sheet's bottom edge, report at the ${at}`).toBeLessThanOrEqual(0.5);
      // The buttons keep the sheet's bottom padding (plus the safe area on the phone) clear below them.
      expect(box - button, `the buttons clear the bottom edge, report at the ${at}`).toBeGreaterThanOrEqual((width < 900 ? 24 + INSET : 26) - 0.5);
    }
  });
}
