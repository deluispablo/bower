import type { Locator, Page } from '@playwright/test';
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
      // The rules note is a link row of the section (design-rules-block AC6), not its first bullet.
      await expect(panel.locator('section', { has: page.getByRole('heading', { name: 'Rules', exact: true }) }).getByRole('link', { name: 'Your rules note', exact: true })).toBeVisible();
      await expectAxeClean(page, { include: 'aside[aria-label="Right panel"]', wcag22: true });
    }

    await main.getByRole('link', { name: 'Open your rules note', exact: true }).click();
    await expect(page).toHaveURL(/\/note\/Rules\.md(?:\?|$)/);
    await expect(page.getByRole('heading', { level: 1, name: 'Rules', exact: true })).toBeVisible();
  });
}

/** The text look of an element, as the browser computed it. */
const look = (el: Locator): Promise<Record<string, string>> =>
  el.evaluate((e) => {
    const c = getComputedStyle(e);
    return { family: c.fontFamily, size: c.fontSize, weight: c.fontWeight, color: c.color, decoration: c.textDecorationLine };
  });

// design-rules-block: the person's text leads; two equal group labels; the note's own headings read as bold text;
// the rules added in Bower in the prose's weight; the foot link under its sentence. Real styles, no screenshots.
for (const width of [375, 1440]) {
  test(`design-rules-block: the rules block's hierarchy and foot link, at ${width}`, async ({ page }) => {
    await resize(page, { width, height: width < 900 ? 812 : 900 });
    const stub = await proseRead(page);
    await page.goto('/bower?scenario=default&time=instant');
    const main = page.getByRole('main');
    const written = main.getByRole('region', { name: 'Written in your rules note', exact: true });
    await expect(written).toBeVisible();
    expect(stub.served, 'the prose read is stubbed').toBe(true);
    const prose = await look(written.getByText('Alex keeps paper letters for a year, then scans them.', { exact: true }));
    expect(Number(prose.weight), 'the person\'s text is regular weight').toBe(400);

    // AC1: a rule added in Bower reads in the prose's weight and size, not bold.
    const remove = main.getByRole('button', { name: /^Remove the rule: / }).first();
    await expect(remove).toBeVisible();
    // The probe is the element holding the rule's words, found by its text, whatever wraps it.
    const ruleWords = ((await remove.getAttribute('aria-label')) ?? '').replace(/^Remove the rule: /, '');
    const rule = await look(main.getByRole('listitem').getByText(ruleWords, { exact: true }));
    expect({ size: rule.size, weight: rule.weight }).toEqual({ size: prose.size, weight: prose.weight });

    // AC2: the two group labels look the same, and stand out from the text they label.
    const labels = ['Written in your rules note', 'Added in Bower'].map((name) => main.getByRole('heading', { level: 3, name, exact: true }));
    for (const label of labels) await expect(label).toBeVisible();
    const [writtenLook, addedLook] = await Promise.all(labels.map(look));
    expect(addedLook).toEqual(writtenLook);
    expect(Number(writtenLook?.weight)).toBeGreaterThan(Number(prose.weight));

    // AC3: the note's own heading reads as bold text of the prose, not as a heading of the page.
    const inner = await look(written.getByRole('heading', { name: 'Rules', exact: true }));
    expect({ family: inner.family, size: inner.size }).toEqual({ family: prose.family, size: prose.size });
    expect(Number(inner.weight)).toBeGreaterThanOrEqual(600);

    // AC4: "Open your rules note" sits under its sentence, left-aligned with it.
    const sentence = await main.getByText(FOOT, { exact: true }).boundingBox();
    const open = await main.getByRole('link', { name: 'Open your rules note', exact: true }).boundingBox();
    expect(sentence && open).toBeTruthy();
    if (sentence && open) {
      expect(open.y, 'the link starts under the sentence').toBeGreaterThanOrEqual(sentence.y + sentence.height - 1);
      expect(Math.abs(open.x - sentence.x), 'left edges line up').toBeLessThanOrEqual(1);
    }
    // Unchanged: each rule card keeps its date and Remove on one row.
    const row = await remove.evaluate((b) => {
      const date = b.parentElement?.firstElementChild?.getBoundingClientRect();
      const own = b.getBoundingClientRect();
      return date ? Math.abs(date.top + date.height / 2 - (own.top + own.height / 2)) < own.height / 2 && date.right <= own.left : false;
    });
    expect(row, 'date and Remove share a row').toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectAxeClean(page, { include: 'main', wcag22: true });

    if (width < 900) return;
    // AC5, AC6: in the panel each rule is two lines at most, its full text kept; the rules note is a link row.
    const panel = page.getByRole('complementary', { name: 'Right panel', exact: true });
    const section = panel.locator('section', { has: page.getByRole('heading', { name: 'Rules', exact: true }) });
    const items = section.getByRole('listitem');
    await expect(items.first()).toBeVisible();
    // The rule text is the item's first element; a pending status beside it stays outside the clamp, visible.
    const fit = await items.evaluateAll((lis) => lis.map((li) => {
      const el = li.firstElementChild as HTMLElement;
      const line = parseFloat(getComputedStyle(el).lineHeight);
      const clamped = el.getBoundingClientRect().height / line;
      const saved = [el.style.webkitLineClamp, el.style.display, el.style.overflow];
      el.style.webkitLineClamp = 'unset';
      el.style.display = 'block';
      el.style.overflow = 'visible';
      const natural = el.getBoundingClientRect().height / line;
      [el.style.webkitLineClamp, el.style.display, el.style.overflow] = saved;
      const status = li.children[1]?.getBoundingClientRect();
      return { text: el.textContent ?? '', clamped, natural, statusShown: status ? status.height > 0 && status.top >= el.getBoundingClientRect().bottom - 1 : true };
    }));
    for (const item of fit) {
      expect(item.clamped, item.text).toBeLessThanOrEqual(2.05);
      expect(item.statusShown, `status of ${item.text}`).toBe(true);
    }
    // Positive control: a rule that overflows two lines with the clamp off is there, whole, in the page.
    const long = fit.find((i) => i.natural > 2.05);
    expect(long, 'a rule over two lines with the clamp off').toBeTruthy();
    if (long) await expect(main.getByText(long.text, { exact: true })).toBeVisible();
    const noteLink = section.getByRole('link', { name: 'Your rules note', exact: true });
    await expect(noteLink).toBeVisible();
    expect(await noteLink.evaluate((a) => a.closest('li') === null)).toBe(true);
    const answer = panel.getByRole('link', { name: 'Answer on Home', exact: true });
    await expect(answer, 'the panel\'s other link row').toBeVisible();
    expect(await look(noteLink)).toEqual(await look(answer));
    await expectAxeClean(page, { include: 'aside[aria-label="Right panel"]', wcag22: true });
  });
}
