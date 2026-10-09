import { expect, test } from '@playwright/test';
import { axeScan, expectAxeClean } from './axe';

// focus-axe-contrast-flaky: a sheet fades in while axe reads its colours, so the contrast it sees is a frame in between.
const PAGE = `<!doctype html><html lang="en"><head><title>Fixture</title><style>
  body { background: #fff; margin: 0; }
  main p { color: #fff; animation: settle 1.2s linear forwards; }
  @keyframes settle { to { color: #000; } }
  aside i { display: block; width: 8px; height: 8px; animation: spin 0.5s linear infinite; }
  @keyframes spin { to { transform: rotate(1turn); } }
</style></head><body><main><h1>Sheet</h1><p>Name this folder</p></main><aside><i></i></aside></body></html>`;

test("axe runs after the sheet's animations end", async ({ page }) => {
  await page.setContent(PAGE);
  // Right after the page is set, the text is still the colour it started with: a scan now would see white on white.
  expect(await page.evaluate(() => document.getAnimations().some((a) => a.playState === 'running'))).toBe(true);
  await expectAxeClean(page, { include: 'main' });
  const settled = await page.evaluate(() => getComputedStyle(document.querySelector('main p') as Element).color);
  expect(settled).toBe('rgb(0, 0, 0)');
  // An animation that never ends does not hold the scan back.
  const results = await axeScan(page, { include: 'aside' });
  expect(results.violations).toEqual([]);
});
