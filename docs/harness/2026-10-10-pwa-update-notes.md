# pwa-update implementation

implementer: codex

## Delivery and commit split

No git-writing command, network access, server, or e2e run was used.
The coordinator commits these sets separately, in this order:

- Test files (red commit): `e2e/pwa.spec.ts`, `src/preload-error.test.ts`.
- Code files (fix commit): `vite.config.ts`, `src/main.tsx`.
- Notes file (notes commit): `docs/harness/2026-10-10-pwa-update-notes.md`.
- `tmp-logs/` contains local evidence; it is not an app change.

## Behaviour

The default plugin injection mode enables Workbox skipWaiting and clientsClaim
for autoUpdate. The plugin emits its simple external registration script, which
registers on window load and never reloads on activation or controllerchange.
No virtual registration import or second registration mechanism was added.
Navigation fallback, exclusions, manifest, and CSP are unchanged.

The single preloadError listener lives in `src/main.tsx`, before startup.
It recognizes browser dynamic-import fetch TypeErrors, prevents that first error,
and reloads. A memory flag allows one attempt per page, including when storage
access or writing throws. A session timestamp suppresses another attempt within
30 seconds across page loads. Unrecognized errors and suppressed repeated errors
are not prevented: Vite throws them to the existing reporting path.
When storage is unavailable, the memory guard still bounds each page load;
it cannot remember an attempt across separate page loads without storage.

## Red tests and deploy harness

Exact e2e:pwa names:

- `one ordinary reload after a deploy executes build B`
- `a removed old lazy chunk recovers with exactly one reload`

The deployment tests use the existing preview origin and real Vite builds.
Build B is a copy of the coordinator's production `dist`. Build A is compiled
with different entry/chunk filenames, without changing app source or adding
app test hooks. The serial deployment group swaps the directory served by the
existing preview server and restores B at teardown. Vite preview uses a fresh
sirv middleware with `dev: true` for each request, so the directory swap is read.

Chromium coverage checks executable ranges with a positive count in the exact
main bundle URL, rather than merely checking HTML, fetching a script, or checking
worker activation. Update discovery waits for the new worker's installation,
then gives activation one second to settle. The old configuration leaves B waiting;
the ordinary-reload test therefore fails its executing-B identity assertion.
Document navigation requests count reloads, excluding React history changes.
Both tests assert activation alone does not navigate.

For the missing chunk case, Playwright holds A's actual lazy world-module request
until B replaces the server files. It then fetches the removed URL, verifies a
real 404, and delivers that response to A. No preloadError event is synthesized
in e2e. Native browser registration installs A while the held import may delay
window load. B's installation/activation is discovered through registration.update.
The test requires exactly one recovery navigation, executed A and B main bundles,
a nonempty app, and no extra reload during a further one-second observation.

The unit tests import the actual main entry with unrelated startup dependencies
mocked. They capture its installed event listener and exercise missing-chunk
recovery, duplicate events, storage-get failure, storage-write failure, a fresh
page with a recent stored attempt, and unrelated errors.

## Evidence and deferred gates

- Red: `pnpm exec vitest run src/preload-error.test.ts --maxWorkers=2`.
  All five tests fail the assertion that main installs the preload recovery handler.
  `tmp-logs/pwa-unit-red.log`. The guard was temporarily removed for this proof
  and restored afterward; no git command wrote the tree.
- Green: the same command, five tests pass: `tmp-logs/pwa-unit-green.log`.
- `pnpm build` passes: `tmp-logs/pwa-build.log`.
- `pnpm exec tsc -b --noEmit` passes: `tmp-logs/pwa-tsc.log`.
- ESLint on all four touched TypeScript files passes: `tmp-logs/pwa-eslint.log`.
- Generated `dist/sw.js` contains unconditional `self.skipWaiting()` and
  `clientsClaim()`. `dist/registerSW.js` contains no reload or controllerchange
  handler. Evidence: `tmp-logs/pwa-sw-inspection.log`.
- The coordinator must run e2e:pwa on the tests-only red, then on the fix.
- `pnpm check`, e2e:pwa, and demo/fake suites were not run, as instructed.
  They remain coordinator gates; browser behaviour is not claimed verified here.

## Changes to existing tests and removals

tests changed: e2e/pwa.spec.ts: additive production A-to-B deployment cases; original four tests unchanged.
tests changed: src/preload-error.test.ts: new unit tests through the main entry; no existing unit test modified.
removed: vite.config.ts: forced injectRegister script-defer option, which bypassed automatic Workbox activation flags.
removed: no existing test, controllerchange handler, navigation exclusion, or CSP rule.

## References (offline research)

No references were fetched over the network. Public references supplied by the
packet/diagnosis and installed library implementation were used:

- [Vite PWA auto update](https://vite-pwa-org.netlify.app/guide/auto-update).
- [Vite PWA registration / injectRegister](https://vite-pwa-org.netlify.app/guide/register-service-worker).
  Installed `node_modules/vite-plugin-pwa/dist/index.js:874` enables both Workbox
  flags only with auto/null injection and autoUpdate. Its auto injection resolves
  to the external script when no virtual registration is imported.
- [Workbox generateSW](https://developer.chrome.com/docs/workbox/modules/workbox-build#generatesw).
  Installed Workbox clientsClaim registers an activate listener that calls
  self.clients.claim(); generated sw.js confirms the result for this build.
- [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle).
  The diagnosis records why a worker left waiting survives ordinary reloads.
- [Vite load error handling](https://vite.dev/guide/build.html#load-error-handling).
  Installed `node_modules/vite/dist/node/chunks/node.js:26818` emits a cancelable
  vite:preloadError with the original error payload and throws unless prevented.
