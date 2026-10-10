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

## Reds confirmed by the coordinator

`pnpm e2e:pwa` at fb3c534c: the 6 existing tests pass; `pwa-update-one-reload: / executes B before its worker installs` fails on the assertion (B's index-DKtH2vo8.js not executed; A's precached bundles ran). The serial block stops there, so the later reds were not reached.

## Implementation

Implemented ruling (a) in `src/sw.ts`, the mechanism-map home. `vite.config.ts` now builds it with
vite-plugin-pwa `injectManifest`, retaining the asset glob and landing exclusion. `precache` first
populates the revision map; `createHandlerBoundToURL('/index.html')` binds the fallback. The
`NavigationRoute` using `NetworkFirst({ networkTimeoutSeconds: 3 })` registers before `addRoute`,
so `/`, app routes with queries and `/index.html` try the network before precached HTML/aliases.
The landing and auth/me/drive/vault/process/status/session/health/runs/push denylist is unchanged.

The strategy's `cachedResponseWillBeUsed` plugin returns the bound precached shell on both network
failure and timeout, including an empty runtime cache. `cacheWillUpdate` returns null: online HTML
may reference B assets that controlling A has not installed, so it must not become the offline shell.
There is no second timer, fetch route or navigation cache mechanism. `skipWaiting`, `clientsClaim`
and outdated-precache cleanup remain. External plugin registration remains passive; `src/main.tsx`
and its once-per-load `vite:preloadError` recovery are unchanged. No prompt or controllerchange reload.
The ruled first-deploy limitation for a pre-fix controller still applies.

`tsconfig.sw.json` uses the WebWorker library, separately from the app's DOM types. The root build
references it, so ordinary `pnpm build` / typecheck also check the worker. Four Workbox 7.4.1 modules
already installed through vite-plugin-pwa/workbox-build are declared as direct dev dependencies.
No package version was upgraded. The packet does not own `pnpm-lock.yaml`; its importer must be
synchronized by the coordinator before a frozen install. No lockfile change was made here.

removed: generateSW configuration and its precache-bound navigateFallback in vite.config.ts.
removed: navigation denylist configuration in vite.config.ts; moved unchanged into src/sw.ts.
removed: no app code, assets, registration behavior, test or test assertion.
tests changed: none.

### Research cited (installed source; no reference URLs fetched)

