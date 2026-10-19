import { resize } from './viewport';
import type { Locator } from '@playwright/test';
import { expect, openTidy, test } from './fixtures';
import { expectAxeClean } from './axe';

async function look(pill: Locator) {
  await expect(pill).toBeVisible();
  return pill.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      borderRadius: style.borderRadius,
      height: style.height,
    };
  });
}

test('the new pill has one look everywhere', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  await resize(page, { width: isMobile ? 375 : 1440, height: 900 });
  await page.goto('/?source=fake&scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  // The scripted tidy-up marks both a filed thing and the project note's new Timeline line.
  await openTidy(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things?$/ }).click();
  await expect(page.getByRole('dialog').getByText(/^Done\./).last()).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const homePill = page.getByRole('main').getByText('New', { exact: true }).first();
  const homeLook = await look(homePill);
  const colors = await homePill.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--fresh)';
    probe.style.color = 'var(--brand-line)';
    element.append(probe);
    const style = getComputedStyle(probe);
    const result = { background: style.backgroundColor, color: style.color };
    probe.remove();
    return result;
  });
  expect(homeLook).toEqual({ ...colors, fontSize: '13px', fontWeight: '600', borderRadius: '999px', height: '22px' });
  await expect(homePill).toHaveClass(/_freshPill_/);
  await expectAxeClean(page, { include: 'main' });

  await page.goto('/files/Projects/Flat%20hunt');
  const folderPill = page.getByRole('main').getByText('New', { exact: true }).first();
  expect(await look(folderPill)).toEqual(homeLook);
  await expect(folderPill).toHaveClass(/_freshPill_/);
  await expectAxeClean(page, { include: 'main' });

  await page.goto('/note/Projects/Flat%20hunt/Flat%20hunt.md');
  const notePill = page.getByRole('region', { name: 'Timeline', exact: true }).getByText('New', { exact: true }).first();
  expect(await look(notePill)).toEqual(homeLook);
  await expect(notePill).toHaveClass(/_freshPill_/);
  await expectAxeClean(page, { include: 'main' });

  // Use the same phone menu / desktop tree entry points as v2-move-here.
  await page.goto('/note/Projects/Flat%20hunt/Lease%20draft.pdf');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  if (isMobile) {
    await page.getByRole('button', { name: 'More for Lease draft' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Move to…', exact: true }).click();
  } else {
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    await tree.focus();
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to…', exact: true }).click();
  }
  const sheet = page.getByRole('dialog', { name: 'Move Lease draft', exact: true });
  const herePill = sheet.getByText('Now here', { exact: true });
  expect(await look(herePill)).toEqual(homeLook);
  await expect(herePill).toHaveClass(/_freshPill_/);
  await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
});
