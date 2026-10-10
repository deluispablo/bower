**Diagnosis: `pwa-update-stuck` — Important**

Read-only inspection of checkout `5452091a`; no files changed, builds or tests run, or network used. The deployed revision `2ab7b490` has the same PWA options. Local generated assets match the reported new bundle, `index-CurYm3rq.js`.

**Cause**

- [vite.config.ts:16](/Users/deluisp/Projects/bower-app/vite.config.ts:16) selects `registerType: 'autoUpdate'`, but line 17 forces `injectRegister: 'script-defer'`. Workbox options at line 32 omit both `skipWaiting` and `clientsClaim`.
- Installed `vite-plugin-pwa` 2.0.0 enables those flags **only when `injectRegister` is `auto` or null**: [plugin index.js:874](/Users/deluisp/Projects/bower-app/node_modules/vite-plugin-pwa/dist/index.js:874). The forced injection mode bypasses that branch.
- Workbox 7.4.1 defaults both flags to false: `node_modules/.pnpm/workbox-build@7.4.1/node_modules/workbox-build/src/schema/GenerateSWOptions.json:104,193`.
- [dist/sw.js:1](/Users/deluisp/Projects/bower-app/dist/sw.js:1) confirms the result: `skipWaiting()` runs only after a `SKIP_WAITING` message; there is no `clientsClaim()` call.
- [dist/registerSW.js:1](/Users/deluisp/Projects/bower-app/dist/registerSW.js:1) only registers `/sw.js` on window load. It neither sends that message nor handles activation, control changes, prompts, or reloads.
- Searches of `src/` found no `registerSW`, `useRegisterSW`, `onNeedRefresh`, `controllerchange`, or `SKIP_WAITING` handling. [src/main.tsx:1](/Users/deluisp/Projects/bower-app/src/main.tsx:1) starts the app without an update integration.

Thus `autoUpdate` expresses intent but does not implement it through this registration path.

**Why reloads keep A**

The installed B worker waits while A still controls clients. A normal reload does not reliably create a period with no controlled clients: the replacement navigation still uses A. Without `skipWaiting`, B remains waiting; without a message sender, nothing advances it.

[vite.config.ts:35](/Users/deluisp/Projects/bower-app/vite.config.ts:35) binds app navigations to precached `/index.html`. The precache also handles a direct fetch of that URL, so `fetch(..., {cache:'no-store'})` still receives A’s cached shell. That option controls HTTP caching; it does not bypass service-worker routing. Workbox’s cache-first handling is explicit in `node_modules/.pnpm/workbox-precaching@7.4.1/node_modules/workbox-precaching/PrecacheStrategy.js:63`.

This explains all reported observations, including the absent prompt. [HANDOFF.md:76](/Users/deluisp/Projects/bower-app/docs/harness/HANDOFF.md:76) records the close-all-tabs workaround; [DEFECT_LOG.md:108](/Users/deluisp/Projects/bower-app/docs/harness/DEFECT_LOG.md:108) records the resulting stale-app defect.

**Headers and CSP**

[public/_headers:15](/Users/deluisp/Projects/bower-app/public/_headers:15) permits same-origin scripts and workers. The external deferred registration script is compatible with that CSP; no CSP relaxation is needed.

There are **no explicit cache headers for `index.html`, `sw.js`, or `registerSW.js`** in `_headers`. [api/wrangler.jsonc:7](/Users/deluisp/Projects/bower-app/api/wrangler.jsonc:7) serves these as static assets; the API’s `Cache-Control: no-store` at [security.ts:45](/Users/deluisp/Projects/bower-app/api/src/security.ts:45) does not govern them.

Actual staging cache headers remain unverified. Revalidation headers can improve update discovery, but cannot activate an already waiting worker or override A’s precache response. The waiting B worker already proves discovery and installation succeeded.

**Rulings and standard approach**

