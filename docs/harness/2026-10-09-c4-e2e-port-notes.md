# c4-e2e-port notes

- **Sources.** Playwright `webServer` (`url`, `reuseExistingServer`; `port` is deprecated for `url`): https://playwright.dev/docs/test-webserver. Vite plugin `configureServer` / `configurePreviewServer` (serve-only hooks): https://vite.dev/guide/api-plugin#configureserver.
- **How.** `e2e/port.ts` is the one home: port from a hash of the worktree root (dev from 5300, preview from 7300), overrides `E2E_PORT` and `E2E_PREVIEW_PORT`. `identityPlugin` in `vite.config.ts` answers `/__bower-e2e-root` on dev and preview servers only. The Playwright `url` carries this worktree's root: a foreign server answers 409, so Playwright runs `e2e/serve.ts`, which refuses in one line naming the other root. A server with no identity route is refused the same way.
- **Covered.** `playwright.config.ts`, `e2e/pwa.config.ts`, `e2e/explore.config.ts` (explore now starts its own dev server instead of attaching to 5190).
- **Defects.** `e2e-port-shared-across-worktrees`: covered. `vite-outdated-optimize-dep`: not covered (a Vite re-optimise after files change; stays with c4-test-timers).
- **Red.** The red fails at import ("Failed to resolve import ../e2e/port"), since the module did not exist.
- **Run.** `E2E_SOURCE=fake playwright test e2e/home-errors.spec.ts --project=desktop` passed on port 5564 while 5191 belonged to another worker.
- **Load flake.** `pnpm check` hit a 30 s timeout in `fake-worker.test.ts` "note edits past the size cap wait for the next run" at load average 17; the file passes alone.
- tests changed: none (one new file, src/e2e-port.test.ts; tsconfig.node.json gains allowImportingTsExtensions for the `.ts` import in serve.ts and vite.config.ts).
