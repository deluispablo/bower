# Packet: P4-97 review (pwa-update-one-reload, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-pwa-update-one-reload`.

## What to review

- **Diff:** `git diff claude/p3...pwa-update-one-reload` (reds fb3c534c; fix and the scanner scope after it) with the notes `docs/harness/2026-10-10-pwa-update-one-reload-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-10-pwa-update-one-reload-packet.md`; the diagnosis `docs/harness/defects/2026-10-10-pwa-update-one-reload-diagnosis.md`; the lead's ruling (a) and the ARCHITECTURE mechanism map entry for `src/sw.ts`; the lead's OK for the scanner skip and the offline lockfile sync.
- **Gates (coordinator):** pnpm check green; e2e:pwa 12/12 (the 6 old tests plus the 6 reds); e2e app on demo (31) and fake (33).

## Look hardest at

- One home: `src/sw.ts`; no second fetch route, timer or navigation cache. The NavigationRoute (NetworkFirst, 3 s) is registered before precache routing; the precached shell answers only on failure or timeout, including an empty runtime cache; online HTML never becomes the offline shell.
- Today's navigation exclusions (landing, the Worker's paths, Google APIs) are kept; nothing caches Drive or the Worker.
- skipWaiting, clientsClaim, outdated-precache cleanup kept; no reload on controllerchange, no prompt; the one vite:preloadError reload per load unchanged.
- The red replaced only the blanket NetworkFirst prohibition; the lockfile change adds only the four workbox 7.4.1 importer entries; the scanner skip is the one named file.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