Searches of `DECISIONS.md` and `docs/specs/` found no app-update policy or update-prompt contract. Relevant existing requirements are:
- `docs/harness/DECISIONS.md:77`, TL-P3-26 addendum: CSP/static headers must pass the PWA suite.
- `docs/specs/2026-10-04-worker-contract.md:23`: API paths remain outside navigation fallback.
- [DEFECTS.md:27](/Users/deluisp/Projects/bower-app/docs/harness/DEFECTS.md:27): the lead rules on the fix; visible UI requires designer consultation.

Standard references, linked without network retrieval:
- [Vite PWA: Auto Update](https://vite-pwa-org.netlify.app/guide/auto-update): automatic activation and page refresh.
- [Vite PWA: Prompt for update](https://vite-pwa-org.netlify.app/guide/prompt-for-update): notify, obtain acceptance, activate and refresh.
- [Workbox generateSW](https://developer.chrome.com/docs/workbox/modules/workbox-build#generatesw): `skipWaiting` advances activation; `clientsClaim` takes control after activation.
- [web.dev: service worker lifecycle](https://web.dev/articles/service-worker-lifecycle): waiting, reload behaviour, and old-page/new-worker compatibility risks.

The installed plugin’s virtual registration implements automatic reloads and prompt callbacks: `node_modules/vite-plugin-pwa/dist/client/build/register.js:39,55,81`.

**Options for the lead**

1. **(a) Complete auto-update:** explicitly enable `skipWaiting` and `clientsClaim`; replace the simple injected registration with one registration home and an update-only, once-per-page reload on `controllerchange`, or the plugin’s equivalent activation handler. Exclude first-install reloads. Setting `registerType` alone is insufficient.
2. **(b) Prompt:** use the plugin’s prompt registration, handle `onNeedRefresh`, and activate through its returned updater when accepted. Requires designer/owner agreement on the visible change and safe handling of pending work.
3. **(c) Activate automatically, refresh manually:** retain external registration but explicitly enable both flags. A subsequent reload runs B without closing every tab. This avoids a forced refresh, but existing pages temporarily run A under B; test lazy chunks and cache cleanup. Closing tabs is a workaround, not a fix.

**Reload risks**

Durable uploads survive reload through IndexedDB: [upload-store.ts:2](/Users/deluisp/Projects/bower-app/src/data/upload-store.ts:2). Files too large to retain, quota failures, or unavailable storage fall back to memory: [upload-queue.ts:779](/Users/deluisp/Projects/bower-app/src/data/upload-queue.ts:779). Those bytes, unsaved file drafts ([draft-files.ts:2](/Users/deluisp/Projects/bower-app/src/data/draft-files.ts:2)), and unfinished direct writes can be lost by forced refresh.

Persisted folder outboxes survive reload and sign-out ([device.ts:7](/Users/deluisp/Projects/bower-app/src/data/device.ts:7)); storage failures leave volatile journal lines that reload can lose ([journal.ts:231](/Users/deluisp/Projects/bower-app/src/data/vault/journal.ts:231)). Queue `onlyHere()` alone does not cover drafts or volatile journal lines.

The place ID survives reload ([session.ts:67](/Users/deluisp/Projects/bower-app/src/data/session.ts:67)), but `pagehide` asynchronously releases the lease at line 503. Restart must use the existing lease checks and generation fencing, preserving “Use here” and preventing duplicate sends. Never implement updating through sign-out/device cleanup.

**Required red**

Extend the existing `e2e:pwa` suite (`package.json:21`; `e2e/pwa.config.ts:10`). Serve production build A, open and control a tab, then switch the same origin to build B without closing the tab or clearing registration/cache. Trigger update discovery and await installation; reload twice as reported; assert **executed B bundle identity**, not merely server HTML or an activated worker.

Current expected failure: A still executes and B waits. Existing `e2e/pwa.spec.ts:3,14,20,30` covers installation, offline opening and route exclusions, but never an A→B deployment. Add separate safety coverage for pending uploads/outbox, multiple tabs, and lease reacquisition before accepting forced reloads.
