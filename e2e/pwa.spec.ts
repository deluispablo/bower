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

test('the service worker keeps the app shell only, never Google Drive or the Worker', async ({ page, request }) => {
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).not.toMatch(/googleapis/);
  expect(sw).not.toMatch(/runtimeCaching|StaleWhileRevalidate/);
  await page.goto('/?source=demo&scenario=default&time=instant');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  // A navigation may use NetworkFirst; ordinary requests and excluded routes
  // must still reach the network, never an app-shell response.
  expect((await page.goto('/files'))?.fromServiceWorker()).toBe(true);
  for (const path of ['/landing/', '/auth/login', '/me', '/drive/token', '/vault', '/process', '/status', '/session', '/health', '/runs', '/push/subscribe']) {
    expect((await page.goto(path))?.fromServiceWorker(), path).toBe(false);
  }
  await page.goto('/?source=demo&scenario=default&time=instant');
  // Record the response source rather than its bytes: preview also serves HTML
  // for unknown paths, which would hide an overbroad runtime route.
  const ordinary = page.waitForResponse((result) =>
    result.url().endsWith('/files?pwa-non-navigation=1') && result.request().resourceType() === 'fetch');
  await page.evaluate(async () => {
    const result = await fetch('/files?pwa-non-navigation=1');
    await result.text();
  });
  expect((await ordinary).fromServiceWorker()).toBe(false);
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
    // Capture A's execution while its document still exists: coverage after the
    // recovery reload only contains the current document's scripts.
    expect(await executed(page)).toContain(mainA);
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
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
    expect(bundles).toContain(mainB);
    // Leave time for a second startup/import failure to reveal a reload loop.
    await page.waitForTimeout(1000);
    expect(navigations).toBe(2);
  });

  const appControls = async (page: Page): Promise<void> => {
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByRole('link', { name: /^Home/ }).first()).toBeVisible();
  };

  const openControlledA = async (page: Page, path: string): Promise<void> => {
    // Seed the demo choice, including for the literal / and /index.html aliases.
    await page.goto('/?source=demo&scenario=default&time=instant');
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.goto(path);
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
    await appControls(page);
    expect(await executed(page)).toContain(mainA);
  };

  const withholdWorkerB = async (page: Page): Promise<void> => {
    const withheld = join(directory, 'b-with-a-worker');
    await rm(withheld, { recursive: true, force: true });
    await cp(buildB, withheld, { recursive: true });
    // generateSW imports root workbox-*.js; injectManifest bundles its worker.
    // Retain both forms of A's worker, while every HTML/asset is from B.
    const scripts = (await readdir(buildA)).filter((name) => name === 'sw.js' || /^workbox-.*\.js$/.test(name));
    for (const script of scripts) await cp(join(buildA, script), join(withheld, script));
    // Prepare the whole hybrid before exposing it: B's worker is never briefly
    // available for an automatic update during the preview-directory swap.
    await serve(withheld);
    expect(await readFile(join('dist', 'sw.js'), 'utf8')).toBe(await readFile(join(buildA, 'sw.js'), 'utf8'));
    expect(await readFile(join('dist', 'index.html'), 'utf8')).toContain(mainB);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error('No service worker registration');
      await registration.update();
    });
    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return !!registration && !registration.installing && !registration.waiting &&
        registration.active === navigator.serviceWorker.controller;
    })).toBe(true);
  };

  const countNavigations = (page: Page): (() => number) => {
    let count = 0;
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) count++;
    });
    return () => count;
  };

  for (const { label, path } of [
    { label: '/', path: '/' },
    { label: 'an app route with a query', path: '/files?source=demo&scenario=default&time=instant&pwa-deploy=b' },
    { label: '/index.html', path: '/index.html' },
  ]) {
    test(`pwa-update-one-reload: ${label} executes B before its worker installs`, async ({ page, context }) => {
      await openControlledA(page, path);
      const workerA = context.serviceWorkers()[0];
      expect(workerA).toBeDefined();
      await withholdWorkerB(page);
      const navigations = countNavigations(page);
      // Only the reloaded document can satisfy the bundle assertions.
      await page.coverage.startJSCoverage({ resetOnNavigation: true });
      await page.reload();
      await appControls(page);
      const bundles = await executed(page);
      expect(bundles).toContain(mainB);
      expect(bundles).not.toContain(mainA);
      expect(context.serviceWorkers()).toEqual([workerA]);
      expect(navigations()).toBe(1);
    });
  }

  test('pwa-update-one-reload: offline opens precached A while B worker is withheld', async ({ page, context }) => {
    await openControlledA(page, '/files?source=demo&scenario=default&time=instant');
    await withholdWorkerB(page);
    const navigations = countNavigations(page);
    try {
      await context.setOffline(true);
      await page.coverage.startJSCoverage({ resetOnNavigation: true });
      expect((await page.reload())?.fromServiceWorker()).toBe(true);
      await appControls(page);
      await expect(page.getByRole('tree', { name: 'Your Bower folder' })).toBeVisible();
      const bundles = await executed(page);
      expect(bundles).toContain(mainA);
      expect(bundles).not.toContain(mainB);
      expect(navigations()).toBe(1);
    } finally {
      await context.setOffline(false);
    }
  });

  test('pwa-update-one-reload: offline opens precached B after its worker claims the tab', async ({ page, context }) => {
    await openControlledA(page, '/files?source=demo&scenario=default&time=instant');
    await withholdWorkerB(page);
    const controllerA = await page.evaluateHandle(() => navigator.serviceWorker.controller);
    const navigations = countNavigations(page);
    await deploy(page);
    await expect.poll(() => page.evaluate((worker) => {
      const controller = navigator.serviceWorker.controller;
      return controller !== null && controller !== worker && controller.state === 'activated';
    }, controllerA)).toBe(true);
    await controllerA.dispose();
    expect(navigations()).toBe(0);
    try {
      await context.setOffline(true);
      await page.coverage.startJSCoverage({ resetOnNavigation: true });
      expect((await page.reload())?.fromServiceWorker()).toBe(true);
      await appControls(page);
      await expect(page.getByRole('tree', { name: 'Your Bower folder' })).toBeVisible();
      const bundles = await executed(page);
      expect(bundles).toContain(mainB);
      expect(bundles).not.toContain(mainA);
      expect(navigations()).toBe(1);
    } finally {
      await context.setOffline(false);
    }
  });

  test('pwa-update-one-reload: a three-second timeout opens precached A with no navigation cache entry', async ({ page, context }) => {
    await openControlledA(page, '/?source=demo&scenario=default&time=instant');
    await withholdWorkerB(page);
    const target = new URL('/files?source=demo&scenario=default&time=instant&pwa-timeout=uncached', page.url()).href;
    // Check every cache, including precache: this exact navigation has never
    // happened. A fallback cannot rely on a prior runtime navigation response.
    expect(await page.evaluate(async (url) => {
      const names = await caches.keys();
      for (const name of names) {
        if (await (await caches.open(name)).match(url)) return true;
      }
      return false;
    }, target)).toBe(false);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let networkRequests = 0;
    await context.route(target, async (route) => {
      // Only the worker's outgoing fetch is held. The browser's document request
      // must still reach A's real fetch handler, rather than a test response.
      if (!route.request().serviceWorker()) return route.continue();
      networkRequests++;
      await held;
      await route.continue();
    });
    // Change the address without fetching it, then exercise the ordinary reload
    // path with a fresh query and no runtime entry to answer the timeout.
    await page.evaluate((url) => history.replaceState(null, '', url), target);
    const navigations = countNavigations(page);
    await page.coverage.startJSCoverage({ resetOnNavigation: true });
    const started = performance.now();
    try {
      // Five seconds allows scheduling overhead around the ruled three-second
      // timeout, but cannot finish if an empty runtime cache waits for network.
      const response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
      const elapsed = performance.now() - started;
      expect(networkRequests).toBe(1);
      expect(response?.fromServiceWorker()).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(3000);
      expect(elapsed).toBeLessThan(5000);
      await appControls(page);
      await expect(page.getByRole('tree', { name: 'Your Bower folder' })).toBeVisible();
      const bundles = await executed(page);
      expect(bundles).toContain(mainA);
      expect(bundles).not.toContain(mainB);
      expect(navigations()).toBe(1);
    } finally {
      release();
      await context.unrouteAll({ behavior: 'wait' });
    }
  });
});