- [Workbox routing](https://developer.chrome.com/docs/workbox/modules/workbox-routing): installed
  7.4.1 `Router.ts` says earliest registration wins; `NavigationRoute.ts` limits matching to navigate
  requests and applies the denylist to pathname plus search.
- [NetworkFirst](https://developer.chrome.com/docs/workbox/modules/workbox-strategies): installed
  `NetworkFirst.ts` resolves the timeout via `handler.cacheMatch`; an undefined result waits for the
  network. `StrategyHandler.ts` runs `cachedResponseWillBeUsed` even on a miss. Returning the bound
  shell there resolves the three-second timeout without a runtime entry; disabling cache writes
  keeps the offline shell consistent with the installed hashed assets.
- [Precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching): installed
  `precacheAndRoute.ts` separates `precache` and `addRoute`; `PrecacheController.ts` binds the shell
  handler to its revisioned key, so registration can precede precache routing without losing assets.
- [Vite PWA worker strategies](https://vite-pwa-org.netlify.app/guide/service-worker-strategies):
  installed plugin 2.0.0 `dist/index.d.ts` and `dist/index.js` provide injectManifest, srcDir/filename
  and the TypeScript-to-sw.js build. `chunk-I2Z7IWCN.js` registers on load without activation reloads.
- [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle): installed Workbox
  `clientsClaim.ts` claims on activation; `skipWaiting.ts` recommends direct `self.skipWaiting()`.
  These actions do not reload an existing page.

### Verification and environment

The first plain pnpm commands unexpectedly triggered pnpm 12's automatic dependency installation
when package.json changed. It attempted registry fetches (DNS failed); the processes were stopped.
The interrupted install removed local node_modules. Dependencies were restored by copying the
existing local `/Users/deluisp/Projects/bower-app/node_modules` and linking the four already installed
Workbox modules locally. No network install completed. All subsequent commands explicitly use
`pnpm --offline --config.verify-deps-before-run=false`; no tracked configuration was added for this.

- PASS: `pnpm build` with those offline flags; log `tmp-logs/pwa-update-one-reload-build.log`.
  vite-plugin-pwa reports injectManifest and 28 precache entries; dist/sw.js is generated.
- PASS: built artifact check using TypeScript's parser plus manifest/registration assertions.
  `dist/sw.js` contains the navigation route before precache routing, 3 s NetworkFirst timeout,
  shell fallback plugin, revisioned index.html and hashed asset entries, lifecycle and exclusions.
  `dist/registerSW.js` contains no controllerchange, reload or prompt.
  Log: `tmp-logs/pwa-update-one-reload-artifact.log`.
- PASS: `pnpm exec tsc -p tsconfig.app.json --noEmit`, `-p tsconfig.node.json --noEmit`,
  and `-p tsconfig.sw.json --noEmit`, with the same offline flags.
  Logs: `tmp-logs/pwa-update-one-reload-tsc-{app,node,sw}.log`.
- PASS: eslint on `vite.config.ts` and `src/sw.ts`, with the same offline flags.
  Log: `tmp-logs/pwa-update-one-reload-eslint.log`.

No e2e or application preview/dev server command was run. Coordinator owns e2e:pwa, demo/fake e2e
and the full pnpm check gate.
No git command that writes was invoked by this implementation session; changes remain uncommitted.

- FAIL: `pnpm exec vitest run src --maxWorkers=2`, with the same offline flags; exit 1.
  All 164 files ran: 162 passed, 2 failed; 5,485 tests passed, 2 failed; 1 unhandled error.
  Log: `tmp-logs/pwa-update-one-reload-vitest.log`.
  1. `src/e2e-port.test.ts:37`, `a server from another worktree is never reused`:
     5,000 ms timeout and `listen EPERM: operation not permitted 127.0.0.1`. This test attempts
     a local socket; the sandbox prohibits it. No timeout, test or port policy was changed.
  2. `src/vite-config.test.ts:36`, `pre-bundles every bare runtime import of the app`:
     its all-src import scan includes the new service worker's workbox-core, workbox-precaching,
     workbox-routing and workbox-strategies imports, but OPTIMIZED_DEPS lacks those four entries.
     The assertion reads OPTIMIZED_DEPS directly from `vite.deps.ts`; that file is not owned.

### Contradiction / blocked handoff (TL-P4-51)

The second failure conflicts with adding the ruled `src/sw.ts` and its standard Workbox imports
within the packet's owned files. The complete requested regression suite ran before stopping;
this is the only observed assertion/scope contradiction. The lead must rule on ownership of
`vite.deps.ts` (or the scanner's app-only scope) before another implementation step. No test was
changed or weakened, and no relative node_modules import or other scanner bypass was added.
Implementation, build, artifact, three TypeScript projects and touched-file lint pass, but the
entry is blocked on this regression. Full pnpm check and browser gates are not claimed green.

PASS: `git diff --exit-code -- e2e src/main.tsx pnpm-lock.yaml` confirms those files are unchanged.
Log: `tmp-logs/pwa-update-one-reload-preservation.log`. `git diff --check` also passes;
log `tmp-logs/pwa-update-one-reload-diff.log`. Coordinator must also synchronize the lockfile
importer for the declared dependencies within its authorized scope before frozen installation.

## Coordinator follow-ups (lead OK 2026-10-10)

tests changed: src/vite-config.test.ts: the bare-import scanner skips src/sw.ts, which injectManifest builds and Vite never pre-bundles; worker deps do not join OPTIMIZED_DEPS.
Lockfile: offline `pnpm install` added only the root importer entries for workbox-core, workbox-precaching, workbox-routing and workbox-strategies at 7.4.1 (already in the store through vite-plugin-pwa); no other entry changed, no network, supply-chain policy check passed (817 entries).

## Known-green close (coordinator)

done.sh could not prove the red by reverting 73b3c196: without src/sw.ts, tsconfig.sw.json has no inputs and the build stops before any test runs. The red is proved at its commit: at fb3c534c the coordinator ran `pnpm e2e:pwa` and `pwa-update-one-reload: / executes B before its worker installs` failed on its assertion (A's precached bundles ran, not B's index-DKtH2vo8.js). After the fix e2e:pwa passes 12/12; pnpm check green; e2e app demo 31 and fake 33; P4-97 PASS.
