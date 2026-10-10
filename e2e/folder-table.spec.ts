import { resize } from './viewport';
import { animationsEnd, expectAxeClean } from './axe';
import { expect, test } from './fixtures';

test('folder table headers stay on one line and the table scrolls sideways', async ({ page }) => {
  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await resize(page, viewport);
      // Same folder entry and boot check as v2-targets; explicitly use the demo on both projects.
      await page.goto('/files/Projects/Flat%20hunt?source=demo&scenario=default&time=instant');
      await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
      await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Table', exact: true }).click();

      const table = page.getByRole('main').getByRole('table');
      for (const label of ['Bedrooms', 'Commute']) {
        await expect(table.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
      }
      await animationsEnd(page);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));

      const heights = await table.locator('thead button').evaluateAll((buttons) =>
        buttons.map((button) => ({ label: button.textContent?.trim(), height: button.getBoundingClientRect().height })),
      );
      expect(heights.length).toBeGreaterThan(0);
      for (const { label, height } of heights) {
        expect(height, `${viewport.width}: ${label} header height`).toBeLessThanOrEqual(48);
      }

      for (const label of ['Bedrooms', 'Commute']) {
        const widths = await table.getByRole('columnheader', { name: label, exact: true }).evaluate((cell) => {
          const button = cell.querySelector('button');
          if (!button) throw new Error('Missing header button');
          // Measure an unwrapped copy of the label: a Range on wrapped text alone could hide the defect.
          const naturalLabel = document.createElement('span');
          const style = getComputedStyle(button);
          naturalLabel.textContent = button.textContent;
          Object.assign(naturalLabel.style, {
            font: style.font, letterSpacing: style.letterSpacing,
            whiteSpace: 'nowrap', position: 'fixed', visibility: 'hidden',
          });
          document.body.append(naturalLabel);
          try {
            const range = document.createRange();
            range.selectNodeContents(naturalLabel);
            return { cell: cell.getBoundingClientRect().width, label: range.getBoundingClientRect().width };
          } finally {
            naturalLabel.remove();
          }
        });
        expect(widths.label, `${label} natural width`).toBeGreaterThan(0);
        expect(widths.cell, `${viewport.width}: ${label} cell width`).toBeGreaterThanOrEqual(widths.label);
      }

      if (viewport.width === 375) {
        const wrap = await table.evaluate((element) => {
          const parent = element.parentElement;
          if (!parent) throw new Error('Missing table wrap');
          return { scroll: parent.scrollWidth, client: parent.clientWidth };
        });
        expect(wrap.scroll, '375: table wrap scrolls sideways').toBeGreaterThan(wrap.client);
      }
      await expectAxeClean(page, { include: 'main', wcag22: true });
    });
  }
});
