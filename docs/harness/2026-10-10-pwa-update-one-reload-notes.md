# pwa-update-one-reload — red ownership

implementer: codex

Scope: tests only, under the packet and DECISIONS ruling (a). No network, port binding, production changes,
git writes or commits. The coordinator owns execution of e2e:pwa and the red/notes commits.

## Reds

Every name below is exact, including the three names expanded by the route table in e2e/pwa.spec.ts.
Expected results are source-based predictions, not observed browser failures.

1. `pwa-update-one-reload: / executes B before its worker installs`
   - Today: fails `expect(bundles).toContain(mainB)`. A's earlier precache route matches the directory alias
     and returns A's HTML, so coverage records mainA instead of mainB.
2. `pwa-update-one-reload: an app route with a query executes B before its worker installs`
   - Today: fails `expect(bundles).toContain(mainB)`. A's NavigationRoute binds this query-bearing /files
     navigation to A's precached index.html, which references mainA.
3. `pwa-update-one-reload: /index.html executes B before its worker installs`
   - Today: fails `expect(bundles).toContain(mainB)`. The direct HTML precache match returns A's shell.
4. `pwa-update-one-reload: offline opens precached A while B worker is withheld`
   - Today: expected pass; this is a preservation assertion. The real offline reload must execute mainA,
     never mainB, and render the Home link and folder tree from A's precached assets.
5. `pwa-update-one-reload: offline opens precached B after its worker claims the tab`
   - Today: expected pass; this is a preservation assertion. Release B through the existing deploy helper,
     await a different activated controller, assert zero activation-triggered navigations, then go offline.
     One reload must execute only mainB and render the Home link and folder tree.
6. `pwa-update-one-reload: a three-second timeout opens precached A with no navigation cache entry`
   - Today: fails `expect(networkRequests).toBe(1)`: precache-first routing never attempts the navigation
     fetch. After merely adding NetworkFirst without a timeout fallback, this instead fails the 5000 ms
     reload deadline, because the strategy waits for its held network request on an empty runtime cache.
   - The target has a fresh query and no matching entry in any cache. history.replaceState sets that
     address without a fetch, followed by a real reload. context.route holds only the worker's outgoing
     fetch; no app shell is fabricated by the test. The response must arrive after at least 3000 ms and
     before 5000 ms (two seconds of browser scheduling allowance), while the request is still held.
     It must execute mainA, never mainB, render app controls, and make exactly one document navigation.
     The held request is released and routing drained in finally, including on the predicted red.

The online tests restart Chromium execution coverage for the measured reload and discard prior documents.
They require mainB, exclude mainA, assert A remains the sole worker, and count exactly one document request.
The hybrid preview build contains B's HTML/assets with A's sw.js and imported root workbox-*.js scripts.
It is prepared before the swap, so B's worker is never briefly available to automatic update checks.
The literal / and /index.html cases seed demo/scenario/time through the preceding query-bearing page;
the measured addresses themselves are literal. /index.html renders the existing app's NotFound screen,
whose Home link is an app control; its shell/main-bundle identity is still measured.

All six original tests remain, in their original order before the new cases. The suite retains serial A/B
builds and preview swapping; workers: 1 also makes ownership of the preview directory explicit.
Serial mode skips later cases after a failure. To observe every predicted red on today's implementation,
the coordinator must run each exact name separately with --grep, as well as the complete targeted suite.

## Existing tests

tests changed: e2e/pwa.spec.ts: replace only NetworkFirst in the blanket strategy prohibition with navigation-only checks.
The original no-googleapis, no-runtimeCaching and no-StaleWhileRevalidate assertions remain. Online app
navigation is worker-owned; landing and all current auth/me/drive/vault/process/status/session/health/runs/push
exclusions are network-owned. An ordinary fetch to a non-precached app route must also be network-owned.
The other five original test bodies and their assertions are unchanged.
tests changed: e2e/pwa.config.ts: one worker makes the shared preview-directory swaps explicit; no tests removed.
removed: the blanket NetworkFirst prohibition; no tests, other original assertions, retries or coverage cases removed.

## Verification

- PASS: `pnpm exec tsc -p tsconfig.node.json --noEmit` (the project includes all e2e files).
  Log: `/tmp/pwa-update-one-reload-e2e-tsc.log`.
- PASS: `pnpm exec eslint e2e/pwa.spec.ts e2e/pwa.config.ts`.
  Log: `/tmp/pwa-update-one-reload-eslint.log`.
- PASS: TypeScript AST comparison against HEAD: all six original names retained, the five other bodies
  unchanged, six red names exactly match this section, and notes line 3 has the required implementer.
  Log: `/tmp/pwa-update-one-reload-preservation.log`.
- PASS: `git diff --check`. Log: `/tmp/pwa-update-one-reload-diff.log`.
- Browser tests, pnpm check and demo/fake e2e are unrun in this red session as instructed.
  No observed red/green browser result is claimed. The coordinator runs the packet's remaining gates.

## Offline research

No links were fetched. Research used the installed Workbox 7.4.1, vite-plugin-pwa 2.0.0 and Playwright 1.63.0
sources, plus the packet's diagnosis and ruling. Standard references for the implementation handoff:

- Workbox [routing](https://developer.chrome.com/docs/workbox/modules/workbox-routing): NavigationRoute.ts
  matches request.mode === navigate and applies the denylist; Router.ts states earliest registration wins.
- Workbox [NetworkFirst](https://developer.chrome.com/docs/workbox/modules/workbox-strategies): NetworkFirst.ts
  resolves a timeout from handler.cacheMatch(request); a cache miss continues waiting for the network.
- Workbox [precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching):
  createHandlerBoundToURL.ts delegates to PrecacheController; the bound handler uses its revisioned cache key.
- Vite PWA [worker strategies](https://vite-pwa-org.netlify.app/guide/service-worker-strategies): installed
  dist/index.d.ts exposes injectManifest and custom-worker build options; dist/index.js implements the builds.
- [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle): installed Workbox core
  clientsClaim.ts claims on activate; skipWaiting.ts documents direct self.skipWaiting(). Neither reloads a page.
- Playwright [service workers](https://playwright.dev/docs/service-workers): installed coreBundle.js's
  CRServiceWorker enables worker network interception from browser-context routes. Request.serviceWorker()
  identifies the outgoing fetch, independently from the browser's un-intercepted document request.

## Left out

Production routing, registration, dependencies and all implementation files are untouched. No git command
that writes was run. The coordinator must commit the red files and this notes file separately.
