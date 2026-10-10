# Packet: P4-80 review (landing-csp, written by Codex; P4-E, TL-P4-31 ruling 2)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-landing-csp`. You may run `pnpm exec vitest run src/landing-csp.test.ts --maxWorkers=2` and `node scripts/fix-landing.mjs --help`-style dry reads there; do not write files.

## What to review

- **Diff:** `git diff claude/p3...landing-csp`: `scripts/fix-landing.mjs`, the regenerated `public/landing/support.js` (script output only), `public/_headers`, `src/landing-csp.test.ts`, `e2e/landing-csp.{config,spec}.ts`, `playwright.config.ts`, the notes.
- **Contract:** `docs/harness/2026-10-10-landing-csp-packet.md` (Contract, Reds). AGENTS.md: `public/landing/` is never edited by hand; fixes go only in fix-landing.mjs.

## Look hardest at

- support.js changes come only from fix-landing.mjs: running the script on the pre-fix export gives exactly the committed file; it is idempotent on a second run; a new export still gets fixed (no hard-coded offsets that break silently, and a loud failure if the pattern is missing).
- No `eval`, `new Function` or string-to-code path is left in the landing; `/landing/*` CSP drops `'unsafe-eval'` and nothing else loosens (the app's CSP and the Worker's are unchanged).
- The precompile uses the same transform the runtime used (no behaviour change), and the cited standard fits.
- The e2e serves the real `_headers` and fails on a CSP violation or console error; the playwright.config change does not drop other specs.

Already run by the coordinator: pnpm check green; landing-csp e2e 2/2. The designer verified at 9be1cc80 (no visual, motion or link change).

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
