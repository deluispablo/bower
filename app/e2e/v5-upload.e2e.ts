/**
 * Durable uploads (#768, spec R-UPL-1 and R-UPL-3): a file attached while
 * Drive is slow is still there after a reload and finishes without being
 * picked again; `beforeunload` is set only while a file is unfinished.
 * Runs on a harness page that bundles the real queue and chip
 * (`upload-harness.tsx`) against a mocked Drive: no network, no Google.
 */

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { build } from 'vite';

const HARNESS = '/upload-harness';
const SESSION = 'https://www.googleapis.com/upload/session/S1';
const FILE = 'e2e/files/Garden centre receipt.txt';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, PUT, OPTIONS',
  'access-control-allow-headers': 'authorization, content-range, content-type',
  'access-control-expose-headers': 'Location, Range',
};

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
        entry: 'e2e/upload-harness.tsx',
        formats: ['iife'],
        name: 'UploadHarness',
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

interface Drive {
  /** Chunk PUTs the mock saw, by their Content-Range. */
  chunks: string[];
  /** Holds the next chunk answer until `release()`. */
  hold: () => void;
  release: () => void;
  /** Drive has the whole file. */
  complete: () => boolean;
}

/** A mocked Drive: resumable session, token, CORS. */
async function mockDrive(page: Page): Promise<Drive> {
  let holding = true;
  let gate: (() => void) | undefined;
  let waiting: Promise<void> = new Promise<void>((resolve) => {
    gate = resolve;
  });
  let done = false;
  const chunks: string[] = [];

  await page.route('**/drive/token', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'TOKEN',
        expiresAt: '2099-01-01T00:00:00.000Z',
        folderId: 'FOLDER_ID',
      }),
    }),
  );

  await page.route('https://www.googleapis.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        headers: { ...CORS, Location: SESSION },
        body: '{}',
      });
      return;
    }
    const range = request.headers()['content-range'] ?? '';
    if (range.startsWith('bytes */')) {
      // The status question after a reload: nothing arrived yet.
      await route.fulfill(
        done
          ? {
              status: 200,
              headers: CORS,
              body: JSON.stringify({ id: 'FILE1', name: 'offer.txt' }),
            }
          : { status: 308, headers: CORS, body: '' },
      );
      return;
    }
    chunks.push(range);
    if (holding) {
      // Drive is slow: the answer never comes (the page is reloaded).
      await waiting;
      if (page.isClosed()) return;
    }
    done = true;
    await route.fulfill({
      status: 200,
      headers: CORS,
      body: JSON.stringify({ id: 'FILE1', name: 'offer.txt' }),
    });
  });

  return {
    chunks,
    hold: () => {
      holding = true;
      waiting = new Promise<void>((resolve) => {
        gate = resolve;
      });
    },
    release: () => {
      holding = false;
      gate?.();
    },
    complete: () => done,
  };
}

async function openHarness(page: Page): Promise<void> {
  const { js, css } = bundled ?? { js: '', css: '' };
  await page.route(`**${HARNESS}`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        `<title>Upload harness</title><style>${css}</style></head>` +
        `<body><div id="root"></div><script>${js}</script></body></html>`,
    }),
  );
  await page.goto(HARNESS);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
}

/** Whether a `beforeunload` handler is asking to stop the page leaving. */
function leaveIsGuarded(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test('a file attached mid-upload finishes after a reload, without picking it again (R-UPL-1, R-UPL-3)', async ({
  page,
}) => {
  const drive = await mockDrive(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await openHarness(page);
  expect(await leaveIsGuarded(page)).toBe(false);

  // Attach one file; Drive holds the answer to its chunk.
  await page.getByLabel('Pick files').setInputFiles(FILE);
  const bar = page.getByTestId('bar');
  await expect(
    bar.getByRole('button', { name: /^Uploading 1 file to your inbox/ }),
  ).toBeVisible();
  await expect.poll(() => drive.chunks.length).toBe(1);
  expect(await leaveIsGuarded(page)).toBe(true);

  // Reload while it is still going: the copy on the device is all that is left.
  drive.hold();
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await expect(
    bar.getByRole('button', { name: 'Finishing 1 upload from last time' }),
  ).toBeVisible();
  expect(await leaveIsGuarded(page)).toBe(true);
  expect(drive.complete()).toBe(false);

  // Drive answers: the file is in, the chip is gone, the guard is off.
  drive.release();
  await expect(bar.getByRole('status')).toHaveCount(0);
  expect(drive.complete()).toBe(true);
  // The whole file went in one chunk: bytes 0-(n-1)/n.
  const [, last, total] =
    /^bytes 0-(\d+)\/(\d+)$/.exec(drive.chunks.at(-1) ?? '') ?? [];
  expect(Number(last) + 1).toBe(Number(total));
  expect(await leaveIsGuarded(page)).toBe(false);

  // Nothing is left on the device to send again.
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await expect(bar.getByRole('status')).toHaveCount(0);
});
