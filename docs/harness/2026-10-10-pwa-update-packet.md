# Packet: pwa-update, a reload runs the new build (lead ruling (c) plus guard; DECISIONS after 1a432aa2)

- **Entry:** `pwa-update`. Worktree `/private/tmp/bower-pwa-update`, branch `pwa-update`. Non-escalated, so it goes to Codex and then a Claude review. It must land before the owner's retest. `ui: false`: no visible change, and nothing reloads by itself.
- **Evidence:** staging 2ab7b490. A tab kept the old bundle through two reloads, a new service worker was left waiting, and even a no-store fetch of /index.html returned the old precached shell. Diagnosis: `docs/harness/defects/2026-10-10-pwa-update-stuck-diagnosis.md`. `vite.config.ts:16-17` sets autoUpdate but forces `injectRegister: 'script-defer'`, so the plugin never adds skipWaiting or clientsClaim.
- **Ruling (c) plus guard:**
  - skipWaiting and clientsClaim go through the plugin's own registration, with vite.config.ts as the one home. Remove or fix the forced script-defer.
  - Nothing reloads on controllerchange (options (a) and (b) are rejected), so no data is lost.
  - Guard: an old page that lazy-loads a removed chunk reloads once, through Vite's `vite:preloadError` event, handled in one place in the app.
- **Research first:** cite vite-plugin-pwa (Auto Update; injectRegister), Workbox skipWaiting and clientsClaim, the web.dev service worker lifecycle, and Vite's "Load Error Handling" (`vite:preloadError`).

## Contract

1. After a deploy, the next ordinary reload of an open tab runs the new build. The new worker activates without every tab being closed.
2. No automatic reload on activation or controllerchange.
3. An old page whose lazy chunk 404s after a deploy reloads once, through `vite:preloadError`. It never loops: a per-page-load guard, e.g. sessionStorage with a timestamp, wrapped in try/catch. Any other preload error is reported as today.
4. Navigation fallback and API exclusions are unchanged, and the CSP stays the same (the diagnosis found no relaxation needed).

## Tests (TDD; red first in its own commit)

In `e2e/pwa.spec.ts` (e2e:pwa), with build A served and a tab open:
- switch the same origin to build B without closing the tab or clearing anything;
- wait for the install;
- reload once, and assert that B's bundle is the one executing (its identity, not just the server's HTML);
- the old-chunk case: page A requests a chunk that is gone in B, and the page recovers with one reload and no loop.
A unit test for the preloadError guard, covering once per load and storage throwing.
Codex cannot run e2e, so the coordinator runs e2e:pwa to prove the red and the green.

## Verify

The e2e:pwa reds by exact name, `pnpm check`, then `pnpm e2e:pwa`, plus app e2e on demo and fake.

## Commits

The red (tests only), then the fix, then the notes (`docs/harness/2026-10-10-pwa-update-notes.md`, line 3 `implementer: codex`).
