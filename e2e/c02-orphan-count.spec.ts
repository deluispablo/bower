import type { Locator, Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

const singular = "1 pile didn't finish arriving. Add it again if you still need it.";
const plural = "3 piles didn't finish arriving. Add them again if you still need them.";
const unknown = "Bower couldn't check that everything you added arrived.";

// Stub only the count door, leaving the real Home, routing, Inbox and styling in place.
// The count mechanism's real Drive cases belong to orphan-pile-count-data's tests.
async function countRead(page: Page, summary: { count: number; complete: boolean }): Promise<void> {
  const module = isFake ? 'drive-vault' : 'world';
  await page.route(new RegExp(`/src/data/(?:vault|demo)/${module}\\.ts(?:\\?|$)`), async (route) => {
    const response = await route.fetch();
    const stub = isFake
      ? `DriveVault.prototype.orphanSummary = async function () { return ${JSON.stringify({ count: summary.count, complete: summary.complete })}; };`
      : `const c02Vault = DemoWorld.prototype.vault; DemoWorld.prototype.vault = function () { const door = c02Vault.call(this); door.orphanSummary = async () => (${JSON.stringify({ count: summary.count, complete: summary.complete })}); return door; };`;
    await route.fulfill({ response, body: `${await response.text()}\n${stub}\n` });
  });
}

async function lineStyle(line: Locator, token: string): Promise<void> {
  expect(await line.evaluate((node, name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    node.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { color: getComputedStyle(node).color, expected, size: getComputedStyle(node).fontSize };
  }, token)).toEqual({ color: expect.any(String), expected: expect.any(String), size: '15px' });
  expect(await line.evaluate((node, name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    node.append(probe);
    const same = getComputedStyle(node).color === getComputedStyle(probe).color;
    probe.remove();
    return same;
  }, token)).toBe(true);
  await expect(line.locator('a, button')).toHaveCount(0);
  expect(await line.evaluate((node) => node.tagName)).toBe('P');
  expect(await line.evaluate((node) => node.closest('[role="status"], [role="alert"], [aria-live]') === null)).toBe(true);
  await expect(line).not.toContainText(/orphan|upload|session|\.pdf/i);
}

for (const width of [375, 1440]) {
  for (const row of [
    { name: 'No pile left unfinished', count: 0, complete: true, sentence: null },
    { name: '1 / 3 unfinished, full read (1)', count: 1, complete: true, sentence: singular },
    { name: '1 / 3 unfinished, full read (3)', count: 3, complete: true, sentence: plural },
    { name: 'A read that failed in part (1)', count: 1, complete: false, sentence: `At least ${singular}` },
    { name: 'A read that failed in part (3)', count: 3, complete: false, sentence: `At least ${plural}` },
    { name: 'Nothing could be checked', count: 0, complete: false, sentence: unknown },
  ]) {
    test(`c02-upload-count-ui: ${row.name} at ${width}`, async ({ page }) => {
      await resize(page, { width, height: 900 });
      await countRead(page, row);
      await page.goto('/?scenario=default&time=instant');
      const inbox = page.getByRole('region', { name: 'Inbox' });
      await expect(inbox.getByText('Looking…', { exact: true })).toHaveCount(0);
      await expect(inbox.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
      if (row.sentence) {
        const line = inbox.getByText(row.sentence, { exact: true });
        await expect(line).toBeVisible();
        await lineStyle(line, row.count ? '--accent-line' : '--text-muted');
        expect(await line.evaluate((node) => node.previousElementSibling?.textContent)).toMatch(/waiting/);
        if (row.count === 0) await expect(line).not.toContainText('0');
      } else {
        await expect(inbox.getByText(/finish arriving|couldn't check that/)).toHaveCount(0);
      }
      await expectAxeClean(page, { include: 'main', wcag22: true });
      await page.getByRole('link', { name: 'Your account and settings' }).click();
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
      await expectAxeClean(page, { include: 'main', wcag22: true });
    });
  }
}
