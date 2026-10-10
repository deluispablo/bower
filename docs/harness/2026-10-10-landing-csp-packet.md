# Packet: landing-csp (P4-E; TL-P4-31 ruling 2; Codex, non-escalated, ui: true)

- **Entry:** `landing-csp` (ui: true: the landing must look and behave exactly as today). Worktree `/private/tmp/bower-landing-csp`, branch `landing-csp` from `claude/p3`.
- **Ruling:** P4_PLAN P4-E "`landing-csp` (drop `unsafe-eval` through `fix-landing.mjs`)"; TL-P4-31 ruling 2 (P4-E in parallel on Codex). The earlier security fix `app-security-headers` (f9a3ab8) detached the landing's CSP with `!` because the exported `public/landing/support.js` runs the page script through `new Function` (support.js:350).
- **Starting model:** Codex. Then a fresh Claude review and the designer's check.

## Contract

1. `public/_headers`: the `/landing/*` CSP no longer contains `'unsafe-eval'` (and gains nothing looser). The app's CSP is unchanged.
2. The one home for landing fixes stays `scripts/fix-landing.mjs` (AGENTS.md: `public/landing/` is exported from the design canvas, never edited by hand; mechanical fixes go in fix-landing.mjs, run after each export). After an export, running it makes the landing work without eval: e.g. it extracts the page script that support.js compiles at runtime, precompiles it with the same transform at fix time, and rewrites the runtime call to load the precompiled code. Research the standard first (CSP `unsafe-eval` removal by precompiling templates/JSX; cite it). Choose the simplest proven way; do not hand-edit `public/landing/*` except through the script's output.
3. `fix-landing.mjs --check` (already in pnpm check) fails when an export still needs eval, so a future re-export cannot silently bring it back.
4. The landing renders and behaves exactly as today: same DOM text, links, layout and motion; no console error, no CSP violation.

## Reds

- A unit test of `fix-landing.mjs` on a small fixture export: before the fix it reports eval needed (`--check` exits 1); after, the output has no `new Function`/`eval(` on the page-script path, and `--check` passes.
- A test that `public/_headers`' `/landing/*` CSP has no `'unsafe-eval'`.
- An e2e (extend `e2e/qa5.spec.ts` or a new `e2e/landing-csp.spec.ts`) served with the real headers (`scripts/serve-dist-with-headers.mjs`, as the PWA config does): the landing loads with zero CSP violations (`securitypolicyviolation` listener) and zero console errors, and its main heading, the GitHub links and the sign-in link are present. Axe as other specs do.

## What the person sees

Nothing changes. The designer compares the landing before and after at 375 and 1280 (screenshots and motion).

## Commits

1. The reds. 2. The fix (fix-landing.mjs, its output in public/landing/, _headers). 3. The notes (`docs/harness/2026-10-10-landing-csp-notes.md`).
