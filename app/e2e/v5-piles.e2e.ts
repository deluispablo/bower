/**
 * Piles (#771, spec R-PILE-6): two piles made one after the other, a reload,
 * and both are still there with their notes, while the inbox holds two
 * context notes that each list only their own files. Runs on a harness page
 * that bundles the real pile store and the real Drive client
 * (`piles-harness.tsx`) against a mocked Drive whose state lives in this
 * process, so it survives the page's reload: no network, no Google.
 */

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { build } from 'vite';

// No `@types/node` in this repo; `Buffer` is a real Node global here.
declare const Buffer: {
  from: (text: string) => { length: number };
};

const HARNESS = '/piles-harness';
const INBOX = 'FOLDER_ID';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

/** Bundles the harness once: its script and the styles it imports. */
async function bundle(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: 'e2e/piles-harness.tsx',
        formats: ['iife'],
        name: 'PilesHarness',
        fileName: 'harness',
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  let js = '';
  for (const output of outputs) {
    if (!('output' in output)) continue;
    for (const item of output.output) {
      if (item.type === 'chunk') js += item.code;
    }
  }
  return js;
}

let bundled = '';

test.beforeAll(async () => {
  bundled = await bundle();
});

interface Stored {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime: string;
  content: string;
  trashed: boolean;
}

/** The mocked Drive: the inbox and what is in it. */
interface Drive {
  files: Stored[];
  /** The context notes still in the inbox. */
  notes: () => Stored[];
}

function mockDrive(page: Page): Drive {
  const files: Stored[] = [];
  let clock = 0;
  const stamp = (): string =>
    new Date(Date.UTC(2026, 8, 30, 10, 0, (clock += 1))).toISOString();
  const json = (file: Stored): string =>
    JSON.stringify({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      parents: file.parents,
      modifiedTime: file.modifiedTime,
      size: String(file.content.length),
    });
  const drive: Drive = {
    files,
    notes: () =>
      files.filter((f) => !f.trashed && /Context/.test(f.name) && !f.trashed),
  };

  void page.route('**/drive/token', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'TOKEN',
        expiresAt: '2099-01-01T00:00:00.000Z',
        folderId: INBOX,
      }),
    }),
  );

  void page.route('https://www.googleapis.com/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const ok = (
      body: string,
      contentType = 'application/json',
    ): Promise<void> =>
      route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': contentType },
        body,
      });
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const byId = /\/files\/([^/?]+)$/.exec(url.pathname)?.[1];

    // files.create, multipart: metadata JSON, then the content.
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files') {
      const boundary = /boundary=(.+)$/.exec(
        request.headers()['content-type'] ?? '',
      )?.[1];
      const parts = (request.postData() ?? '')
        .split(`--${boundary ?? ''}`)
        .filter((part) => part.includes('Content-Type'));
      const body = (part: string | undefined): string =>
        (part ?? '')
          .split('\r\n\r\n')
          .slice(1)
          .join('\r\n\r\n')
          .replace(/\r\n$/, '');
      const metadata = JSON.parse(body(parts[0])) as {
        name: string;
        parents: string[];
        mimeType?: string;
      };
      const file: Stored = {
        id: `ID_${String(files.length + 1)}`,
        name: metadata.name,
        mimeType: metadata.mimeType ?? 'text/plain',
        parents: metadata.parents,
        modifiedTime: stamp(),
        content: body(parts[1]),
        trashed: false,
      };
      files.push(file);
      await ok(json(file));
      return;
    }
    // files.update, media: the note's new text.
    if (
      method === 'PATCH' &&
      url.pathname.startsWith('/upload/drive/v3/files/')
    ) {
      const file = files.find((f) => f.id === byId);
      if (file === undefined) {
        await route.fulfill({ status: 404, headers: CORS, body: '{}' });
        return;
      }
      file.content = request.postData() ?? '';
      file.modifiedTime = stamp();
      await ok(json(file));
      return;
    }
    // files.update, metadata: trashing.
    if (method === 'PATCH' && byId !== undefined) {
      const file = files.find((f) => f.id === byId);
      if (file !== undefined) file.trashed = true;
      await ok('{}');
      return;
    }
    // files.get, media.
    if (method === 'GET' && url.searchParams.get('alt') === 'media') {
      await ok(files.find((f) => f.id === byId)?.content ?? '', 'text/plain');
      return;
    }
    // files.list: the children of a folder.
    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      const parent = /'([^']+)' in parents/.exec(
        url.searchParams.get('q') ?? '',
      )?.[1];
      await ok(
        `{"files":[${files
          .filter(
            (f) =>
              !f.trashed && parent !== undefined && f.parents.includes(parent),
          )
          .map(json)
          .join(',')}]}`,
      );
      return;
    }
    await route.fulfill({ status: 404, headers: CORS, body: '{}' });
  });

  return drive;
}

