/**
 * The photo viewer (#605): full screen on tap, 2x on double tap with the
 * zoom badge, Escape closes, the arrows walk. Runs on a harness page that
 * bundles the component (`photo-harness.tsx`), since the file screen only
 * mounts it in #606.
 */

import { expect, test } from '@playwright/test';
import { build } from 'vite';

const HARNESS = '/photo-harness';

/** Bundles the harness once: its script and the styles it imports. */
async function bundle(): Promise<{ js: string; css: string }> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: 'e2e/photo-harness.tsx',
        formats: ['iife'],
        name: 'PhotoHarness',
        fileName: 'harness',
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  let js = '';
  let css = '';
  for (const output of outputs) {
    if (!('output' in output)) continue;
    for (const item of output.output) {
      if (item.type === 'chunk') js += item.code;
      else if (item.fileName.endsWith('.css')) css += String(item.source);
    }
  }
  return { js, css };
}

let bundled: { js: string; css: string } | undefined;

test.beforeAll(async () => {
  bundled = await bundle();
});

test.beforeEach(async ({ page }) => {
  const { js, css } = bundled ?? { js: '', css: '' };
  await page.route(`**${HARNESS}`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        `<title>Photo harness</title><style>${css}</style></head>` +
        `<body><div id="root"></div><script>${js}</script></body></html>`,
    }),
  );
  await page.goto(HARNESS);
});

test('a tap opens full screen, a double tap zooms to 2x, Escape closes', async ({
  page,
}) => {
  const open = page.getByRole('button', { name: /Tap to see it whole/ });
  await expect(open).toBeVisible();
  await open.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('2 of 5 in Flat hunt')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);

  await dialog.getByRole('img').dblclick();
  await expect(page.getByRole('status')).toHaveText('2×');
  await dialog.getByRole('img').dblclick();
  await expect(page.getByRole('status')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('the arrow keys and the buttons walk the folder', async ({ page }) => {
  await page.getByRole('button', { name: /Tap to see it whole/ }).click();
  const dialog = page.getByRole('dialog');

  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

  // Real full screen takes a moment to settle; press again until it lands.
  await expect(async () => {
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText('3 of 5 in Flat hunt')).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await expect(dialog.getByText('Kitchen')).toBeVisible();

  await dialog.getByRole('button', { name: 'Previous' }).click();
  await expect(dialog.getByText('2 of 5 in Flat hunt')).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByText('1 of 5 in Flat hunt')).toBeVisible();
});
