# Packet: P4-92 review (pwa-update, written by Codex and a Claude fix round)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-pwa-update`.

## What to review

- **Diff:** `git diff claude/p3...pwa-update` (red, fix, red repair of the test harness, fix round 1).
- **Contract:** `docs/harness/2026-10-10-pwa-update-packet.md`; lead ruling (c) plus guard: skipWaiting and clientsClaim through the plugin's own registration in vite.config.ts (one home); NO reload on controllerchange; one `vite:preloadError` handler reloads once per page load.
- **Coordinator evidence:** e2e:pwa red (one-reload test failed before the fix) and green 6/6 after; pnpm check passes (/tmp/pwa-green2.log, /tmp/pwa-check2.log).

## Look hardest at

- dist/sw.js gets skipWaiting and clientsClaim; no second registration path; no automatic reload anywhere.
- The preloadError guard cannot loop (per load, storage throwing), reports other errors, swallows nothing (architecture rule).
- The red repair (assert build A ran before the reload) still proves the point and loosened nothing else.
- Risks the diagnosis named: an old page under the new worker loading lazy chunks; navigation fallback and API exclusions unchanged; CSP unchanged.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
