/**
 * Long lists (#590): with 2,000 notes the tree renders only the rows in
 * view, and the arrow keys still move focus row by row. Runs on a harness
 * page that bundles the tree (`tree-harness.tsx`), once with the page
 * scrolling (the phone) and once with the tree in its own scrolling box
 * (the desktop sidebar).
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from 'vite';

const HARNESS = '/tree-harness';
// Root-relative: Vite resolves it against the app folder.
const STUBS = '/e2e/tree-harness-stubs.ts';

/** Bundles the harness once: its script and the styles it imports. */
async function bundle(): Promise<{ js: string; css: string }> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    // The library build leaves this for a bundler to fill in.
    define: { 'process.env.NODE_ENV': '"production"' },
    resolve: {
      alias: [
        { find: /^(\.\.?\/)+vault-store\.js$/, replacement: STUBS },
        { find: /^(\.\.?\/)+use-new\.js$/, replacement: STUBS },
      ],
    },
    build: {
      write: false,
      minify: false,
      // The tree loads its list module lazily; one script is easier to serve.
      rollupOptions: { output: { inlineDynamicImports: true } },
      lib: {
        entry: 'e2e/tree-harness.tsx',
        formats: ['iife'],
        name: 'TreeHarness',
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
        `<title>Tree harness</title><style>${css}</style></head>` +
        `<body><div id="root"></div><script>${js}</script></body></html>`,
    }),
  );
});

function renderedRows(page: Page): Promise<number> {
  return page.locator('[role="treeitem"]').count();
}

function focusedName(page: Page): ReturnType<Page['locator']> {
  return page.locator('a:focus .tree-name');
}

for (const mode of ['page', 'box'] as const) {
  test.describe(`tree on 2,000 notes, ${mode === 'box' ? 'in its own scrolling box' : 'the page scrolling'}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(mode === 'box' ? `${HARNESS}#box` : HARNESS);
      // Every folder opens: 20 batches, 2,000 notes, 2,021 rows.
      await expect(
        page.locator('a.tree-link', { hasText: 'Batch 00' }),
      ).toBeVisible();
    });

    test('renders fewer than 60 rows', async ({ page }) => {
      const count = await renderedRows(page);
      expect(count).toBeGreaterThan(5);
      expect(count).toBeLessThan(60);
    });

    test('the arrow keys move focus row by row, far past the first screen', async ({
      page,
    }) => {
      await page.locator('a.tree-link', { hasText: 'Batch 00' }).focus();

      // Batch 00 holds Note 0000 to Note 0099: 80 presses walk well past
      // the rows rendered at the start.
      for (let n = 0; n < 80; n++) {
        await page.keyboard.press('ArrowDown');
        await expect(focusedName(page), `after ${n + 1} presses`).toHaveText(
          `Note ${String(n).padStart(4, '0')}`,
        );
      }
      expect(await renderedRows(page)).toBeLessThan(60);

      // And back up one row.
      await page.keyboard.press('ArrowUp');
      await expect(focusedName(page)).toHaveText('Note 0078');
    });
  });
}
