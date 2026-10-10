**Diagnosis: `pwa-update-one-reload` — Important**

Read-only inspection of `04eb9283`; no edits, network, builds or tests. Research used installed Workbox 7.4.1 and vite-plugin-pwa 2.0.0 source.

**Failure and exact path.** [DEFECT_LOG.md:113](/private/tmp/bower-pwa-update-one-reload/docs/harness/DEFECT_LOG.md:113) records staging `539fe3a3`: one reload executed A’s `index-BUZNGxSW.js` (`645710a4`), although the server served B’s `index-DKtH2vo8.js`.

The reload reaches A, the controlling worker. For app routes, [vite.config.ts:36](/private/tmp/bower-pwa-update-one-reload/vite.config.ts:36) generates `NavigationRoute(createHandlerBoundToURL('/index.html'))`. That handler selects A’s revisioned precache key; `PrecacheStrategy` returns the cached HTML before fetching. Its script references then select A’s precached bundles. Plain `/` can match the earlier precache route through `directoryIndex`; `/index.html` matches directly. Discovering B during that reload cannot change the response already served. Later B activation permits subsequent document navigation to use B; client-side navigation alone does not replace executed JavaScript.

**Five whys**

1. Why did one reload execute A? A’s shell referenced A’s bundles.
2. Why was A’s shell returned? The controlling worker answered from its precache.
3. Why did the network not win? `navigateFallback` binds navigations directly to a precache handler.
4. Why did skipWaiting/clientsClaim not prevent it? They affect B after installation/activation, independently of this navigation.
5. Why was the promise accepted? Activation was treated as navigation freshness; the test installed B and waited before reloading ([e2e/pwa.spec.ts:118](/private/tmp/bower-pwa-update-one-reload/e2e/pwa.spec.ts:118)).

**Owner and related class.** PWA shell routing/registration belongs to `vite.config.ts`, per [DECISIONS.md:474](/private/tmp/bower-pwa-update-one-reload/docs/harness/DECISIONS.md:474). [ARCHITECTURE.md:80](/private/tmp/bower-pwa-update-one-reload/docs/ARCHITECTURE.md:80) has **no PWA mechanism-map entry**; the lead must record this home. The broad precache glob ([vite.config.ts:34](/private/tmp/bower-pwa-update-one-reload/vite.config.ts:34)) also covers HTML, JS, CSS and unversioned static assets. Direct HTML requests and directory/clean-URL aliases can select stale shells; hashed assets faithfully preserve A when A’s HTML requests them. Landing is excluded at line 35. The removed-chunk guard ([src/main.tsx:19](/private/tmp/bower-pwa-update-one-reload/src/main.tsx:19)) cannot detect a successful stale-cache response.

**Options**

- **(a) Apply the ruled network-first policy within this mechanism.** Prefer plugin `injectManifest`: register one `NavigationRoute` using `NetworkFirst({networkTimeoutSeconds: 3})` **before** precache routing, retain the existing exclusions, and provide revision-aware precached-shell fallback. Preserve skipWaiting/clientsClaim and registration without activation-triggered reloads. Cost: a small worker source and explicit lifecycle setup.
- **(b) Retain generateSW.** It supports `runtimeCaching`, NetworkFirst, timeout and `precacheFallback`, but generated precache routes precede runtime routes. Disable `navigateFallback` explicitly and prevent precached HTML/aliases from intercepting navigation; separately arrange offline-shell availability. Cost: more configuration/installation plumbing.

Adding NetworkFirst alone is insufficient. Its timeout checks its strategy cache; with a cache miss it continues waiting. `PrecacheFallbackPlugin` handles strategy errors, not that timeout miss. The fallback must therefore be available to the timeout cache lookup. “Offline” here includes network failure/timeout, not only `navigator.onLine === false`.

**Regression in `e2e:pwa`.** Reuse the serial A/B builds and preview-directory swap at [e2e/pwa.spec.ts:56](/private/tmp/bower-pwa-update-one-reload/e2e/pwa.spec.ts:56). Establish A’s controller and rendered app. Serve B’s HTML/assets while temporarily retaining A’s `sw.js` and imported worker scripts; B cannot install. Bypass the existing update-and-wait helper. Reload once; restart coverage for that measurement, assert executed `mainB`, rendered app controls, and exactly one document navigation. Cover `/`, a query-bearing app route, and `/index.html`.

While B’s worker remains withheld, set offline and reload: assert the functional precached A app opens. Then release B’s worker, await completed installation/control, and repeat offline for B. Add a timeout case with no runtime navigation-cache entry. Replace the contradictory blanket NetworkFirst prohibition at [e2e/pwa.spec.ts:21](/private/tmp/bower-pwa-update-one-reload/e2e/pwa.spec.ts:21) with navigation-only caching/exclusion assertions.

**Rollout limit:** corrected A→B routing is testable; deploying B cannot retroactively change a pre-fix controlling worker. That transition may still require a later ordinary reload.

Reference links, not fetched: [Workbox routing](https://developer.chrome.com/docs/workbox/modules/workbox-routing), [strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies), [generateSW/injectManifest](https://developer.chrome.com/docs/workbox/modules/workbox-build), [Vite PWA worker strategies](https://vite-pwa-org.netlify.app/guide/service-worker-strategies), [update lifecycle](https://web.dev/articles/service-worker-lifecycle).