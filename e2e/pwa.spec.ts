import { expect, test, type Page } from '@playwright/test';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'vite';

test('the built app has a manifest and registers a service worker', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { name: string; display: string; icons: Array<{ sizes: string }> };
  expect(manifest.name).toBe('Bower');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  await page.goto('/?scenario=default&time=instant');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe('activated');
});

test('the service worker keeps the app shell only, never Google Drive or the Worker', async ({ request }) => {
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).not.toMatch(/googleapis/);
  expect(sw).not.toMatch(/runtimeCaching|NetworkFirst|StaleWhileRevalidate/);
});

test('with no network the app still opens', async ({ page, context }) => {
  await page.goto('/?scenario=default&time=instant');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 8000 });
  await context.setOffline(false);
});

test("the app shell never answers the Worker's own paths", async ({ page }) => {
  await page.goto('/?scenario=default&time=instant');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe('activated');
  await page.reload();
  // An app page comes from the service worker; a Worker path goes to the network.
  expect((await page.goto('/files'))?.fromServiceWorker()).toBe(true);
  for (const p of ['/auth/login', '/me', '/drive/token', '/vault', '/process', '/status', '/runs', '/push/subscribe']) {
    expect((await page.goto(p))?.fromServiceWorker(), p).toBe(false);
  }
});

// Real production builds, swapped behind the existing preview server. No app hooks:
// Chromium coverage identifies the main bundle that actually executed.
test.describe('a deployment on the same origin', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  let directory: string;
  let buildA: string;
  let buildB: string;
  let mainA: string;
  let mainB: string;
  let oldChunk: string;

  test.beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'bower-pwa-builds-'));
    buildA = join(directory, 'a');
    buildB = join(directory, 'b');
    await cp('dist', buildB, { recursive: true });
    await build({
      logLevel: 'warn',
      build: {
        outDir: buildA,
        emptyOutDir: true,
        rolldownOptions: { output: {
          entryFileNames: 'assets/a-[name]-[hash].js',
          chunkFileNames: 'assets/a-[name]-[hash].js',
        } },
      },
    });
    const entry = async (dir: string): Promise<string> => {
      const html = await readFile(join(dir, 'index.html'), 'utf8');
      const script = /<script\b[^>]*type="module"[^>]*src="([^"]+)"/.exec(html)?.[1];
      if (!script) throw new Error('No production main bundle');
      return script;
    };
    mainA = await entry(buildA);
    mainB = await entry(buildB);
    expect(mainA).not.toBe(mainB);
    const world = (await readdir(join(buildA, 'assets'))).find((name) => /^a-world-.*\.js$/.test(name));
    if (!world) throw new Error('No production lazy world chunk');
    oldChunk = `/assets/${world}`;
    expect(await readdir(join(buildB, 'assets'))).not.toContain(world);
  });

  const serve = async (dir: string): Promise<void> => {
    await rm('dist', { recursive: true, force: true });
    await cp(dir, 'dist', { recursive: true });
  };

  test.beforeEach(async ({ page }) => {
    await serve(buildA);
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
  });

  test.afterAll(async () => {
    if (buildB) await serve(buildB);
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  const deploy = async (page: Page): Promise<void> => {
    await serve(buildB);
    // Observe B's own worker, rather than confusing A's active worker with B.
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error('No service worker registration');
      const installing = new Promise<void>((resolve, reject) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return reject(new Error('No installing worker'));
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' || worker.state === 'activated') resolve();
            if (worker.state === 'redundant') reject(new Error('Update became redundant'));
          });
        }, { once: true });
      });
      await registration.update();
      await installing;
    });
    // Allow activation/claim to settle; on the red B stays waiting. The assertion
    // below still checks executed bundle identity after an ordinary reload.
    await page.waitForTimeout(1000);
  };

  const executed = async (page: Page): Promise<string[]> =>
    (await page.coverage.stopJSCoverage()).filter((entry) => entry.functions.some((fn) => fn.ranges.some((range) => range.count > 0))).map((entry) => new URL(entry.url).pathname);

  test('one ordinary reload after a deploy executes build B', async ({ page }) => {
    let navigations = 0;
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
    });
    await page.goto('/?source=demo&scenario=default&time=instant');
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.reload(); // Establish A's controller before the deployment.
    await expect(page.locator('#root')).not.toBeEmpty();
    const beforeDeploy = navigations;
    await deploy(page);
    // Activation and controllerchange must leave the current page running A.
    expect(navigations).toBe(beforeDeploy);
    await page.reload();
    await expect(page.locator('#root')).not.toBeEmpty();
    expect(await executed(page)).toContain(mainB);
    expect(navigations).toBe(beforeDeploy + 1);
  });

  test('a removed old lazy chunk recovers with exactly one reload', async ({ page }) => {
    let release: () => void = () => undefined;
    let requested: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { requested = resolve; });
    let missingStatus: number | undefined;
    await page.route(`**${oldChunk}`, async (route) => {
      requested();
      await held;
      // The request reaches the newly deployed server, where A's chunk is gone.
      const response = await route.fetch({ headers: { ...route.request().headers(), accept: 'text/javascript' } });
      missingStatus = response.status();
      await route.fulfill({ response });
    });
    let navigations = 0;
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
    });
    await page.goto('/?source=demo&scenario=default&time=instant', { waitUntil: 'commit' });
    await started;
    // A's pending import can delay window.load, so use the browser's registration
    // API to install its real worker while that network request is held.
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await deploy(page);
    expect(navigations).toBe(1);
    release();
    await expect.poll(() => navigations).toBe(2);
    await expect(page.locator('#root')).not.toBeEmpty();
    expect(missingStatus).toBe(404);
    expect(navigations).toBe(2);
    const bundles = await executed(page);
    expect(bundles).toContain(mainA);
    expect(bundles).toContain(mainB);
    // Leave time for a second startup/import failure to reveal a reload loop.
    await page.waitForTimeout(1000);
    expect(navigations).toBe(2);
  });
});
