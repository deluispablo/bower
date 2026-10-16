import { animationsEnd, expectAxeClean } from './axe';
import { expect, test } from './fixtures';

test.use({ viewport: { width: 1280, height: 720 } });

for (const source of ['demo', 'fake']) {
  test(`q-ui-3: tall desktop sheet stays inside the window and scrolls (${source})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(`/?source=${source}&scenario=empty&time=instant`);
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });

    // Use Home and Add throughout: reloading would replace the demo's in-memory piles.
    const inbox = page.getByRole('region', { name: 'Inbox', exact: true });
    const names = Array.from({ length: 24 }, (_, i) => `Garden idea ${i + 1}`);
    for (const name of names) {
      await inbox.getByRole('button', { name: 'Add a pile', exact: true }).click();
      await page.getByRole('textbox', { name: 'What is this?', exact: true }).fill(name);
      await page.getByRole('button', { name: 'Add to the inbox', exact: true }).click();
      await expect(inbox.getByRole('link', { name: new RegExp(`^${name}\\b`) })).toBeVisible();
    }

    await inbox.getByRole('button', { name: 'Tidy up 24 things', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Tidy up 24 things?', exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('listitem')).toHaveCount(24);
    const pileTitles = sheet.getByRole('listitem').locator(':scope > span:first-of-type');
    for (const name of names) await expect(pileTitles.filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1);
    await animationsEnd(page);

    const content = await sheet.getByRole('list').boundingBox();
    expect(content).not.toBeNull();
    if (!content) throw new Error('The pile list needs a bounding box.');
    // Positive control: the list alone is taller than the entire window.
    expect(content.height).toBeGreaterThan(720);
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('The sheet needs a bounding box.');
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, 'the sheet ends inside the viewport').toBeLessThanOrEqual(720);

    const sizes = await sheet.evaluate((element) => ({
      content: element.scrollHeight,
      visible: element.clientHeight,
      overflow: getComputedStyle(element).overflowY,
    }));
    expect(sizes.content).toBeGreaterThan(720);
    expect(sizes.content).toBeGreaterThan(sizes.visible);
    expect(sizes.overflow).toBe('auto');
    await sheet.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => sheet.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(sheet.getByRole('button', { name: 'Not now', exact: true })).toBeInViewport();
    await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
  });
}