async function openHarness(page: Page): Promise<void> {
  await page.route(`**${HARNESS}`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Piles harness</title></head>' +
        `<body><div id="root"></div><script>${bundled}</script></body></html>`,
    }),
  );
  await page.goto(HARNESS);
  await page.waitForFunction(() => document.body.dataset.listed === '1');
}

function text(name: string): {
  name: string;
  mimeType: string;
  buffer: { length: number };
} {
  return { name, mimeType: 'text/plain', buffer: Buffer.from(`${name}\n`) };
}

test('two piles, a reload: both are back with their notes, each note lists only its own files (R-PILE-6)', async ({
  page,
}) => {
  const drive = mockDrive(page);
  await openHarness(page);

  // 1. A pile of two files, with a note.
  await page.getByLabel('What is this pile?').fill('Five job offers.');
  await page
    .getByLabel('Add files')
    .setInputFiles([text('offer one.txt'), text('offer two.txt')]);
  const first = page.getByTestId('pile').first();
  await expect(first).toContainText('offer one.txt');
  await expect(first).toContainText('offer two.txt');
  await expect
    .poll(() =>
      drive
        .notes()
        .some(
          (n) =>
            n.content.includes('Five job offers.') &&
            n.content.includes('offer one.txt') &&
            n.content.includes('offer two.txt'),
        ),
    )
    .toBe(true);

  // 2. Leave Add: the open pile closes and its note is written once more.
  await page.getByRole('button', { name: 'Leave Add' }).click();
  await page.getByRole('button', { name: 'Open Add' }).click();

  // 3. A second pile, of one file, with another note.
  await page.getByLabel('What is this pile?').fill('A flat to rent.');
  await page.getByLabel('Add files').setInputFiles([text('flat plan.txt')]);
  await expect(page.getByTestId('pile')).toHaveCount(2);
  await expect
    .poll(() =>
      drive
        .notes()
        .some(
          (n) =>
            n.content.includes('A flat to rent.') &&
            n.content.includes('flat plan.txt'),
        ),
    )
    .toBe(true);

  // 4. Reload.
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.listed === '1');

  // 5. Both piles are back, with their notes.
  const piles = page.getByTestId('pile');
  await expect(piles).toHaveCount(2);
  const one = piles.filter({ hasText: 'Five job offers.' });
  await expect(one).toContainText('offer one.txt');
  await expect(one).toContainText('offer two.txt');
  await expect(one).not.toContainText('flat plan.txt');
  const two = piles.filter({ hasText: 'A flat to rent.' });
  await expect(two).toContainText('flat plan.txt');
  await expect(two).not.toContainText('offer one.txt');

  // The inbox holds two context notes, each listing only its own files.
  const notes = drive.notes();
  expect(notes).toHaveLength(2);
  const noteOne = notes.find((n) => n.content.includes('Five job offers.'));
  const noteTwo = notes.find((n) => n.content.includes('A flat to rent.'));
  expect(noteOne?.content).toContain('- offer one.txt');
  expect(noteOne?.content).toContain('- offer two.txt');
  expect(noteOne?.content).not.toContain('flat plan.txt');
  expect(noteTwo?.content).toContain('- flat plan.txt');
  expect(noteTwo?.content).not.toContain('offer one.txt');
  expect(
    new Set(notes.map((n) => /^pile: (\S+)$/m.exec(n.content)?.[1])).size,
  ).toBe(2);
});
