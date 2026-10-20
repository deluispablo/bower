import { expect, isFake, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

// design-note-page: on a phone, a note's table never breaks a word or a number in the middle; it scrolls sideways
// inside its own region instead (WCAG 1.4.10 Reflow), and headers and number cells stay on one line. Linked notes
// show each note once. The seeded made-up notes, on demo and fake.
const NOTES = ['Projects/Flat%20hunt/Flat%20hunt.md', 'Projects/Job%20hunt/Job%20hunt.md'];

for (const path of NOTES) {
  test(`design-note-page: the table in ${decodeURIComponent(path)} keeps every word whole on a phone`, async ({ page }) => {
    await resize(page, { width: 375, height: 812 });
    await page.goto(`/note/${path}?scenario=default&time=instant`);
    const main = page.getByRole('main');
    const region = main.getByRole('region', { name: /^Table: / }).first();
    await expect(region).toBeVisible();
    const table = region.getByRole('table');
    await expect(table.getByRole('row').nth(1)).toBeVisible();

    const cells = await table.evaluate((t) => {
      /** How many line boxes a range of text takes. */
      const lines = (r: Range): number => new Set([...r.getClientRects()].filter((b) => b.width > 0).map((b) => Math.round(b.top))).size;
      return [...t.querySelectorAll('th, td')].map((cell) => {
        const text = cell.textContent ?? '';
        const broken: string[] = [];
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const value = node.nodeValue ?? '';
          for (const m of value.matchAll(/\S+/g)) {
            const r = document.createRange();
            r.setStart(node, m.index);
            r.setEnd(node, m.index + m[0].length);
            if (lines(r) > 1) broken.push(m[0]);
          }
        }
        const whole = document.createRange();
        whole.selectNodeContents(cell);
        return { text, header: cell.tagName === 'TH', number: /^[-+]?[£$€]?\d[\d,.]*\s?(%|[A-Za-z]{1,4})?$/.test(text.trim()), broken, lines: lines(whole) };
      });
    });
    expect(cells.length, 'the note has a table').toBeGreaterThan(4);
    // AC1: no word or number is split across lines, anywhere in the table.
    expect(cells.filter((c) => c.broken.length).map((c) => `${c.text}: ${c.broken.join(' ')}`)).toEqual([]);
    // AC2: header cells and number cells take one line.
    expect(cells.filter((c) => (c.header || c.number) && c.lines > 1).map((c) => c.text)).toEqual([]);
    expect(cells.some((c) => c.number), 'positive control: the table has number cells').toBe(true);
    // AC1: the region scrolls sideways when it must; the page never does.
    expect(await region.evaluate((r) => getComputedStyle(r).overflowX)).toBe('auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Overflow is reachable: scrolling the region sideways brings its last cell into view (nothing is clipped).
    const reach = await region.evaluate((r) => {
      const last = [...r.querySelectorAll('tr')].at(-1)?.lastElementChild;
      // Force an overflow with a long unbroken token (a web address) in the last cell, as a real note could have.
      if (last) last.textContent = 'https://example.com/a/very/long/address/that/cannot/break/anywhere/at/all';
      r.scrollLeft = r.scrollWidth;
      const box = r.getBoundingClientRect();
      const cell = last?.getBoundingClientRect();
      return { overflows: r.scrollWidth > r.clientWidth, reached: !!cell && cell.right <= box.right + 1 && cell.right > box.left };
    });
    expect(reach.reached, 'the last cell is reachable by scrolling the table').toBe(true);
    expect(reach.overflows, 'positive control: at 375 px the table overflows its region').toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the page still does not scroll').toBe(true);
    await region.evaluate((r) => { r.scrollLeft = 0; });
    await region.focus();
    await expect(region).toBeFocused();
    await expectAxeClean(page, { include: 'main', wcag22: true });
  });
}

test('design-note-page: linked notes show each note once on a phone, two-way ones in their own group', async ({ page }) => {
  await resize(page, { width: 375, height: 812 });
  await page.goto(`/note/${NOTES[0]}?scenario=default&time=instant`);
  const linked = page.getByRole('main').locator('section', { has: page.getByRole('heading', { name: 'Linked notes', exact: true }) });
  await expect(linked.getByRole('heading', { name: 'Links to', exact: true })).toBeVisible();
  const paths = await linked.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  expect(paths.length, 'the note has linked notes').toBeGreaterThan(1);
  expect(paths.filter((t, i) => paths.indexOf(t) !== i), 'each note once, by its path').toEqual([]);
  // In the demo the flats link back to their project, so they are listed under "Links both ways", said once
  // (ux-controls-polish AC4; the pretend Drive's flats do not link back).
  if (!isFake) {
    await expect(linked.getByRole('heading', { name: 'Links both ways', exact: true }).locator('xpath=following-sibling::ul[1]').getByRole('link', { name: /Flat 3, 12 Larkspur Lane/ })).toBeVisible();
    await expect(linked.getByText('Links both ways', { exact: true })).toHaveCount(1);
  }
});
