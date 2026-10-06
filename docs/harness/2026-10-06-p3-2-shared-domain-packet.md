# Packet: shared-domain-package (P3-2)

Starting model: `bower-implementer` (Sonnet). Reason: a no-behaviour-change move plus an architecture test ([TL-P3-02](DECISIONS.md)); climb to `bower-escalated` if it needs any behaviour change.

- **Entry:** `shared-domain-package` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-domain`, branch `claude/p3-domain`. Never push.
- **Read:** `docs/harness/WORKER.md`, this packet, `docs/ARCHITECTURE.md` line 22 (the shared module rule), `src/architecture.test.ts`, and `src/data/contracts/*.ts` imports.
- **Today:** contracts import `../vault/hashes`, `../vault/rules-format`, `../vault/note-format`, `../vault/ownership-format`, `../rules`, `../links`, `../tree`, plus `node:fs`/`node:crypto` in tests only.
- **Acceptance contract:**
  - The transitive import closure of every non-test module in `src/data/contracts/` contains only modules inside `src/data/contracts/` and a short allowlist of pure libraries (name each with a reason). Move the pure helpers it needs under `src/data/contracts/` (keep the old paths working by re-exporting, so no app import changes), or split a module so only its pure part moves. Pure means: no DOM, `window`, `document`, `localStorage`, IndexedDB, `fetch`, React, `import.meta.env` or `process.env`; Web Crypto, `TextEncoder`/`TextDecoder` are allowed (they exist in Workers).
  - Named tests in `src/architecture.test.ts`: `contracts import only themselves and allowlisted pure libraries` (walks the closure, and also scans the closure for the forbidden globals) and `api imports nothing from src except contracts` (passes when `api/` is absent; the other P3-2 worker adds it). Red first: the first test fails on today's code.
  - No behaviour change: every existing test stays green without edits other than import paths in tests of moved modules.
  - Files in scope: `src/data/contracts/**`, the moved modules and their re-export stubs, `src/architecture.test.ts`. Do not touch `api/`, `package.json`, `pnpm-workspace.yaml`.
- **Gates:** the verify, `pnpm check`. No Playwright.
- **Deliver, under 15 lines:** commit SHAs, files moved, allowlist with reasons, red→green evidence, gate results, left out.
