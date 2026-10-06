import { expect, test } from './fixtures';

test('console guard: an unexpected console error fails the test', async ({ page }) => {
  // The guard must fail this test after it runs; test.fail() turns that into a pass.
  test.fail();
  await page.goto('/');
  await page.evaluate(() => console.error('boom: not on the allowlist'));
});

test('console guard: an allowlisted error passes with its reason', async ({ page, allowConsole }) => {
  allowConsole(/expected: save refused/, 'a failure-path test logs the BowerError details');
  await page.goto('/');
  await page.evaluate(() => console.error('expected: save refused'));
  expect(true).toBe(true);
});
