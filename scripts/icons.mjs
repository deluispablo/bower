// Renders the app icon (public/app-icon.svg) to the PNG sizes an installable app needs.
// Uses the Chrome Playwright already drives; run with `node scripts/icons.mjs` after changing the icon.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/app-icon.svg', import.meta.url), 'utf8');
mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: new URL(`../public/icons/app-${size}.png`, import.meta.url).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written');
