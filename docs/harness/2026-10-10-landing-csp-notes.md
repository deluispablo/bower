# landing-csp implementation

implementer: codex

## Result and contract mismatch

The CSP and build-time page-script fix are implemented. All four requested local commands pass.
Delivery is blocked on the packet's sign-in-link requirement: the existing export has no such link.
Its anchors are section links, GitHub links and setup links; neither its markup nor its page logic
contains a sign-in anchor or an auth URL. Adding one would change the required current behaviour.
The new e2e retains that assertion, at the end, for the coordinator/lead to resolve. No existing
test was changed. Browser execution and the designer's 375/1280 comparison remain pending.

## Research (offline, before the fix)

The standard solution is to generate JavaScript at build time and serve that file, avoiding
string compilation in the browser. Ajv's shipped documentation explicitly prescribes
precompilation to keep a CSP without unsafe-eval:
[Ajv: CSP and precompilation](https://github.com/ajv-validator/ajv/blob/v6.15.0/README.md#ajv-and-content-security-policies-csp).
Read locally in `node_modules/.pnpm/ajv@6.15.0/node_modules/ajv/README.md`, lines 269–276.
Its templates are themselves precompiled (line 1474). Also inspected the installed Ajv 8
standalone generator, `lib/standalone/index.ts`, which emits function source into modules:
[standalone JavaScript](https://ajv.js.org/standalone.html).
No network was used; the linked pages were not fetched.

## What changed

`scripts/fix-landing.mjs` extracts the single `script[data-dc-script]` from the export and
emits its body into a normal function in `support.js`. The old page loader is `ze(t)`:
it adds the Component return expression and calls `new Function` with DCLogic,
StreamableLogic and React, then supplies I, I and L(). It applies **no transform**.
The generated function preserves that body, return expression and those arguments.
The separate x-import loader uses Babel with react/typescript presets; it is unused by
this landing (no x-import/dc-import tags) and was left intact. It cannot execute eval under
the tightened CSP. No compiler dependency or installation is needed.

The generated source comparison rejects stale runtime logic. The marked generated block
is regenerated after source edits; a fresh design export's original loader is replaced
again. Unknown loader shapes and invalid emitted JavaScript fail before any file is written.
`--check` computes the required output without writing and rejects missing/stale compilation.
The fixture verifies the real CLI, re-export detection, regeneration, idempotence, unchanged
markup and execution with VM string-code generation disabled.

Only `ze()` changes in the generated support asset. A byte comparison against HEAD verified
that the rest of support.js, all of index.html and the entire app header block are unchanged.
The existing attribute/copy fixes remain in their original home.

The new dedicated Playwright config serves dist through `serve-dist-with-headers.mjs`, uses
the existing per-worktree preview-port mechanism, and tests at 375 and 1280. The dev config
excludes this production-only spec, like the PWA spec. The e2e records CSP violations and
console/page errors, checks the response policy, heading, GitHub links, drawings, axe and
the packet's sign-in link. There are no fixed waits or only/skip modifiers in new tests.

removed: runtime new Function compilation on the landing page-script path.
removed: unsafe-eval from the landing CSP; no other policy permission changed.
removed: none of the exported page script, DOM, links, layout or motion logic.

## Separable commit sets (coordinator commits; no git writes performed)

1. Red: `src/landing-csp.test.ts`, `e2e/landing-csp.spec.ts`,
   `e2e/landing-csp.config.ts`, `playwright.config.ts`.
2. Fix: `scripts/fix-landing.mjs`, `public/landing/support.js`, `public/_headers`.
3. Notes: `docs/harness/2026-10-10-landing-csp-notes.md`.

## Evidence and logs

- `/tmp/lcsp-red.log`: both required named unit tests failed on assertions before the fix.
  `fix-landing removes the runtime eval from an export`: check returned 0 instead of 1.
  `the landing CSP has no unsafe-eval`: script-src still included unsafe-eval.
- `/tmp/lcsp-fix.log`: mechanical fix command, exit 0.
- `/tmp/lcsp-unit.log`: `pnpm exec vitest run src/landing-csp.test.ts src/docs.test.ts`, exit 0.
  Both exact named reds above and the unchanged docs tests pass.
- `/tmp/lcsp-check.log`: `node scripts/fix-landing.mjs --check`, exit 0.
- `/tmp/lcsp-tsc.log`: `pnpm exec tsc -p tsconfig.app.json`, exit 0.
- `/tmp/lcsp-eslint.log`: `pnpm exec eslint src/landing-csp.test.ts scripts/fix-landing.mjs`, exit 0.
- `/tmp/lcsp-e2e-lint.log`: ESLint of both new e2e files and the dev config, exit 0.
- `/tmp/lcsp-e2e-list.log`: Playwright discovery with the dedicated config, exit 0; no server started.

No e2e or full pnpm check was run: this session cannot open ports. The four specifically
requested checks above were run; the full gate includes additional suites and remains
the coordinator's responsibility, as do the designer checks.

Coordinator browser command after building dist:
`bash harness/with-lock.sh pnpm exec playwright test -c e2e/landing-csp.config.ts`.
The sign-in assertion is expected to fail on the current export until the lead resolves
the conflict with preserving today's landing. Other browser/axe results are unverified.

Coordinator, 2026-10-10: the packet's sign-in link requirement was a packet error (the landing has none); the packet is corrected and the assertion removed from e2e/landing-csp.spec.ts. The delivery is no longer blocked.
Coordinator, 2026-10-10: the axe scan was removed from e2e/landing-csp.spec.ts (packet error): the exported landing has pre-existing landmark-one-main and region findings with or without this change (defect landing-axe-regions).

## Designer check

Verified at 9be1cc80 against claude/p3 474e2b06, served with each build's own _headers at 1440 and 375: no unsafe-eval, no CSP violations or console errors; reduced-motion scroll captures byte-identical, same heights; same running animations; 12 links identical.
