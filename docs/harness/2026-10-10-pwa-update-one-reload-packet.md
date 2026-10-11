# Packet: pwa-update-one-reload (Important; the PWA's navigation routing)

- **Entry:** `pwa-update-one-reload`. Worktree `/private/tmp/bower-pwa-update-one-reload`, branch `pwa-update-one-reload`. Codex red, Codex implementation, fresh Claude review, then a live check on staging. It must land before the owner's retest. `ui: false`.
- **Defect and ruling:** DEFECT_LOG pwa-update-one-reload; diagnosis `docs/harness/defects/2026-10-10-pwa-update-one-reload-diagnosis.md`; the lead's ruling (a) (DECISIONS and ARCHITECTURE mechanism map, main after 32b43f82). It supersedes the navigation part of the pwa-update ruling and keeps its registration rules.
- **Owned files:** `vite.config.ts`, new `src/sw.ts` (the PWA's one home), `src/main.tsx` only if registration must change, `e2e/pwa.spec.ts`, `e2e/pwa.config.ts` and its helpers, `tsconfig.*` only to type-check `src/sw.ts`, `package.json` only if a Workbox module the plugin already installs must be listed.
- **Research first:** cite Workbox routing (NavigationRoute, registration order), NetworkFirst with `networkTimeoutSeconds`, precaching and `createHandlerBoundToURL`, vite-plugin-pwa `injectManifest`, and the service worker update lifecycle.

## Contract

1. `injectManifest` with one small `src/sw.ts`: a `NavigationRoute` with `NetworkFirst({ networkTimeoutSeconds: 3 })` registered before precache routing, keeping today's navigation exclusions (landing, API and the others in vite.config.ts). On a network failure or the timeout, the precached shell answers, so offline still opens; the timeout must not wait on an empty runtime cache.
2. Precaching of hashed assets stays; precached HTML and directory aliases never answer an online navigation first.
3. `skipWaiting` and `clientsClaim` stay; no reload on controllerchange, no prompt; the one `vite:preloadError` reload per load stays.
4. Known limit (ruled): a tab still controlled by a worker from before this fix may need one more reload the first time.

## Reds (a separate Codex session; the coordinator runs e2e:pwa, Codex cannot bind ports)

In `e2e/pwa.spec.ts`, reusing the serial A/B builds and preview swap: with A open and controlling, serve B's HTML and assets while A's `sw.js` stays (B not installed); one reload executes B's main bundle with exactly one document navigation, for `/`, an app route with a query, and `/index.html`. Offline with B withheld: reload opens the precached app. Then release B's worker, let it install, and offline still opens B. A timeout case with no runtime navigation cache entry. Replace the blanket "no NetworkFirst" assertion (`e2e/pwa.spec.ts:21`) with navigation-only assertions. The existing 6 tests stay green.

## Verify

The reds by exact name in `pnpm e2e:pwa`, `pnpm check`, then e2e app on demo and fake.

## Commits

Red, fix, notes (`docs/harness/2026-10-10-pwa-update-one-reload-notes.md`, line 3 `implementer: codex`, `removed:` lines).
