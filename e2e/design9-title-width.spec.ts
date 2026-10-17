/**
 * design9-title-width (tester, P3): between about 1512 and 1650 px with both side panels, Home is two columns
 * (design8-layout) and Recent sits in the narrow one, where a note's title was held on one line and cut. A title wraps.
 */
import { resize } from './viewport';
import { expect, test } from './fixtures';

const prefs = { leftOpen: true, rightOpen: true, leftWidth: 300, rightWidth: 320, birdMoves: false };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((initial) => localStorage.setItem('bower:prefs', JSON.stringify(initial)), prefs);
});

for (const width of [1560, 1600]) {
  test(`AC1 design9-title-width-e2e: Recent titles wrap beside the inbox at ${width}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'The two columns and both side panels are the desktop shell.');
    await resize(page, { width, height: 900 });
    await page.goto('/?source=demo&scenario=default&time=instant');
    await expect(page.locator('#boot')).toHaveCount(0);
    const recent = page.getByRole('main').getByRole('region', { name: /^(Recent|Just filed)$/ });
    await expect(recent.getByRole('link').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Two columns: Recent sits to the right of the inbox (the band where the tester saw titles cut).
    const inbox = page.getByRole('main').getByRole('heading', { name: 'Inbox', level: 2 });
    const [inboxBox, recentBox] = await Promise.all([inbox.boundingBox(), recent.boundingBox()]);
    expect(recentBox?.x ?? 0).toBeGreaterThan((inboxBox?.x ?? 0) + (inboxBox?.width ?? 0));
    const titles = await recent.getByRole('link').evaluateAll((links) => links.map((link) => {
      const title = link.querySelector('span:not(:first-child) > span:first-child');
      if (!(title instanceof HTMLElement)) throw new Error('Missing Recent title');
      return { text: title.textContent, whiteSpace: getComputedStyle(title).whiteSpace, cut: title.scrollWidth > title.clientWidth + 1 };
    }));
    expect(titles.length).toBeGreaterThan(0);
    for (const t of titles) expect(t, t.text ?? '').toMatchObject({ whiteSpace: expect.not.stringMatching(/^nowrap$/), cut: false });
  });
}
