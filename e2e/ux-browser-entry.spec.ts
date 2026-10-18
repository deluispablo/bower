import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, source, test } from './fixtures';
import { resize } from './viewport';

for (const width of [390, 1440]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`landing header Sign in works by keyboard at ${width} in ${colorScheme}`, async ({ page }) => {
    await resize(page, { width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto('/privacy?scenario=signed-out&time=instant');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/?scenario=signed-out&time=instant');
    await expect(page).toHaveURL(/\/landing\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Drive, tidied by a bowerbird.');
    const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in', exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/sign-in');
    expect(await link.evaluate((el) => !!el.closest('header') && !el.closest('[role="slider"], .scene, .slider'))).toBe(true);
    for (let i = 0; i < 10 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/sign-in$/);
    const selection = () => page.evaluate(() => ['source', 'scenario', 'scale'].map((key) => sessionStorage.getItem(`bower:demo:${key}`)));
    // The gate's demo run sets no E2E_SOURCE, so no source is chosen or kept.
    const kept = source || null;
    expect(await selection()).toEqual([kept, 'signed-out', 'instant']);
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('heading', { name: /Hello, Alex/ })).toBeVisible();
    expect(await selection()).toEqual([kept, 'signed-out', 'instant']);
    await page.goBack();
    await expect(page).toHaveURL(/\/landing\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy\?/);
  });
}

test('fixer detects and repairs a removed header link, then leaves both assets identical', async () => {
  const root = mkdtempSync(join(tmpdir(), 'browser-entry-'));
  const landing = join(root, 'public/landing');
  mkdirSync(landing, { recursive: true });
  mkdirSync(join(root, 'scripts'));
  copyFileSync('scripts/fix-landing.mjs', join(root, 'scripts/fix-landing.mjs'));
  for (const asset of ['index.html', 'support.js']) copyFileSync(`public/landing/${asset}`, join(landing, asset));
  const read = (asset: string) => readFileSync(join(landing, asset), 'utf8');
  const run = (...args: string[]) => spawnSync(process.execPath, [join(root, 'scripts/fix-landing.mjs'), ...args], { encoding: 'utf8' });
  try {
    writeFileSync(join(landing, 'index.html'), read('index.html').replace(/<a\b[^>]*href="\/sign-in"[^>]*>Sign in<\/a>/g, ''));
    expect(run('--check').status).toBe(1);
    expect(run().status).toBe(0);
    const html = read('index.html');
    const support = read('support.js');
    const nav = html.match(/<header\b[\s\S]*?<nav aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
    expect(nav.match(/<a\b[^>]*href="\/sign-in"[^>]*>Sign in<\/a>/g)).toHaveLength(1);
    expect(html.match(/href="\/sign-in"/g)).toHaveLength(1);
    expect(run('--check').status).toBe(0);
    expect(run().status).toBe(0);
    expect(read('index.html')).toBe(html);
    expect(read('support.js')).toBe(support);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const destination of ['/files/Projects', '/files/Projects/Flat%20hunt?view=list&tag=a%2Bb']) {
  test(`WorkerHttp leaves the document and returns once to ${destination}`, async ({ page, allowConsole }) => {
    allowConsole(/Failed to load resource: the server responded with a status of 401/, 'controlled signed-out Worker response');
    let signedIn = false;
    let logins = 0;
    await page.route('**/me', (route) => route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? { user: { name: 'Alex', email: 'you@example.com' }, folderId: 'root' } : { error: { code: 'auth', message: 'Sign in again.' } } }));
    await page.route('**/session', (route) => route.fulfill({ json: { active: true, epoch: 1 } }));
    await page.route('**/status', (route) => route.fulfill({ json: { run: null, revision: 0 } }));
    await page.route('**/drive/token', (route) => route.fulfill({ json: { accessToken: 'controlled-test-token', expiresAt: Date.now() + 3600000 } }));
    const folders = ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive', 'Flat hunt'].map((name, i) => ({ id: `folder-${i}`, name, parents: [i === 5 ? 'folder-1' : 'root'], mimeType: 'application/vnd.google-apps.folder', modifiedTime: '2026-01-01T00:00:00Z', createdTime: '2026-01-01T00:00:00Z' }));
    await page.route('https://www.googleapis.com/drive/v3/**', (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q') ?? '';
      return route.fulfill({ json: { files: folders.filter((folder) => query.includes(`'${folder.parents[0]}' in parents`)) } });
    });
    await page.route('**/auth/login', async (route) => {
      logins++;
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Controlled authentication</title><h1>Controlled authentication</h1><a href="/auth/callback">Complete sign-in</a>' });
    });
    await page.route('**/auth/callback', async (route) => {
      signedIn = true;
      await route.fulfill({ status: 302, headers: { location: '/' } });
    });
    await page.goto('/privacy?source=real');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate((path) => location.assign(path), destination);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?from=${encodeURIComponent(destination).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('heading', { name: 'Controlled authentication' })).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login$/);
    expect(logins).toBe(1);
    await page.getByRole('link', { name: 'Complete sign-in' }).click();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(destination);
    // The phone heading also holds its "More for" button, so match the name's start.
    await expect(page.getByRole('heading', { name: destination.includes('Flat') ? /^Flat hunt/ : /^Projects/, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('bower:sign-in-from'))).toBeNull();
    await page.evaluate(() => location.assign('/'));
    await expect(page.getByRole('heading', { name: /Hello, Alex/ })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });
}
