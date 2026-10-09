# Packet: deploy-staging-production-check (P3-19)

Starting model: `bower-mechanical` (Haiku): a one-script fix with a clear failing test (TL-P3-26). The lead's deploy of 5a4ab04 stopped with a false production alarm. `scripts/deploy-staging.sh` greps wrangler's whole output for `bower-api`, and the staging URL holds the account subdomain `<account>.workers.dev`. Production was untouched.

- **Entry:** `deploy-staging-production-check`. Checkout `/private/tmp/bower-p3-prodcheck`, branch `claude/p3-prodcheck`, from the commit named in your prompt. Never run `wrangler`, `gh`, a real deploy or any network call, and never push.
- **Read:** `docs/harness/WORKER.md`, this packet, `scripts/deploy-staging.sh` (the checks at about lines 127 and 177) and `runner/test/deploy-staging.test.ts`.
- **Acceptance contract:**
  - **After the deploy.** Judge only wrangler's `Uploaded <name>` line. Fail loudly when the Worker name is `bower-api` or anything other than `bower-staging`, and pass for `bower-staging` even when the URL in the output contains `bower-api`.
  - **Before the deploy.** Read the config's `name` field, stripping the `//` comments before parsing the JSON (as `api/test/routing.test.ts` does), not a grep of the whole file. Refuse `bower-api` or any name other than `bower-staging`.
  - **Named tests, red first** (commit them on their own before the fix):
    - `deploy-staging passes when only the URL holds bower-api`;
    - `deploy-staging fails when bower-api is uploaded`.
  - **Files in scope:** `scripts/deploy-staging.sh` and `runner/test/deploy-staging.test.ts`.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
